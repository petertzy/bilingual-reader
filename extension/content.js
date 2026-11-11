'use strict';
(() => {
  if (globalThis.__sovereignBilingualInstalled) return;
  globalThis.__sovereignBilingualInstalled = true;
  const MARK = 'data-sovereign-bilingual';
  const MAX_BLOCKS = 35;
  const MAX_CHARS = 3500;
  const state = { running: false, stop: false };
  const excluded = 'script,style,noscript,textarea,input,select,option,button,code,pre,[contenteditable],nav,footer,header,[role="navigation"]';
  function candidates() {
    return Array.from(document.querySelectorAll('main p, article p, main li, article li, p'))
      .filter(el => !el.closest(excluded) && !el.hasAttribute(MARK) && !el.closest(`[${MARK}]`))
      .filter(el => {
        const text = el.innerText?.trim();
        return text && text.length >= 25 && text.length <= MAX_CHARS && el.getClientRects().length > 0;
      })
      .slice(0, MAX_BLOCKS);
  }
  async function translate(options) {
    if (state.running) return;
    state.running = true;
    state.stop = false;
    const blocks = candidates();
    let done = 0;
    let errors = 0;
    for (const el of blocks) {
      if (state.stop) break;
      if (!el.isConnected) continue;
      el.setAttribute(MARK, 'original');
      const source = el.innerText.trim();
      try {
        const result = await chrome.runtime.sendMessage({ type: 'TRANSLATE', text: source, ...options });
        if (!result?.ok) throw new Error(result?.error || 'Translation failed');
        if (!el.isConnected || state.stop) continue;
        const translated = document.createElement('div');
        translated.setAttribute(MARK, 'translation');
        translated.style.cssText = 'border-left:3px solid #2563eb;padding:8px 12px;margin:6px 0 16px;background:rgba(37,99,235,.06);color:inherit;white-space:pre-wrap;font:inherit;line-height:1.6;';
        translated.textContent = result.translation; // Never use innerHTML for model output.
        el.insertAdjacentElement('afterend', translated);
        done++;
      } catch (err) {
        errors++;
        el.removeAttribute(MARK);
        console.warn('[Sovereign Bilingual] Local translation failed:', err.message);
        if (String(err.message).includes('Local service') || String(err.message).includes('Failed to fetch') || String(err.message).includes('timed out')) break;
      }
    }
    state.running = false;
    console.info(`[Sovereign Bilingual] Translated ${done} blocks; ${errors} errors.`);
  }
  function clear() {
    state.stop = true;
    document.querySelectorAll(`[${MARK}="translation"]`).forEach(el => el.remove());
    document.querySelectorAll(`[${MARK}="original"]`).forEach(el => el.removeAttribute(MARK));
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'START') {
      translate({ provider: message.provider, model: message.model, target: message.target, deepLocalBaseUrl: message.deepLocalBaseUrl });
      respond({ ok: true, started: true });
    } else if (message?.type === 'CLEAR') {
      clear();
      respond({ ok: true });
    }
  });
})();
