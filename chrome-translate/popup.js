'use strict';

/* ============================================================
 * 划词翻译 · 弹窗逻辑
 * ============================================================ */

const $ = (id) => document.getElementById(id);

const LANGS = [
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', '英语'],
  ['ja', '日语'],
  ['ko', '韩语'],
  ['fr', '法语'],
  ['de', '德语'],
  ['ru', '俄语'],
  ['es', '西班牙语'],
  ['pt', '葡萄牙语'],
  ['it', '意大利语'],
  ['ar', '阿拉伯语']
];

const LANG_LABELS = Object.fromEntries(LANGS);
const PROVIDER_LABELS = { google: 'Google', caiyun: '彩云小译', mymemory: 'MyMemory' };

const inputEl = $('input');
const clearBtn = $('clear');
const targetEl = $('target');
const translateBtn = $('translate');
const card = $('result-card');
const metaEl = $('result-meta');
const textEl = $('result-text');
const errorEl = $('result-error');
const copyBtn = $('copy');
const speakBtn = $('speak');
const loadingEl = $('loading');

let lastTranslated = '';
let lastLang = 'zh-CN';

/* ---------------- 初始化 ---------------- */

function fillLangOptions() {
  for (const [code, label] of LANGS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    targetEl.appendChild(opt);
  }
}

async function loadSettings() {
  const { target = 'zh-CN' } = await chrome.storage.sync.get({ target: 'zh-CN' });
  targetEl.value = LANGS.some(([c]) => c === target) ? target : 'zh-CN';
  lastLang = targetEl.value;
}

async function saveTarget() {
  lastLang = targetEl.value;
  await chrome.storage.sync.set({ target: lastLang });
}

/* ---------------- 翻译流程 ---------------- */

async function doTranslate() {
  const text = inputEl.value.trim();
  if (!text) {
    showError('请输入要翻译的文本');
    return;
  }
  if (text.length > 3000) {
    showError('文本过长（最多 3000 字符）');
    return;
  }

  translateBtn.disabled = true;
  loadingEl.hidden = false;
  textEl.hidden = true;
  errorEl.hidden = true;
  card.hidden = false;
  metaEl.textContent = '';

  try {
    const res = await chrome.runtime.sendMessage({ type: 'translate', text, target: lastLang });
    if (res && res.ok) {
      lastTranslated = res.translated;
      textEl.textContent = res.translated;
      textEl.hidden = false;
      const parts = [];
      if (res.detected) parts.push('检测语言：' + (LANG_LABELS[res.detected] || res.detected));
      parts.push('目标语言：' + LANG_LABELS[lastLang]);
      if (res.provider) parts.push('服务：' + (PROVIDER_LABELS[res.provider] || res.provider));
      metaEl.textContent = parts.join(' · ');
    } else {
      showError((res && res.error) || '未知错误');
    }
  } catch (e) {
    showError(String((e && e.message) || e));
  } finally {
    translateBtn.disabled = false;
    loadingEl.hidden = true;
  }
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  textEl.hidden = true;
  metaEl.textContent = '';
}

/* ---------------- 操作按钮 ---------------- */

async function copyResult() {
  if (!lastTranslated) return;
  try {
    await navigator.clipboard.writeText(lastTranslated);
    copyBtn.textContent = '已复制 ✓';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '复制';
      copyBtn.classList.remove('copied');
    }, 1200);
  } catch (e) {
    // 兜底：execCommand
    const ta = document.createElement('textarea');
    ta.value = lastTranslated;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e2) { /* ignore */ }
    ta.remove();
  }
}

function speakResult() {
  if (!lastTranslated) return;
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(lastTranslated);
    // 目标语言对应的语音 locale
    const localeMap = { 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', ru: 'ru-RU', es: 'es-ES', pt: 'pt-BR', it: 'it-IT', ar: 'ar-SA' };
    u.lang = localeMap[lastLang] || lastLang;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch (e) { /* 忽略 */ }
}

/* ---------------- 事件绑定 ---------------- */

translateBtn.addEventListener('click', doTranslate);
clearBtn.addEventListener('click', () => {
  inputEl.value = '';
  inputEl.focus();
  card.hidden = true;
  clearBtn.hidden = true;
});

inputEl.addEventListener('input', () => {
  clearBtn.hidden = inputEl.value.length === 0;
});
inputEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    doTranslate();
  }
});
targetEl.addEventListener('change', saveTarget);
copyBtn.addEventListener('click', copyResult);
speakBtn.addEventListener('click', speakResult);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.close();
});

/* ---------------- 启动 ---------------- */

fillLangOptions();
loadSettings().then(() => {
  inputEl.focus();
});
