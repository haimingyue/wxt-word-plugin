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
const subtitleCache = new Map();
const subtitleRequestAtByCacheKey = new Map();
const subtitleInflightByKey = new Map();
const SUBTITLE_CACHE_LIMIT = 60;
const SUBTITLE_REQUEST_INTERVAL_MS = 1000;
const SUBTITLE_RETRY_BACKOFF_MS = [400, 900, 1800];
const SUBTITLE_HTML_RETRY_LIMIT = 2;
const SUBTITLE_POSITIVE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const SUBTITLE_NEGATIVE_CACHE_TTL_MS = 60 * 1000;
/**
 * `yt-load-subtitles` payload (from content):
 * {
 *   videoId, track, fallbackUrl,
 *   pageContext: { source, htmlReason, attempts[], candidates[], responses[], timings }
 * }
 */

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

  if (msg?.type === 'deepseek-translate-batch') {
    deepseekTranslateBatchHandler(msg.payload)
      .then((res) => sendResponse({ success: true, translations: res }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'deepseek-translate-grouped') {
    deepseekTranslateGroupedHandler(msg.payload)
      .then((res) => sendResponse({ success: true, translations: res }))
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

  if (msg?.type === 'deepseek-ready') {
    canUseDeepseek()
      .then((ready) => sendResponse({ success: true, ready }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'yt-fetch-text') {
    fetchYoutubeText(msg.payload?.url || msg.url, sender)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'yt-get-caption-tracks') {
    fetchYoutubeCaptionTracks(msg.payload?.videoId || msg.videoId)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (msg?.type === 'yt-load-subtitles') {
    loadYoutubeSubtitles(msg.payload, sender)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) =>
        sendResponse({
          success: false,
          message: err?.message || '字幕加载失败',
          code: err?.code || 'SUBTITLE_FAILED'
        })
      );
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

async function deepseekTranslateBatchHandler(payload) {
  const sentences = Array.isArray(payload?.sentences)
    ? payload.sentences.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!sentences.length) throw new Error('缺少批量句子');
  if (sentences.length > 20) throw new Error('批量句子过多');

  const numbered = sentences.map((sentence, idx) => `${idx + 1}. ${sentence}`).join('\n');
  const prompt = [
    '你是中英翻译助手。',
    '请将多条英文句子逐条翻译为中文，保持自然通顺。',
    '输出必须是 JSON，且只输出 JSON，不要额外说明。',
    '格式：{"translations":["译文1","译文2",...]}',
    'translations 数组长度必须与输入句子数量完全一致，顺序一一对应。'
  ].join('\n');
  const raw = await deepseekChat([
    { role: 'system', content: prompt },
    { role: 'user', content: `句子列表：\n${numbered}` }
  ]);
  const cleaned = String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: any = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // no-op
  }
  const translations = Array.isArray(parsed?.translations)
    ? parsed.translations
    : Array.isArray(parsed)
      ? parsed
      : [];
  const normalized = translations.map((item) => String(item || '').trim());
  if (normalized.length !== sentences.length) {
    throw new Error('批量翻译结果数量不匹配');
  }
  return normalized;
}

async function deepseekTranslateGroupedHandler(payload) {
  const segments = Array.isArray(payload?.segments)
    ? payload.segments.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!segments.length) throw new Error('缺少分组句子');
  if (segments.length > 40) throw new Error('分组句子过多');

  const separator = '\n\n%%\n\n';
  const content = segments.join(separator);
  const prompt = [
    '你是一个专业的简体中文母语译者，需将文本流畅地翻译为简体中文。',
    '翻译规则：',
    '1) 仅输出译文内容，禁止解释或添加额外文字。',
    '2) 必须保持与输入完全相同的段落数量与顺序。',
    '3) 段落之间必须使用分隔符“%%”分隔，且分隔数量保持一致。',
    '4) 不可合并段落，不可遗漏段落。',
    `5) 本次必须输出 ${segments.length} 段；若无法翻译某段，保留原文占位。`
  ].join('\n');
  const raw = await deepseekChat([
    { role: 'system', content: prompt },
    { role: 'user', content: `翻译为简体中文：\n\n${content}` }
  ]);

  const normalized = parseGroupedTranslationsOutput(raw, segments.length);
  if (normalized.length !== segments.length) {
    throw new Error('分组翻译结果数量不匹配');
  }
  return normalized;
}

function parseGroupedTranslationsOutput(raw, expectedCount) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/, '');
  const normalized = cleaned.replace(/\r\n/g, '\n');

  let parsed: any = null;
  try {
    parsed = JSON.parse(normalized);
  } catch (_) {
    parsed = null;
  }
  const jsonTranslations = Array.isArray(parsed?.translations)
    ? parsed.translations
    : Array.isArray(parsed)
      ? parsed
      : [];
  const normalizedJson = jsonTranslations.map((item) => String(item || '').trim());
  if (normalizedJson.length === expectedCount) {
    return normalizedJson;
  }

  const bySeparator = normalized
    .split(/\n?\s*%%\s*\n?/g)
    .map((item) => String(item ?? '').trim());
  if (bySeparator.length === expectedCount) {
    return bySeparator;
  }

  // fallback: some models return plain "%%" without surrounding newlines
  const byRawToken = normalized
    .split('%%')
    .map((item) => String(item ?? '').trim());
  if (byRawToken.length === expectedCount) {
    return byRawToken;
  }

  // final fallback for single segment.
  if (expectedCount === 1 && normalized) {
    return [normalized.trim()];
  }

  return [];
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

async function canUseDeepseek() {
  const auth = await getStoredAuthState();
  if (String(auth?.token || '').trim()) return true;
  const config = await getConfig();
  return Boolean(String(config?.deepseekApiKey || '').trim());
}

function isAllowedYoutubeFetchUrl(url) {
  const host = String(url?.hostname || '').toLowerCase();
  return (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  );
}

function normalizeYoutubeVideoId(rawVideoId) {
  const videoId = String(rawVideoId || '').trim();
  if (!videoId) return '';
  if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) return '';
  return videoId;
}

function extractInnertubeValueFromHtml(html, key) {
  const source = String(html || '');
  if (!source) return '';
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*"([^"]+)"`);
  const match = source.match(pattern);
  if (!match?.[1]) return '';
  return String(match[1])
    .replace(/\\u0026/g, '&')
    .replace(/\\"/g, '"')
    .trim();
}

function extractYoutubeCaptionTracks(payload) {
  const tracks = payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(tracks)) return [];
  return tracks
    .map((track) => {
      const baseUrl = String(track?.baseUrl || '').trim();
      if (!baseUrl) return null;
      return {
        baseUrl,
        languageCode: String(track?.languageCode || ''),
        kind: String(track?.kind || ''),
        vssId: String(track?.vssId || ''),
        name: track?.name || null,
        isTranslatable: Boolean(track?.isTranslatable)
      };
    })
    .filter(Boolean);
}

async function fetchYoutubeCaptionTracks(rawVideoId) {
  const videoId = normalizeYoutubeVideoId(rawVideoId);
  if (!videoId) {
    throw new Error('视频 ID 无效');
  }

  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`;
  const watchRes = await fetch(watchUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/html,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
    }
  });
  const watchHtml = await watchRes.text();
  if (!watchRes.ok) {
    throw new Error(`读取 watch 页面失败 (${watchRes.status})`);
  }

  const apiKey = extractInnertubeValueFromHtml(watchHtml, 'INNERTUBE_API_KEY');
  if (!apiKey) {
    throw new Error('watch 页面未提取到 INNERTUBE_API_KEY');
  }
  const clientVersion =
    extractInnertubeValueFromHtml(watchHtml, 'INNERTUBE_CLIENT_VERSION') || '2.20260201.01.00';
  const clientName =
    extractInnertubeValueFromHtml(watchHtml, 'INNERTUBE_CLIENT_NAME') || 'WEB';

  const endpoint =
    `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}` +
    '&prettyPrint=false';
  const playerRes = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
    },
    body: JSON.stringify({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName,
          clientVersion,
          hl: 'en',
          gl: 'US'
        }
      }
    })
  });

  const playerRaw = await playerRes.text();
  const normalizedRaw = String(playerRaw || '').replace(/^\)\]\}'\s*/, '');
  let playerJson = null;
  try {
    playerJson = JSON.parse(normalizedRaw);
  } catch (_) {
    playerJson = null;
  }
  if (!playerRes.ok) {
    throw new Error(`youtubei/player 请求失败 (${playerRes.status})`);
  }
  if (!playerJson || typeof playerJson !== 'object') {
    throw new Error('youtubei/player 返回解析失败');
  }

  return {
    source: 'youtubei',
    videoId,
    tracks: extractYoutubeCaptionTracks(playerJson)
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSubtitleTrackPayload(rawTrack) {
  if (!rawTrack || typeof rawTrack !== 'object') return null;
  const baseUrl = String(rawTrack.baseUrl || '').trim();
  if (!baseUrl) return null;
  return {
    videoId: normalizeYoutubeVideoId(rawTrack.videoId),
    baseUrl,
    languageCode: String(rawTrack.languageCode || '').trim(),
    isAsr: Boolean(rawTrack.isAsr)
  };
}

function parseTimedtextInfo(rawUrl) {
  const info = {
    videoId: '',
    language: '',
    isAutoGenerated: false,
    tlang: '',
    format: '',
    expireAtSec: 0,
    isExpired: false
  };
  const text = String(rawUrl || '').trim();
  if (!text) return info;
  try {
    const url = new URL(text);
    const videoId = normalizeYoutubeVideoId(url.searchParams.get('v'));
    const language = String(url.searchParams.get('lang') || '').trim();
    const tlang = String(url.searchParams.get('tlang') || '').trim();
    const format = String(url.searchParams.get('fmt') || '').trim().toLowerCase();
    const expireRaw = Number(url.searchParams.get('expire'));
    const nowSec = Date.now() / 1000;
    const kind = String(url.searchParams.get('kind') || '').toLowerCase();
    const caps = String(url.searchParams.get('caps') || '').toLowerCase();
    info.videoId = videoId;
    info.language = language;
    info.isAutoGenerated = kind === 'asr' || caps === 'asr';
    info.tlang = tlang;
    info.format = format;
    info.expireAtSec = Number.isFinite(expireRaw) ? expireRaw : 0;
    info.isExpired = Number.isFinite(expireRaw) ? expireRaw <= nowSec : false;
    return info;
  } catch (_) {
    return info;
  }
}

function summarizeTimedtextUrlForDebug(rawUrl) {
  const summary = {
    host: '',
    path: '',
    v: '',
    lang: '',
    tlang: '',
    kind: '',
    caps: '',
    fmt: '',
    hasExpire: false,
    expireAtSec: 0,
    isExpired: false,
    isNearExpiry: false,
    hasSignature: false,
    hasPot: false
  };
  const text = String(rawUrl || '').trim();
  if (!text) return summary;
  try {
    const url = new URL(text);
    const pick = (name) => String(url.searchParams.get(name) || '').trim();
    summary.host = String(url.host || '').trim();
    summary.path = String(url.pathname || '').trim();
    summary.v = normalizeYoutubeVideoId(pick('v'));
    summary.lang = pick('lang');
    summary.tlang = pick('tlang');
    summary.kind = pick('kind');
    summary.caps = pick('caps');
    summary.fmt = pick('fmt');
    const expireRaw = Number(pick('expire'));
    const nowSec = Date.now() / 1000;
    summary.hasExpire = Boolean(pick('expire'));
    summary.expireAtSec = Number.isFinite(expireRaw) ? expireRaw : 0;
    summary.isExpired = Number.isFinite(expireRaw) ? expireRaw <= nowSec : false;
    summary.isNearExpiry = Number.isFinite(expireRaw) ? expireRaw - nowSec <= 45 : false;
    summary.hasSignature = Boolean(pick('signature') || pick('sig') || pick('lsig'));
    summary.hasPot = Boolean(pick('pot'));
    return summary;
  } catch (_) {
    return summary;
  }
}

function pushSubtitleDebugAttempt(debugLog, payload) {
  if (!debugLog || !Array.isArray(debugLog.attempts)) return;
  debugLog.attempts.push(payload);
  if (debugLog.attempts.length > 80) {
    debugLog.attempts.splice(0, debugLog.attempts.length - 80);
  }
}

function buildSubtitleResult({
  status = 'OK',
  videoId = '',
  language = '',
  isAutoGenerated = false,
  items = [],
  message = '',
  debug = null
}) {
  return {
    status,
    message,
    videoKey: String(videoId || '').trim(),
    videoId: String(videoId || '').trim(),
    language: String(language || '').trim(),
    isAutoGenerated: Boolean(isAutoGenerated),
    itemCount: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : [],
    debug: debug && typeof debug === 'object' ? debug : null
  };
}

function buildSubtitleCacheKey({ videoId, languageCode, isAsr, tlang, format }) {
  return [
    `v=${String(videoId || '').trim()}`,
    `lang=${String(languageCode || '').trim().toLowerCase()}`,
    `asr=${Boolean(isAsr) ? 1 : 0}`,
    `tlang=${String(tlang || '').trim().toLowerCase()}`,
    `fmt=${String(format || 'auto').trim().toLowerCase()}`
  ].join('|');
}

function getSubtitleCache(cacheKey) {
  if (!cacheKey) return null;
  const entry = subtitleCache.get(cacheKey);
  if (!entry) return null;
  if (Number(entry?.expiresAt || 0) <= Date.now()) {
    subtitleCache.delete(cacheKey);
    return null;
  }
  subtitleCache.delete(cacheKey);
  subtitleCache.set(cacheKey, entry);
  return entry;
}

function setSubtitleCache(cacheKey, value, options = {}) {
  if (!cacheKey || !value) return;
  const ttlMs = Math.max(1000, Number(options?.ttlMs || SUBTITLE_NEGATIVE_CACHE_TTL_MS));
  const now = Date.now();
  subtitleCache.delete(cacheKey);
  subtitleCache.set(cacheKey, {
    cacheKey,
    createdAt: now,
    expiresAt: now + ttlMs,
    isNegative: options?.isNegative === true,
    result: value
  });
  while (subtitleCache.size > SUBTITLE_CACHE_LIMIT) {
    const firstKey = subtitleCache.keys().next().value;
    if (!firstKey) break;
    subtitleCache.delete(firstKey);
  }
}

async function throttleSubtitleRequest(cacheKey) {
  const now = Date.now();
  const lastAt = Number(subtitleRequestAtByCacheKey.get(cacheKey) || 0);
  const waitMs = SUBTITLE_REQUEST_INTERVAL_MS - (now - lastAt);
  if (waitMs > 0) {
    await delay(waitMs);
  }
  subtitleRequestAtByCacheKey.set(cacheKey, Date.now());
  return waitMs > 0 ? waitMs : 0;
}

function decodeHtmlEntitiesLite(input) {
  return String(input || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number(num);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

function normalizeSubtitleText(input) {
  return decodeHtmlEntitiesLite(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVttTimestampToSeconds(raw) {
  const text = String(raw || '').trim().replace(',', '.');
  if (!text) return NaN;
  const parts = text.split(':');
  if (parts.length < 2 || parts.length > 3) return NaN;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
    seconds = Number(parts[2]);
  } else {
    minutes = Number(parts[0]);
    seconds = Number(parts[1]);
  }
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return NaN;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseVttToSubtitleItems(vttText, videoId) {
  const source = String(vttText || '').replace(/\r/g, '').trim();
  if (!source || !source.includes('-->')) return [];
  const blocks = source.split(/\n{2,}/);
  const items = [];
  const seen = new Set();

  blocks.forEach((block) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    if (String(lines[0] || '').toUpperCase() === 'WEBVTT') return;

    const timelineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timelineIndex < 0) return;

    const timeline = lines[timelineIndex];
    const [startRaw, endRawWithMeta] = timeline.split('-->');
    const endRaw = String(endRawWithMeta || '').split(/\s+/)[0];
    const startTime = parseVttTimestampToSeconds(startRaw);
    const endTime = parseVttTimestampToSeconds(endRaw);
    if (!Number.isFinite(startTime) || startTime < 0) return;
    const resolvedEndTime =
      Number.isFinite(endTime) && endTime > startTime ? endTime : startTime + 2.2;
    const text = normalizeSubtitleText(lines.slice(timelineIndex + 1).join(' '));
    if (!text) return;

    const dedupeKey = `${Math.round(startTime * 10)}|${text}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    items.push({
      id: `${videoId || 'yt'}-${items.length + 1}`,
      text,
      startTimeSeconds: Number(startTime.toFixed(3)),
      endTimeSeconds: Number(resolvedEndTime.toFixed(3))
    });
  });

  return items;
}

function parseJson3ToSubtitleItems(rawText, videoId) {
  const normalized = String(rawText || '').replace(/^\)\]\}'\s*/, '');
  if (!normalized) return [];
  let payload = null;
  try {
    payload = JSON.parse(normalized);
  } catch (_) {
    payload = null;
  }
  const events = Array.isArray(payload?.events) ? payload.events : [];
  if (!events.length) return [];

  const items = [];
  const seen = new Set();
  events.forEach((event) => {
    const segs = Array.isArray(event?.segs) ? event.segs : [];
    if (!segs.length) return;
    const text = normalizeSubtitleText(segs.map((seg) => seg?.utf8 || '').join(''));
    if (!text) return;
    const startMs = Number(event?.tStartMs);
    const durationMs = Number(event?.dDurationMs);
    if (!Number.isFinite(startMs) || startMs < 0) return;
    const start = startMs / 1000;
    const end =
      Number.isFinite(durationMs) && durationMs > 0 ? start + durationMs / 1000 : start + 2.2;
    const dedupeKey = `${Math.round(start * 10)}|${text}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push({
      id: `${videoId || 'yt'}-${items.length + 1}`,
      text,
      startTimeSeconds: Number(start.toFixed(3)),
      endTimeSeconds: Number(end.toFixed(3))
    });
  });

  return items;
}

function classifyHtmlSubtitleResponse(rawText) {
  const text = String(rawText || '').toLowerCase();
  if (!text) return 'UNKNOWN_HTML';
  if (
    text.includes('consent.youtube.com') ||
    text.includes('before you continue') ||
    text.includes('consent.google.com') ||
    text.includes('consent.googleusercontent.com')
  ) {
    return 'CONSENT_REQUIRED';
  }
  if (
    text.includes('accounts.google.com') ||
    text.includes('sign in') ||
    text.includes('servicelogin')
  ) {
    return 'LOGIN_REQUIRED';
  }
  if (
    text.includes('/sorry/') ||
    text.includes('google.com/sorry') ||
    text.includes('/sorry/index') ||
    text.includes('captcha') ||
    text.includes('unusual traffic') ||
    text.includes('recaptcha') ||
    text.includes('our systems have detected unusual traffic') ||
    text.includes('pardon the interruption')
  ) {
    return 'CAPTCHA_DETECTED';
  }
  return 'UNKNOWN_HTML';
}

function htmlReasonToMessage(reason) {
  if (reason === 'CONSENT_REQUIRED') return '需要先通过 YouTube 同意页';
  if (reason === 'CAPTCHA_DETECTED') return '检测到验证码页面';
  if (reason === 'LOGIN_REQUIRED') return '需要先登录 YouTube/Google 账号';
  return '字幕请求返回了 HTML 页面';
}

function buildTimedtextFormatUrl(baseUrl, format) {
  const url = new URL(baseUrl);
  url.searchParams.set('fmt', format);
  return url.toString();
}

function normalizeSubtitleStatus(status) {
  const value = String(status || '').toUpperCase();
  if (
    value === 'OK' ||
    value === 'NO_SUBTITLES' ||
    value === 'HTML_RESPONSE' ||
    value === 'NETWORK_ERROR' ||
    value === 'PARSE_ERROR' ||
    value === 'UNSUPPORTED'
  ) {
    return value;
  }
  return 'UNSUPPORTED';
}

function mergePageContextAttempts(debugLog, pageContext) {
  const attempts = Array.isArray(pageContext?.attempts) ? pageContext.attempts : [];
  attempts.forEach((attempt) => {
    pushSubtitleDebugAttempt(debugLog, {
      format: String(attempt?.format || ''),
      attempt: Number(attempt?.attempt || 0),
      status: Number(attempt?.status || 0),
      contentType: String(attempt?.contentType || ''),
      isHtml: Boolean(attempt?.isHtml),
      reason: String(attempt?.reason || ''),
      elapsedMs: Number(attempt?.elapsedMs || 0)
    });
  });
}

async function fetchSubtitleTextWithRetry(requestUrl, options = {}) {
  const debugLog = options?.debugLog || null;
  const format = String(options?.format || '').trim().toLowerCase();
  const source = String(options?.source || 'BG_FETCH_FALLBACK').trim();
  const htmlRetryLimit = Math.max(1, Number(options?.htmlRetryLimit || SUBTITLE_HTML_RETRY_LIMIT));
  let lastFailure = {
    code: 'NETWORK_ERROR',
    message: '字幕请求失败'
  };
  let htmlAttempts = 0;

  for (let attempt = 0; attempt < SUBTITLE_RETRY_BACKOFF_MS.length; attempt += 1) {
    const attemptNumber = attempt + 1;
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 4500);
      const response = await fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'text/vtt,application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
        }
      });
      clearTimeout(timeoutId);
      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      const body = await response.text();
      const isHtml =
        contentType.includes('text/html') ||
        contentType.includes('application/xhtml+xml') ||
        /^\s*<!doctype html/i.test(body) ||
        /^\s*<html/i.test(body);
      const bodyHead = String(body || '')
        .slice(0, 200)
        .replace(/\s+/g, ' ')
        .trim();
      const elapsedMs = Date.now() - startedAt;
      if (response.status !== 200) {
        lastFailure = {
          code: 'NETWORK_ERROR',
          message: `字幕请求失败 (${response.status})`
        };
      } else if (isHtml) {
        const htmlReason = classifyHtmlSubtitleResponse(body);
        htmlAttempts += 1;
        lastFailure = {
          code: 'HTML_RESPONSE',
          message: htmlReasonToMessage(htmlReason),
          htmlReason
        };
        if (htmlAttempts >= htmlRetryLimit) {
          pushSubtitleDebugAttempt(debugLog, {
            source,
            format,
            attempt: attemptNumber,
            status: response.status,
            contentType,
            isHtml: true,
            reason: htmlReason,
            elapsedMs,
            htmlSnippet: bodyHead
          });
          return {
            ok: false,
            ...lastFailure
          };
        }
      } else if (
        !contentType.includes('text/vtt') &&
        !contentType.includes('application/json') &&
        !(contentType.includes('text/plain') && /^\s*webvtt/i.test(body))
      ) {
        lastFailure = {
          code: 'PARSE_ERROR',
          message: `字幕内容类型异常: ${contentType || 'unknown'}`
        };
      } else {
        pushSubtitleDebugAttempt(debugLog, {
          source,
          format,
          attempt: attemptNumber,
          status: response.status,
          contentType,
          isHtml,
          reason: '',
          elapsedMs
        });
        return {
          ok: true,
          body,
          contentType
        };
      }
      pushSubtitleDebugAttempt(debugLog, {
        source,
        format,
        attempt: attemptNumber,
        status: response.status,
        contentType,
        isHtml,
        reason: String(lastFailure?.htmlReason || ''),
        elapsedMs,
        htmlSnippet: isHtml ? bodyHead : ''
      });
    } catch (err) {
      lastFailure = {
        code: 'NETWORK_ERROR',
        message: String(err?.message || err || '字幕网络请求失败')
      };
      pushSubtitleDebugAttempt(debugLog, {
        source,
        format,
        attempt: attemptNumber,
        status: 0,
        contentType: '',
        isHtml: false,
        reason: 'NETWORK_ERROR',
        elapsedMs: Date.now() - startedAt
      });
    }

    if (attempt < SUBTITLE_RETRY_BACKOFF_MS.length - 1) {
      await delay(SUBTITLE_RETRY_BACKOFF_MS[attempt] + Math.floor(Math.random() * 150));
    }
  }

  return {
    ok: false,
    ...lastFailure
  };
}

function buildSubtitleInflightKey(payload) {
  const track = normalizeSubtitleTrackPayload(payload?.track);
  const fallbackUrl = String(payload?.fallbackUrl || '').trim();
  const fallbackInfo = parseTimedtextInfo(fallbackUrl);
  const videoId = normalizeYoutubeVideoId(payload?.videoId) || track?.videoId || fallbackInfo.videoId;
  if (!videoId) return '';
  const languageCode = String(track?.languageCode || fallbackInfo.language || '').trim().toLowerCase();
  const isAsr = Boolean(track?.isAsr || fallbackInfo.isAutoGenerated) ? '1' : '0';
  const tlang = String(fallbackInfo.tlang || '').trim().toLowerCase();
  return `${videoId}|${languageCode}|${isAsr}|${tlang}`;
}

async function loadYoutubeSubtitles(payload, sender) {
  const inflightKey = buildSubtitleInflightKey(payload);
  if (!inflightKey) {
    return loadYoutubeSubtitlesImpl(payload, sender);
  }

  const existing = subtitleInflightByKey.get(inflightKey);
  if (existing) {
    return existing;
  }

  const task = loadYoutubeSubtitlesImpl(payload, sender).finally(() => {
    if (subtitleInflightByKey.get(inflightKey) === task) {
      subtitleInflightByKey.delete(inflightKey);
    }
  });
  subtitleInflightByKey.set(inflightKey, task);
  return task;
}

async function loadYoutubeSubtitlesImpl(payload, sender) {
  const track = normalizeSubtitleTrackPayload(payload?.track);
  const fallbackUrl = String(payload?.fallbackUrl || '').trim();
  const fallbackInfo = parseTimedtextInfo(fallbackUrl);
  const pageContext = payload?.pageContext && typeof payload.pageContext === 'object'
    ? payload.pageContext
    : null;

  let videoId = normalizeYoutubeVideoId(payload?.videoId);
  if (!videoId) {
    videoId = track?.videoId || fallbackInfo.videoId;
  }
  if (!videoId) {
    throw new Error('视频 ID 无效');
  }

  const languageCode = String(track?.languageCode || fallbackInfo.language || '').trim();
  const isAsr = Boolean(track?.isAsr || fallbackInfo.isAutoGenerated);
  const tlang = String(fallbackInfo.tlang || '').trim();
  const pageFormatHint = String(
    Array.isArray(pageContext?.responses) && pageContext.responses[0]?.format
      ? pageContext.responses[0].format
      : ''
  )
    .trim()
    .toLowerCase();
  const formatHint = String(pageFormatHint || fallbackInfo.format || payload?.format || 'auto')
    .trim()
    .toLowerCase();
  const cacheKey = buildSubtitleCacheKey({
    videoId,
    languageCode,
    isAsr,
    tlang,
    // Keep cache key format-agnostic to maximize subtitle cache hit rate.
    format: 'auto'
  });
  const startedAt = Date.now();

  const debugLog = {
    requestAt: new Date().toISOString(),
    videoId,
    source: 'INJECTED_FETCH',
    htmlReason: '',
    cacheKey,
    cacheHit: false,
    cacheAgeMs: 0,
    throttleWaitMs: 0,
    timings: {
      totalMs: 0,
      pageFetchMs: Number(pageContext?.timings?.pageFetchMs || 0),
      bgFallbackMs: 0
    },
    track: track
      ? {
          languageCode: track.languageCode,
          isAsr: Boolean(track.isAsr),
          timedtext: summarizeTimedtextUrlForDebug(track.baseUrl)
        }
      : null,
    fallback: fallbackUrl
      ? {
          videoId: fallbackInfo.videoId,
          language: fallbackInfo.language,
          isAutoGenerated: Boolean(fallbackInfo.isAutoGenerated),
          timedtext: summarizeTimedtextUrlForDebug(fallbackUrl)
        }
      : null,
    candidates: [],
    attempts: [],
    finalReason: ''
  };
  const adPlayingHint = Boolean(pageContext?.adSignals?.adPlayingAtStart) ||
    Boolean(pageContext?.adSignals?.adPlayingAtEnd);
  const negativeCacheTtlMs = adPlayingHint ? 3000 : SUBTITLE_NEGATIVE_CACHE_TTL_MS;
  debugLog.adSignals = pageContext?.adSignals || null;
  debugLog.negativeCacheTtlMs = negativeCacheTtlMs;
  const cached = getSubtitleCache(cacheKey);
  if (cached?.result) {
    debugLog.timings.totalMs = Date.now() - startedAt;
    return {
      ...cached.result,
      debug: {
        ...(cached?.result?.debug && typeof cached.result.debug === 'object'
          ? cached.result.debug
          : {}),
        videoId,
        cacheKey,
        cacheHit: true,
        cacheAgeMs: Math.max(0, Date.now() - Number(cached.createdAt || Date.now())),
        timings: {
          ...(cached?.result?.debug?.timings || {}),
          totalMs: debugLog.timings.totalMs
        },
        returnedAt: new Date().toISOString()
      }
    };
  }

  debugLog.throttleWaitMs = await throttleSubtitleRequest(cacheKey);
  mergePageContextAttempts(debugLog, pageContext);
  if (pageContext?.htmlReason) {
    debugLog.htmlReason = String(pageContext.htmlReason);
  }

  const candidates = [];
  if (track?.baseUrl) {
    candidates.push({
      baseUrl: track.baseUrl,
      language: track.languageCode,
      isAutoGenerated: track.isAsr,
      source: 'PLAYER_RESPONSE'
    });
  }
  if (fallbackUrl) {
    if (!fallbackInfo.isExpired) {
      candidates.push({
        baseUrl: fallbackUrl,
        language: fallbackInfo.language,
        isAutoGenerated: fallbackInfo.isAutoGenerated,
        source: 'PERF_ENTRY'
      });
    } else {
      debugLog.skippedCandidates = [
        {
          source: 'PERF_ENTRY',
          reason: 'PERF_ENTRY_EXPIRED',
          timedtext: summarizeTimedtextUrlForDebug(fallbackUrl)
        }
      ];
    }
  }

  const uniqueCandidates = [];
  const seen = new Set();
  candidates.forEach((candidate) => {
    const key = String(candidate?.baseUrl || '').trim();
    if (!key || seen.has(key)) return;
    try {
      const parsed = new URL(key);
      if (!isAllowedYoutubeFetchUrl(parsed)) return;
      const info = parseTimedtextInfo(key);
      if (String(candidate?.source || '') !== 'PLAYER_RESPONSE' && info.isExpired) {
        debugLog.skippedCandidates = [
          ...(Array.isArray(debugLog.skippedCandidates) ? debugLog.skippedCandidates : []),
          {
            source: String(candidate?.source || 'PERF_ENTRY'),
            reason: 'PERF_ENTRY_EXPIRED',
            timedtext: summarizeTimedtextUrlForDebug(key)
          }
        ].slice(0, 8);
        return;
      }
    } catch (_) {
      return;
    }
    seen.add(key);
    uniqueCandidates.push(candidate);
  });

  uniqueCandidates.sort((a, b) => {
    const rank = (source) => (String(source || '') === 'PLAYER_RESPONSE' ? 0 : 1);
    return rank(a?.source) - rank(b?.source);
  });

  debugLog.candidates = uniqueCandidates.map((candidate, index) => ({
    index,
    source: String(candidate.source || ''),
    language: String(candidate.language || '').trim(),
    isAutoGenerated: Boolean(candidate.isAutoGenerated),
    timedtext: summarizeTimedtextUrlForDebug(candidate.baseUrl)
  }));

  if (!uniqueCandidates.length) {
    debugLog.finalReason = 'NO_VALID_CANDIDATE';
    const result = buildSubtitleResult({
      status: 'UNSUPPORTED',
      videoId,
      language: '',
      isAutoGenerated: false,
      items: [],
      message: '未提供有效字幕轨道',
      debug: debugLog
    });
    setSubtitleCache(cacheKey, result, {
      ttlMs: negativeCacheTtlMs,
      isNegative: true
    });
    return result;
  }

  const pageResponses = Array.isArray(pageContext?.responses) ? pageContext.responses : [];
  let parseFailureDetected = false;
  for (const response of pageResponses) {
    const format = String(response?.format || '').toLowerCase();
    const body = String(response?.body || '');
    if (!body) continue;
    const resolvedLanguage = String(response?.languageCode || languageCode || '').trim();
    const resolvedAsr = Boolean(response?.isAsr ?? isAsr);
    const parsedItems =
      format === 'json3'
        ? parseJson3ToSubtitleItems(body, videoId)
        : parseVttToSubtitleItems(body, videoId);
    if (parsedItems.length > 0) {
      debugLog.source = String(response?.source || 'INJECTED_FETCH').toUpperCase();
      debugLog.finalReason = `${format.toUpperCase()}_OK_FROM_PAGE`;
      debugLog.timings.totalMs = Date.now() - startedAt;
      const result = buildSubtitleResult({
        status: 'OK',
        videoId,
        language: resolvedLanguage,
        isAutoGenerated: resolvedAsr,
        items: parsedItems,
        debug: debugLog
      });
      setSubtitleCache(cacheKey, result, {
        ttlMs: SUBTITLE_POSITIVE_CACHE_TTL_MS,
        isNegative: false
      });
      return result;
    }
    parseFailureDetected = true;
  }

  const htmlAttempt = [...debugLog.attempts].reverse().find((attempt) => attempt?.isHtml);
  if (htmlAttempt) {
    const htmlReason = String(htmlAttempt?.reason || debugLog.htmlReason || 'UNKNOWN_HTML');
    debugLog.htmlReason = htmlReason;
    debugLog.finalReason = 'HTML_RESPONSE_FROM_PAGE';
    debugLog.timings.totalMs = Date.now() - startedAt;
    const htmlResult = buildSubtitleResult({
      status: 'HTML_RESPONSE',
      videoId,
      language: languageCode,
      isAutoGenerated: isAsr,
      items: [],
      message: htmlReasonToMessage(htmlReason),
      debug: debugLog
    });
    setSubtitleCache(cacheKey, htmlResult, {
      ttlMs: negativeCacheTtlMs,
      isNegative: true
    });
    return htmlResult;
  }

  const bgFallbackStart = Date.now();
  for (const candidate of uniqueCandidates) {
    const vttResult = await fetchSubtitleTextWithRetry(buildTimedtextFormatUrl(candidate.baseUrl, 'vtt'), {
      debugLog,
      format: 'vtt',
      source: 'BG_FETCH_FALLBACK'
    });
    if (vttResult.ok) {
      const parsed = parseVttToSubtitleItems(vttResult.body, videoId);
      if (parsed.length > 0) {
        debugLog.source = 'BG_FETCH_FALLBACK';
        debugLog.finalReason = 'VTT_OK_BG_FALLBACK';
        debugLog.timings.bgFallbackMs = Date.now() - bgFallbackStart;
        debugLog.timings.totalMs = Date.now() - startedAt;
        debugLog.risk =
          'fallback path used background fetch; may still hit YouTube consent/login/captcha HTML';
        const result = buildSubtitleResult({
          status: 'OK',
          videoId,
          language: String(candidate.language || languageCode || '').trim(),
          isAutoGenerated: Boolean(candidate.isAutoGenerated),
          items: parsed,
          debug: debugLog
        });
        setSubtitleCache(cacheKey, result, {
          ttlMs: SUBTITLE_POSITIVE_CACHE_TTL_MS,
          isNegative: false
        });
        return result;
      }
      parseFailureDetected = true;
    }

    const jsonResult = await fetchSubtitleTextWithRetry(
      buildTimedtextFormatUrl(candidate.baseUrl, 'json3'),
      {
        debugLog,
        format: 'json3',
        source: 'BG_FETCH_FALLBACK'
      }
    );
    if (jsonResult.ok) {
      const parsed = parseJson3ToSubtitleItems(jsonResult.body, videoId);
      if (parsed.length > 0) {
        debugLog.source = 'BG_FETCH_FALLBACK';
        debugLog.finalReason = 'JSON3_OK_BG_FALLBACK';
        debugLog.timings.bgFallbackMs = Date.now() - bgFallbackStart;
        debugLog.timings.totalMs = Date.now() - startedAt;
        debugLog.risk =
          'fallback path used background fetch; may still hit YouTube consent/login/captcha HTML';
        const result = buildSubtitleResult({
          status: 'OK',
          videoId,
          language: String(candidate.language || languageCode || '').trim(),
          isAutoGenerated: Boolean(candidate.isAutoGenerated),
          items: parsed,
          debug: debugLog
        });
        setSubtitleCache(cacheKey, result, {
          ttlMs: SUBTITLE_POSITIVE_CACHE_TTL_MS,
          isNegative: false
        });
        return result;
      }
      parseFailureDetected = true;
    }
  }

  const latestHtml = [...debugLog.attempts].reverse().find((attempt) => attempt?.isHtml);
  if (latestHtml) {
    const htmlReason = String(latestHtml?.reason || debugLog.htmlReason || 'UNKNOWN_HTML');
    debugLog.htmlReason = htmlReason;
    debugLog.source = debugLog.source || 'INJECTED_FETCH';
    debugLog.finalReason = 'HTML_RESPONSE';
    debugLog.timings.bgFallbackMs = Date.now() - bgFallbackStart;
    debugLog.timings.totalMs = Date.now() - startedAt;
    const result = buildSubtitleResult({
      status: 'HTML_RESPONSE',
      videoId,
      language: languageCode,
      isAutoGenerated: isAsr,
      items: [],
      message: htmlReasonToMessage(htmlReason),
      debug: debugLog
    });
    setSubtitleCache(cacheKey, result, {
      ttlMs: negativeCacheTtlMs,
      isNegative: true
    });
    return result;
  }

  const hasNetworkFailure = debugLog.attempts.some((attempt) =>
    String(attempt?.reason || '').toUpperCase() === 'NETWORK_ERROR'
  );
  const status = hasNetworkFailure
    ? 'NETWORK_ERROR'
    : parseFailureDetected
      ? 'PARSE_ERROR'
      : normalizeSubtitleStatus('NO_SUBTITLES');
  debugLog.finalReason = hasNetworkFailure
    ? 'NETWORK_ERROR'
    : parseFailureDetected
      ? 'PARSE_ERROR'
      : 'NO_ITEMS_PARSED';
  debugLog.timings.bgFallbackMs = Date.now() - bgFallbackStart;
  debugLog.timings.totalMs = Date.now() - startedAt;
  const finalResult = buildSubtitleResult({
    status,
    videoId,
    language: languageCode,
    isAutoGenerated: isAsr,
    items: [],
    message:
      status === 'NETWORK_ERROR'
        ? '字幕请求失败（网络或超时）'
        : status === 'PARSE_ERROR'
          ? '字幕解析失败'
          : '未解析到字幕内容',
    debug: debugLog
  });
  setSubtitleCache(cacheKey, finalResult, {
    ttlMs: negativeCacheTtlMs,
    isNegative: true
  });
  return finalResult;
}

async function fetchYoutubeText(rawUrl, sender) {
  const urlText = String(rawUrl || '').trim();
  if (!urlText) throw new Error('缺少请求地址');
  let parsedUrl;
  try {
    parsedUrl = new URL(urlText);
  } catch (_) {
    throw new Error('请求地址格式错误');
  }
  if (!isAllowedYoutubeFetchUrl(parsedUrl)) {
    throw new Error('仅允许请求 YouTube 字幕地址');
  }

  const res = await fetch(parsedUrl.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
    }
  });

  return {
    source: 'background',
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get('content-type') || '',
    text: await res.text()
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

