'use strict';
(() => {
  if (globalThis.__sovereignBilingualInstalled) return;
  globalThis.__sovereignBilingualInstalled = true;

  const MARK = 'data-sovereign-bilingual';
  const MAX_BLOCKS = 35;
  const MAX_CHARS = 3500;
  const MAX_TASKS = 120;
  const MAX_SEGMENT_CHARS = 600;
  const state = { running: false, generation: 0 };
  const excluded = 'script,style,noscript,textarea,input,select,option,button,code,pre,[contenteditable],nav,footer,header,[role="navigation"]';

  // Include headings and text-only chat bubbles without translating controls or containers twice.
  const textSelector = 'p, li, h1, h2, h3, h4, h5, h6, [role="heading"], div, span';
  const structuralText = 'p, li, h1, h2, h3, h4, h5, h6, [role="heading"]';
  const uiExcluded = 'script,style,noscript,textarea,input,select,option,button,code,pre,[contenteditable],nav,footer,header,[role="navigation"],[role="button"],[role="toolbar"],[role="menu"],[role="menubar"],[role="tablist"],[role="textbox"],[aria-hidden="true"]';

  function directText(el) {
    return Array.from(el.childNodes || [])
      .filter(node => node.nodeType === 3)
      .map(node => node.textContent || '')
      .join(' ').replace(/\s+/g, ' ').trim();
  }

  function sourceText(el) {
    const own = directText(el);
    if (own.length >= 25) return own;
    // Structural text can contain inline formatting without being a wrapper.
    if (el.matches(structuralText)) return el.innerText?.trim() || '';
    // Plain chat bubbles often wrap the prompt in nested spans. Accept the
    // innermost non-interactive container with text, not the Copy toolbar.
    if (Array.from(el.children).some(child => child.innerText?.trim())) return '';
    return el.innerText?.trim() || '';
  }

  function candidates() {
    return Array.from(document.querySelectorAll(textSelector))
      .filter(el => {
        if (el.closest(uiExcluded) || el.hasAttribute(MARK) || el.closest(`[${MARK}]`)) return false;
        if (el.closest('#sovereign-reader-quick-tab')) return false;
        if (!el.getClientRects().length) return false;
        const text = sourceText(el);
        if (!text || text.length < 25 || text.length > MAX_CHARS) return false;
        if (!el.matches(structuralText)) {
          const childWithText = Array.from(el.children).some(child =>
            child.innerText?.trim() && !child.matches('button, [role="button"], svg, img, [aria-hidden="true"]'));
          if (childWithText && directText(el).length < 25) return false;
        }
        return true;
      })
      .filter((el, _, all) => !all.some(other => other !== el && el.contains(other) && !directText(el)))
      .sort((a, b) => {
        const ay = Math.abs(a.getBoundingClientRect().top - window.innerHeight * 0.35);
        const by = Math.abs(b.getBoundingClientRect().top - window.innerHeight * 0.35);
        return ay - by;
      })
      .slice(0, MAX_BLOCKS);
  }

  function splitText(text) {
    const sentences = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'sentence' }).segment(text), item => item.segment.trim()).filter(Boolean)
      : (text.match(/[^.!?\n]+(?:[.!?]+|$)/g) || [text]).map(item => item.trim()).filter(Boolean);
    const parts = [];
    for (const sentence of sentences) {
      if (sentence.length > MAX_SEGMENT_CHARS) {
        for (let i = 0; i < sentence.length; i += MAX_SEGMENT_CHARS) {
          parts.push(sentence.slice(i, i + MAX_SEGMENT_CHARS));
        }
      } else {
        parts.push(sentence);
      }
    }
    return parts;
  }

  function translationNode(text) {
    const el = document.createElement('div');
    el.setAttribute(MARK, 'translation');
    el.style.cssText = 'border-left:3px solid #2563eb;padding:8px 12px;margin:6px 0 16px;background:rgba(37,99,235,.06);color:inherit;white-space:pre-wrap;font:inherit;line-height:1.6;';
    el.textContent = text;
    return el;
  }


  function insertTranslation(original, wrapper) {
    // deepLocal renders a user message's text directly in div.message.user,
    // with its Copy controls inside a nested .messageActions element.
    // Keep the bilingual text in the message bubble, before those controls.
    if (original.matches('.message.user') && directText(original).length >= 25) {
      original.insertBefore(wrapper, original.querySelector('.messageActions'));
    } else {
      original.insertAdjacentElement('afterend', wrapper);
    }
  }

  async function translate(options) {
    if (state.running) return;
    const generation = ++state.generation;
    state.running = true;
    const tasks = [];
    try {
      const blocks = candidates().sort((a, b) => {
        const ay = Math.abs(a.getBoundingClientRect().top - window.innerHeight * 0.35);
        const by = Math.abs(b.getBoundingClientRect().top - window.innerHeight * 0.35);
        return ay - by;
      });
      if (!blocks.length) return;
      for (const original of blocks) {
        const segments = splitText(sourceText(original));
        if (!segments.length) continue;
        original.setAttribute(MARK, 'original');
        const wrapper = translationNode('');
        insertTranslation(original, wrapper);
        for (const segment of segments) {
          if (tasks.length >= MAX_TASKS) break;
          const line = document.createElement('div');
          line.textContent = 'Translating…';
          line.style.opacity = '0.65';
          wrapper.append(line);
          tasks.push({ segment, line });
        }
        if (!wrapper.childNodes.length) {
          wrapper.remove();
          original.removeAttribute(MARK);
        }
        if (tasks.length >= MAX_TASKS) break;
      }
      const total = tasks.length;
      let next = 0;
      let completed = 0;
      let failed = 0;
      let fatalError = '';
      let succeeded = 0;
      const concurrency = options.provider === 'openai' ? 2 : 2;
      async function worker() {
        while (generation === state.generation && !fatalError) {
          const index = next++;
          if (index >= tasks.length) return;
          const task = tasks[index];
          try {
            const result = await chrome.runtime.sendMessage({
              type: 'TRANSLATE', text: task.segment, ...options
            });
            if (generation !== state.generation) return;
            if (!result?.ok) throw new Error(result?.error || 'Translation failed');
            succeeded++;
            if (task.line.isConnected) {
              task.line.textContent = result.translation;
              task.line.style.opacity = '1';
            }
          } catch (error) {
            if (generation !== state.generation) return;
            failed++;
            const reason = String(error.message || error).slice(0, 240);
            if (task.line.isConnected) {
              task.line.textContent = `Translation failed: ${reason}`;
            }
            console.warn('[Sovereign Bilingual] Translation failed:', reason);
            if (/HTTP 400|HTTP 401|HTTP 402|HTTP 403|HTTP 404|HTTP 429|Invalid OpenAI API key|Failed to fetch|network error/i.test(reason)) {
              fatalError = reason;
            }
          } finally {
            if (generation === state.generation) {
              completed++;
            }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
    } finally {
      if (generation === state.generation) state.running = false;
    }
  }

  function clear() {
    state.generation++;
    state.running = false;
    document.querySelectorAll(`[${MARK}="translation"], [${MARK}="progress"]`).forEach(el => el.remove());
    document.querySelectorAll(`[${MARK}="original"]`).forEach(el => el.removeAttribute(MARK));
  }


  // A small, user-controlled tab provides translation without a persistent settings window.
  function installQuickTab() {
    if (document.getElementById('sovereign-reader-quick-tab')) return;
    const host = document.createElement('div');
    host.id = 'sovereign-reader-quick-tab';
    host.style.cssText = 'position:fixed;right:0;top:42%;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      button { font: 13px system-ui,sans-serif; cursor:pointer; }
      .tab { border:0;border-radius:8px 0 0 8px;background:#205ad7;color:white;padding:11px 9px;box-shadow:0 2px 10px #0003; }
      .panel { position:absolute;right:38px;top:0;width:190px;padding:12px;background:white;color:#18212f;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 6px 22px #0003;font:13px system-ui,sans-serif; }
      .panel[hidden] { display:none; }
      .panel button { width:100%;margin-top:8px;border:0;border-radius:6px;padding:9px;background:#205ad7;color:white; }
      .panel button.secondary { background:#edf1f7;color:#18212f; }
      .hint { margin-top:8px;font-size:11px;color:#596579; }
    `;
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.type = 'button';
    tab.textContent = 'T';
    tab.title = 'Bilingual translation';
    tab.setAttribute('aria-label', 'Open bilingual translation controls');
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.hidden = true;
    const title = document.createElement('strong');
    title.textContent = 'Bilingual Reader';
    const translateButton = document.createElement('button');
    translateButton.type = 'button';
    translateButton.textContent = 'Translate page';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'secondary';
    removeButton.textContent = 'Remove translations';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Choose provider and language in extension settings.';
    panel.append(title, translateButton, removeButton, hint);
    root.append(style, tab, panel);
    tab.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    translateButton.addEventListener('click', async () => {
      panel.hidden = true;
      if (!chrome.runtime?.id) {
        hint.textContent = 'Extension was updated. Refresh this page to reconnect the translation controls.';
        panel.hidden = false;
        return;
      }
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_TRANSLATION_PREFS' });
        if (!response?.ok) throw new Error(response?.error || 'Unable to load translation preferences.');
        if (!response.settings?.model) throw new Error('Choose a model in extension settings.');
        clear();
        await translate(response.settings);
      } catch (error) {
        const reason = String(error.message || error);
        hint.textContent = /Extension context invalidated/i.test(reason)
          ? 'Extension was updated. Refresh this page to reconnect the translation controls.'
          : reason.slice(0, 160);
        panel.hidden = false;
      }
    });
    removeButton.addEventListener('click', () => {
      if (!chrome.runtime?.id) {
        hint.textContent = 'Extension was updated. Refresh this page to reconnect the translation controls.';
        panel.hidden = false;
        return;
      }
      clear(); panel.hidden = true;
    });
    document.documentElement.append(host);
  }

  installQuickTab();

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'START') {
      translate({
        provider: message.provider, model: message.model,
        target: message.target, deepLocalBaseUrl: message.deepLocalBaseUrl
      }).catch(error => console.warn('[Sovereign Bilingual] Translation run failed:', error.message));
      respond({ ok: true, started: true });
    } else if (message?.type === 'CLEAR') {
      clear();
      respond({ ok: true });
    }
  });
})();
