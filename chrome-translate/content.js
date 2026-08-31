(() => {
  'use strict';

  if (window.__transXLoaded) return;
  window.__transXLoaded = true;

  const MAX_LEN = 3000;
  const LANG_LABELS = {
    'zh-CN': '简体中文', 'zh-TW': '繁體中文', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
    en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', ru: '俄语',
    es: '西班牙语', pt: '葡萄牙语', it: '意大利语', ar: '阿拉伯语'
  };
  const PROVIDER_LABELS = { google: 'Google', caiyun: '彩云小译', mymemory: 'MyMemory' };

  /* ================= 构建 UI（Shadow DOM，避免与页面样式冲突） ================= */

  const host = document.createElement('div');
  host.id = 'transx-host';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .tx-btn, .tx-bubble {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
        position: fixed;
        z-index: 2147483647;
      }
      .tx-btn {
        width: 30px; height: 30px;
        border: none; border-radius: 50%;
        background: #0D9488;
        color: #fff;
        font-size: 15px; font-weight: 700;
        line-height: 1;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(13, 148, 136, 0.45);
        display: none;
        align-items: center; justify-content: center;
        transition: background 150ms ease, transform 150ms ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .tx-btn:hover { background: #0F766E; transform: scale(1.08); }
      .tx-btn:focus-visible { outline: 2px solid #EA580C; outline-offset: 2px; }
      .tx-bubble {
        width: 380px; max-width: min(420px, calc(100vw - 24px));
        background: #fff;
        color: #134E4A;
        border: 1px solid #99F6E4;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(19, 78, 74, 0.18);
        display: none;
        overflow: hidden;
        font-size: 14px;
      }
      .tx-head {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px;
        background: #0D9488;
        color: #fff;
        font-size: 13px; font-weight: 600;
      }
      .tx-head .tx-meta { flex: 1; font-weight: 400; opacity: 0.9; font-size: 12px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .tx-close {
        border: none; background: transparent; color: #fff;
        width: 22px; height: 22px; border-radius: 6px;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        padding: 0; transition: background 150ms ease;
      }
      .tx-close:hover { background: rgba(255, 255, 255, 0.25); }
      .tx-close:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
      .tx-body { padding: 10px 12px; max-height: 300px; overflow-y: auto; }
      .tx-src {
        font-size: 12.5px; color: #64748B;
        padding-bottom: 8px; margin-bottom: 8px;
        border-bottom: 1px dashed #CCFBF1;
        white-space: pre-wrap; word-break: break-word;
        display: none;
      }
      .tx-result {
        font-size: 14.5px; line-height: 1.6; color: #134E4A;
        white-space: pre-wrap; word-break: break-word;
        display: none;
      }
      .tx-error { font-size: 13px; color: #DC2626; line-height: 1.5; display: none; }
      .tx-spinner { display: none; align-items: center; gap: 8px; color: #64748B; font-size: 13px; }
      .tx-spinner::before {
        content: '';
        width: 14px; height: 14px;
        border: 2px solid #99F6E4; border-top-color: #0D9488;
        border-radius: 50%;
        animation: tx-rot 0.8s linear infinite;
      }
      @keyframes tx-rot { to { transform: rotate(360deg); } }
      .tx-foot {
        display: flex; justify-content: flex-end; gap: 8px;
        padding: 6px 12px 10px;
      }
      .tx-copy {
        border: 1px solid #99F6E4; background: #F0FDFA; color: #0F766E;
        font-size: 12px; font-weight: 600;
        padding: 4px 12px; border-radius: 8px; cursor: pointer;
        transition: background 150ms ease, color 150ms ease;
      }
      .tx-copy:hover { background: #0D9488; color: #fff; }
      .tx-copy:focus-visible { outline: 2px solid #EA580C; outline-offset: 1px; }
      .tx-copied { background: #0D9488 !important; color: #fff !important; }
      @media (prefers-reduced-motion: reduce) {
        .tx-btn, .tx-bubble, .tx-close, .tx-copy { transition: none; }
        .tx-spinner::before { animation: none; }
      }
      @media (prefers-color-scheme: dark) {
        .tx-bubble { background: #134E4A; color: #CCFBF1; border-color: #0F766E; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); }
        .tx-src { color: #99F6E4; border-bottom-color: #0F766E; }
        .tx-result { color: #F0FDFA; }
        .tx-copy { border-color: #0F766E; background: #0F766E; color: #F0FDFA; }
        .tx-copy:hover { background: #14B8A6; }
      }
    </style>
    <button class="tx-btn" id="tx-btn" type="button" role="button" aria-label="翻译选中文本" title="翻译选中文本">译</button>
    <div class="tx-bubble" id="tx-bubble" role="dialog" aria-label="翻译结果">
      <div class="tx-head">
        <span>划词翻译</span>
        <span class="tx-meta" id="tx-meta"></span>
        <button class="tx-close" id="tx-close" type="button" aria-label="关闭">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div class="tx-body">
        <div class="tx-spinner" id="tx-spinner">翻译中…</div>
        <div class="tx-src" id="tx-src"></div>
        <div class="tx-result" id="tx-result"></div>
        <div class="tx-error" id="tx-error"></div>
      </div>
      <div class="tx-foot">
        <button class="tx-copy" id="tx-copy" type="button">复制译文</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);

  const btn = shadow.getElementById('tx-btn');
  const bubble = shadow.getElementById('tx-bubble');
  const metaEl = shadow.getElementById('tx-meta');
  const spinnerEl = shadow.getElementById('tx-spinner');
  const srcEl = shadow.getElementById('tx-src');
  const resultEl = shadow.getElementById('tx-result');
  const errorEl = shadow.getElementById('tx-error');
  const copyBtn = shadow.getElementById('tx-copy');
  const closeBtn = shadow.getElementById('tx-close');

  let currentText = '';
  let currentTranslated = '';

  /* ================= 工具函数 ================= */

  function insideHost(e) {
    return e.composedPath && e.composedPath().includes(host);
  }

  function hideBtn() {
    btn.style.display = 'none';
  }

  function hideBubble() {
    bubble.style.display = 'none';
    currentText = '';
    currentTranslated = '';
  }

  function hideAll() {
    hideBtn();
    hideBubble();
  }

  function langLabel(code) {
    if (!code) return '';
    return LANG_LABELS[code] || code;
  }

  function getSelectionInfo() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!text || text.length > MAX_LEN) return null;
    // 忽略纯数字/符号等无意义选择
    if (!/[a-zA-Z\u4e00-\u9fff]/.test(text)) return null;
    let rect = null;
    if (sel.rangeCount > 0) {
      try {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) rect = r;
      } catch (e) { /* ignore */ }
    }
    return rect ? { text, rect } : null;
  }

  // 将气泡定位到选区附近
  function positionBubble(rect) {
    if (!rect) {
      bubble.style.left = '12px';
      bubble.style.top = '12px';
      return;
    }
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - bw - 8));
    let top = rect.top + rect.height + 10;
    if (top + bh > window.innerHeight - 8) {
      top = Math.max(8, rect.top - bh - 10);
    }
    bubble.style.left = left + 'px';
    bubble.style.top = top + 'px';
  }

  function showLoading() {
    spinnerEl.style.display = 'flex';
    srcEl.style.display = 'none';
    resultEl.style.display = 'none';
    errorEl.style.display = 'none';
    metaEl.textContent = '';
  }

  function showResult(source, translated, detected, provider) {
    spinnerEl.style.display = 'none';
    errorEl.style.display = 'none';
    srcEl.textContent = source;
    srcEl.style.display = 'block';
    resultEl.textContent = translated;
    resultEl.style.display = 'block';
    const parts = [];
    if (detected) parts.push('源语言 ' + langLabel(detected));
    if (provider) parts.push(PROVIDER_LABELS[provider] || provider);
    metaEl.textContent = parts.join(' · ');
  }

  function showError(msg) {
    spinnerEl.style.display = 'none';
    srcEl.style.display = 'none';
    resultEl.style.display = 'none';
    errorEl.textContent = '翻译失败：' + msg;
    errorEl.style.display = 'block';
    metaEl.textContent = '';
  }

  function openBubble(rect) {
    bubble.style.display = 'block';
    positionBubble(rect);
  }

  async function translateSelection(selection, rect) {
    currentText = selection;
    showLoading();
    openBubble(rect);
    const { target = 'zh-CN' } = await chrome.storage.sync.get({ target: 'zh-CN' });
    try {
      const res = await chrome.runtime.sendMessage({ type: 'translate', text: selection, target });
      if (res && res.ok) {
        currentTranslated = res.translated;
        showResult(selection, res.translated, res.detected, res.provider);
      } else {
        showError((res && res.error) || '未知错误');
      }
    } catch (e) {
      showError(String(e && e.message || e));
    }
    positionBubble(rect);
  }

  function copyTranslated() {
    if (!currentTranslated) return;
    const ta = document.createElement('textarea');
    ta.value = currentTranslated;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
    if (ok) {
      const old = copyBtn.textContent;
      copyBtn.textContent = '已复制 ✓';
      copyBtn.classList.add('tx-copied');
      setTimeout(() => {
        copyBtn.textContent = old;
        copyBtn.classList.remove('tx-copied');
      }, 1200);
    }
  }

  /* ================= 页面事件 ================= */

  document.addEventListener('mouseup', (e) => {
    if (insideHost(e)) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      hideBtn();
      return;
    }
    const info = getSelectionInfo();
    if (!info) { hideBtn(); return; }
    const r = info.rect;
    let left = r.right + 8;
    let top = r.top - 8;
    if (top < 4) top = r.bottom + 8;
    if (left > window.innerWidth - 38) left = Math.max(4, r.left - 38);
    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    btn.style.display = 'flex';
  });

  document.addEventListener('mousedown', (e) => {
    if (insideHost(e)) {
      // 点击气泡内部不关闭；点击「译」按钮不关闭
      return;
    }
    hideBtn();
    hideBubble();
  });

  // 捕获阶段监听滚动，处理页面内嵌滚动容器
  document.addEventListener('scroll', hideAll, true);
  window.addEventListener('resize', hideAll);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAll();
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBtn();
    const info = getSelectionInfo();
    if (!info) return;
    translateSelection(info.text, info.rect);
  });

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBubble();
  });

  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyTranslated();
  });

  /* ================= 来自后台的消息（右键菜单 / Alt+T） ================= */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'show-translation') {
      hideBtn();
      const rect = msg.rect || null;
      showLoading();
      openBubble(rect);
      if (msg.translated) {
        currentText = msg.source || '';
        currentTranslated = msg.translated;
        showResult(msg.source || '', msg.translated, msg.detected, msg.provider);
        positionBubble(rect);
      } else {
        // 后台可能只传了 rect，重新发起翻译（兜底）
        const info = getSelectionInfo();
        if (info) translateSelection(info.text, rect);
        else showError('未获取到选中文本');
      }
      sendResponse && sendResponse({ ok: true });
    }
  });
})();
