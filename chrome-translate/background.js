'use strict';

/* ============================================================
 * 划词翻译 · 后台 Service Worker
 * 职责：
 *   1. 统一调用翻译服务（Google → 彩云小译 → MyMemory 依次兜底）
 *   2. 失败熔断：某服务失败后 10 分钟内不再优先尝试，保证响应速度
 *   3. 提供右键菜单「翻译选中文本」
 *   4. 提供快捷键 Alt+T 翻译选中文本
 *   5. 响应 popup / content script 的 translate 消息
 * ============================================================ */

const PROVIDER_ORDER = ['google', 'caiyun', 'mymemory'];

const FAIL_COOLDOWN_MS = 10 * 60 * 1000; // 服务失败后的熔断时间
const FETCH_TIMEOUT_MS = 8000;           // 单次请求超时

// 各翻译服务的语言映射（目标语言 → 服务方代码）
const TARGET_MAP = {
  google:   { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', de: 'de', ru: 'ru', es: 'es', pt: 'pt', it: 'it', ar: 'ar' },
  // 彩云小译只支持 auto→zh/en/ja 几种方向，其余语言跳过该服务
  caiyun:   { 'zh-CN': 'zh', en: 'en', ja: 'ja' },
  mymemory: { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en', ja: 'ja', ko: 'ko', fr: 'fr', de: 'de', ru: 'ru', es: 'es', pt: 'pt', it: 'it', ar: 'ar' }
};

/* ---------------- 基础工具 ---------------- */

async function fetchWithTimeout(url, opts, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function isProviderAvailable(provider) {
  const { fails = {} } = await chrome.storage.local.get('fails');
  const t = fails[provider];
  return !t || (Date.now() - t) > FAIL_COOLDOWN_MS;
}

async function markProviderFail(provider) {
  const { fails = {} } = await chrome.storage.local.get('fails');
  fails[provider] = Date.now();
  await chrome.storage.local.set({ fails });
}

/* ---------------- 各翻译服务实现 ---------------- */

// 1. Google 非官方接口（质量最好；部分网络不可用）
async function translateGoogle(text, target) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=auto&tl='
    + encodeURIComponent(target) + '&q=' + encodeURIComponent(text);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('Google 接口返回 ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data[0])) throw new Error('Google 返回格式异常');
  const translated = data[0].map((seg) => (seg && seg[0]) ? seg[0] : '').join('');
  const detected = typeof data[2] === 'string' ? data[2] : '';
  if (!translated) throw new Error('Google 未返回译文');
  return { translated, detected, provider: 'google' };
}

// 2. 彩云小译（国内直连，质量好；使用公开演示 token，无需注册）
async function translateCaiyun(text, target) {
  const url = 'https://api.interpreter.caiyunai.com/v1/translator';
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-authorization': 'token 3975l6lr5pcbvidl6jl2',
      'Origin': 'https://fanyi.caiyunapp.com',
      'Referer': 'https://fanyi.caiyunapp.com/'
    },
    body: JSON.stringify({
      source: [text],
      trans_type: 'auto2' + target,
      request_id: 'web_fanyi_' + Date.now(),
      detect: true,
      os_type: 'web',
      media: 'text'
    })
  });
  if (!res.ok) throw new Error('彩云接口返回 ' + res.status);
  const data = await res.json();
  if (data.rc !== 0 || !data.target || !data.target.length) {
    throw new Error('彩云接口错误: ' + (data.message || data.rc));
  }
  const translated = data.target[0];
  const detected = data.trans_type ? data.trans_type.slice(0, 2) : '';
  if (!translated) throw new Error('彩云未返回译文');
  return { translated, detected, provider: 'caiyun' };
}

// 3. MyMemory 免费接口（最终兜底，全网络可用）
async function translateMyMemory(text, target, source) {
  const q = text.length > 400 ? text.slice(0, 400) : text; // 免费接口限制单次长度
  const langpair = (source || 'en') + '|' + target;
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q)
    + '&langpair=' + encodeURIComponent(langpair);
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('MyMemory 接口返回 ' + res.status);
  const data = await res.json();
  if (String(data.responseStatus) !== '200') {
    throw new Error('MyMemory 接口错误: ' + (data.responseDetails || data.responseStatus));
  }
  const translated = data.responseData && data.responseData.translatedText;
  if (!translated) throw new Error('MyMemory 未返回译文');
  return {
    translated: String(translated).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    detected: source || '',
    provider: 'mymemory'
  };
}

/* ---------------- 统一翻译入口（自动兜底 + 熔断） ---------------- */

// 根据文本猜测源语言（MyMemory 需要显式源语言）
function guessSource(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return cjk > latin ? 'zh-CN' : 'en';
}

async function translateText(text, target, detectedHint) {
  const errors = [];
  for (const provider of PROVIDER_ORDER) {
    const code = TARGET_MAP[provider][target] || TARGET_MAP[provider]['zh-CN'];
    if (!code) continue; // 该服务不支持此目标语言
    if (!(await isProviderAvailable(provider))) {
      errors.push(provider + ': 熔断中');
      continue;
    }
    try {
      if (provider === 'google') return await translateGoogle(text, code);
      if (provider === 'caiyun') return await translateCaiyun(text, code);
      if (provider === 'mymemory') return await translateMyMemory(text, code, detectedHint || guessSource(text));
    } catch (e) {
      errors.push(provider + ': ' + ((e && e.message) || e));
      markProviderFail(provider);
    }
  }
  throw new Error('所有翻译服务均失败（' + errors.join(' ｜ ') + '）');
}

/* ---------------- 消息处理 ---------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'translate') {
    const text = String(msg.text || '').trim();
    if (!text) {
      sendResponse({ ok: false, error: '没有可翻译的文本' });
      return;
    }
    if (text.length > 3000) {
      sendResponse({ ok: false, error: '文本过长（最多 3000 字符）' });
      return;
    }
    translateText(text, msg.target || 'zh-CN', msg.detectedHint)
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((e) => sendResponse({ ok: false, error: ((e && e.message) || String(e)) }));
    return true; // 异步 sendResponse
  }
});

/* ---------------- 右键菜单 ---------------- */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '翻译选中文本',
    contexts: ['selection']
  });
});

// 在指定标签页中读取选中文本及其屏幕位置
async function getSelectionInTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      let rect = null;
      if (sel && sel.rangeCount > 0) {
        try {
          const r = sel.getRangeAt(0).getBoundingClientRect();
          if (r && (r.width > 0 || r.height > 0)) {
            rect = { x: r.left, y: r.top, w: r.width, h: r.height };
          }
        } catch (e) { /* 忽略异常 */ }
      }
      return { text, rect };
    }
  });
  return results && results[0] && results[0].result;
}

async function translateSelectionInTab(tabId) {
  try {
    const sel = await getSelectionInTab(tabId);
    if (!sel || !sel.text) return;
    const { target = 'zh-CN' } = await chrome.storage.sync.get({ target: 'zh-CN' });
    const result = await translateText(sel.text, target, guessSource(sel.text));
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'show-translation',
        source: sel.text,
        translated: result.translated,
        detected: result.detected,
        provider: result.provider,
        rect: sel.rect
      });
    } catch (e) {
      // 页面未注入 content script（如 chrome://、PDF 等）时静默忽略
    }
  } catch (e) {
    console.error('[划词翻译] 翻译失败：', e);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translate-selection' && tab && tab.id != null) {
    translateSelectionInTab(tab.id);
  }
});

/* ---------------- 快捷键 Alt+T ---------------- */

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'translate-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.id != null) translateSelectionInTab(tab.id);
  });
});
