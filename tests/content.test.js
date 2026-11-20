'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');

function inspectCandidates(elements) {
  const document = {
    querySelectorAll(selector) {
      return selector.includes('div, span') ? elements : [];
    },
    getElementById() { return {}; }
  };
  const context = {
    document,
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    Intl,
    console
  };
  // Capture the private selection function without changing extension behavior.
  const instrumented = script.replace('  function splitText(text) {',
    '  globalThis.__selectCandidates = candidates;\n  globalThis.__sourceText = sourceText;\n  function splitText(text) {');
  vm.runInNewContext(instrumented, context);
  const candidates = Array.from(context.__selectCandidates());
  return { candidates, sourceText: item => context.__sourceText(item) };
}

function selectCandidates(elements) {
  return inspectCandidates(elements).candidates;
}

function element({ text, tag = 'DIV', parent = '', children = [], visible = true, directText = null }) {
  return {
    nodeType: 1,
    tagName: tag,
    innerText: text,
    children,
    childNodes: [{ nodeType: 3, textContent: directText === null ? (children.length ? '' : text) : directText }],
    querySelector(selector) { return parent === 'interactive' && selector.includes('button') ? {} : null; },
    getClientRects() { return visible ? [{}] : []; },
    getBoundingClientRect() { return { top: 100 }; },
    closest(selector) {
      if (selector.includes('script,style')) return parent === 'excluded' ? this : null;
      if (selector.includes('data-sovereign-bilingual')) return null;
      if (selector.includes('main, article')) return parent === 'main' ? this : null;
      return null;
    },
    hasAttribute() { return false; },
    matches(selector) {
      return tag === 'BUTTON' && selector.includes('button') ||
        /^H[1-6]$/.test(tag) && selector.includes('h1') ||
        tag === 'P' && selector.includes('p, li');
    },
    contains(other) { return children.includes(other); }
  };
}

test('includes text-only chat questions and headings', () => {
  const question = element({ text: "What's a surprising fact about your city?", parent: 'outside-main' });
  const heading = element({ text: 'An interesting article heading', tag: 'H2' });
  assert.deepEqual(selectCandidates([question, heading]), [question, heading]);
});

test('skips toolbar content, hidden text, and wrapper duplicates', () => {
  const question = element({ text: 'What is an interesting fact about your city?', parent: 'main' });
  const wrapper = element({ text: question.innerText, parent: 'main', children: [question] });
  const toolbar = element({ text: 'Copy the selected text into the clipboard', parent: 'excluded' });
  const hidden = element({ text: 'This should not be translated when invisible', parent: 'main', visible: false });
  assert.deepEqual(selectCandidates([wrapper, question, toolbar, hidden]), [question]);
});

test('includes leaf chat prompts outside main and excludes interactive wrappers', () => {
  const prompt = element({ text: 'What is a surprising fact about your city?', tag: 'SPAN', parent: 'outside-main' });
  const interactive = element({ text: 'Copy the selected text into the clipboard', tag: 'BUTTON', parent: 'excluded' });
  assert.deepEqual(selectCandidates([prompt, interactive]), [prompt]);
});

test('includes chat bubble text when a Copy button is a sibling', () => {
  const copy = element({ text: 'Copy', tag: 'BUTTON' });
  const bubble = element({ text: "What's a surprising fact about your city? Copy", children: [copy], directText: "What's a surprising fact about your city?" });
  assert.deepEqual(selectCandidates([bubble]), [bubble]);
});

test('selects a direct-text question bubble with nested Copy control', () => {
  const copy = element({ text: 'Copy', tag: 'BUTTON' });
  const prompt = element({ text: "What's a surprising fact about your city? Copy", children: [copy], directText: "What's a surprising fact about your city?" });
  assert.deepEqual(selectCandidates([prompt]), [prompt]);
});

test('does not let earlier offscreen candidates consume the visible block limit', () => {
  const offscreen = Array.from({ length: 40 }, (_, i) => element({ text: 'An unrelated paragraph of sufficient length ' + i }));
  offscreen.forEach(item => { item.getBoundingClientRect = () => ({ top: 12000 }); });
  const prompt = element({ text: "What's a surprising fact about your city?" });
  assert.ok(selectCandidates([...offscreen, prompt]).includes(prompt));
});

test('matches the deepLocal user-message structure with a nested Copy action', () => {
  // apps/desktop/src/main.tsx renders user content as a direct text node
  // inside div.message.user, followed by div.messageActions > CopyButton.
  const copy = element({ text: 'Copy', tag: 'BUTTON', parent: 'excluded' });
  const actions = element({ text: 'Copy', children: [copy], directText: '' });
  const promptText = "What's a surprising fact about your city?";
  const message = element({
    text: promptText + ' Copy',
    children: [actions],
    directText: '\n    ' + promptText + '\n'
  });
  const { candidates, sourceText } = inspectCandidates([message, actions, copy]);
  assert.deepEqual(candidates, [message]);
  assert.equal(sourceText(message), promptText);
});

test('normalizes whitespace in chat message direct text', () => {
  const bubble = element({
    text: 'This is a question with extra whitespace',
    directText: 'This   is  a\nquestion   with   extra whitespace'
  });
  assert.equal(inspectCandidates([bubble]).sourceText(bubble), 'This is a question with extra whitespace');
});

test('inserts deepLocal user translation inside bubble before Copy controls', () => {
  const original = element({
    text: "What's a surprising fact about your city? Copy",
    directText: "What's a surprising fact about your city?"
  });
  const actions = {};
  const wrapper = {};
  let inserted = null;
  original.matches = selector => selector === '.message.user';
  original.querySelector = selector => selector === '.messageActions' ? actions : null;
  original.insertBefore = (node, reference) => { inserted = { node, reference }; };
  original.insertAdjacentElement = () => { throw new Error('Translation escaped the bubble'); };

  const instrumented = script.replace('  async function translate(options) {',
    '  globalThis.__insertTranslation = insertTranslation;\n  async function translate(options) {');
  const context = {
    document: { getElementById() { return {}; } },
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    Intl,
    console
  };
  vm.runInNewContext(instrumented, context);
  context.__insertTranslation(original, wrapper);
  assert.deepEqual(inserted, { node: wrapper, reference: actions });
});

test('preserves normal paragraph translation placement', () => {
  const original = element({ text: 'A paragraph with enough text to translate.', tag: 'P' });
  let placement = null;
  original.insertAdjacentElement = (position, node) => { placement = { position, node }; };
  const instrumented = script.replace('  async function translate(options) {',
    '  globalThis.__insertTranslation = insertTranslation;\n  async function translate(options) {');
  const context = {
    document: { getElementById() { return {}; } },
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    Intl,
    console
  };
  vm.runInNewContext(instrumented, context);
  const wrapper = {};
  context.__insertTranslation(original, wrapper);
  assert.deepEqual(placement, { position: 'afterend', node: wrapper });
});

function textNode(value) {
  return { nodeType: 3, textContent: value };
}

function domNode(tagName, children, excluded = false) {
  return {
    nodeType: 1,
    tagName,
    childNodes: children,
    matches(selector) {
      if (excluded) return selector.includes('button');
      return selector.includes('p, li') && tagName === 'P';
    }
  };
}

test('keeps inline anchor text in a long paragraph instead of dropping tagged', () => {
  const paragraph = domNode('P', [
    textNode('Sometimes a class may depend on an array of '),
    domNode('A', [textNode('tagged')]),
    textNode(' instances. Using the giveTagged method, you may easily inject all of the container bindings with that tag:')
  ]);
  paragraph.innerText = 'Sometimes a class may depend on an array of tagged instances. Using the giveTagged method, you may easily inject all of the container bindings with that tag:';
  const { sourceText } = inspectCandidates([]);
  assert.equal(sourceText(paragraph), paragraph.innerText);
});

test('preserves adjacent inline formatting and excludes controls', () => {
  const paragraph = domNode('P', [
    textNode('Read the '),
    domNode('STRONG', [textNode('important')]),
    textNode(' '),
    domNode('CODE', [textNode('tagged')]),
    textNode(' examples before continuing.'),
    domNode('BUTTON', [textNode('Copy this text')], true)
  ]);
  const { sourceText } = inspectCandidates([]);
  assert.equal(sourceText(paragraph), 'Read the important tagged examples before continuing.');
});

test('normalizes whitespace across inline text and line breaks', () => {
  const paragraph = domNode('P', [
    textNode('An array of '),
    domNode('EM', [textNode('tagged')]),
    textNode('  instances'),
    domNode('BR', []),
    textNode('can be injected.')
  ]);
  const { sourceText } = inspectCandidates([]);
  assert.equal(sourceText(paragraph), 'An array of tagged instances can be injected.');
});

test('selects a short linked article heading for translation', () => {
  const heading = element({ text: 'Binding Primitives', tag: 'H2' });
  heading.childNodes = [domNode('A', [textNode('Binding Primitives')])];
  const { candidates, sourceText } = inspectCandidates([heading]);
  assert.deepEqual(candidates, [heading]);
  assert.equal(sourceText(heading), 'Binding Primitives');
});

test('translates each link separately when one heading groups multiple linked titles', () => {
  const first = element({ text: 'Writing Service Providers', tag: 'A' });
  const second = element({ text: 'The Register Method', tag: 'A' });
  const heading = element({
    text: 'Writing Service Providers The Register Method',
    tag: 'H2', children: [first, second]
  });
  first.parentElement = heading;
  second.parentElement = heading;
  heading.childNodes = [first, second];
  first.childNodes = [textNode('Writing Service Providers')];
  second.childNodes = [textNode('The Register Method')];
  const { candidates, sourceText } = inspectCandidates([heading, first, second]);
  assert.deepEqual(candidates, [first, second]);
  assert.equal(sourceText(first), 'Writing Service Providers');
  assert.equal(sourceText(second), 'The Register Method');
});

test('keeps a single linked heading as one translation unit', () => {
  const link = element({ text: 'Introduction', tag: 'A' });
  const heading = element({ text: 'Introduction', tag: 'H2', children: [link] });
  link.parentElement = heading;
  heading.childNodes = [link];
  link.childNodes = [textNode('Introduction')];
  const { candidates } = inspectCandidates([heading, link]);
  assert.deepEqual(candidates, [heading]);
});

test('selects short semantic paragraphs, lists and accessible headings', () => {
  const heading = element({ text: 'Quick Start', tag: 'DIV' });
  heading.matches = selector => selector.includes('[role="heading"]');
  const paragraph = element({ text: 'Ready.', tag: 'P' });
  const listItem = element({ text: 'First', tag: 'LI' });
  listItem.matches = selector => selector.includes('p, li');
  const shortLabel = element({ text: 'Quick Start', tag: 'SPAN' });
  const { candidates } = inspectCandidates([heading, paragraph, listItem, shortLabel]);
  assert.deepEqual(candidates, [heading, paragraph, listItem]);
});

test('accepts one-character semantic text and rejects empty content', () => {
  const heading = element({ text: 'A', tag: 'H3' });
  const paragraph = element({ text: 'I', tag: 'P' });
  const empty = element({ text: ' ', tag: 'P' });
  assert.deepEqual(selectCandidates([heading, paragraph, empty]), [heading, paragraph]);
});

test('does not select short generic containers or interactive controls', () => {
  const shortDiv = element({ text: 'Save', tag: 'DIV' });
  const shortSpan = element({ text: 'Read more', tag: 'SPAN' });
  const button = element({ text: 'Apply changes now to continue', tag: 'BUTTON', parent: 'excluded' });
  const hidden = element({ text: 'Hidden', tag: 'P', visible: false });
  assert.deepEqual(selectCandidates([shortDiv, shortSpan, button, hidden]), []);
});

test('hides and restores existing translations without clearing their text', () => {
  const first = { hidden: false, style: { display: '' }, textContent: 'First translation' };
  const second = { hidden: false, style: { display: '' }, textContent: 'Second translation' };
  const messages = new Map();
  const document = {
    getElementById() { return {}; },
    querySelectorAll(selector) {
      return selector.includes('="translation"') ? [first, second] : [];
    }
  };
  const context = {
    document,
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener(fn) { messages.set('listener', fn); } } } },
    Intl,
    console
  };
  vm.runInNewContext(script, context);
  function send(type) {
    let response;
    messages.get('listener')({ type }, null, value => { response = value; });
    return response;
  }
  assert.equal(send('HIDE_TRANSLATIONS').visible, false);
  assert.equal(first.hidden, true);
  assert.equal(second.style.display, 'none');
  assert.equal(send('GET_TRANSLATION_VISIBILITY').visible, false);
  assert.equal(send('SHOW_TRANSLATIONS').visible, true);
  assert.equal(first.hidden, false);
  assert.equal(second.style.display, '');
  assert.equal(first.textContent, 'First translation');
  assert.equal(second.textContent, 'Second translation');
});

test('translation blocks use no decorative left border', () => {
  const created = [];
  const document = {
    getElementById() { return {}; },
    createElement(tagName) {
      const node = {
        tagName,
        style: {},
        setAttribute(name, value) { this[name] = value; }
      };
      created.push(node);
      return node;
    }
  };
  const context = {
    document,
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    Intl,
    console
  };
  const instrumented = script.replace('  function translationNode(text) {',
    '  globalThis.__makeTranslation = text => translationNode(text);\n  function translationNode(text) {');
  vm.runInNewContext(instrumented, context);
  const translation = context.__makeTranslation('Translated paragraph');
  assert.equal(translation.textContent, 'Translated paragraph');
  assert.doesNotMatch(translation.style.cssText, /border-left\s*:/i);
  assert.match(translation.style.cssText, /background:/);
});

test('floating tab is hidden initially and the same command shows and hides it', () => {
  const messages = new Map();
  const host = { style: { display: 'none' } };
  const document = { getElementById() { return {}; } };
  const context = {
    document,
    window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener(fn) { messages.set('listener', fn); } } } },
    Intl,
    console
  };
  const instrumented = script.replace(
    "  // A small, user-controlled tab provides translation without a persistent settings window.",
    "  // Test-only quick-tab host.\n  globalThis.__setQuickTabHost = host => { quickTabHost = host; };\n  // A small, user-controlled tab provides translation without a persistent settings window."
  );
  vm.runInNewContext(instrumented, context);
  context.__setQuickTabHost(host);
  function toggle() {
    let response;
    messages.get('listener')({ type: 'TOGGLE_QUICK_TAB' }, null, result => { response = result; });
    return response;
  }
  assert.equal(host.style.display, 'none');
  assert.equal(toggle().visible, true);
  assert.equal(host.style.display, '');
  assert.equal(toggle().visible, false);
  assert.equal(host.style.display, 'none');
});

test('floating tab shortcut toggles the tab and ignores repeated keydown events', () => {
  let keydown;
  const host = { style: { display: 'none' } };
  const document = {
    getElementById() { return {}; },
    addEventListener(type, listener) { if (type === 'keydown') keydown = listener; }
  };
  const instrumented = script.replace(
    '  // A small, user-controlled tab provides translation without a persistent settings window.',
    '  globalThis.__setQuickTabHost = host => { quickTabHost = host; };\\n  // A small, user-controlled tab provides translation without a persistent settings window.'
  );
  const context = {
    document, window: { innerHeight: 800 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    Intl, console
  };
  vm.runInNewContext(instrumented, context);
  context.__setQuickTabHost(host);
  let prevented = 0;
  const event = {
    code: 'KeyU', metaKey: true, ctrlKey: false, shiftKey: true,
    altKey: false, repeat: false, target: {},
    preventDefault() { prevented++; }
  };
  keydown(event);
  assert.equal(host.style.display, '');
  keydown({ ...event, repeat: true });
  assert.equal(host.style.display, '');
  assert.equal(prevented, 1);
});

test('notifies extension popup when webpage translation visibility changes', () => {
  const messages = [];
  let listener;
  const document = {
    getElementById() { return {}; },
    querySelectorAll() { return []; }
  };
  const context = {
    document,
    window: { innerHeight: 800 },
    chrome: {
      runtime: {
        id: 'test-extension',
        sendMessage(message) {
          messages.push(message);
          return Promise.resolve();
        },
        onMessage: { addListener(fn) { listener = fn; } }
      }
    },
    Intl,
    console
  };
  vm.runInNewContext(script, context);
  listener({ type: 'HIDE_TRANSLATIONS' }, null, () => {});
  listener({ type: 'SHOW_TRANSLATIONS' }, null, () => {});
  assert.deepEqual(messages.map(message => [message.type, message.visible]), [
    ['TRANSLATION_VISIBILITY_CHANGED', false],
    ['TRANSLATION_VISIBILITY_CHANGED', true]
  ]);
});
