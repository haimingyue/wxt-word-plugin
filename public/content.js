const PANEL_ID = 'anki-example-panel';
const TOAST_ID = 'anki-example-toast';
const MEANING_PANEL_ID = 'deepseek-meaning-panel';
const MEANING_MAX_LEN = 64;
const AUDIO_WAVES_ICON = chrome.runtime.getURL('assets/audio-waves.png');
const AUTO_POPUP_COOLDOWN_MS = 600;
const YT_RT_PANEL_ID = 'yt-rt-translate-panel';
const YT_RT_OVERLAY_ID = 'yt-rt-translate-overlay';
const YT_RT_REOPEN_BTN_ID = 'yt-rt-translate-reopen-btn';
const YT_RT_WATCH_ACTIVE_CLASS = 'yt-rt-vertical-view-active';
const YT_RT_TARGET_FULL_CLASS = 'yt-rt-target-full-bleed';
const YT_RT_TARGET_PLAYER_FULL_CLASS = 'yt-rt-target-player-full-bleed';
const YT_RT_MAX_ITEMS = 2000;
const YT_RT_DEBOUNCE_MS = 120;
const YT_RT_SEEK_LEAD_SECONDS = 1.0;
const YT_CAPTION_TRACK_MESSAGE_TYPE = 'YT_CAPTION_TRACK';
const YT_CAPTION_TRACK_REQUEST_TYPE = 'YT_CAPTION_TRACK_REQUEST';
const YT_SUBTITLE_FETCH_REQUEST_TYPE = 'YT_SUBTITLE_FETCH_REQUEST';
const YT_SUBTITLE_FETCH_RESPONSE_TYPE = 'YT_SUBTITLE_FETCH_RESPONSE';
const YT_CAPTION_BRIDGE_SCRIPT_ID = 'yt-caption-bridge-script';
const YT_CAPTION_BRIDGE_TIMEOUT_MS = 2400;
const YT_CAPTION_BRIDGE_FETCH_TIMEOUT_MS = 4200;
const YT_PAGE_FETCH_BACKOFF_MS = [400, 900, 1800];
const YT_PERF_SCAN_DELAYS_MS = [500, 1000, 2000];
const YT_RT_AD_RETRY_MS = 1500;
/**
 * Message protocol:
 * `YT_SUBTITLE_FETCH_REQUEST`: content -> injected(main world)
 * `YT_SUBTITLE_FETCH_RESPONSE`: injected(main world) -> content
 * `yt-load-subtitles`: content -> background (includes `pageContext`)
 */
let preferredTtsAccent = 'us';
let lastAutoPopupSelection = '';
let lastAutoPopupAt = 0;
let ytRtObserver = null;
let ytRtRouteKey = '';
let ytRtDebounceTimer = 0;
let ytRtQueuedText = '';
let ytRtQueuedVideoTime = -1;
let ytRtRequestInFlight = false;
let ytRtEnabled = true;
let ytRtLastCaption = '';
let ytRtItems = [];
let ytRtStatusText = '等待字幕...';
let ytRtActiveItemId = '';
let ytRtActiveIndex = -1;
let ytRtPlaybackTimer = 0;
let ytRtTranscriptLoadedVideoKey = '';
let ytRtTranscriptLoadingVideoKey = '';
let ytRtTranslationJobId = 0;
let ytRtCanTranslate = null;
let ytRtAutoCcTriedVideoKey = '';
let ytRtLoadingPromise = null;
let ytRtNextLoadAt = 0;
let ytRtAdDetectionStartedAt = 0;
const ytRtPlayerResponseCache = new Map();
const ytRtTranslationCache = new Map();
const ytRtCaptionTrackCache = new Map();
const ytCaptionTrackWaiters = [];
const ytCaptionBridgeFetchWaiters = new Map();
let ytCaptionBridgeInitialized = false;
let ytCaptionBridgeInjecting = null;
let ytCaptionBridgeReady = false;
let ytCaptionLastTrack = null;
let ytCaptionBridgeFetchSeq = 0;

let meaningRequestId = 0;
let translationRequestId = 0;
let dictRequestId = 0;
let parseRequestId = 0;

function getTtsAccentLabel() {
  return preferredTtsAccent === 'us' ? '口音：美式' : '口音：英式';
}

function updateTtsAccentButton(button) {
  if (!button) return;
  button.textContent = getTtsAccentLabel();
  button.dataset.originalText = button.textContent;
}

function findPreferredVoice(synth, accent) {
  const voices = synth.getVoices();
  if (!voices.length) return null;
  const targetLang = accent === 'us' ? 'en-us' : 'en-gb';
  const exact = voices.find((voice) => String(voice.lang || '').toLowerCase() === targetLang);
  if (exact) return exact;
  const startsWith = voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith(targetLang));
  if (startsWith) return startsWith;
  const english = voices.find((voice) => String(voice.lang || '').toLowerCase().startsWith('en'));
  return english || null;
}

function speakText(text, triggerBtn, options = {}) {
  const content = String(text || '').replace(/\s+/g, ' ').trim();
  if (!content) {
    showToast('没有可朗读的内容');
    return;
  }
  if (typeof SpeechSynthesisUtterance === 'undefined' || !window.speechSynthesis) {
    showToast('当前浏览器不支持语音朗读');
    return;
  }

  setButtonLoading(triggerBtn, true, '朗读中...');
  window.speechSynthesis.cancel();

  const accent = options.accent || preferredTtsAccent;
  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = accent === 'us' ? 'en-US' : 'en-GB';
  utterance.rate = options.rate ?? 1;
  const voice = findPreferredVoice(window.speechSynthesis, accent);
  if (voice) utterance.voice = voice;

  utterance.onend = () => {
    setButtonLoading(triggerBtn, false);
  };
  utterance.onerror = () => {
    setButtonLoading(triggerBtn, false);
    showToast('语音朗读失败');
  };
  window.speechSynthesis.speak(utterance);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'trigger-capture') {
    if (!document.hasFocus() && !msg.selectionText) return;
    startCapture(msg.selectionText);
  }

  if (msg?.type === 'trigger-meaning') {
    startMeaningCapture(msg.selectionText);
  }

  if (msg?.type === 'trigger-translate-sentence') {
    startSentenceTranslation(msg.selectionText);
  }

  if (msg?.type === 'trigger-parse-sentence') {
    startSentenceParse(msg.selectionText);
  }

  if (msg?.type === 'trigger-ecdict-lookup') {
    startEcdictLookup(msg.selectionText);
  }
});

initAutoPopupOnSelection();
initRealtimeSubtitleTranslator();
initYouTubeCaptionBridge();

async function startCapture(prefilledSelection) {
  const selected = (prefilledSelection || getSelectionText()).trim();
  if (!selected) {
    showToast('请先选中一个单词');
    return;
  }

  removeMeaningPanel();
  const sentence = extractSentence(selected);
  const normalizedWord = await normalizeSelection(selected);
  const data = {
    word: normalizedWord,
    phraseKeyword: '',
    sentence,
    sourceUrl: location.href,
    sourceTitle: document.title
  };
  openPanel(data);
}

async function startMeaningCapture(prefilledSelection) {
  const selected = (prefilledSelection || getSelectionText()).trim();
  if (!selected) {
    showToast('请先选中一个单词');
    return;
  }
  const hasSpaces = /\s/.test(selected);
  if (!hasSpaces && selected.length > MEANING_MAX_LEN) {
    showToast('选中文本过长');
    return;
  }

  const isSentenceSelection = hasSpaces && isSentenceFragmentSelection(selected);
  const sentence = isSentenceSelection ? selected : extractSentence(selected);
  const word = hasSpaces ? selected : await normalizeSelection(selected);
  const rect = getSelectionRect(window.getSelection());
  openMeaningPanel(
    {
      word,
      sentence,
      parseAllowed: isSentenceSelection,
      sourceUrl: location.href,
      sourceTitle: document.title
    },
    rect,
    {
      skipMeaning: isSentenceSelection || selected.length > MEANING_MAX_LEN,
      hideSendToAnki: hasSpaces,
      hideVocab: hasSpaces,
      hidePhrase: hasSpaces,
      hideTtsWord: hasSpaces,
      hideTtsSentence: !hasSpaces,
      showDictionaryResult: !hasSpaces,
      meaningPlaceholder: isSentenceSelection ? '' : '正在查询 DeepSeek...'
    }
  );
}

function initAutoPopupOnSelection() {
  const trigger = () => {
    window.setTimeout(() => {
      maybeAutoPopupMeaning();
    }, 0);
  };
  document.addEventListener('mouseup', trigger);
  document.addEventListener('keyup', trigger);
}

function maybeAutoPopupMeaning() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  if (selection.rangeCount < 1) return;
  if (isSelectionInEditableArea(selection)) return;
  if (isSelectionInsideExtensionPanel(selection)) return;

  const selected = selection.toString().replace(/\s+/g, ' ').trim();
  if (!isAutoPopupWordSelection(selected)) return;

  const now = Date.now();
  if (selected === lastAutoPopupSelection && now - lastAutoPopupAt < AUTO_POPUP_COOLDOWN_MS) {
    return;
  }
  lastAutoPopupSelection = selected;
  lastAutoPopupAt = now;
  startMeaningCapture(selected);
}

function isAutoPopupWordSelection(selected) {
  if (!selected) return false;
  if (selected.length > MEANING_MAX_LEN) return false;
  return /^[A-Za-z][A-Za-z'-]*$/.test(selected);
}

function isSelectionInEditableArea(selection) {
  const node = selection.anchorNode;
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!element) return false;
  const editable = element.closest?.(
    'input,textarea,[contenteditable]:not([contenteditable=\"false\"])'
  );
  return Boolean(editable);
}

function isSelectionInsideExtensionPanel(selection) {
  const node = selection.anchorNode;
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!element) return false;
  return Boolean(element.closest?.(`#${PANEL_ID},#${MEANING_PANEL_ID}`));
}

function startSentenceTranslation(prefilledSelection) {
  const selected = (prefilledSelection || getSelectionText()).trim();
  if (!selected) {
    showToast('请先选中一个单词或句子');
    return;
  }

  const sentence = extractSentence(selected);
  const rect = getSelectionRect(window.getSelection());
  openMeaningPanel(
    {
      word: selected,
      sentence,
      parseAllowed: true,
      sourceUrl: location.href,
      sourceTitle: document.title
    },
    rect,
    {
      autoTranslate: true,
      skipMeaning: true,
      hideSendToAnki: true,
      hideVocab: true,
      hidePhrase: true,
      hideTtsWord: true,
      meaningPlaceholder: ''
    }
  );
}

function startSentenceParse(prefilledSelection) {
  const selected = (prefilledSelection || getSelectionText()).trim();
  if (!selected) {
    showToast('请先选中一个单词或句子');
    return;
  }

  if (!isSentenceFragmentSelection(selected)) {
    showToast('请选中要解析的句子片段');
    return;
  }
  const rect = getSelectionRect(window.getSelection());
  openMeaningPanel(
    {
      word: selected,
      sentence: selected,
      parseAllowed: true,
      sourceUrl: location.href,
      sourceTitle: document.title
    },
    rect,
    {
      autoParse: true,
      skipMeaning: true,
      hideSendToAnki: true,
      hideVocab: true,
      hidePhrase: true,
      hideTtsWord: true,
      hideTranslation: true,
      title: '句子解析',
      meaningPlaceholder: ''
    }
  );
}

async function startEcdictLookup(prefilledSelection, anchorRect = null) {
  const selected = (prefilledSelection || getSelectionText()).trim();
  if (!selected || /\s/.test(selected)) {
    showToast('请先选中一个单词');
    return;
  }
  if (selected.length > MEANING_MAX_LEN) {
    showToast('选中文本过长');
    return;
  }

  const sentence = extractSentence(selected);
  const rect = anchorRect || getSelectionRect(window.getSelection());
  const normalizedWord = await normalizeSelection(selected);
  const data = {
    word: normalizedWord,
    sentence,
    sourceUrl: location.href,
    sourceTitle: document.title,
    skipTranslation: false,
    skipMeaning: false
  };
  return openMeaningPanel(
    data,
    rect,
    {
      skipMeaning: false,
      hideSendToAnki: false,
      hideVocab: false,
      hidePhrase: false,
      hideTranslation: false,
      hideTtsWord: false,
      hideTtsSentence: true,
      title: 'DeepSeek 释义',
      meaningPlaceholder: '正在查询 DeepSeek...',
      showDictionaryResult: true
    }
  );
}

function getSelectionText() {
  const selection = window.getSelection();
  return selection ? selection.toString() : '';
}

async function normalizeSelection(selected) {
  if (!selected) return selected;
  const trimmed = selected.trim();
  if (/\s/.test(trimmed)) return trimmed;
  const cleaned = trimmed.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (!cleaned || /\s/.test(cleaned)) return trimmed;
  return new Promise((resolve) => {
    safeSendMessage(
      { type: 'normalize-lemma', payload: { word: cleaned } },
      (res, err) => {
        if (err || !res?.success || !res?.lemma) {
          resolve(trimmed);
          return;
        }
        resolve(res.lemma);
      }
    );
  });
}

function extractSentence(selected) {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  const container = range
    ? range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer
    : null;

  const block =
    container?.closest?.('p,li,article,section,div') ||
    container ||
    document.body;
  const text = (block?.innerText || document.body.innerText || selected).replace(
    /\s+/g,
    ' '
  );

  const lowerSelected = selected.trim().replace(/\s+/g, ' ').toLowerCase();
  const lowerText = text.toLowerCase();
  const occurrences = [];
  let searchFrom = 0;
  while (lowerSelected && searchFrom <= lowerText.length) {
    const foundAt = lowerText.indexOf(lowerSelected, searchFrom);
    if (foundAt === -1) break;
    occurrences.push(foundAt);
    searchFrom = foundAt + 1;
  }
  if (!occurrences.length) return selected;

  let idx = occurrences[0];
  if (range) {
    try {
      const prefixRange = document.createRange();
      prefixRange.setStart(block, 0);
      prefixRange.setEnd(range.startContainer, range.startOffset);
      const anchorText = prefixRange.toString().replace(/\s+/g, ' ');
      const anchorIndex = anchorText.length;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const pos of occurrences) {
        let distance = Math.abs(pos - anchorIndex);
        if (anchorIndex >= pos && anchorIndex <= pos + lowerSelected.length) distance = 0;
        if (distance < bestDistance) {
          bestDistance = distance;
          idx = pos;
        }
      }
      if (typeof prefixRange.detach === 'function') prefixRange.detach();
    } catch (_) {
      idx = occurrences[0];
    }
  }

  const parts = text.split(/(?<=[。？！?!\.])/);
  let offset = 0;
  for (const part of parts) {
    const start = offset;
    const end = offset + part.length;
    if (idx >= start && idx <= end) return part.trim() || selected;
    offset = end;
  }
  return selected;
}

function isSentenceFragmentSelection(selected) {
  const cleaned = String(selected || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return false;
  const wordMatches = cleaned.match(/[A-Za-z]+/g) || [];
  const hasSentencePunct = /[。？！?!\.]/.test(cleaned);
  return wordMatches.length >= 4 || hasSentencePunct;
}

function openPanel(data) {
  removePanel();

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="anki-panel">
      <div class="anki-panel__header">
        <div class="anki-panel__title">发送短句到 Anki</div>
        <button class="anki-btn anki-btn--ghost" data-close>✕</button>
      </div>
      <label class="anki-field">
        <span>目标单词</span>
        <input
          id="anki-word"
          type="text"
          value="${escapeHtml(data.word)}"
          placeholder="输入目标单词"
        />
      </label>
      <label class="anki-field">
        <span>短语关键词</span>
        <input
          id="anki-phrase"
          type="text"
          value="${escapeHtml(data.phraseKeyword || '')}"
          placeholder="检测后自动填入"
          readonly
        />
      </label>
      <div class="anki-phrase-status" data-phrase-status>请先检测短语</div>
      <label class="anki-field">
        <span>Sentence</span>
        <textarea id="anki-sentence">${escapeHtml(data.sentence)}</textarea>
      </label>
      <label class="anki-field">
        <span>Source</span>
        <input id="anki-source" type="text" value="${escapeHtml(
          data.sourceTitle
        )}" />
      </label>
      <div class="anki-actions">
        <button class="anki-btn" data-detect>检测</button>
        <button class="anki-btn anki-btn--ghost" data-close>取消</button>
        <button class="anki-btn anki-btn--primary" data-submit disabled>发送</button>
      </div>
      <div class="anki-hint">Ctrl+Shift+L 也可快速触发，或右键选中“发送短句到 Anki”。</div>
    </div>
  `;

  panel.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined || e.target === panel) {
      removePanel();
    }
  });

  const wordInput = panel.querySelector('#anki-word');
  const phraseInput = panel.querySelector('#anki-phrase');
  const sentenceInput = panel.querySelector('#anki-sentence');
  const submitBtn = panel.querySelector('[data-submit]');
  const detectBtn = panel.querySelector('[data-detect]');
  const statusEl = panel.querySelector('[data-phrase-status]');

  setPhraseDetectionState(panel, statusEl, submitBtn, {
    detected: false,
    message: '请先检测短语'
  });

  wordInput.addEventListener('input', () => {
    phraseInput.value = '';
    setPhraseDetectionState(panel, statusEl, submitBtn, {
      detected: false,
      message: '请先检测短语'
    });
  });
  phraseInput.addEventListener('input', () =>
    setPhraseDetectionState(panel, statusEl, submitBtn, {
      detected: false,
      message: '短语已修改，请重新检测'
    })
  );
  sentenceInput.addEventListener('input', () => {
    phraseInput.value = '';
    setPhraseDetectionState(panel, statusEl, submitBtn, {
      detected: false,
      message: '句子已修改，请重新检测'
    });
  });

  const runPhraseDetect = () => {
    const word = wordInput.value.trim();
    const sentence = sentenceInput.value.trim();
    if (!word || !sentence) return;

    detectBtn.disabled = true;
    const originalDetectText = detectBtn.textContent;
    detectBtn.textContent = '检测中...';
    statusEl.textContent = '正在检测短语...';
    statusEl.classList.remove('is-error');

    safeSendMessage(
      {
        type: 'deepseek-detect-phrase',
        payload: { keyword: word, sentence }
      },
      (res, err) => {
        detectBtn.disabled = false;
        detectBtn.textContent = originalDetectText;
        if (err) {
          setPhraseDetectionState(panel, statusEl, submitBtn, {
            detected: false,
            message: normalizeExtensionError(err),
            isError: true
          });
          return;
        }
        if (!res?.success) {
          setPhraseDetectionState(panel, statusEl, submitBtn, {
            detected: false,
            message: res?.message || '检测失败',
            isError: true
          });
          return;
        }
        if (!res.message?.isPhrase) {
          setPhraseDetectionState(panel, statusEl, submitBtn, {
            detected: false,
            message: '未检测到短语',
            isError: true
          });
          return;
        }
        if (!res.message?.meaning) {
          setPhraseDetectionState(panel, statusEl, submitBtn, {
            detected: false,
            message: '未返回短语释义',
            isError: true
          });
          return;
        }

        phraseInput.value = res.message.phrase || '';
        setPhraseDetectionState(panel, statusEl, submitBtn, {
          detected: true,
          phrase: res.message.phrase || '',
          meaning: res.message.meaning || '',
          message: `短语释义：${res.message.meaning}`
        });
      }
    );
  };

  detectBtn.addEventListener('click', () => {
    const word = wordInput.value.trim();
    const sentence = sentenceInput.value.trim();
    if (!word) {
      showToast('请输入目标单词');
      return;
    }
    if (!sentence) {
      showToast('句子不能为空');
      return;
    }

    runPhraseDetect();
  });

  if (wordInput.value.trim() && sentenceInput.value.trim()) {
    runPhraseDetect();
  }

  submitBtn.addEventListener('click', async () => {
    const originalText = submitBtn.textContent;
    const word = panel.querySelector('#anki-word').value.trim();
    const keyword = word;
    const sentence = panel.querySelector('#anki-sentence').value.trim();
    const sourceTitle = panel.querySelector('#anki-source').value.trim() || data.sourceTitle;

    if (!panel.dataset.phraseDetected || panel.dataset.phraseDetected !== 'true') {
      showToast('请先检测短语');
      return;
    }
    if (!keyword || !sentence) {
      showToast('短语或句子不能为空');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '处理中...';

    safeSendMessage(
      {
        type: 'append-phrase-example',
        payload: {
          keyword,
          sentence,
          phrase: panel.dataset.phraseValue || phraseInput.value.trim(),
          meaning: panel.dataset.phraseMeaning || '',
          sourceUrl: data.sourceUrl,
          sourceTitle
        }
      },
      (res, err) => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        if (err) {
          showToast(normalizeExtensionError(err));
          return;
        }
        if (res?.success) {
          showToast('已追加到短语卡片');
          removePanel();
        } else {
          showToast(res?.message || '发送失败');
        }
      }
    );
  });

  document.body.appendChild(panel);
}

function removePanel() {
  document.getElementById(PANEL_ID)?.remove();
}

function setPhraseDetectionState(panel, statusEl, submitBtn, state) {
  panel.dataset.phraseDetected = state.detected ? 'true' : 'false';
  panel.dataset.phraseMeaning = state.meaning || '';
  panel.dataset.phraseValue = state.phrase || '';
  submitBtn.disabled = !state.detected;
  if (statusEl) {
    statusEl.textContent = state.message || '';
    statusEl.classList.toggle('is-error', Boolean(state.isError));
  }
}

function openMeaningPanel(data, rect, options = {}) {
  const {
    autoTranslate = false,
    autoParse = false,
    skipMeaning = false,
    hideSendToAnki = false,
    hideTranslation = false,
    hideParse = false,
    hideVocab = false,
    hidePhrase = false,
    hideTtsWord = false,
    hideTtsSentence = false,
    showDictionaryResult = false,
    title = 'DeepSeek 释义',
    meaningPlaceholder = '正在查询 DeepSeek...'
  } = options;
  removeMeaningPanel();

  const panel = document.createElement('div');
  panel.id = MEANING_PANEL_ID;
  const sendButtonHtml = hideSendToAnki
    ? ''
    : '<button class="deepseek-action-btn" data-send-anki>发送到 Anki</button>';
  const vocabButtonHtml = hideVocab
    ? ''
    : '<button class="deepseek-action-btn deepseek-action-btn--secondary" data-add-vocab>添加到生词本</button>';
  const phraseButtonHtml = hidePhrase
    ? ''
    : '<button class="deepseek-action-btn deepseek-action-btn--warning" data-phrase>检测短语</button>';
  const ttsAccentButtonHtml =
    '<button class="deepseek-action-btn deepseek-action-btn--secondary" data-tts-accent>口音：美式</button>';
  const ttsWordButtonHtml = hideTtsWord
    ? ''
    : `
      <button class="deepseek-action-btn deepseek-action-btn--secondary deepseek-action-btn--audio" data-tts-word>
        <img class="deepseek-action-btn__icon" src="${escapeAttr(AUDIO_WAVES_ICON)}" alt="" />
        <span>读单词</span>
      </button>
    `;
  const ttsSentenceButtonHtml = hideTtsSentence
    ? ''
    : `
      <button class="deepseek-action-btn deepseek-action-btn--secondary deepseek-action-btn--audio" data-tts-sentence>
        <img class="deepseek-action-btn__icon" src="${escapeAttr(AUDIO_WAVES_ICON)}" alt="" />
        <span>读句子</span>
      </button>
    `;
  const translateButtonHtml = hideTranslation
    ? ''
    : `
      <button class="deepseek-action-btn deepseek-action-btn--secondary" data-translate>
        翻译整句
      </button>
    `;
  const shouldHideParse = hideParse || !data.parseAllowed;
  const parseButtonHtml = shouldHideParse
    ? ''
    : `
      <button class="deepseek-action-btn deepseek-action-btn--secondary" data-parse>
        句子解析
      </button>
    `;
  const translationResultHtml = hideTranslation
    ? ''
    : '<div class="deepseek-panel__result is-muted" data-translation>点击“翻译整句”</div>';
  const dictionaryResultHtml = showDictionaryResult
    ? '<div class="deepseek-panel__result is-muted" data-dictionary>正在查询本地词典...</div>'
    : '';
  const parseResultHtml = shouldHideParse
    ? ''
    : '<div class="deepseek-panel__result is-muted" data-parse-result></div>';
  panel.innerHTML = `
    <div class="deepseek-panel__header">
      <div class="deepseek-panel__title">${escapeHtml(title)}</div>
      <button class="deepseek-btn" data-close>×</button>
    </div>
    <div class="deepseek-panel__word">${escapeHtml(data.word)}</div>
    <div class="deepseek-panel__sentence">${escapeHtml(data.sentence)}</div>
    <div class="deepseek-panel__result deepseek-panel__result--meaning" data-meaning>${escapeHtml(meaningPlaceholder)}</div>
    ${translationResultHtml}
    ${dictionaryResultHtml}
    ${parseResultHtml}
    <div class="deepseek-panel__actions">
      <div class="deepseek-panel__action-row">
        ${ttsAccentButtonHtml}
        ${ttsWordButtonHtml}
        ${ttsSentenceButtonHtml}
      </div>
      <div class="deepseek-panel__action-row">
        ${translateButtonHtml}
        ${parseButtonHtml}
      </div>
      <div class="deepseek-panel__action-row">
        ${phraseButtonHtml}
        ${sendButtonHtml}
        ${vocabButtonHtml}
      </div>
    </div>
  `;

  panel.addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined) {
      removeMeaningPanel();
    }
  });

  const handleOutsideClick = (event) => {
    if (!panel.contains(event.target)) {
      removeMeaningPanel();
    }
  };
  panel._outsideClickHandler = handleOutsideClick;
  document.addEventListener('mousedown', handleOutsideClick);

  enablePanelDrag(panel);

  const sendBtn = panel.querySelector('[data-send-anki]');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => sendMeaningToAnki(data, sendBtn));
  }
  const vocabBtn = panel.querySelector('[data-add-vocab]');
  if (vocabBtn) {
    vocabBtn.addEventListener('click', () => sendVocabToAnki(data, vocabBtn));
  }
  const phraseBtn = panel.querySelector('[data-phrase]');
  if (phraseBtn) {
    phraseBtn.addEventListener('click', () => {
      removeMeaningPanel();
      openPanel(data);
    });
  }
  const ttsAccentBtn = panel.querySelector('[data-tts-accent]');
  if (ttsAccentBtn) {
    updateTtsAccentButton(ttsAccentBtn);
    ttsAccentBtn.addEventListener('click', () => {
      preferredTtsAccent = preferredTtsAccent === 'us' ? 'uk' : 'us';
      updateTtsAccentButton(ttsAccentBtn);
    });
  }
  const ttsWordBtn = panel.querySelector('[data-tts-word]');
  if (ttsWordBtn) {
    ttsWordBtn.addEventListener('click', () => {
      speakText(data.word, ttsWordBtn, { accent: preferredTtsAccent, rate: 0.98 });
    });
  }
  const ttsSentenceBtn = panel.querySelector('[data-tts-sentence]');
  if (ttsSentenceBtn) {
    ttsSentenceBtn.addEventListener('click', () => {
      speakText(data.sentence, ttsSentenceBtn, { accent: preferredTtsAccent, rate: 0.95 });
    });
  }
  const translateBtn = panel.querySelector('[data-translate]');
  if (translateBtn) {
    translateBtn.addEventListener('click', () =>
      requestSentenceTranslation(panel, data, translateBtn)
    );
  }
  const parseBtn = panel.querySelector('[data-parse]');
  if (parseBtn) {
    parseBtn.addEventListener('click', () => requestSentenceParse(panel, data, parseBtn));
  }

  document.body.appendChild(panel);
  positionMeaningPanel(panel, rect);
  if (skipMeaning) {
    const meaningEl = panel.querySelector('[data-meaning]');
    if (meaningEl) {
      meaningEl.textContent = meaningPlaceholder;
      meaningEl.classList.add('is-muted');
    }
  } else {
    requestMeaning(panel, data);
  }
  if (autoTranslate && !hideTranslation) {
    requestSentenceTranslation(panel, data, translateBtn);
  }
  if (showDictionaryResult) {
    requestEcdictMeaning(panel, data);
  }
  if (autoParse && !shouldHideParse) {
    requestSentenceParse(panel, data, parseBtn);
  }
  return panel;
}

function requestMeaning(panel, data) {
  const resultEl = panel.querySelector('[data-meaning]');
  const requestId = ++meaningRequestId;

  safeSendMessage(
    {
      type: 'deepseek-meaning',
      payload: { word: data.word, sentence: data.sentence }
    },
    (res, err) => {
      if (requestId !== meaningRequestId) return;
      if (err) {
        setPanelError(resultEl, normalizeExtensionError(err));
        return;
      }
      if (res?.success) {
        resultEl.textContent = normalizeMeaningDisplay(res.message);
        resultEl.classList.remove('is-error');
      } else {
        setPanelError(resultEl, res?.message || 'DeepSeek 请求失败');
      }
    }
  );
}

function normalizeMeaningDisplay(raw) {
  const text = String(raw || '').trim();
  if (!text) return text;
  return text.replace(/^释义\s*[:：]?\s*/i, '');
}

function requestEcdictMeaning(panel, data) {
  const resultEl = panel.querySelector('[data-dictionary]');
  if (!resultEl) return;
  resultEl.textContent = '正在查询本地词典...';
  resultEl.classList.remove('is-error');
  resultEl.classList.add('is-muted');
  const requestId = ++dictRequestId;

  safeSendMessage(
    {
      type: 'lookup-ecdict',
      payload: { word: data.word }
    },
    (res, err) => {
      if (requestId !== dictRequestId) return;
      if (err) {
        setPanelError(resultEl, normalizeExtensionError(err));
        return;
      }
      if (res?.success) {
        panel._ecdictEntry = res.entry || null;
        if (res?.meaning) {
          resultEl.textContent = res.meaning;
          resultEl.classList.remove('is-error', 'is-muted');
          return;
        }
      }
      setPanelError(resultEl, res?.message || '未找到本地词典释义');
    }
  );
}

function requestSentenceTranslation(panel, data, triggerBtn) {
  const resultEl = panel.querySelector('[data-translation]');
  if (!resultEl) return;
  if (triggerBtn && triggerBtn.disabled) return;
  setButtonLoading(triggerBtn, true, '翻译中...');
  resultEl.textContent = '正在翻译整句...';
  resultEl.classList.remove('is-error', 'is-muted');

  const requestId = ++translationRequestId;
  const meaning = getPanelMeaning(panel);
  safeSendMessage(
    {
      type: 'deepseek-translate-sentence',
      payload: { sentence: data.sentence, word: data.word, meaning }
    },
    (res, err) => {
      if (requestId !== translationRequestId) return;
      if (err) {
        setPanelError(resultEl, normalizeExtensionError(err));
        setButtonLoading(triggerBtn, false);
        return;
      }
      if (res?.success) {
        resultEl.textContent = res.message;
        resultEl.classList.remove('is-error');
      } else {
        setPanelError(resultEl, res?.message || 'DeepSeek 请求失败');
      }
      setButtonLoading(triggerBtn, false);
    }
  );
}

function requestSentenceParse(panel, data, triggerBtn) {
  const resultEl = panel.querySelector('[data-parse-result]');
  if (!resultEl) return;
  if (triggerBtn && triggerBtn.disabled) return;
  if (!data.parseAllowed || !isSentenceFragmentSelection(data.sentence)) {
    showToast('请选中要解析的句子');
    return;
  }
  setButtonLoading(triggerBtn, true, '解析中...');
  resultEl.textContent = '正在解析句子...';
  resultEl.classList.remove('is-error', 'is-muted');

  const requestId = ++parseRequestId;
  safeSendMessage(
    {
      type: 'deepseek-parse-sentence',
      payload: { sentence: data.sentence, word: data.word }
    },
    (res, err) => {
      if (requestId !== parseRequestId) return;
      if (err) {
        setPanelError(resultEl, normalizeExtensionError(err));
        setButtonLoading(triggerBtn, false);
        return;
      }
      if (res?.success) {
        const parsed = normalizeParseResult(res.message);
        if (parsed) {
          renderParseResult(resultEl, parsed);
          resultEl.classList.remove('is-error', 'is-muted');
        } else {
          resultEl.textContent =
            typeof res.message === 'string' ? res.message : '解析结果解析失败';
          resultEl.classList.remove('is-error');
        }
      } else {
        setPanelError(resultEl, res?.message || 'DeepSeek 请求失败');
      }
      setButtonLoading(triggerBtn, false);
    }
  );
}

function setPanelError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-error');
}

function removeMeaningPanel() {
  const panel = document.getElementById(MEANING_PANEL_ID);
  if (!panel) return;
  if (panel._outsideClickHandler) {
    document.removeEventListener('mousedown', panel._outsideClickHandler);
  }
  panel.remove();
}

function getSelectionRect(selection) {
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length) return rects[0];
  const rect = range.getBoundingClientRect();
  if (rect && (rect.width || rect.height)) return rect;
  return null;
}

function positionMeaningPanel(panel, rect) {
  const margin = 8;
  if (!rect) {
    panel.style.top = `${margin}px`;
    panel.style.left = `${margin}px`;
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + margin;

  if (left + panelRect.width > window.innerWidth - margin) {
    left = window.innerWidth - panelRect.width - margin;
  }
  if (left < margin) left = margin;

  if (top + panelRect.height > window.innerHeight - margin) {
    top = rect.top - panelRect.height - margin;
  }
  if (top < margin) top = margin;

  panel.style.left = `${Math.round(left)}px`;
  panel.style.top = `${Math.round(top)}px`;
}

function getPanelMeaning(panel) {
  const raw = panel?.querySelector('[data-meaning]')?.textContent?.trim() || '';
  if (!raw) return '';
  if (raw.includes('正在查询') || raw.includes('DeepSeek 请求失败')) return '';
  if (raw.includes('仅翻译整句')) return '';
  if (raw.includes('正在查询本地词典')) return '';
  return raw;
}

function getPanelTranslation(panel) {
  const raw = panel?.querySelector('[data-translation]')?.textContent?.trim() || '';
  if (!raw) return '';
  if (raw.includes('点击“翻译整句”')) return '';
  if (raw.includes('正在翻译')) return '';
  if (raw.includes('DeepSeek 请求失败')) return '';
  return raw;
}

function sendMeaningToAnki(data, triggerBtn) {
  if (triggerBtn?.disabled) return;
  setButtonLoading(triggerBtn, true, '发送中...');
  const word = data.word?.trim();
  const sentence = data.sentence?.trim();
  if (!word || !sentence) {
    showToast('单词或句子不能为空');
    setButtonLoading(triggerBtn, false);
    return;
  }

  const panel = document.getElementById(MEANING_PANEL_ID);
  const meaning = getPanelMeaning(panel);
  const translation = getPanelTranslation(panel);
  const skipTranslation = Boolean(data.skipTranslation);
  const skipMeaning = Boolean(data.skipMeaning);

  safeSendMessage(
    {
      type: 'append-example',
      payload: {
        word,
        sentence,
        meaning,
        translation,
        skipTranslation,
        skipMeaning,
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle
      }
    },
    (res, err) => {
      setButtonLoading(triggerBtn, false);
      if (err) {
        showToast(normalizeExtensionError(err));
        return;
      }
      if (res?.success) {
        showToast('已追加到 Anki');
        removeMeaningPanel();
      } else {
        showToast(res?.message || '发送失败');
      }
    }
  );
}

async function sendVocabToAnki(data, triggerBtn) {
  if (triggerBtn?.disabled) return;
  setButtonLoading(triggerBtn, true, '添加中...');
  const rawWord = data.word?.trim();
  if (!rawWord) {
    showToast('单词不能为空');
    setButtonLoading(triggerBtn, false);
    return;
  }

  const panel = document.getElementById(MEANING_PANEL_ID);
  let normalizedWord = '';
  let entry = null;
  try {
    normalizedWord = await normalizeSelection(rawWord);
    entry = (panel && panel._ecdictEntry) || (await fetchEcdictEntry(normalizedWord));
  } catch (err) {
    setButtonLoading(triggerBtn, false);
    showToast(normalizeExtensionError(err));
    return;
  }
  if (!entry) {
    showToast('未找到本地词典释义');
    setButtonLoading(triggerBtn, false);
    return;
  }

  const sentence = data.sentence?.trim() || '';
  const translation = panel ? getPanelTranslation(panel) : '';
  const meaning = !data.skipMeaning && panel ? getPanelMeaning(panel) : '';

  safeSendMessage(
    {
      type: 'add-vocab-note',
      payload: {
        word: normalizedWord,
        entry,
        sentence,
        translation,
        meaning,
        sourceUrl: data.sourceUrl,
        sourceTitle: data.sourceTitle
      }
    },
    (res, err) => {
      setButtonLoading(triggerBtn, false);
      if (err) {
        showToast(normalizeExtensionError(err));
        return;
      }
      if (res?.success) {
        showToast('已添加到生词本');
      } else {
        showToast(res?.message || '发送失败');
      }
    }
  );
}

function fetchEcdictEntry(word) {
  return new Promise((resolve) => {
    safeSendMessage(
      { type: 'lookup-ecdict', payload: { word } },
      (res, err) => {
        if (err) {
          resolve(null);
          return;
        }
        if (res?.success && res.entry) {
          resolve(res.entry);
        } else {
          resolve(null);
        }
      }
    );
  });
}

function normalizeParseResult(message) {
  const parsed = typeof message === 'string' ? parseJsonFromText(message) : message;
  if (!parsed || typeof parsed !== 'object') return null;
  const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
  const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  const translation = String(
    parsed.translation || parsed.cn || parsed.chinese || parsed.zh || ''
  ).trim();
  const raw = typeof message === 'string' ? message : '';
  return { segments, notes, translation, raw };
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

function renderParseResult(resultEl, parsed) {
  const segments = Array.isArray(parsed.segments) ? parsed.segments : [];
  const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  const translation = String(parsed.translation || '').trim();

  const sentenceHtml = segments
    .map((seg) => {
      const text = String(seg?.text ?? '');
      const role = String(seg?.role ?? '');
      const roleClass = roleToClass(role);
      return `<span class="parse-token ${roleClass}">${escapeHtml(text)}</span>`;
    })
    .join('');

  const notesHtml = notes
    .map((note) => `<li>${escapeHtml(String(note || '').trim())}</li>`)
    .filter((item) => item !== '<li></li>')
    .join('');

  const translationHtml = translation
    ? `
      <div class="parse-translation">
        <div class="parse-label">中文释义</div>
        <div class="parse-text">${escapeHtml(translation)}</div>
      </div>
    `
    : '';

  const fallbackText =
    !sentenceHtml && parsed.raw && !String(parsed.raw).trim().startsWith('{')
      ? escapeHtml(String(parsed.raw))
      : '';

  resultEl.innerHTML = `
    <div class="parse-block">
      <div class="parse-sentence">${sentenceHtml || fallbackText}</div>
      ${notesHtml ? `<ul class="parse-notes">${notesHtml}</ul>` : ''}
      ${translationHtml}
    </div>
  `;
}

function roleToClass(role) {
  const text = String(role || '').trim();
  if (text.includes('主语')) return 'parse-role-subject';
  if (text.includes('谓语')) return 'parse-role-verb';
  if (text.includes('宾语')) return 'parse-role-object';
  if (text.includes('补语')) return 'parse-role-complement';
  if (text.includes('定语')) return 'parse-role-attrib';
  if (text.includes('状语')) return 'parse-role-adverbial';
  if (text.includes('从句')) return 'parse-role-clause';
  if (text.includes('连词')) return 'parse-role-conj';
  return 'parse-role-other';
}

function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = (button.textContent || '').trim();
  }
  if (!button.dataset.originalHtml) {
    button.dataset.originalHtml = button.innerHTML;
  }
  if (loading) {
    button.disabled = true;
    button.textContent = text || '处理中...';
    return;
  }
  button.disabled = false;
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
  } else {
    button.textContent = button.dataset.originalText;
  }
}

function safeSendMessage(message, callback) {
  let runtime = null;
  try {
    runtime = chrome.runtime;
  } catch (err) {
    callback?.(null, err);
    return;
  }
  if (!runtime?.id) {
    callback?.(null, new Error('扩展上下文已失效，请刷新页面'));
    return;
  }
  try {
    runtime.sendMessage(message, (res) => {
      const lastError = runtime.lastError;
      if (lastError) {
        callback?.(res, new Error(lastError.message || '扩展通信失败'));
        return;
      }
      callback?.(res, null);
    });
  } catch (err) {
    callback?.(null, err);
  }
}

function normalizeExtensionError(err) {
  const raw = String(err?.message || err || '');
  if (raw.toLowerCase().includes('extension context invalidated')) {
    return '扩展已更新，请刷新页面';
  }
  return raw || '无法连接扩展后台';
}

function showToast(message) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement('div');
    toast.id = TOAST_ID;
    toast.className = 'anki-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 2400);
}

function safeSendMessageAsync(message) {
  return new Promise((resolve, reject) => {
    safeSendMessage(message, (res, err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(res);
    });
  });
}

function isLikelyHtmlResponse(contentType, rawText) {
  const ct = String(contentType || '').toLowerCase();
  const head = String(rawText || '')
    .slice(0, 2000)
    .toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) {
    return true;
  }
  return (
    head.includes('<!doctype html') ||
    head.includes('<html') ||
    head.includes('consent.youtube.com') ||
    head.includes('consent.googleusercontent.com') ||
    head.includes('www.youtube.com/error') ||
    head.includes('servicelogin') ||
    head.includes('our systems have detected unusual traffic') ||
    head.includes('pardon the interruption') ||
    head.includes('google.com/sorry') ||
    head.includes('/sorry/index') ||
    head.includes('/sorry/') ||
    head.includes('captcha') ||
    head.includes('sign in')
  );
}

function classifyHtmlReason(contentType, rawText) {
  if (!isLikelyHtmlResponse(contentType, rawText)) return '';
  const text = String(rawText || '').toLowerCase();
  if (
    text.includes('consent.youtube.com') ||
    text.includes('before you continue') ||
    text.includes('consent.google.com') ||
    text.includes('consent.googleusercontent.com')
  ) {
    return 'CONSENT_REQUIRED';
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
  if (
    text.includes('sign in') ||
    text.includes('accounts.google.com') ||
    text.includes('servicelogin')
  ) {
    return 'LOGIN_REQUIRED';
  }
  if (text.includes('www.youtube.com/error') || text.includes('youtube.com/error')) {
    return 'UNKNOWN_HTML';
  }
  return 'UNKNOWN_HTML';
}

function getTimedtextUrlSummary(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''), location.origin);
    if (!url.pathname.includes('/api/timedtext')) return null;
    const pick = (name) => String(url.searchParams.get(name) || '');
    const expireRaw = pick('expire');
    const expireSec = Number(expireRaw);
    const nowSec = Date.now() / 1000;
    return {
      v: pick('v'),
      lang: pick('lang'),
      tlang: pick('tlang'),
      fmt: pick('fmt'),
      c: pick('c'),
      hasExpire: Boolean(expireRaw),
      expireAtSec: Number.isFinite(expireSec) ? expireSec : 0,
      isExpired: Number.isFinite(expireSec) ? expireSec <= nowSec : false,
      isNearExpiry: Number.isFinite(expireSec) ? expireSec - nowSec <= 45 : false,
      hasSignature: Boolean(pick('signature') || pick('sig') || pick('lsig')),
      hasPot: Boolean(pick('pot')),
      hasSparams: Boolean(pick('sparams'))
    };
  } catch (_) {
    return null;
  }
}

function getTimedtextExpireState(rawUrl) {
  const summary = getTimedtextUrlSummary(rawUrl);
  if (!summary) {
    return {
      hasExpire: false,
      isExpired: false,
      isNearExpiry: false,
      expireAtSec: 0
    };
  }
  return {
    hasExpire: Boolean(summary.hasExpire),
    isExpired: Boolean(summary.isExpired),
    isNearExpiry: Boolean(summary.isNearExpiry),
    expireAtSec: Number(summary.expireAtSec || 0)
  };
}

function shouldTryPageFetch(rawUrl) {
  try {
    const url = new URL(String(rawUrl || ''), location.origin);
    const targetHost = String(url.hostname || '').toLowerCase();
    const currentHost = String(location.hostname || '').toLowerCase();
    if (!targetHost || !currentHost) return false;
    if (targetHost !== currentHost) return false;
    return (
      targetHost === 'youtube.com' ||
      targetHost.endsWith('.youtube.com') ||
      targetHost === 'youtube-nocookie.com' ||
      targetHost.endsWith('.youtube-nocookie.com')
    );
  } catch (_) {
    return false;
  }
}

async function fetchTextViaPage(url, options = {}) {
  const allowHtml = options?.allowHtml === true;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
    }
  });
  const raw = await res.text();
  const contentType = String(res.headers.get('content-type') || '');
  console.log('[yt-cc] fetch', {
    source: 'page',
    url,
    status: Number(res.status || 0),
    ct: contentType,
    head: raw.slice(0, 200)
  });
  if (!res.ok) {
    throw new Error(`页面请求失败（${Number(res.status || 0)}）`);
  }
  if (!allowHtml && isLikelyHtmlResponse(contentType, raw)) {
    throw new Error('页面请求拿到的是 HTML 页面（同意页/登录页/验证码页）');
  }
  return raw;
}

async function fetchTextViaBackground(url, options = {}) {
  const allowHtml = options?.allowHtml === true;
  const timedtextSummary = getTimedtextUrlSummary(url);
  if (timedtextSummary) {
    console.log('[yt-cc] timedtext params', timedtextSummary);
  }

  let pageError = null;
  if (shouldTryPageFetch(url)) {
    try {
      return await fetchTextViaPage(url, { allowHtml });
    } catch (err) {
      pageError = err;
      console.warn('[yt-cc] page fetch failed', {
        url,
        message: String(err?.message || err || 'unknown')
      });
    }
  }

  const response = await safeSendMessageAsync({
    type: 'yt-fetch-text',
    payload: { url }
  });
  if (!response?.success) {
    throw new Error(String(response?.message || '后台请求失败'));
  }
  const raw = String(response.text || '');
  console.log('[yt-cc] fetch', {
    source: String(response.source || 'background'),
    url,
    status: Number(response.status || 0),
    ct: String(response.contentType || ''),
    head: raw.slice(0, 200)
  });
  if (!response.ok) {
    throw new Error(`字幕加载失败（${Number(response.status || 0)}）`);
  }
  if (!allowHtml && isLikelyHtmlResponse(response.contentType, raw)) {
    if (pageError) {
      throw new Error(
        `拿到的是 HTML 页面（同意页/登录页/验证码页），不是字幕数据；同源请求失败：${normalizeExtensionError(pageError)}`
      );
    }
    throw new Error('拿到的是 HTML 页面（同意页/登录页/验证码页），不是字幕数据');
  }
  return raw;
}

function initRealtimeSubtitleTranslator() {
  setInterval(() => {
    maybeSetupRealtimeSubtitleObserver();
  }, 1200);
  maybeSetupRealtimeSubtitleObserver();
}

function maybeSetupRealtimeSubtitleObserver() {
  if (!isYouTubeRuntimePage()) {
    teardownRealtimeSubtitleObserver();
    return;
  }
  ensureRealtimeSubtitleUi();
  syncRealtimePanelLayout();

  const routeKey = `${location.host}${location.pathname}${location.search}`;
  if (routeKey !== ytRtRouteKey) {
    ytRtRouteKey = routeKey;
    ytRtLastCaption = '';
    ytRtQueuedText = '';
    ytRtQueuedVideoTime = -1;
    ytRtActiveItemId = '';
    ytRtActiveIndex = -1;
    ytRtItems = [];
    ytRtStatusText = '加载字幕中...';
    ytRtTranscriptLoadedVideoKey = '';
    ytRtTranscriptLoadingVideoKey = '';
    ytRtAutoCcTriedVideoKey = '';
    ytRtLoadingPromise = null;
    ytRtNextLoadAt = 0;
    ytRtPlayerResponseCache.clear();
    ytRtCaptionTrackCache.clear();
    ytRtTranslationJobId += 1;
    renderRealtimeSubtitleList();
    renderRealtimeSubtitleOverlay(null);
  }

  if (ytRtObserver) return;
  ytRtObserver = new MutationObserver(() => {
    scheduleRealtimeSubtitleCapture();
  });
  ytRtObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  startRealtimePlaybackSync();
  scheduleRealtimeSubtitleCapture();
}

function syncRealtimePanelLayout() {
  const panel = document.getElementById(YT_RT_PANEL_ID);
  if (!panel) return;
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  watchFlexy?.classList?.remove(
    YT_RT_WATCH_ACTIVE_CLASS,
    YT_RT_TARGET_FULL_CLASS,
    YT_RT_TARGET_PLAYER_FULL_CLASS
  );

  if (panel.classList.contains('is-hidden')) {
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    return;
  }

  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
}

function teardownRealtimeSubtitleObserver() {
  if (ytRtObserver) {
    ytRtObserver.disconnect();
    ytRtObserver = null;
  }
  clearTimeout(ytRtDebounceTimer);
  ytRtDebounceTimer = 0;
  clearInterval(ytRtPlaybackTimer);
  ytRtPlaybackTimer = 0;
  ytRtLoadingPromise = null;
  ytRtNextLoadAt = 0;
  document
    .querySelector('ytd-watch-flexy')
    ?.classList?.remove(
      YT_RT_WATCH_ACTIVE_CLASS,
      YT_RT_TARGET_FULL_CLASS,
      YT_RT_TARGET_PLAYER_FULL_CLASS
    );
}

function isYouTubeRuntimePage() {
  const host = String(location.host || '').toLowerCase();
  if (!host.includes('youtube.com') && !host.includes('youtube-nocookie.com')) {
    return false;
  }
  const path = String(location.pathname || '');
  return path.startsWith('/watch') || path.startsWith('/shorts') || path.startsWith('/embed/');
}

function startRealtimePlaybackSync() {
  if (ytRtPlaybackTimer) return;
  ytRtPlaybackTimer = window.setInterval(() => {
    if (!ytRtEnabled) return;
    syncRealtimeActiveItemByPlayback(true);
  }, 220);
}

function getCurrentYouTubeVideoKey() {
  const url = new URL(location.href);
  if (url.pathname.startsWith('/watch')) {
    return String(url.searchParams.get('v') || '').trim();
  }
  if (url.pathname.startsWith('/shorts/')) {
    return String(url.pathname.split('/')[2] || '').trim();
  }
  if (url.pathname.startsWith('/embed/')) {
    return String(url.pathname.split('/')[2] || '').trim();
  }
  return '';
}

function isYouTubeAdPlaying() {
  const now = Date.now();
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  let strongSignal = false;
  let weakSignal = false;

  try {
    const html5Player = document.querySelector('.html5-video-player');
    if (html5Player?.classList?.contains('ad-showing')) {
      strongSignal = true;
    }
  } catch (_) {}
  try {
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer?.classList?.contains?.('ad-showing')) {
      strongSignal = true;
    }
    if (typeof moviePlayer?.getAdState === 'function') {
      const adState = moviePlayer.getAdState();
      if (adState === 1 || adState === true) {
        strongSignal = true;
      }
    }
  } catch (_) {}
  const adOverlay = document.querySelector('.ytp-ad-player-overlay, .video-ads.ytp-ad-module');
  const adSkip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern');
  if (isVisible(adOverlay) || isVisible(adSkip)) {
    weakSignal = true;
  }

  if (strongSignal || weakSignal) {
    if (!ytRtAdDetectionStartedAt) {
      ytRtAdDetectionStartedAt = now;
    }
    const adDurationMs = now - ytRtAdDetectionStartedAt;
    if (!strongSignal && adDurationMs > 12000) {
      // Weak ad markers can remain in DOM; avoid sticky "ad playing" false positives.
      ytRtAdDetectionStartedAt = 0;
      return false;
    }
    return true;
  }

  ytRtAdDetectionStartedAt = 0;
  return false;
}

function initYouTubeCaptionBridge() {
  if (!isYouTubeRuntimePage()) return;
  if (ytCaptionBridgeInitialized) return;
  ytCaptionBridgeInitialized = true;
  window.addEventListener('message', handleYouTubeCaptionBridgeMessage, false);
  ensureYouTubeCaptionBridgeScript().catch(() => {});
}

function normalizeBridgeTrackPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const videoId = String(payload.videoId || '').trim();
  if (!videoId) return null;
  const baseUrl = String(payload.baseUrl || '').trim();
  return {
    videoId,
    baseUrl,
    languageCode: String(payload.languageCode || '').trim(),
    isAsr: Boolean(payload.isAsr),
    status: String(payload.status || '').trim()
  };
}

function handleYouTubeCaptionBridgeMessage(event) {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === YT_CAPTION_TRACK_MESSAGE_TYPE) {
    const payload = normalizeBridgeTrackPayload(data.payload);
    if (!payload) return;

    if (payload.baseUrl) {
      ytCaptionLastTrack = payload;
      ytRtCaptionTrackCache.set(payload.videoId, payload);
      if (ytRtCaptionTrackCache.size > 8) {
        const firstKey = ytRtCaptionTrackCache.keys().next().value;
        if (firstKey) ytRtCaptionTrackCache.delete(firstKey);
      }
    }

    for (let i = ytCaptionTrackWaiters.length - 1; i >= 0; i -= 1) {
      const waiter = ytCaptionTrackWaiters[i];
      if (!waiter) continue;
      if (waiter.videoId && waiter.videoId !== payload.videoId) continue;
      ytCaptionTrackWaiters.splice(i, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    }
    return;
  }

  if (data.type !== YT_SUBTITLE_FETCH_RESPONSE_TYPE) return;
  const requestId = String(data?.payload?.requestId || '').trim();
  if (!requestId) return;
  const waiter = ytCaptionBridgeFetchWaiters.get(requestId);
  if (!waiter) return;
  ytCaptionBridgeFetchWaiters.delete(requestId);
  clearTimeout(waiter.timer);
  waiter.resolve({
    requestId,
    ok: Boolean(data?.payload?.ok),
    status: Number(data?.payload?.status || 0),
    contentType: String(data?.payload?.contentType || ''),
    text: String(data?.payload?.text || ''),
    error: String(data?.payload?.error || ''),
    source: String(data?.payload?.source || 'INJECTED_FETCH'),
    elapsedMs: Number(data?.payload?.elapsedMs || 0),
    isHtml: Boolean(data?.payload?.isHtml),
    reason: String(data?.payload?.reason || ''),
    htmlSnippet: String(data?.payload?.htmlSnippet || '')
  });
}

function ensureYouTubeCaptionBridgeScript() {
  if (ytCaptionBridgeReady) return Promise.resolve();
  if (ytCaptionBridgeInjecting) return ytCaptionBridgeInjecting;
  ytCaptionBridgeInjecting = new Promise((resolve, reject) => {
    const existing = document.getElementById(YT_CAPTION_BRIDGE_SCRIPT_ID);
    if (existing) {
      ytCaptionBridgeReady = true;
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = YT_CAPTION_BRIDGE_SCRIPT_ID;
    script.src = chrome.runtime.getURL('injected.js');
    script.async = false;
    script.onload = () => {
      ytCaptionBridgeReady = true;
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('主世界桥接脚本注入失败'));
    };
    const parent = document.documentElement || document.head || document.body;
    if (!parent) {
      reject(new Error('页面节点不可用，无法注入桥接脚本'));
      return;
    }
    parent.appendChild(script);
  }).finally(() => {
    ytCaptionBridgeInjecting = null;
  });
  return ytCaptionBridgeInjecting;
}

async function requestCaptionTrackFromBridge(videoId) {
  const key = String(videoId || '').trim();
  if (!key) return null;

  const cached = ytRtCaptionTrackCache.get(key);
  if (cached?.baseUrl) return cached;
  if (ytCaptionLastTrack?.videoId === key && ytCaptionLastTrack?.baseUrl) {
    return ytCaptionLastTrack;
  }

  try {
    await ensureYouTubeCaptionBridgeScript();
  } catch (_) {
    return null;
  }

  const payload = await new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      const idx = ytCaptionTrackWaiters.findIndex((item) => item && item.resolve === resolve);
      if (idx >= 0) ytCaptionTrackWaiters.splice(idx, 1);
      resolve(null);
    }, YT_CAPTION_BRIDGE_TIMEOUT_MS);

    ytCaptionTrackWaiters.push({
      videoId: key,
      resolve,
      timer
    });
    window.postMessage(
      {
        type: YT_CAPTION_TRACK_REQUEST_TYPE,
        payload: { videoId: key }
      },
      '*'
    );
  });

  const normalized = normalizeBridgeTrackPayload(payload);
  if (!normalized?.baseUrl) return null;
  ytRtCaptionTrackCache.set(key, normalized);
  return normalized;
}

async function requestSubtitleTextViaBridge(rawUrl) {
  const requestUrl = String(rawUrl || '').trim();
  if (!requestUrl) return null;
  try {
    await ensureYouTubeCaptionBridgeScript();
  } catch (_) {
    return null;
  }

  const requestId = `${Date.now()}-${(ytCaptionBridgeFetchSeq += 1)}`;
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      ytCaptionBridgeFetchWaiters.delete(requestId);
      resolve(null);
    }, YT_CAPTION_BRIDGE_FETCH_TIMEOUT_MS);

    ytCaptionBridgeFetchWaiters.set(requestId, {
      resolve,
      timer
    });

    window.postMessage(
      {
        type: YT_SUBTITLE_FETCH_REQUEST_TYPE,
        payload: {
          requestId,
          url: requestUrl
        }
      },
      '*'
    );
  });
}

function findTimedtextUrlFromPerformance(videoId) {
  const key = String(videoId || '').trim();
  const entries = performance.getEntriesByType('resource');
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const name = String(entries[i]?.name || '');
    if (!name || !name.includes('timedtext')) continue;
    try {
      const url = new URL(name, location.origin);
      const v = String(url.searchParams.get('v') || '').trim();
      if (key && v && v !== key) continue;
      return url.toString();
    } catch (_) {
      // ignore malformed entry
    }
  }
  return '';
}

async function findTimedtextUrlFromPerformanceWithRetry(videoId) {
  const immediate = findTimedtextUrlFromPerformance(videoId);
  if (immediate) return immediate;
  for (const waitMs of YT_PERF_SCAN_DELAYS_MS) {
    await sleep(waitMs);
    const next = findTimedtextUrlFromPerformance(videoId);
    if (next) return next;
  }
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function withJitter(ms) {
  const jitter = Math.floor(Math.random() * 160);
  return ms + jitter;
}

function buildBridgeAttemptRecord({
  format,
  attempt,
  status,
  contentType,
  isHtml,
  reason,
  elapsedMs
}) {
  return {
    format: String(format || ''),
    attempt: Number(attempt || 0),
    status: Number(status || 0),
    contentType: String(contentType || ''),
    isHtml: Boolean(isHtml),
    reason: String(reason || ''),
    elapsedMs: Number(elapsedMs || 0)
  };
}

async function fetchSubtitleWithBridgeRetry(requestUrl, format, attempts) {
  let htmlAttempts = 0;
  for (let index = 0; index < YT_PAGE_FETCH_BACKOFF_MS.length; index += 1) {
    const attempt = index + 1;
    const response = await requestSubtitleTextViaBridge(requestUrl);
    const status = Number(response?.status || 0);
    const contentType = String(response?.contentType || '');
    const body = String(response?.text || '');
    const isHtml = Boolean(response?.isHtml) || isLikelyHtmlResponse(contentType, body);
    const htmlReason = isHtml
      ? String(response?.reason || classifyHtmlReason(contentType, body) || 'UNKNOWN_HTML')
      : '';
    const elapsedMs = Number(response?.elapsedMs || 0);

    if (response) {
      attempts.push(
        buildBridgeAttemptRecord({
          format,
          attempt,
          status,
          contentType,
          isHtml,
          reason: htmlReason,
          elapsedMs
        })
      );
    } else {
      attempts.push(
        buildBridgeAttemptRecord({
          format,
          attempt,
          status: 0,
          contentType: '',
          isHtml: false,
          reason: 'NETWORK_ERROR',
          elapsedMs: 0
        })
      );
    }

    if (response && status === 200 && !isHtml && body) {
      return {
        ok: true,
        status,
        contentType,
        body,
        htmlReason: '',
        source: String(response?.source || 'INJECTED_FETCH')
      };
    }

    if (isHtml) {
      htmlAttempts += 1;
      if (htmlAttempts > 1) {
        return {
          ok: false,
          error: 'HTML_RESPONSE',
          htmlReason: htmlReason || 'UNKNOWN_HTML',
          source: String(response?.source || 'INJECTED_FETCH')
        };
      }
      await sleep(withJitter(YT_PAGE_FETCH_BACKOFF_MS[Math.min(index, 1)]));
      continue;
    }

    if (attempt < YT_PAGE_FETCH_BACKOFF_MS.length) {
      await sleep(withJitter(YT_PAGE_FETCH_BACKOFF_MS[index]));
    }
  }
  return {
    ok: false,
    error: 'NETWORK_ERROR',
    htmlReason: '',
    source: 'INJECTED_FETCH'
  };
}

async function buildPageContextPayload(videoId, track, fallbackUrl) {
  const payload = {
    source: 'INJECTED_FETCH',
    htmlReason: '',
    attempts: [],
    candidates: [],
    responses: [],
    timings: {
      pageFetchMs: 0
    },
    adSignals: {
      adPlayingAtStart: isYouTubeAdPlaying(),
      adPlayingAtEnd: false
    }
  };
  const startAt = Date.now();
  const seen = new Set();
  const candidates = [];
  const skippedCandidates = [];
  const pushCandidate = (baseUrl, source, languageCode, isAsr) => {
    const key = String(baseUrl || '').trim();
    if (!key || seen.has(key)) return;
    const expire = getTimedtextExpireState(key);
    const isPerfSource = String(source || '').toUpperCase().startsWith('PERF_ENTRY');
    if (isPerfSource && expire.isExpired) {
      skippedCandidates.push({
        source,
        reason: 'PERF_ENTRY_EXPIRED',
        timedtext: getTimedtextUrlSummary(key)
      });
      return;
    }
    seen.add(key);
    const priority = source === 'PLAYER_RESPONSE' ? 0 : expire.isNearExpiry ? 2 : 1;
    candidates.push({
      baseUrl: key,
      source,
      languageCode: String(languageCode || '').trim(),
      isAsr: Boolean(isAsr),
      expire,
      priority
    });
  };

  if (track?.baseUrl) {
    pushCandidate(track.baseUrl, 'PLAYER_RESPONSE', track.languageCode, track.isAsr);
  }
  if (fallbackUrl) {
    pushCandidate(fallbackUrl, 'PERF_ENTRY', '', false);
  }
  const perfUrl = await findTimedtextUrlFromPerformanceWithRetry(videoId);
  if (perfUrl) {
    pushCandidate(perfUrl, 'PERF_ENTRY_SCAN', '', false);
  }

  candidates.sort((a, b) => a.priority - b.priority);

  payload.candidates = candidates.map((item, index) => ({
    index,
    source: item.source,
    languageCode: item.languageCode,
    isAsr: item.isAsr,
    priority: item.priority,
    expire: item.expire,
    timedtext: getTimedtextUrlSummary(item.baseUrl)
  }));
  if (skippedCandidates.length) {
    payload.skippedCandidates = skippedCandidates.slice(0, 8);
  }

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const vttUrl = buildCaptionVttUrl(candidate.baseUrl);
    const vttResult = await fetchSubtitleWithBridgeRetry(vttUrl, 'vtt', payload.attempts);
    if (vttResult.ok) {
      payload.source = String(vttResult.source || 'INJECTED_FETCH');
      payload.responses.push({
        candidateIndex: i,
        source: candidate.source,
        format: 'vtt',
        contentType: vttResult.contentType,
        body: vttResult.body,
        languageCode: candidate.languageCode,
        isAsr: candidate.isAsr
      });
      break;
    }
    if (vttResult.error === 'HTML_RESPONSE') {
      payload.htmlReason = vttResult.htmlReason || payload.htmlReason;
    }

    const jsonUrl = buildCaptionJsonUrl(candidate.baseUrl);
    const jsonResult = await fetchSubtitleWithBridgeRetry(jsonUrl, 'json3', payload.attempts);
    if (jsonResult.ok) {
      payload.source = String(jsonResult.source || 'INJECTED_FETCH');
      payload.responses.push({
        candidateIndex: i,
        source: candidate.source,
        format: 'json3',
        contentType: jsonResult.contentType,
        body: jsonResult.body,
        languageCode: candidate.languageCode,
        isAsr: candidate.isAsr
      });
      break;
    }
    if (jsonResult.error === 'HTML_RESPONSE') {
      payload.htmlReason = jsonResult.htmlReason || payload.htmlReason;
    }
  }
  payload.timings.pageFetchMs = Date.now() - startAt;
  payload.adSignals.adPlayingAtEnd = isYouTubeAdPlaying();
  return payload;
}

async function requestSubtitleBundle(videoId, track, fallbackUrl, pageContext) {
  const response = await safeSendMessageAsync({
    type: 'yt-load-subtitles',
    payload: {
      videoId,
      track: track || null,
      fallbackUrl: String(fallbackUrl || '').trim(),
      pageContext: pageContext || null
    }
  });
  if (!response?.success) {
    throw new Error(String(response?.message || '字幕后台请求失败'));
  }
  return response?.result || null;
}

function summarizeBridgeTrackForLog(track) {
  if (!track || typeof track !== 'object') return null;
  return {
    videoId: String(track.videoId || '').trim(),
    languageCode: String(track.languageCode || '').trim(),
    isAsr: Boolean(track.isAsr),
    status: String(track.status || '').trim(),
    timedtext: getTimedtextUrlSummary(track.baseUrl || '')
  };
}

function isSubtitleBundleHtmlFailure(bundle) {
  const attempts = Array.isArray(bundle?.debug?.attempts) ? bundle.debug.attempts : [];
  if (!attempts.length) return false;
  let hasHtml = false;
  for (const attempt of attempts) {
    const contentType = String(attempt?.contentType || '').toLowerCase();
    const reason = String(attempt?.reason || '').toUpperCase();
    const isHtml =
      Boolean(attempt?.isHtml) ||
      reason === 'CONSENT_REQUIRED' ||
      reason === 'CAPTCHA_DETECTED' ||
      reason === 'LOGIN_REQUIRED' ||
      reason === 'UNKNOWN_HTML' ||
      contentType.includes('text/html') ||
      contentType.includes('application/xhtml+xml');
    if (!isHtml) return false;
    hasHtml = true;
  }
  return hasHtml;
}

function collectSubtitleBaseUrlCandidates(track, fallbackUrl) {
  const urls = [];
  const seen = new Set();
  const candidates = [
    { url: String(track?.baseUrl || '').trim(), source: 'PLAYER_RESPONSE' },
    { url: String(fallbackUrl || '').trim(), source: 'PERF_ENTRY' }
  ];
  candidates.forEach((candidate) => {
    const raw = String(candidate?.url || '').trim();
    if (!raw || seen.has(raw)) return;
    const expire = getTimedtextExpireState(raw);
    if (candidate?.source === 'PERF_ENTRY' && expire.isExpired) return;
    seen.add(raw);
    urls.push(raw);
  });
  return urls;
}

async function tryLoadSubtitlesViaBridgeFallback(videoKey, track, fallbackUrl) {
  const baseUrls = collectSubtitleBaseUrlCandidates(track, fallbackUrl);
  if (!baseUrls.length) return [];

  for (const baseUrl of baseUrls) {
    const candidates = [buildCaptionVttUrl(baseUrl), buildCaptionJsonUrl(baseUrl)];
    for (const requestUrl of candidates) {
      const response = await requestSubtitleTextViaBridge(requestUrl);
      if (!response) {
        console.warn('[yt-cc] bridge fallback timeout', {
          videoKey,
          timedtext: getTimedtextUrlSummary(requestUrl)
        });
        continue;
      }
      const head = String(response.text || '').slice(0, 160);
      console.info('[yt-cc] bridge fallback fetch', {
        videoKey,
        status: Number(response.status || 0),
        ct: String(response.contentType || ''),
        timedtext: getTimedtextUrlSummary(requestUrl),
        head
      });
      if (!response.ok || Number(response.status || 0) !== 200) continue;
      if (isLikelyHtmlResponse(response.contentType, response.text)) continue;
      const events = parseCaptionEventsFromText(response.text);
      const items = buildRealtimeItemsFromCaptionEvents(events, videoKey);
      if (items.length) {
        return items;
      }
    }
  }

  return [];
}

function mapSubtitleBundleToRealtimeItems(bundle, videoKey) {
  const rawItems = Array.isArray(bundle?.items) ? bundle.items : [];
  const items = [];
  rawItems.forEach((item, index) => {
    const text = String(item?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const start = Number(item?.startTimeSeconds);
    const end = Number(item?.endTimeSeconds);
    if (!Number.isFinite(start) || start < 0) return;
    const safeEnd = Number.isFinite(end) && end > start ? end : start + 2.2;
    items.push({
      id: String(item?.id || `${videoKey}-${index + 1}`),
      source: text,
      translation: '',
      videoTimeSeconds: start,
      endTimeSeconds: safeEnd,
      createdAt: Date.now()
    });
  });
  return items.slice(0, YT_RT_MAX_ITEMS);
}

async function applyLoadedRealtimeItems(videoKey, items) {
  ytRtItems = items;
  ytRtStatusText = '';
  ytRtNextLoadAt = 0;
  ytRtTranscriptLoadedVideoKey = videoKey;
  ytRtActiveItemId = '';
  ytRtActiveIndex = -1;
  renderRealtimeSubtitleList();
  syncRealtimeActiveItemByPlayback(true);

  const canTranslate = await ensureRealtimeTranslationCapability();
  if (!canTranslate) {
    renderRealtimeSubtitleList();
    return;
  }
  translateRealtimeItems(videoKey);
}

function getYouTubePlayerResponse() {
  try {
    const moviePlayer = document.getElementById('movie_player');
    const direct = moviePlayer?.getPlayerResponse?.();
    if (direct) return direct;
  } catch (_) {}

  try {
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    const fromFlexy = watchFlexy?.playerData?.playerResponse || watchFlexy?.playerResponse;
    if (fromFlexy) return fromFlexy;
  } catch (_) {}

  try {
    const fromGlobal =
      window.ytInitialPlayerResponse ||
      window?.ytcfg?.get?.('PLAYER_RESPONSE') ||
      window?.ytcfg?.data_?.PLAYER_RESPONSE;
    if (fromGlobal) return fromGlobal;
  } catch (_) {}
  return null;
}

async function getYouTubePlayerResponseWithFallback(videoKey) {
  const direct = getYouTubePlayerResponse();
  if (direct) return direct;
  const inline = extractPlayerResponseFromInlineScripts();
  if (inline) return inline;
  if (!videoKey) return null;

  if (ytRtPlayerResponseCache.has(videoKey)) {
    return ytRtPlayerResponseCache.get(videoKey) || null;
  }

  const fetched = await fetchYouTubePlayerResponseFromHtml(videoKey);
  ytRtPlayerResponseCache.set(videoKey, fetched || null);
  if (ytRtPlayerResponseCache.size > 6) {
    const firstKey = ytRtPlayerResponseCache.keys().next().value;
    if (firstKey) ytRtPlayerResponseCache.delete(firstKey);
  }
  return fetched;
}

async function fetchCaptionTracksViaBackground(videoKey) {
  const key = String(videoKey || '').trim();
  if (!key) return [];
  if (ytRtCaptionTrackCache.has(key)) {
    return ytRtCaptionTrackCache.get(key) || [];
  }
  try {
    const response = await safeSendMessageAsync({
      type: 'yt-get-caption-tracks',
      payload: { videoId: key }
    });
    if (!response?.success) {
      console.warn('[yt-cc] tracks(background) failed', {
        videoKey: key,
        message: String(response?.message || 'unknown')
      });
      ytRtCaptionTrackCache.set(key, []);
      return [];
    }
    const tracks = Array.isArray(response?.tracks) ? response.tracks : [];
    console.log('[yt-cc] tracks(background)', {
      videoKey: key,
      source: String(response?.source || 'youtubei'),
      count: tracks.length
    });
    ytRtCaptionTrackCache.set(key, tracks);
    if (ytRtCaptionTrackCache.size > 6) {
      const firstKey = ytRtCaptionTrackCache.keys().next().value;
      if (firstKey) ytRtCaptionTrackCache.delete(firstKey);
    }
    return tracks;
  } catch (err) {
    console.warn('[yt-cc] tracks(background) exception', {
      videoKey: key,
      message: normalizeExtensionError(err)
    });
    ytRtCaptionTrackCache.set(key, []);
    return [];
  }
}

function extractPlayerResponseFromInlineScripts() {
  try {
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      const raw = String(script.textContent || '');
      if (!raw || !raw.includes('ytInitialPlayerResponse')) continue;
      const jsonText = extractJsonObjectByMarker(raw, 'ytInitialPlayerResponse =');
      if (!jsonText) continue;
      try {
        return JSON.parse(jsonText);
      } catch (_) {}
    }
  } catch (_) {}
  return null;
}

async function fetchYouTubePlayerResponseFromHtml(videoKey) {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoKey)}&hl=en`;
    const html = await fetchTextWithDebug(watchUrl, { allowHtml: true });
    const jsonText = extractJsonObjectByMarker(html, 'ytInitialPlayerResponse =');
    if (!jsonText) return null;
    return JSON.parse(jsonText);
  } catch (_) {
    return null;
  }
}

function extractJsonObjectByMarker(raw, marker) {
  const text = String(raw || '');
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return '';
  const startIndex = text.indexOf('{', markerIndex);
  if (startIndex < 0) return '';

  let depth = 0;
  let quoteChar = '';
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (quoteChar) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quoteChar) {
        quoteChar = '';
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quoteChar = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }
  return '';
}

function extractYouTubeCaptionTracks(playerResponse) {
  const tracks =
    playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  return Array.isArray(tracks) ? tracks : [];
}

function getCaptionTracksFromPlayerApi() {
  try {
    const moviePlayer = document.getElementById('movie_player');
    if (!moviePlayer?.getOption) return [];
    const tracklist = moviePlayer.getOption('captions', 'tracklist');
    const tracks = tracklist?.captionTracks;
    return Array.isArray(tracks) ? tracks : [];
  } catch (_) {
    return [];
  }
}

function normalizeCaptionTrack(track) {
  if (!track || typeof track !== 'object') return null;
  const baseUrl = String(track.baseUrl || '').trim();
  if (!baseUrl) return null;
  return {
    ...track,
    baseUrl
  };
}

function mergeCaptionTracks(primary = [], secondary = []) {
  const all = [...primary, ...secondary]
    .map((track) => normalizeCaptionTrack(track))
    .filter(Boolean);
  if (!all.length) return [];
  const seen = new Set();
  const result = [];
  all.forEach((track) => {
    const key = `${track.baseUrl}|${String(track.languageCode || '')}|${String(track.vssId || '')}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(track);
  });
  return result;
}

function pickPreferredCaptionTrack(tracks = []) {
  if (!tracks.length) return null;
  const normalized = tracks.filter((track) => track?.baseUrl);
  if (!normalized.length) return null;

  const english = normalized.filter((track) => {
    const lang = String(track?.languageCode || '').toLowerCase();
    const vssId = String(track?.vssId || '').toLowerCase();
    return lang.startsWith('en') || /(^|[.])en([.-]|$)/.test(vssId);
  });
  const englishManual = english.find((track) => String(track?.kind || '') !== 'asr');
  if (englishManual) return englishManual;
  if (english.length) return english[0];

  const manual = normalized.find((track) => String(track?.kind || '') !== 'asr');
  return manual || normalized[0];
}

function buildCaptionJsonUrl(baseUrl) {
  const url = new URL(baseUrl, location.origin);
  url.searchParams.set('fmt', 'json3');
  return url.toString();
}

function buildCaptionVttUrl(baseUrl) {
  const url = new URL(baseUrl, location.origin);
  url.searchParams.set('fmt', 'vtt');
  return url.toString();
}

async function fetchCaptionEvents(track) {
  const baseUrl = String(track?.baseUrl || '').trim();
  if (!baseUrl) {
    throw new Error('字幕轨道地址为空');
  }
  const candidates = [baseUrl];
  const json3Url = buildCaptionJsonUrl(baseUrl);
  if (json3Url && json3Url !== baseUrl) {
    candidates.push(json3Url);
  }
  const vttUrl = buildCaptionVttUrl(baseUrl);
  if (vttUrl && vttUrl !== baseUrl) {
    candidates.push(vttUrl);
  }

  let lastError = null;
  for (const url of candidates) {
    try {
      const raw = await fetchTextWithDebug(url);
      const parsed = parseCaptionEventsFromText(raw);
      if (parsed.length) return parsed;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return [];
}

async function fetchTextWithDebug(url, options = {}) {
  return fetchTextViaBackground(url, options);
}

function parseCaptionEventsFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  const normalizedJsonText = text.replace(/^\)\]\}'\s*/, '');
  try {
    const payload = JSON.parse(normalizedJsonText);
    const events = Array.isArray(payload?.events) ? payload.events : [];
    if (events.length) return events;
  } catch (_) {}

  const vttEvents = parseCaptionEventsFromVtt(text);
  if (vttEvents.length) return vttEvents;

  return parseCaptionEventsFromXml(text);
}

function parseCaptionEventsFromVtt(vttText) {
  const source = String(vttText || '').replace(/\r/g, '').trim();
  if (!source || !source.includes('-->')) return [];
  const blocks = source.split(/\n{2,}/);
  const events = [];

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
    const endRaw = String(endRawWithMeta || '')
      .split(/\s+/)[0]
      .trim();
    const startMs = parseVttTimestampToMs(startRaw);
    const endMs = parseVttTimestampToMs(endRaw);
    if (!Number.isFinite(startMs) || startMs < 0) return;
    const durationMs =
      Number.isFinite(endMs) && endMs > startMs ? endMs - startMs : 2200;
    const textLines = lines.slice(timelineIndex + 1);
    const textValue = textLines.join(' ').trim();
    if (!textValue) return;
    events.push({
      tStartMs: startMs,
      dDurationMs: durationMs,
      segs: [{ utf8: textValue }]
    });
  });

  return events;
}

function parseVttTimestampToMs(raw) {
  const input = String(raw || '').trim().replace(',', '.');
  if (!input) return NaN;
  const parts = input.split(':');
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
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

function parseCaptionEventsFromXml(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    const parseError = doc.querySelector('parsererror');
    if (parseError) return [];

    const textNodes = Array.from(doc.querySelectorAll('text'));
    if (!textNodes.length) return [];
    return textNodes.map((node) => {
      const start = Number(node.getAttribute('start') || '0');
      const dur = Number(node.getAttribute('dur') || '0');
      return {
        tStartMs: Number.isFinite(start) ? start * 1000 : 0,
        dDurationMs: Number.isFinite(dur) && dur > 0 ? dur * 1000 : 2200,
        segs: [{ utf8: node.textContent || '' }]
      };
    });
  } catch (_) {
    return [];
  }
}

function normalizeCaptionText(text) {
  const decoded = decodeHtmlEntities(String(text || ''));
  return decoded
    .replace(/\u200b/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(text) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = String(text || '');
  return textarea.value || '';
}

function buildRealtimeItemsFromCaptionEvents(events, videoKey) {
  const items = [];
  const seen = new Set();
  events.forEach((event) => {
    const segs = Array.isArray(event?.segs) ? event.segs : [];
    if (!segs.length) return;
    const source = normalizeCaptionText(segs.map((seg) => seg?.utf8 || '').join(''));
    if (!source) return;
    const startMs = Number(event?.tStartMs);
    const durationMs = Number(event?.dDurationMs);
    if (!Number.isFinite(startMs) || startMs < 0) return;
    const start = startMs / 1000;
    const duration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 2.2;
    const dedupeKey = `${Math.round(start * 10)}|${source}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    items.push({
      id: `${videoKey}-${items.length + 1}`,
      source,
      translation: '',
      videoTimeSeconds: start,
      endTimeSeconds: start + duration,
      createdAt: Date.now()
    });
  });
  return items.slice(0, YT_RT_MAX_ITEMS);
}

async function ensureRealtimeTranslationCapability() {
  if (ytRtCanTranslate !== null) return ytRtCanTranslate;
  try {
    const res = await safeSendMessageAsync({ type: 'deepseek-ready' });
    ytRtCanTranslate = Boolean(res?.success && res?.ready);
  } catch (_) {
    ytRtCanTranslate = false;
  }
  return ytRtCanTranslate;
}

async function requestRealtimeSentenceTranslation(sentence) {
  try {
    const res = await safeSendMessageAsync({
      type: 'deepseek-translate-sentence',
      payload: { sentence }
    });
    if (res?.success && res?.message) {
      return String(res.message || '').trim();
    }
  } catch (_) {}
  return '';
}

function syncRealtimeActiveItemByPlayback(shouldScroll = true) {
  if (!ytRtItems.length) return;
  const seconds = getCurrentVideoTimeSeconds();
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const index = findRealtimeItemIndexByTime(seconds);
  if (index < 0 || index >= ytRtItems.length) return;
  if (index === ytRtActiveIndex && ytRtItems[index]?.id === ytRtActiveItemId) return;

  ytRtActiveIndex = index;
  ytRtActiveItemId = ytRtItems[index]?.id || '';
  renderRealtimeSubtitleOverlay(ytRtItems[index] || null);
  updateRealtimeActiveRow(shouldScroll);
}

function findRealtimeItemIndexByTime(seconds) {
  if (!ytRtItems.length) return -1;
  let idx = Number.isInteger(ytRtActiveIndex) ? ytRtActiveIndex : -1;
  if (idx < 0 || idx >= ytRtItems.length) {
    idx = 0;
  }
  if (seconds < ytRtItems[idx].videoTimeSeconds) {
    while (idx > 0 && seconds < ytRtItems[idx].videoTimeSeconds) {
      idx -= 1;
    }
    return idx;
  }
  while (idx < ytRtItems.length - 1 && seconds >= ytRtItems[idx + 1].videoTimeSeconds) {
    idx += 1;
  }
  return idx;
}

function setRealtimeActiveById(itemId, shouldScroll = true) {
  if (!itemId) return;
  const index = ytRtItems.findIndex((item) => item.id === itemId);
  if (index < 0) return;
  ytRtActiveIndex = index;
  ytRtActiveItemId = itemId;
  renderRealtimeSubtitleOverlay(ytRtItems[index] || null);
  updateRealtimeActiveRow(shouldScroll);
}

function updateRealtimeActiveRow(shouldScroll = false) {
  const listEl = document.querySelector(`#${YT_RT_PANEL_ID} [data-yt-rt-list]`);
  if (!listEl) return;
  const current = listEl.querySelector('.yt-rt-item.is-active');
  if (current && current.dataset.ytRtItemId !== ytRtActiveItemId) {
    current.classList.remove('is-active');
  }
  if (!ytRtActiveItemId) return;
  const selector = `[data-yt-rt-item-id="${escapeAttr(ytRtActiveItemId)}"]`;
  const target = listEl.querySelector(selector);
  if (!target) return;
  target.classList.add('is-active');
  if (shouldScroll) {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

function updateRealtimeItemTranslation(itemId, translation) {
  const listEl = document.querySelector(`#${YT_RT_PANEL_ID} [data-yt-rt-list]`);
  if (!listEl) return;
  const selector = `[data-yt-rt-item-id="${escapeAttr(itemId)}"] .yt-rt-item__translation`;
  const rowTranslation = listEl.querySelector(selector);
  if (!rowTranslation) return;
  rowTranslation.textContent = translation || '';
  rowTranslation.classList.toggle('is-empty', !translation);
}

async function translateRealtimeItems(videoKey) {
  if (!ytRtItems.length) return;
  const jobId = ++ytRtTranslationJobId;
  for (const item of ytRtItems) {
    if (jobId !== ytRtTranslationJobId) return;
    if (videoKey !== ytRtTranscriptLoadedVideoKey) return;
    if (item.translation) continue;
    const cached = ytRtTranslationCache.get(item.source);
    if (cached) {
      item.translation = cached;
      updateRealtimeItemTranslation(item.id, cached);
      continue;
    }
    const translated = await requestRealtimeSentenceTranslation(item.source);
    if (!translated) continue;
    item.translation = translated;
    ytRtTranslationCache.set(item.source, translated);
    if (ytRtTranslationCache.size > 1200) {
      const firstKey = ytRtTranslationCache.keys().next().value;
      if (firstKey) ytRtTranslationCache.delete(firstKey);
    }
    updateRealtimeItemTranslation(item.id, translated);
    if (item.id === ytRtActiveItemId) {
      renderRealtimeSubtitleOverlay(item);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 60));
  }
}

function loadRealtimeTranscript(forceReload = false) {
  if (!forceReload && Date.now() < ytRtNextLoadAt) {
    return Promise.resolve();
  }
  if (forceReload) {
    ytRtNextLoadAt = 0;
    ytRtLoadingPromise = ensureRealtimeTranscriptLoaded(true).finally(() => {
      ytRtLoadingPromise = null;
    });
    return ytRtLoadingPromise;
  }
  if (!ytRtLoadingPromise) {
    ytRtLoadingPromise = ensureRealtimeTranscriptLoaded(false).finally(() => {
      ytRtLoadingPromise = null;
    });
  }
  return ytRtLoadingPromise;
}

async function ensureRealtimeTranscriptLoaded(forceReload = false) {
  const videoKey = getCurrentYouTubeVideoKey();
  if (!videoKey) return;
  if (forceReload) {
    ytRtNextLoadAt = 0;
    ytRtTranscriptLoadedVideoKey = '';
    ytRtTranscriptLoadingVideoKey = '';
    ytRtTranslationJobId += 1;
    ytRtActiveItemId = '';
    ytRtActiveIndex = -1;
  }
  if (!forceReload && ytRtTranscriptLoadedVideoKey === videoKey && ytRtItems.length) return;
  if (!forceReload && ytRtTranscriptLoadingVideoKey === videoKey) return;

  ytRtTranscriptLoadingVideoKey = videoKey;
  ytRtStatusText = '加载字幕中...';
  renderRealtimeSubtitleList();
  try {
    if (isYouTubeAdPlaying()) {
      ytRtItems = [];
      ytRtStatusText = '广告播放中，广告结束后自动加载字幕...';
      ytRtTranscriptLoadedVideoKey = '';
      ytRtNextLoadAt = Date.now() + YT_RT_AD_RETRY_MS;
      renderRealtimeSubtitleList();
      window.setTimeout(() => {
        loadRealtimeTranscript(false);
      }, YT_RT_AD_RETRY_MS + 120);
      return;
    }
    if (ytRtStatusText.includes('广告播放中')) {
      ytRtStatusText = '广告已结束，正在加载字幕...';
      ytRtNextLoadAt = 0;
      renderRealtimeSubtitleList();
    }

    const track = await requestCaptionTrackFromBridge(videoKey);
    let fallbackUrl = '';
    if (!track?.baseUrl) {
      fallbackUrl = await findTimedtextUrlFromPerformanceWithRetry(videoKey);
    }
    const pageContext = await buildPageContextPayload(videoKey, track, fallbackUrl);
    console.info('[yt-cc] subtitle request', {
      videoKey,
      track: summarizeBridgeTrackForLog(track),
      fallbackFound: Boolean(fallbackUrl),
      fallbackTimedtext: fallbackUrl ? getTimedtextUrlSummary(fallbackUrl) : null,
      pageContext: {
        source: pageContext?.source || '',
        candidateCount: Array.isArray(pageContext?.candidates) ? pageContext.candidates.length : 0,
        attemptCount: Array.isArray(pageContext?.attempts) ? pageContext.attempts.length : 0,
        htmlReason: String(pageContext?.htmlReason || '')
      }
    });

    if (!track?.baseUrl && !fallbackUrl && ytRtAutoCcTriedVideoKey !== videoKey) {
      console.warn('[yt-cc] subtitle track missing, will auto-enable CC and retry', {
        videoKey,
        trackStatus: String(track?.status || '').trim()
      });
      ytRtAutoCcTriedVideoKey = videoKey;
      ensureYouTubeCcEnabled();
      ytRtStatusText = '正在开启 CC 并加载字幕...';
      renderRealtimeSubtitleList();
      window.setTimeout(() => {
        loadRealtimeTranscript(true);
      }, 600);
      return;
    }

    const subtitleBundle = await requestSubtitleBundle(videoKey, track, fallbackUrl, pageContext);
    const status = String(subtitleBundle?.status || '').toUpperCase();
    const itemCount = Array.isArray(subtitleBundle?.items) ? subtitleBundle.items.length : 0;
    console.info('[yt-cc] subtitle response', {
      videoKey,
      status,
      message: String(subtitleBundle?.message || ''),
      language: String(subtitleBundle?.language || ''),
      isAutoGenerated: Boolean(subtitleBundle?.isAutoGenerated),
      itemCount,
      debug: subtitleBundle?.debug || null
    });

    const shouldTryBridgeFallback =
      isSubtitleBundleHtmlFailure(subtitleBundle) &&
      (status === 'NO_SUBTITLES' || status === 'HTML_RESPONSE');
    if (shouldTryBridgeFallback) {
      console.warn('[yt-cc] background returned HTML, trying page-context fallback', {
        videoKey,
        status,
        debug: subtitleBundle?.debug || null
      });
      const fallbackItems = await tryLoadSubtitlesViaBridgeFallback(videoKey, track, fallbackUrl);
      if (fallbackItems.length) {
        console.info('[yt-cc] page-context fallback succeeded', {
          videoKey,
          itemCount: fallbackItems.length
        });
        await applyLoadedRealtimeItems(videoKey, fallbackItems);
        return;
      }
      console.warn('[yt-cc] page-context fallback still failed', {
        videoKey,
        status
      });
    }

    if (status === 'HTML_RESPONSE') {
      if (isYouTubeAdPlaying()) {
        ytRtItems = [];
        ytRtStatusText = '广告阶段字幕不可用，广告结束后自动重试...';
        ytRtTranscriptLoadedVideoKey = '';
        ytRtNextLoadAt = Date.now() + YT_RT_AD_RETRY_MS;
        renderRealtimeSubtitleList();
        window.setTimeout(() => {
          loadRealtimeTranscript(false);
        }, YT_RT_AD_RETRY_MS + 120);
        return;
      }
      const htmlReason = String(subtitleBundle?.debug?.htmlReason || '').trim();
      console.warn('[yt-cc] subtitle response is html page', {
        videoKey,
        htmlReason,
        debug: subtitleBundle?.debug || null
      });
      ytRtItems = [];
      ytRtStatusText = htmlReason
        ? `字幕加载失败：HTML 页面拦截（${htmlReason}）`
        : '字幕加载失败：拿到的是 HTML 页面（同意页/登录页/验证码页），不是字幕数据';
      ytRtTranscriptLoadedVideoKey = '';
      ytRtNextLoadAt = Date.now() + 5000;
      renderRealtimeSubtitleList();
      return;
    }
    if (status === 'NO_SUBTITLES') {
      console.warn('[yt-cc] no subtitles detected', {
        videoKey,
        track: summarizeBridgeTrackForLog(track),
        fallbackFound: Boolean(fallbackUrl),
        fallbackTimedtext: fallbackUrl ? getTimedtextUrlSummary(fallbackUrl) : null,
        debug: subtitleBundle?.debug || null
      });
      ytRtItems = [];
      ytRtStatusText = '未检测到字幕，请先开启 CC 或更换有字幕的视频';
      ytRtTranscriptLoadedVideoKey = '';
      ytRtNextLoadAt = Date.now() + 5000;
      renderRealtimeSubtitleList();
      return;
    }

    const items = mapSubtitleBundleToRealtimeItems(subtitleBundle, videoKey);
    if (!items.length) {
      ytRtItems = [];
      ytRtStatusText = '该视频字幕为空';
      ytRtTranscriptLoadedVideoKey = '';
      ytRtNextLoadAt = Date.now() + 5000;
      renderRealtimeSubtitleList();
      return;
    }

    await applyLoadedRealtimeItems(videoKey, items);
  } catch (err) {
    const message = normalizeExtensionError(err);
    console.warn('[yt-cc] subtitle pipeline failed', {
      videoKey,
      message
    });
    ytRtItems = [];
    ytRtStatusText = `字幕加载失败：${message}`;
    ytRtNextLoadAt = Date.now() + 5000;
    renderRealtimeSubtitleList();
  } finally {
    if (ytRtTranscriptLoadingVideoKey === videoKey) {
      ytRtTranscriptLoadingVideoKey = '';
    }
  }
}

function scheduleRealtimeSubtitleCapture() {
  clearTimeout(ytRtDebounceTimer);
  ytRtDebounceTimer = window.setTimeout(() => {
    captureRealtimeSubtitleText();
  }, YT_RT_DEBOUNCE_MS);
}

function captureRealtimeSubtitleText() {
  if (!ytRtEnabled) return;
  loadRealtimeTranscript(false)
    .then(() => {
      syncRealtimeActiveItemByPlayback(false);
    })
    .catch(() => {});
}

function getCurrentYoutubeSubtitleText() {
  const captionRoots = document.querySelectorAll(
    '.ytp-caption-window-container, .caption-window.ytp-caption-window-bottom, .ytp-caption-segment'
  );
  if (!captionRoots.length) return '';
  const parts = [];
  captionRoots.forEach((node) => {
    if (!node || !node.textContent) return;
    const value = String(node.textContent).replace(/\s+/g, ' ').trim();
    if (value) parts.push(value);
  });
  if (!parts.length) return '';
  const merged = Array.from(new Set(parts)).join(' ');
  return merged.replace(/\s+/g, ' ').trim();
}

function getCurrentVideoElement() {
  return document.querySelector('video');
}

function getCurrentVideoTimeSeconds() {
  const video = getCurrentVideoElement();
  if (!video) return -1;
  const currentTime = Number(video.currentTime);
  return Number.isFinite(currentTime) ? currentTime : -1;
}

function ensureYouTubeCcEnabled() {
  const ccBtn = document.querySelector('.ytp-subtitles-button');
  if (ccBtn) {
    const pressed = String(ccBtn.getAttribute('aria-pressed') || '').toLowerCase();
    if (pressed !== 'true') {
      ccBtn.click();
    }
    return true;
  }
  try {
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer?.toggleSubtitles) {
      moviePlayer.toggleSubtitles();
      return true;
    }
  } catch (_) {}
  return false;
}

function seekVideoToItem(item) {
  const video = getCurrentVideoElement();
  if (!video) return;
  const seconds = Number(item?.videoTimeSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const clamped = Math.max(0, seconds - YT_RT_SEEK_LEAD_SECONDS);
  try {
    video.currentTime = clamped;
    const playPromise = video.play?.();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  } catch (_) {
    // ignore
  }
}

function queueRealtimeTranslation(text, videoTimeSeconds = -1) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return;
  if (ytRtTranslationCache.has(cleanText)) {
    pushRealtimeTranslationItem(cleanText, ytRtTranslationCache.get(cleanText), videoTimeSeconds);
    return;
  }
  ytRtQueuedText = cleanText;
  ytRtQueuedVideoTime = Number.isFinite(videoTimeSeconds) ? videoTimeSeconds : -1;
  processRealtimeTranslationQueue();
}

function processRealtimeTranslationQueue() {
  if (!ytRtEnabled) return;
  if (ytRtRequestInFlight) return;
  const sentence = String(ytRtQueuedText || '').trim();
  const videoTimeSeconds = ytRtQueuedVideoTime;
  if (!sentence) return;
  ytRtQueuedText = '';
  ytRtQueuedVideoTime = -1;
  ytRtRequestInFlight = true;
  safeSendMessage(
    {
      type: 'deepseek-translate-sentence',
      payload: { sentence }
    },
    (res, err) => {
      ytRtRequestInFlight = false;
      if (err) {
        ytRtStatusText = `翻译失败：${normalizeExtensionError(err)}`;
        renderRealtimeSubtitleList();
        showToast(normalizeExtensionError(err));
      } else if (res?.success && res?.message) {
        const translated = String(res.message || '').trim();
        ytRtTranslationCache.set(sentence, translated);
        if (ytRtTranslationCache.size > 120) {
          const firstKey = ytRtTranslationCache.keys().next().value;
          if (firstKey) ytRtTranslationCache.delete(firstKey);
        }
        ytRtStatusText = '';
        pushRealtimeTranslationItem(sentence, translated, videoTimeSeconds);
      } else {
        ytRtStatusText = `翻译失败：${String(res?.message || '未知错误')}`;
        renderRealtimeSubtitleList();
        showToast(String(res?.message || '翻译失败'));
      }
      if (ytRtQueuedText) {
        window.setTimeout(() => processRealtimeTranslationQueue(), 50);
      }
    }
  );
}

function ensureRealtimeSubtitleUi() {
  let panel = document.getElementById(YT_RT_PANEL_ID);
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = YT_RT_PANEL_ID;
    panel.innerHTML = `
      <div class="yt-rt-panel__header">
        <span class="yt-rt-panel__title">实时翻译</span>
        <div class="yt-rt-panel__actions">
          <button type="button" class="yt-rt-btn yt-rt-btn--ghost" data-yt-rt-load-cc>加载CC</button>
          <button type="button" class="yt-rt-btn yt-rt-btn--ghost" data-yt-rt-toggle>暂停</button>
          <button type="button" class="yt-rt-btn yt-rt-btn--ghost" data-yt-rt-clear>清空</button>
          <button type="button" class="yt-rt-btn yt-rt-btn--ghost" data-yt-rt-hide>隐藏</button>
        </div>
      </div>
      <div class="yt-rt-panel__list" data-yt-rt-list></div>
    `;
    document.body.appendChild(panel);

    const loadCcBtn = panel.querySelector('[data-yt-rt-load-cc]');
    const toggleBtn = panel.querySelector('[data-yt-rt-toggle]');
    const clearBtn = panel.querySelector('[data-yt-rt-clear]');
    const hideBtn = panel.querySelector('[data-yt-rt-hide]');
    loadCcBtn?.addEventListener('click', async () => {
      if (loadCcBtn.disabled) return;
      setButtonLoading(loadCcBtn, true, '加载中...');
      try {
        ytRtAutoCcTriedVideoKey = '';
        const ok = ensureYouTubeCcEnabled();
        if (!ok) {
          showToast('未找到 CC 按钮，请先进入视频页面');
        }
        await new Promise((resolve) => window.setTimeout(resolve, 260));
        await loadRealtimeTranscript(true);
        syncRealtimeActiveItemByPlayback(true);
      } finally {
        setButtonLoading(loadCcBtn, false);
      }
    });
    toggleBtn?.addEventListener('click', () => {
      ytRtEnabled = !ytRtEnabled;
      toggleBtn.textContent = ytRtEnabled ? '暂停' : '继续';
      if (ytRtEnabled) scheduleRealtimeSubtitleCapture();
    });
    clearBtn?.addEventListener('click', () => {
      ytRtItems = [];
      ytRtActiveItemId = '';
      ytRtActiveIndex = -1;
      ytRtTranscriptLoadedVideoKey = '';
      ytRtStatusText = '已清空，重新加载中...';
      renderRealtimeSubtitleList();
      renderRealtimeSubtitleOverlay(null);
      scheduleRealtimeSubtitleCapture();
    });
    hideBtn?.addEventListener('click', () => {
      panel.classList.add('is-hidden');
      document
        .querySelector('ytd-watch-flexy')
        ?.classList?.remove(
          YT_RT_WATCH_ACTIVE_CLASS,
          YT_RT_TARGET_FULL_CLASS,
          YT_RT_TARGET_PLAYER_FULL_CLASS
        );
      const reopenBtn = document.getElementById(YT_RT_REOPEN_BTN_ID);
      if (reopenBtn) reopenBtn.classList.add('is-active');
    });
  }

  let reopenBtn = document.getElementById(YT_RT_REOPEN_BTN_ID);
  if (!reopenBtn) {
    reopenBtn = document.createElement('button');
    reopenBtn.id = YT_RT_REOPEN_BTN_ID;
    reopenBtn.type = 'button';
    reopenBtn.className = 'yt-rt-reopen-btn';
    reopenBtn.textContent = '实时翻译';
    reopenBtn.title = '显示实时翻译面板';
    reopenBtn.addEventListener('click', () => {
      panel?.classList.remove('is-hidden');
      reopenBtn?.classList.remove('is-active');
      syncRealtimePanelLayout();
    });
    document.body.appendChild(reopenBtn);
  }

  syncRealtimePanelLayout();

  let overlay = document.getElementById(YT_RT_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = YT_RT_OVERLAY_ID;
    overlay.innerHTML = `
      <div class="yt-rt-overlay__source" data-yt-rt-source></div>
      <div class="yt-rt-overlay__translation" data-yt-rt-translation></div>
    `;
    document.body.appendChild(overlay);
  }
}

function pushRealtimeTranslationItem(source, translation, videoTimeSeconds = -1) {
  const cleanSource = String(source || '').trim();
  const cleanTranslation = String(translation || '').trim();
  if (!cleanSource || !cleanTranslation) return;
  const canMergeWithLast =
    ytRtItems.length &&
    ytRtItems[ytRtItems.length - 1].source === cleanSource &&
    Math.abs(
      Number(ytRtItems[ytRtItems.length - 1].videoTimeSeconds || -1) -
        Number(videoTimeSeconds || -1)
    ) <= 1.5;
  if (canMergeWithLast) {
    ytRtItems[ytRtItems.length - 1].translation = cleanTranslation;
    if (Number.isFinite(videoTimeSeconds) && videoTimeSeconds >= 0) {
      ytRtItems[ytRtItems.length - 1].videoTimeSeconds = videoTimeSeconds;
    }
  } else {
    ytRtItems.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      source: cleanSource,
      translation: cleanTranslation,
      videoTimeSeconds: Number.isFinite(videoTimeSeconds) ? videoTimeSeconds : -1,
      createdAt: Date.now()
    });
    if (ytRtItems.length > YT_RT_MAX_ITEMS) {
      ytRtItems = ytRtItems.slice(-YT_RT_MAX_ITEMS);
    }
  }
  ytRtActiveItemId = ytRtItems[ytRtItems.length - 1]?.id || '';
  renderRealtimeSubtitleList();
  renderRealtimeSubtitleOverlay(ytRtItems[ytRtItems.length - 1]);
}

function renderRealtimeSubtitleOverlay(item) {
  const overlay = document.getElementById(YT_RT_OVERLAY_ID);
  if (!overlay) return;
  const sourceEl = overlay.querySelector('[data-yt-rt-source]');
  const translationEl = overlay.querySelector('[data-yt-rt-translation]');
  if (!item) {
    sourceEl.textContent = '';
    translationEl.textContent = '';
    overlay.classList.remove('is-active');
    return;
  }
  sourceEl.textContent = item.source;
  const translation = String(item.translation || '').trim();
  translationEl.textContent = translation;
  translationEl.style.display =
    ytRtCanTranslate === false || !translation ? 'none' : 'block';
  overlay.classList.add('is-active');
}

function renderRealtimeSubtitleList() {
  const listEl = document.querySelector(`#${YT_RT_PANEL_ID} [data-yt-rt-list]`);
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!ytRtItems.length) {
    const empty = document.createElement('div');
    empty.className = 'yt-rt-empty';
    empty.textContent = ytRtStatusText || '等待字幕...';
    listEl.appendChild(empty);
    return;
  }
  const items = ytRtItems.slice();
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'yt-rt-item';
    row.dataset.ytRtItemId = item.id || '';
    if (item.id && item.id === ytRtActiveItemId) {
      row.classList.add('is-active');
    }

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'yt-rt-item__play';
    playBtn.title = '跳转并播放';
    playBtn.innerHTML = '<span class="yt-rt-item__play-icon">▶</span>';
    playBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      setRealtimeActiveById(item.id, true);
      seekVideoToItem(item);
    });

    const source = document.createElement('div');
    source.className = 'yt-rt-item__source';
    source.innerHTML = buildRealtimeSourceHtml(item.source);
    source.addEventListener('click', (event) => {
      const target = event.target;
      const word = target?.dataset?.ytWord || '';
      if (!word) return;
      event.preventDefault();
      event.stopPropagation();
      const video = getCurrentVideoElement();
      if (video && !video.paused) video.pause();
      const anchorRect =
        target instanceof HTMLElement ? target.getBoundingClientRect() : null;
      startEcdictLookup(word, anchorRect);
    });

    const translation = document.createElement('div');
    translation.className = 'yt-rt-item__translation';
    translation.textContent = item.translation || '';
    translation.classList.toggle('is-empty', !item.translation);
    if (ytRtCanTranslate === false) {
      translation.style.display = 'none';
    }

    row.addEventListener('click', (event) => {
      if (event.target?.closest?.('.yt-rt-item__play')) return;
      setRealtimeActiveById(item.id, false);
    });

    row.appendChild(playBtn);
    row.appendChild(source);
    if (ytRtCanTranslate !== false) {
      row.appendChild(translation);
    }
    listEl.appendChild(row);
  });
}

function buildRealtimeSourceHtml(text) {
  const raw = String(text || '');
  if (!raw) return '';
  return raw.replace(/[A-Za-z][A-Za-z'-]*/g, (word) => {
    return `<span class="yt-rt-source-word" data-yt-word="${escapeAttr(word)}">${escapeHtml(word)}</span>`;
  });
}

async function addRealtimeWordToAnki(word, item, button) {
  const cleanWord = String(word || '').trim();
  if (!cleanWord) return;
  setButtonLoading(button, true, '...');
  try {
    const normalizedWord = await normalizeSelection(cleanWord);
    const entry = await fetchEcdictEntry(normalizedWord);
    if (!entry) {
      showToast(`未找到词典释义：${normalizedWord}`);
      setButtonLoading(button, false);
      return;
    }

    safeSendMessage(
      {
        type: 'add-vocab-note',
        payload: {
          word: normalizedWord,
          entry,
          sentence: item?.source || '',
          translation: item?.translation || '',
          meaning: '',
          sourceUrl: location.href,
          sourceTitle: document.title
        }
      },
      (res, err) => {
        setButtonLoading(button, false);
        if (err) {
          showToast(normalizeExtensionError(err));
          return;
        }
        if (res?.success) {
          showToast(`已添加：${normalizedWord}`);
        } else {
          showToast(res?.message || '添加失败');
        }
      }
    );
  } catch (err) {
    setButtonLoading(button, false);
    showToast(normalizeExtensionError(err));
  }
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
  return String(str).replace(/"/g, '&quot;');
}

function enablePanelDrag(panel) {
  const header = panel.querySelector('.deepseek-panel__header');
  if (!header) return;

  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const margin = 8;

  const onMouseMove = (event) => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const width = panel.offsetWidth || 0;
    const height = panel.offsetHeight || 0;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);
    const left = Math.min(Math.max(margin, startLeft + dx), maxLeft);
    const top = Math.min(Math.max(margin, startTop + dy), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  header.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('[data-close]')) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
