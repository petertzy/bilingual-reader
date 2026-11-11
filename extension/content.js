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

  function candidates() {
    return Array.from(document.querySelectorAll('main p, article p, main li, article li, p'))
      .filter(el => !el.closest(excluded) && !el.hasAttribute(MARK) && !el.closest(`[${MARK}]`))
      .filter(el => {
        const text = el.innerText?.trim();
        return text && text.length >= 25 && text.length <= MAX_CHARS && el.getClientRects().length > 0;
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

  function updateProgress(progress, completed, total, failed) {
    progress.textContent = `Translation progress: ${completed}/${total} sentences${failed ? ` · ${failed} failed` : ''}`;
  }

  async function translate(options) {
    if (state.running) return;
    const generation = ++state.generation;
    state.running = true;
    const tasks = [];
    let progress = null;
    try {
      const blocks = candidates();
      if (!blocks.length) return;
      progress = translationNode('Preparing translation...');
      progress.setAttribute(MARK, 'progress');
      blocks[0].insertAdjacentElement('beforebegin', progress);
      for (const original of blocks) {
        const segments = splitText(original.innerText.trim());
        if (!segments.length) continue;
        original.setAttribute(MARK, 'original');
        const wrapper = translationNode('');
        original.insertAdjacentElement('afterend', wrapper);
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
      updateProgress(progress, 0, total, 0);
      const concurrency = options.provider === 'openai' ? 3 : 2;
      async function worker() {
        while (generation === state.generation) {
          const index = next++;
          if (index >= tasks.length) return;
          const task = tasks[index];
          try {
            const result = await chrome.runtime.sendMessage({
              type: 'TRANSLATE', text: task.segment, ...options
            });
            if (generation !== state.generation) return;
            if (!result?.ok) throw new Error(result?.error || 'Translation failed');
            if (task.line.isConnected) {
              task.line.textContent = result.translation;
              task.line.style.opacity = '1';
            }
          } catch (error) {
            if (generation !== state.generation) return;
            failed++;
            if (task.line.isConnected) {
              task.line.textContent = 'Translation unavailable.';
              task.line.title = String(error.message || error).slice(0, 300);
            }
            console.warn('[Sovereign Bilingual] Translation failed:', error.message);
            if (/HTTP 401|HTTP 403|HTTP 429|Invalid OpenAI API key|timed out|Failed to fetch/.test(String(error.message))) {
              next = tasks.length;
            }
          } finally {
            if (generation === state.generation) {
              completed++;
              if (progress?.isConnected) updateProgress(progress, completed, total, failed);
            }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
      if (generation === state.generation && progress?.isConnected) {
        progress.textContent = `Translation finished: ${completed}/${total} sentences${failed ? ` · ${failed} failed` : ''}`;
      }
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
