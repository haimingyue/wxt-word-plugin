// @ts-nocheck
export default defineBackground(() => {
const ANKI_URL = 'http://127.0.0.1:8765';

const DEFAULT_CONFIG = {
  deck: '词根词缀记单词',
  model: '词根词缀记单词',
  wordField: 'Word',
  exampleField: 'Example',
  sourceField: 'Source',
  phraseDeck: '短语',
  phraseModel: '短语',
  phraseField: 'Phrase',
  reasonField: 'Reason',
  examplesField: 'Examples',
  vocabDeck: '生词本',
  vocabModel: '生词本',
  vocabWordField: 'word',
  vocabPhoneticField: 'phonetic',
  vocabDefinitionField: 'definition',
  vocabTranslationField: 'translation',
  vocabPosField: 'pos',
  vocabCollinsField: 'collins',
  vocabOxfordField: 'oxford',
  vocabTagField: 'tag',
  vocabBncField: 'bnc',
  vocabFrqField: 'frq',
  vocabExchangeField: 'exchange',
  vocabDetailField: 'detail',
  vocabAudioField: 'audio',
  vocabExampleField: 'example',
  deepseekApiKey: '',
  deepseekModel: 'deepseek-chat',
  deepseekEndpoint: 'https://api.deepseek.com/v1/chat/completions',
  backendBaseUrl: 'http://47.120.34.161:8088'
};
const AUTH_STORAGE_KEY = 'backendAuth';
const DEFAULT_AUTH_STATE = {
  token: '',
  tokenType: 'Bearer',
  username: '',
  vip: 0,
  expiresAt: ''
};
const DEEPSEEK_PROXY_PATH = '/api/v1/deepseek/v1/chat/completions';
const TIMES_FIELD = 'Times';
const LEMMA_FILE_PATH = 'lemma.en.txt';
const ECDICT_INDEX_DIR = 'ecdict-index';
let lemmaIndexPromise = null;
const ecdictIndexCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'anki-example',
    title: '发送短句到 Anki (Ctrl+Shift+L)',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'deepseek-translate',
    title: '翻译单词 (Ctrl+Shift+K)',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'deepseek-translate-sentence',
    title: '翻译整句 (Ctrl+Shift+S)',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'deepseek-parse-sentence',
    title: '句子解析 (Ctrl+Shift+U)',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ecdict-lookup',
    title: '查询单词(本地词典)',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'anki-example' && tab?.id) {
    triggerCapture(tab.id, info.selectionText, info.frameId);
  }

  if (info.menuItemId === 'deepseek-translate' && tab?.id) {
    triggerMeaning(tab.id, info.selectionText, info.frameId);
  }

  if (info.menuItemId === 'deepseek-translate-sentence' && tab?.id) {
    triggerSentenceTranslation(tab.id, info.selectionText, info.frameId);
  }

  if (info.menuItemId === 'deepseek-parse-sentence' && tab?.id) {
    triggerSentenceParse(tab.id, info.selectionText, info.frameId);
  }

  if (info.menuItemId === 'ecdict-lookup' && tab?.id) {
    triggerEcdictLookup(tab.id, info.selectionText, info.frameId);
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-example') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) triggerCapture(tabs[0].id);
    });
  }
  if (command === 'capture-meaning') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) triggerMeaning(tabs[0].id);
    });
  }
  if (command === 'capture-translate-sentence') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) triggerSentenceTranslation(tabs[0].id);
    });
  }
  if (command === 'capture-parse-sentence') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) triggerSentenceParse(tabs[0].id);
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'append-example') {
    appendExampleHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'ping-anki') {
    pingAnki()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'deepseek-meaning') {
    deepseekMeaningHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'deepseek-translate-sentence') {
    deepseekTranslateSentenceHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'deepseek-parse-sentence') {
    deepseekParseSentenceHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'append-phrase-example') {
    appendPhraseExampleHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'add-vocab-note') {
    addVocabNoteHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'deepseek-detect-phrase') {
    deepseekDetectPhraseHandler(msg.payload)
      .then((res) => sendResponse({ success: true, message: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'lookup-ecdict') {
    lookupEcdict(msg.payload?.word)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'normalize-lemma') {
    normalizeLemma(msg.payload?.word)
      .then((lemma) => sendResponse({ success: true, lemma }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'auth-login') {
    loginBackend(msg.payload)
      .then((auth) => sendResponse({ success: true, auth }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'auth-logout') {
    clearAuthState()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'auth-get-status') {
    getAuthState(msg.payload?.refresh === true)
      .then((auth) => sendResponse({ success: true, auth }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  return undefined;
});

function triggerCapture(tabId, selectionText, frameId) {
  sendToContent(tabId, { type: 'trigger-capture', selectionText }, frameId);
}

function triggerMeaning(tabId, selectionText, frameId) {
  sendToContent(tabId, { type: 'trigger-meaning', selectionText }, frameId);
}

function triggerSentenceTranslation(tabId, selectionText, frameId) {
  sendToContent(tabId, { type: 'trigger-translate-sentence', selectionText }, frameId);
}

function triggerSentenceParse(tabId, selectionText, frameId) {
  sendToContent(tabId, { type: 'trigger-parse-sentence', selectionText }, frameId);
}

function triggerEcdictLookup(tabId, selectionText, frameId) {
  sendToContent(tabId, { type: 'trigger-ecdict-lookup', selectionText }, frameId);
}

function sendToContent(tabId, message, frameId) {
  const options = Number.isInteger(frameId) ? { frameId } : undefined;
  chrome.tabs.sendMessage(tabId, message, options, () => {
    const err = chrome.runtime.lastError;
    if (!err) return;
    if (!shouldInjectForError(err?.message)) return;
    injectContent(tabId, frameId, () => {
      chrome.tabs.sendMessage(tabId, message, options, () => {
        if (chrome.runtime.lastError) return;
      });
    });
  });
}

function shouldInjectForError(message = '') {
  const text = String(message).toLowerCase();
  return (
    text.includes('receiving end does not exist') ||
    text.includes('could not establish connection')
  );
}

function injectContent(tabId, frameId, done) {
  const target = Number.isInteger(frameId)
    ? { tabId, frameIds: [frameId] }
    : { tabId };

  chrome.scripting.insertCSS({ target, files: ['content.css'] }, () => {
    if (chrome.runtime.lastError) return;
    chrome.scripting.executeScript({ target, files: ['content.js'] }, () => {
      if (chrome.runtime.lastError) return;
      done?.();
    });
  });
}

async function normalizeLemma(word) {
  const raw = String(word || '').trim();
  if (!raw) return '';
  const map = await loadLemmaIndex();
  const key = raw.toLowerCase();
  return map.get(key) || raw;
}

async function loadLemmaIndex() {
  if (lemmaIndexPromise) return lemmaIndexPromise;
  lemmaIndexPromise = (async () => {
    const res = await fetch(chrome.runtime.getURL(LEMMA_FILE_PATH));
    if (!res.ok) throw new Error('lemma 索引加载失败');
    const text = await res.text();
    return buildLemmaIndex(text);
  })();
  return lemmaIndexPromise;
}

function buildLemmaIndex(text) {
  const map = new Map();
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith(';')) continue;
    const parts = raw.split('->');
    if (parts.length < 2) continue;
    const lemma = parts[0].split('/')[0]?.trim();
    if (!lemma) continue;
    const lemmaKey = lemma.toLowerCase();
    if (!map.has(lemmaKey)) map.set(lemmaKey, lemma);
    const variants = parts[1].split(',');
    for (const variant of variants) {
      const cleaned = variant.trim();
      if (!cleaned) continue;
      const variantKey = cleaned.toLowerCase();
      if (!map.has(variantKey)) map.set(variantKey, lemma);
    }
  }
  return map;
}

async function lookupEcdict(word) {
  const raw = String(word || '').trim();
  if (!raw) return { entry: null, meaning: '' };
  const key = raw.toLowerCase();
  const index = await loadEcdictIndex(getEcdictBucket(key));
  let entry = index[key] || null;
  let entryWord = raw;
  if (!entry) {
    const lemma = await normalizeLemma(raw);
    const lemmaKey = String(lemma || '').toLowerCase();
    if (lemmaKey && lemmaKey !== key) {
      const lemmaIndex = await loadEcdictIndex(getEcdictBucket(lemmaKey));
      entry = lemmaIndex[lemmaKey] || null;
      if (entry) entryWord = lemmaKey;
    }
  }
  const normalized = entry ? normalizeEcdictEntry(entryWord, entry) : null;
  return {
    entry: normalized,
    meaning: normalized?.translation || normalized?.definition || ''
  };
}

function getEcdictBucket(key) {
  const first = String(key || '')[0] || '';
  if (first >= 'a' && first <= 'z') return first;
  return 'other';
}

async function loadEcdictIndex(bucket) {
  if (ecdictIndexCache.has(bucket)) return ecdictIndexCache.get(bucket);
  const loader = (async () => {
    const url = chrome.runtime.getURL(`${ECDICT_INDEX_DIR}/${bucket}.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error('ECDICT 加载失败');
    return res.json();
  })();
  ecdictIndexCache.set(bucket, loader);
  return loader;
}

function normalizeEcdictEntry(word, entry) {
  if (typeof entry === 'string') {
    const text = normalizeEcdictText(entry);
    return {
      word: String(word || '').trim(),
      phonetic: '',
      definition: '',
      translation: text,
      pos: '',
      collins: '',
      oxford: '',
      tag: '',
      bnc: '',
      frq: '',
      exchange: '',
      detail: '',
      audio: ''
    };
  }
  const fields = Array.isArray(entry) ? entry : [];
  return {
    word: String(word || '').trim(),
    phonetic: normalizeEcdictText(fields[0]),
    definition: normalizeEcdictText(fields[1]),
    translation: normalizeEcdictText(fields[2]),
    pos: normalizeEcdictText(fields[3]),
    collins: normalizeEcdictText(fields[4]),
    oxford: normalizeEcdictText(fields[5]),
    tag: normalizeEcdictText(fields[6]),
    bnc: normalizeEcdictText(fields[7]),
    frq: normalizeEcdictText(fields[8]),
    exchange: normalizeEcdictText(fields[9]),
    detail: normalizeEcdictText(fields[10]),
    audio: normalizeEcdictText(fields[11])
  };
}

function normalizeEcdictText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .trim();
}

function isWebSourceUrl(sourceUrl) {
  return /^https?:\/\//i.test(String(sourceUrl || '').trim());
}

function buildDateTag(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}::${month}::${day}`;
}

function buildNoteTags(sourceUrl) {
  const tags = [buildDateTag()];
  if (isWebSourceUrl(sourceUrl)) {
    tags.push('web-read');
  }
  return tags;
}

async function appendExampleHandler(payload) {
  const {
    word,
    sentence,
    sourceUrl,
    sourceTitle,
    meaning,
    translation,
    skipTranslation,
    skipMeaning
  } = payload || {};
  if (!word || !sentence) throw new Error('缺少单词或句子');

  const config = await getConfig();
  const lemmaWord = await normalizeLemma(word);
  const lookupOrder = lemmaWord && lemmaWord !== word ? [lemmaWord, word] : [word];
  let noteIds = [];
  for (const candidate of lookupOrder) {
    noteIds = await findNotesByWord(config, candidate);
    if (noteIds.length) break;
  }
  if (!noteIds.length) throw new Error('未找到对应单词卡片');

  const notes = await notesInfo(noteIds);
  let meaningKeyword = skipMeaning ? '' : extractMeaning(meaning);
  if (!meaningKeyword && !skipMeaning) {
    try {
      meaningKeyword = extractMeaning(await deepseekMeaningHandler({ word, sentence }));
    } catch (err) {
      meaningKeyword = '';
    }
  }
  let translatedSentence = skipTranslation ? '' : String(translation || '').trim();
  if (!translatedSentence && !skipTranslation) {
    try {
      translatedSentence = await deepseekTranslateSentenceHandler({
        sentence,
        word,
        meaning: meaningKeyword
      });
    } catch (err) {
      translatedSentence = '';
    }
  }
  const entry = buildExampleEntry(sentence, sourceUrl, sourceTitle, {
    highlightWord: word,
    translation: translatedSentence,
    highlightMeaning: meaningKeyword
  });
  const sourceEntry = buildSourceEntry(sourceUrl, sourceTitle);
  const noteTags = buildNoteTags(sourceUrl);

  for (const note of notes) {
    const currentExample = note.fields[config.exampleField]?.value || '';
    const updatedExample = appendDedup(currentExample, entry);
    const fields = { [config.exampleField]: updatedExample };

    if (config.sourceField) {
      const currentSource = note.fields[config.sourceField]?.value || '';
      fields[config.sourceField] = appendDedup(currentSource, sourceEntry);
    }

    if (note.fields && Object.prototype.hasOwnProperty.call(note.fields, TIMES_FIELD)) {
      const currentTimes = parseTimesValue(note.fields[TIMES_FIELD]?.value);
      fields[TIMES_FIELD] = String(currentTimes + 1);
    }

    await updateNoteFields(note.noteId, fields);
  }

  await addNoteTags(noteIds, noteTags);

  return '已追加到 Anki';
}

async function appendPhraseExampleHandler(payload) {
  const { keyword, sentence, sourceUrl, sourceTitle, phrase, meaning } = payload || {};
  const candidate = String(keyword || '').trim();
  const cleanSentence = String(sentence || '').trim();
  const providedPhrase = String(phrase || '').trim();
  const providedMeaning = String(meaning || '').trim();
  if (!candidate || !cleanSentence) throw new Error('缺少关键词或句子');

  const phraseInfo =
    providedPhrase && providedMeaning
      ? { isPhrase: true, phrase: providedPhrase, meaning: providedMeaning }
      : await deepseekPhraseDetect(candidate, cleanSentence);
  if (!phraseInfo?.isPhrase || !phraseInfo.phrase) {
    throw new Error('未检测到短语');
  }
  if (!phraseInfo.meaning) {
    throw new Error('未返回短语释义');
  }

  let translatedSentence = '';
  try {
    translatedSentence = await deepseekTranslateSentenceHandler({
      sentence: cleanSentence,
      word: phraseInfo.phrase,
      meaning: phraseInfo.meaning
    });
  } catch (err) {
    translatedSentence = '';
  }

  const config = await getConfig();
  if (!config.phraseField) throw new Error('未配置短语字段');
  if (!config.reasonField && !config.examplesField) {
    throw new Error('未配置 Reason/Examples 字段');
  }

  const noteIds = await findNotesByPhrase(config, phraseInfo.phrase);

  const entry = buildExampleEntry(cleanSentence, sourceUrl, sourceTitle, {
    highlightWord: phraseInfo.phrase,
    translation: translatedSentence,
    highlightMeaning: phraseInfo.meaning
  });
  const noteTags = buildNoteTags(sourceUrl);
  if (!noteIds.length) {
    const fields = {
      [config.phraseField]: phraseInfo.phrase
    };
    if (config.reasonField) fields[config.reasonField] = phraseInfo.meaning;
    if (config.examplesField) fields[config.examplesField] = entry;

    try {
      await addNote({
        deckName: config.phraseDeck,
        modelName: config.phraseModel,
        fields
      });
    } catch (err) {
      const message = String(err?.message || err || '');
      if (message.includes('cannot create note because it is empty')) {
        throw new Error('短语卡片字段为空，请检查短语字段配置');
      }
      throw err;
    }
    return '已新增短语卡片';
  }

  const notes = await notesInfo(noteIds);
  for (const note of notes) {
    const fields = {};
    if (config.reasonField) {
      const currentReason = note.fields[config.reasonField]?.value || '';
      fields[config.reasonField] = appendDedup(currentReason, phraseInfo.meaning);
    }
    if (config.examplesField) {
      const currentExamples = note.fields[config.examplesField]?.value || '';
      fields[config.examplesField] = appendDedup(currentExamples, entry);
    }
    if (Object.keys(fields).length) {
      await updateNoteFields(note.noteId, fields);
    }
  }

  await addNoteTags(noteIds, noteTags);

  return '已追加到短语卡片';
}

async function addVocabNoteHandler(payload) {
  const { word, entry, sentence, translation, meaning, sourceUrl, sourceTitle } = payload || {};
  const cleanWord = String(word || '').trim();
  if (!cleanWord) throw new Error('缺少单词');

  const config = await getConfig();
  const noteTags = buildNoteTags(sourceUrl);
  const cleanMeaning = String(meaning || '').trim();
  const exampleMeaning = cleanMeaning ? extractMeaning(cleanMeaning) || cleanMeaning : '';
  const exampleValue = config.vocabExampleField
    ? buildVocabExampleValue(sentence, translation, exampleMeaning)
    : '';
  const existingNoteIds = await findNotesByVocabWord(config, cleanWord);
  if (existingNoteIds.length) {
    const notes = await notesInfo(existingNoteIds);
    let updated = false;
    for (const note of notes) {
      const fields = {};
      if (config.vocabExampleField && exampleValue) {
        const currentExample = note.fields[config.vocabExampleField]?.value || '';
        const updatedExample = appendDedup(currentExample, exampleValue);
        if (updatedExample !== currentExample) {
          fields[config.vocabExampleField] = updatedExample;
        }
      }
      if (Object.keys(fields).length) {
        await updateNoteFields(note.noteId, fields);
        updated = true;
      }
    }
    if (updated) {
      await addNoteTags(existingNoteIds, noteTags);
      return '已追加到生词本';
    }
    return '单词已存在';
  }

  let ecdictEntry = entry;
  if (!ecdictEntry) {
    const lookup = await lookupEcdict(cleanWord);
    ecdictEntry = lookup?.entry || null;
  }
  if (!ecdictEntry) {
    throw new Error('未找到本地词典释义');
  }

  const deckName = config.vocabDeck || config.deck;
  const modelName = config.vocabModel || config.model;
  const fieldMap = {
    word: config.vocabWordField,
    phonetic: config.vocabPhoneticField,
    definition: config.vocabDefinitionField,
    translation: config.vocabTranslationField,
    pos: config.vocabPosField,
    collins: config.vocabCollinsField,
    oxford: config.vocabOxfordField,
    tag: config.vocabTagField,
    bnc: config.vocabBncField,
    frq: config.vocabFrqField,
    exchange: config.vocabExchangeField,
    detail: config.vocabDetailField,
    audio: config.vocabAudioField
  };
  const fields = {};
  Object.entries(fieldMap).forEach(([key, fieldName]) => {
    if (!fieldName) return;
    const value = ecdictEntry[key];
    fields[fieldName] = value == null ? '' : String(value);
  });

  if (config.vocabExampleField) {
    fields[config.vocabExampleField] = exampleValue;
  }

  if (!Object.keys(fields).length) {
    throw new Error('未配置生词本字段');
  }

  try {
    const note = {
      deckName,
      modelName,
      fields
    };
    if (noteTags.length) {
      note.tags = noteTags;
    }
    await addNote(note);
  } catch (err) {
    const message = String(err?.message || err || '');
    if (message.includes('cannot create note because it is empty')) {
      throw new Error('生词本字段为空，请检查配置');
    }
    throw err;
  }

  return '已添加到生词本';
}

function buildVocabExampleValue(sentence, translation, meaning) {
  const cleanSentence = String(sentence || '').replace(/\s+/g, ' ').trim();
  const cleanTranslation = String(translation || '').replace(/\s+/g, ' ').trim();
  const cleanMeaning = String(meaning || '').replace(/\s+/g, ' ').trim();
  if (!cleanSentence && !cleanTranslation && !cleanMeaning) return '';
  const parts = [];
  if (cleanSentence) {
    parts.push(`<div data-anki-sentence="true">${escapeHtml(cleanSentence)}</div>`);
  }
  if (cleanMeaning) {
    parts.push(`<div data-anki-meaning="true">${escapeHtml(cleanMeaning)}</div>`);
  }
  if (cleanTranslation) {
    parts.push(`<div data-anki-translation="true">${escapeHtml(cleanTranslation)}</div>`);
  }
  return parts.join('');
}

async function findNotesByVocabWord(config, word) {
  const model = config.vocabModel || config.model;
  const deck = config.vocabDeck || config.deck;
  const field = config.vocabWordField || config.wordField;
  if (model && field && word) {
    const query = `"note:${model}" "${field}:${word}"`;
    return ankiInvoke('findNotes', { query });
  }
  if (deck && field && word) {
    const query = `"deck:${deck}" "${field}:${word}"`;
    return ankiInvoke('findNotes', { query });
  }
  return [];
}

async function ankiInvoke(action, params = {}) {
  const res = await fetch(ANKI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, version: 6, params })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

async function addNoteTags(noteIds, tags) {
  if (!noteIds?.length || !tags) return null;
  const tagList = Array.isArray(tags)
    ? tags.map((tag) => String(tag || '').trim()).filter(Boolean)
    : String(tags || '').trim().split(/\s+/).filter(Boolean);
  if (!tagList.length) return null;
  return ankiInvoke('addTags', { notes: noteIds, tags: tagList.join(' ') });
}

async function pingAnki() {
  return ankiInvoke('version');
}

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...stored };
}

function normalizeBaseUrl(url) {
  return String(url || DEFAULT_CONFIG.backendBaseUrl)
    .trim()
    .replace(/\/+$/, '');
}

function normalizeTokenType(tokenType) {
  const clean = String(tokenType || '').trim();
  if (!clean) return DEFAULT_AUTH_STATE.tokenType;
  return clean.replace(/\s+$/, '');
}

function buildAuthorizationHeader(tokenType, token) {
  const cleanToken = String(token || '').trim();
  if (!cleanToken) return '';
  const cleanType = normalizeTokenType(tokenType);
  return `${cleanType} ${cleanToken}`.trim();
}

function normalizeAuthState(raw) {
  const token = String(raw?.token || '').trim();
  if (!token) return { ...DEFAULT_AUTH_STATE };
  return {
    token,
    tokenType: normalizeTokenType(raw?.tokenType),
    username: String(raw?.username || '').trim(),
    vip: Number(raw?.vip) === 1 ? 1 : 0,
    expiresAt: String(raw?.expiresAt || '').trim()
  };
}

async function saveAuthState(state) {
  const normalized = normalizeAuthState(state);
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: normalized });
  return normalized;
}

async function clearAuthState() {
  await chrome.storage.local.remove(AUTH_STORAGE_KEY);
}

async function getStoredAuthState() {
  const stored = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  return normalizeAuthState(stored?.[AUTH_STORAGE_KEY]);
}

function buildClientDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function requestJson(url, options = {}, fallbackMessage = '请求失败') {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    throw new Error(`${fallbackMessage}：网络错误`);
  }
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (err) {
      json = null;
    }
  }
  if (!res.ok) {
    const message =
      json?.msg ||
      json?.error?.message ||
      (text && text.length < 120 ? text : '') ||
      `${fallbackMessage} (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  if (!json) {
    throw new Error(`${fallbackMessage}：返回格式错误`);
  }
  return json;
}

function extractJsonData(json, fallbackMessage) {
  if (json?.code !== 0) {
    throw new Error(json?.msg || fallbackMessage);
  }
  return json?.data || null;
}

async function fetchProfile(baseUrl, auth) {
  const authorization = buildAuthorizationHeader(auth?.tokenType, auth?.token);
  if (!authorization) throw new Error('登录已失效，请重新登录');
  const profileJson = await requestJson(
    `${baseUrl}/api/v1/auth/profile`,
    {
      method: 'GET',
      headers: {
        Authorization: authorization
      }
    },
    '获取用户信息失败'
  );
  const profile = extractJsonData(profileJson, '获取用户信息失败');
  return {
    token: auth.token,
    tokenType: auth.tokenType,
    username: String(profile?.username || auth.username || '').trim(),
    vip: Number(profile?.vip) === 1 ? 1 : 0,
    expiresAt: String(profile?.expiresAt || '').trim()
  };
}

async function getAuthState(refresh = false) {
  const auth = await getStoredAuthState();
  if (!refresh || !auth.token) return auth;
  const config = await getConfig();
  const baseUrl = normalizeBaseUrl(config.backendBaseUrl);
  try {
    const refreshed = await fetchProfile(baseUrl, auth);
    return saveAuthState(refreshed);
  } catch (err) {
    if (err?.status === 401) {
      await clearAuthState();
      return { ...DEFAULT_AUTH_STATE };
    }
    throw err;
  }
}

async function loginBackend(payload) {
  const username = String(payload?.username || '').trim();
  const password = String(payload?.password || '').trim();
  if (!username || !password) {
    throw new Error('请输入用户名和密码');
  }
  const config = await getConfig();
  const baseUrl = normalizeBaseUrl(config.backendBaseUrl);

  const loginJson = await requestJson(
    `${baseUrl}/api/v1/auth/login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    },
    '登录失败'
  );
  const loginData = extractJsonData(loginJson, '登录失败');
  const token = String(loginData?.token || '').trim();
  if (!token) {
    throw new Error('登录失败：后端未返回 token');
  }
  const tokenType = normalizeTokenType(loginData?.tokenType);
  const auth = await fetchProfile(baseUrl, { token, tokenType, username });
  return saveAuthState(auth);
}

async function deepseekMeaningHandler(payload) {
  const word = String(payload?.word || '').trim();
  const sentence = String(payload?.sentence || '').trim();
  if (!word || !sentence) throw new Error('缺少单词或句子');

  const prompt = [
    '你是英汉词义消歧助手。',
    '给定单词和句子，选择该单词在该句子中的最合适中文释义。',
    '只输出两行：',
    '释义：<2-8字>',
    '说明：<一句话解释>',
    '不要输出其他内容。'
  ].join('\n');

  return deepseekChat([
    { role: 'system', content: prompt },
    { role: 'user', content: `单词：${word}\n句子：${sentence}` }
  ]);
}

async function deepseekTranslateSentenceHandler(payload) {
  const sentence = String(payload?.sentence || '').trim();
  const word = String(payload?.word || '').trim();
  const rawMeaning = String(payload?.meaning || '').trim();
  const meaning = extractMeaning(rawMeaning) || rawMeaning;
  if (!sentence) throw new Error('缺少句子');

  const prompt = meaning
    ? [
        '你是中英翻译助手。',
        '将给定英文句子翻译为中文，保持通顺自然。',
        `目标单词：${word || '（未提供）'}`,
        `目标词释义：${meaning}`,
        `要求：译文中该目标词必须译为“${meaning}”，保持原样，不要使用同义词或改写。`,
        '只输出译文，不要输出其他内容。'
      ].join('\n')
    : [
        '你是中英翻译助手。',
        '将给定英文句子翻译为中文，保持通顺自然。',
        '只输出译文，不要输出其他内容。'
      ].join('\n');

  return deepseekChat([
    { role: 'system', content: prompt },
    { role: 'user', content: sentence }
  ]);
}

async function deepseekParseSentenceHandler(payload) {
  const sentence = String(payload?.sentence || '').trim();
  if (!sentence) throw new Error('缺少句子');

  const prompt = [
    '你是英文句子语法解析助手，也是耐心的英语老师。',
    '面向英语初学者讲解，语气友好、易懂，避免术语堆砌。',
    '给定英文句子，请输出 JSON：',
    '{"segments":[{"text":"","role":""}],"notes":[""],"translation":""}',
    '要求：',
    '- segments 按句子原顺序分段，覆盖全句，保留原始标点与空格。',
    '- role 用中文：主语/谓语/宾语/补语/状语/定语/从句/插入语/连词/其他。',
    '- notes 用中文要点列表（3-6条），像老师讲解：',
    '  * 先说明句子整体意思与主干。',
    '  * 逐条解释从句/短语/非谓语等结构（如必须用术语，用括号解释）。',
    '  * 对关键短语或生词给出简短中文含义。',
    '- translation 为整句中文释义。',
    '只输出 JSON，不要输出其他内容。'
  ].join('\n');

  return deepseekChat([
    { role: 'system', content: prompt },
    { role: 'user', content: sentence }
  ]);
}

async function deepseekPhraseDetect(keyword, sentence) {
  const prompt = [
    '你是英文短语识别助手。',
    '给定候选关键词(1-2个英文单词)与句子，判断该关键词是否在句子中构成常见短语/搭配。',
    '如果是，返回短语本身与对应中文释义；如果不是，标记为否。',
    '只输出 JSON：{"is_phrase":true/false,"phrase":"","meaning":""}',
    '不要输出任何其他内容。'
  ].join('\n');

  const content = await deepseekChat([
    { role: 'system', content: prompt },
    { role: 'user', content: `关键词：${keyword}\n句子：${sentence}` }
  ]);

  const parsed = parseJsonFromText(content);
  if (!parsed || typeof parsed !== 'object') throw new Error('短语识别结果解析失败');
  const isPhrase = Boolean(parsed.is_phrase ?? parsed.isPhrase);
  return {
    isPhrase,
    phrase: String(parsed.phrase || '').trim(),
    meaning: String(parsed.meaning || '').trim()
  };
}

function parseJsonFromText(text) {
  if (!text) return null;
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    return null;
  }
}

async function deepseekDetectPhraseHandler(payload) {
  const keyword = String(payload?.keyword || '').trim();
  const sentence = String(payload?.sentence || '').trim();
  if (!keyword || !sentence) throw new Error('缺少关键词或句子');

  const phraseInfo = await deepseekPhraseDetect(keyword, sentence);
  if (!phraseInfo?.isPhrase || !phraseInfo.phrase) {
    return { isPhrase: false, phrase: '', meaning: '' };
  }
  return {
    isPhrase: true,
    phrase: phraseInfo.phrase,
    meaning: phraseInfo.meaning || ''
  };
}

async function deepseekChat(messages) {
  const config = await getConfig();
  const auth = await getStoredAuthState();
  const endpoint = DEFAULT_CONFIG.deepseekEndpoint;
  const model = config.deepseekModel || DEFAULT_CONFIG.deepseekModel;
  let backendError = null;

  if (auth.token) {
    try {
      return await deepseekProxyChat(config, auth, model, messages);
    } catch (err) {
      backendError = err;
      if (err?.status === 401) {
        await clearAuthState();
      }
    }
  }

  const apiKey = String(config.deepseekApiKey || '').trim();
  if (!apiKey) {
    if (backendError) throw mapBackendDeepseekError(backendError);
    throw new Error('请先登录账号（VIP 可免 Key）或在选项页配置 DeepSeek API Key');
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages
    })
  });

  const json = await res.json();
  if (!res.ok || json?.error) {
    const message = json?.error?.message || `DeepSeek 请求失败 (${res.status})`;
    throw new Error(message);
  }
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('DeepSeek 未返回内容');
  return content;
}

function mapBackendDeepseekError(error) {
  const status = Number(error?.status || 0);
  if (status === 401) {
    return new Error('登录已失效，请在选项页重新登录');
  }
  if (status === 403) {
    return new Error('当前账号不是 VIP，请配置 DeepSeek API Key，或升级 VIP 后重试');
  }
  const message = String(error?.message || '').trim();
  if (message) return new Error(message);
  return new Error('后端 DeepSeek 代理请求失败');
}

async function deepseekProxyChat(config, auth, model, messages) {
  const baseUrl = normalizeBaseUrl(config.backendBaseUrl);
  const authorization = buildAuthorizationHeader(auth.tokenType, auth.token);
  if (!authorization) {
    throw new Error('登录已失效，请重新登录');
  }
  const json = await requestJson(
    `${baseUrl}${DEEPSEEK_PROXY_PATH}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        'X-Client-Date': buildClientDate()
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages
      })
    },
    '后端 DeepSeek 请求失败'
  );
  if (json?.error) {
    throw new Error(json.error.message || '后端 DeepSeek 请求失败');
  }
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('后端 DeepSeek 未返回内容');
  }
  return content;
}

async function findNotesByWord(config, word) {
  const query = `"deck:${config.deck}" "${config.wordField}:${word}"`;
  return ankiInvoke('findNotes', { query });
}

async function findNotesByPhrase(config, phrase) {
  const query = `"deck:${config.phraseDeck}" "${config.phraseField}:${phrase}"`;
  return ankiInvoke('findNotes', { query });
}

async function notesInfo(noteIds) {
  return ankiInvoke('notesInfo', { notes: noteIds });
}

async function updateNoteFields(noteId, fields) {
  return ankiInvoke('updateNoteFields', { note: { id: noteId, fields } });
}

async function addNote(note) {
  return ankiInvoke('addNote', { note });
}

function splitEntries(raw) {
  return raw
    .split(/<br\s*\/?>/i)
    .flatMap((part) => part.split('\n'))
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeForCompare(text) {
  return stripTranslationBlock(text)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function appendDedup(current, next) {
  const parts = splitEntries(current);
  const target = normalizeForCompare(next);
  if (!parts.some((p) => normalizeForCompare(p) === target)) {
    parts.push(next);
  }
  return parts.join('<br>');
}

function buildLink(url, title) {
  if (!url && !title) return '';
  if (!url) return escapeHtml(title);
  const safeTitle = escapeHtml(title || url);
  const safeUrl = escapeAttr(url);
  return `<a href="${safeUrl}" target="_blank" rel="noopener">${safeTitle}</a>`;
}

function buildSourceLabel(url, title) {
  if (!url) return String(title || '').trim();
  if (isWebSourceUrl(url)) {
    return '';
  }
  return String(title || url || '').trim();
}

function buildExampleEntry(sentence, url, title, options = {}) {
  const label = buildSourceLabel(url, title);
  const source = label ? buildLink(url, label) : '';
  const highlightWord = String(options.highlightWord || '').trim();
  const highlightMeaning = String(options.highlightMeaning || '').trim();
  const translation = String(options.translation || '').trim();

  const sentenceHtml = highlightWord
    ? highlightText(sentence, highlightWord)
    : escapeHtml(sentence);
  const sentenceLine = source ? `${sentenceHtml} — ${source}` : sentenceHtml;
  if (!translation) return sentenceLine;

  const translationHtml = highlightMeaning
    ? highlightText(translation, highlightMeaning)
    : escapeHtml(translation);
  return `<div data-anki-sentence="true">${sentenceLine}</div><div data-anki-translation="true">${translationHtml}</div>`;
}

function buildSourceEntry(url, title) {
  const label = buildSourceLabel(url, title);
  if (!label) return '';
  return buildLink(url, label);
}

function stripTranslationBlock(text) {
  return String(text || '').replace(
    /<div[^>]*data-anki-translation[^>]*>[\s\S]*?<\/div>/gi,
    ''
  );
}

function extractMeaning(rawMeaning) {
  const text = String(rawMeaning || '').trim();
  if (!text) return '';
  const match = text.match(/释义[:：]\s*([^\n\r]+)/);
  if (match) return match[1].trim();
  const firstLine = text.split(/\r?\n/)[0].trim();
  return firstLine.replace(/^释义[:：]\s*/i, '').trim();
}

function parseTimesValue(raw) {
  const text = String(raw || '').replace(/<[^>]*>/g, '').trim();
  const num = parseInt(text, 10);
  return Number.isFinite(num) ? num : 0;
}

function escapeRegExp(str = '') {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, keyword) {
  const raw = String(text || '');
  const needle = String(keyword || '').trim();
  if (!raw || !needle) return escapeHtml(raw);

  const regex = new RegExp(escapeRegExp(needle), 'gi');
  let result = '';
  let lastIndex = 0;
  let match = regex.exec(raw);
  if (!match) return escapeHtml(raw);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    result += escapeHtml(raw.slice(lastIndex, start));
    result += `<span style="color:#d32f2f;">${escapeHtml(match[0])}</span>`;
    lastIndex = end;
    match = regex.exec(raw);
  }
  result += escapeHtml(raw.slice(lastIndex));
  return result;
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str = '') {
  return str.replace(/"/g, '&quot;');
}

});

