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
const YT_RT_TARGET_PLAYER_CONTAINER_CLASS = 'yt-rt-target-player-container';
const YT_RT_TARGET_SECONDARY_CLASS = 'yt-rt-target-secondary';
const YT_RT_HIDE_NATIVE_CAPTIONS_CLASS = 'yt-rt-hide-native-captions';
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
const YT_RT_HTML_RETRY_COOLDOWN_MS = 6000;
const YT_RT_HTML_HARD_COOLDOWN_MS = 30000;
const YT_RT_OVERLAY_POS_KEY = 'yt-rt-overlay-pos-v2';
const YT_RT_FAST_PREFETCH_AHEAD = 1;
const YT_RT_FAST_TIMEOUT_MS = 4200;
const YT_RT_ACTIVE_PREFETCH_AHEAD = 1;
const YT_RT_PLAYBACK_SYNC_MS = 120;
const YT_RT_TRANSLATE_WINDOW_AHEAD = 12;
const YT_RT_TRANSLATE_WINDOW_BEHIND = 2;
const YT_RT_SEEK_WINDOW_AHEAD = 10;
const YT_RT_SEEK_WINDOW_BEHIND = 3;
const YT_RT_SEEK_JUMP_SECONDS = 2;
const YT_RT_BUDGET_TOTAL = 300;
const YT_RT_BUDGET_SEEK_RESERVE = 80;
const YT_RT_FULL_TRANSCRIPT_RETRY_MS = 5000;
const YT_RT_FULL_TRANSCRIPT_RETRY_HTML_MS = 12000;
const YT_RT_FULL_TRANSCRIPT_RETRY_NO_SUB_MS = 45000;
const YT_RT_FULL_TRANSCRIPT_RETRY_FAIL_MS = 10000;
const YT_RT_ACTIVE_GROUP_MAX_SEGMENTS = 14;
const YT_RT_ACTIVE_GROUP_TIMEOUT_MS = 9000;
const YT_RT_FAST_STANDBY_CHUNKS = 1;
const YT_RT_CHUNK_RETRY_COOLDOWN_MS = 3500;
const YT_RT_BACKFILL_STEP_BATCH = 4;
const YT_RT_BACKFILL_BATCH_TRANSLATE_SIZE = 100;
const YT_RT_BACKFILL_BATCH_RPC_SIZE = 20;
const YT_RT_BACKFILL_GROUP_TARGET_SEGMENTS = 5;
const YT_RT_BACKFILL_GROUP_MAX_SEGMENTS = 18;
const YT_RT_BACKFILL_GROUP_MIN_SEGMENTS = 6;
const YT_RT_BACKFILL_GROUP_MAX_CHARS = 1200;
const YT_RT_BACKFILL_GROUP_MAX_GAP_SECONDS = 3.5;
const YT_RT_BACKFILL_IDLE_DELAY_MS = 140;
const YT_RT_BACKFILL_RETRY_COOLDOWN_MS = 1800;
const YT_RT_BACKFILL_BATCH_TIMEOUT_MS = 9000;
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
let ytRtLayoutSyncTimer = 0;
let ytRtLayoutSyncRaf = 0;
let ytRtLayoutBurstTimers = [];
let ytRtLayoutEventsBound = false;
let ytRtWatchLayoutObserver = null;
let ytRtWatchLayoutObservedEl = null;
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
let ytRtFullTranscriptTriedVideoKey = '';
let ytRtHasFullTimeline = false;
let ytRtFastLaneInFlight = false;
let ytRtFastLaneEpoch = 0;
let ytRtFastLaneVideoKey = '';
let ytRtFastLaneTargets = [];
let ytRtFastLanePendingSeek = false;
let ytRtFastLanePrimaryChunkStart = -1;
let ytRtBackfillInFlight = false;
let ytRtBackfillTimer = 0;
let ytRtBackfillCursor = 0;
let ytRtCanTranslate = null;
let ytRtAutoCcTriedVideoKey = '';
let ytRtLoadingPromise = null;
let ytRtNextLoadAt = 0;
let ytRtAdDetectionStartedAt = 0;
let ytRtLastPlaybackSeconds = -1;
let ytRtLastVideoPausedState = null;
const ytRtPlayerResponseCache = new Map();
const ytRtTranslationCache = new Map();
const ytRtCaptionTrackCache = new Map();
const ytRtTranslationInflight = new Map();
const ytRtBackfillFailedAt = new Map();
const ytRtBudgetSourcesByVideo = new Map();
const ytRtChunkInflight = new Map();
const ytRtChunkLastRequestAt = new Map();
const ytRtFullTranscriptInflightByVideo = new Map();
const ytCaptionTrackWaiters = [];
const ytCaptionBridgeFetchWaiters = new Map();
let ytCaptionBridgeInitialized = false;
let ytCaptionBridgeInjecting = null;
let ytCaptionBridgeReady = false;
let ytCaptionLastTrack = null;
let ytCaptionBridgeFetchSeq = 0;
const ytRtHtmlRetryAtByVideo = new Map();
const ytRtSubtitleBlockedUntilByVideo = new Map();
const ytRtNextFullTranscriptTryAtByVideo = new Map();
let ytRtOverlayPos = null;
let ytRtOverlayDragBound = false;
let ytRtOverlayPendingItemId = '';

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

async function startEcdictLookup(prefilledSelection, anchorRect = null, options = {}) {
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
      showDictionaryResult: true,
      preferLeft: Boolean(options?.preferLeft)
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
  positionMeaningPanel(panel, rect, options);
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

function positionMeaningPanel(panel, rect, options = {}) {
  const margin = 8;
  if (!rect) {
    panel.style.top = `${margin}px`;
    panel.style.left = `${margin}px`;
    return;
  }

  const preferLeft = Boolean(options?.preferLeft);
  const panelRect = panel.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + margin;

  if (preferLeft) {
    left = rect.left - panelRect.width - margin;
  }
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
  bindRealtimeLayoutEvents();
  setInterval(() => {
    maybeSetupRealtimeSubtitleObserver();
  }, 1200);
  maybeSetupRealtimeSubtitleObserver();
}

function scheduleRealtimePanelLayoutSync(delayMs = 0) {
  clearTimeout(ytRtLayoutSyncTimer);
  if (ytRtLayoutSyncRaf) {
    cancelAnimationFrame(ytRtLayoutSyncRaf);
    ytRtLayoutSyncRaf = 0;
  }
  ytRtLayoutSyncTimer = window.setTimeout(() => {
    ytRtLayoutSyncTimer = 0;
    if (!isYouTubeRuntimePage()) return;
    syncRealtimePanelLayout();
    syncRealtimeOverlayLayout();
    ytRtLayoutSyncRaf = requestAnimationFrame(() => {
      ytRtLayoutSyncRaf = 0;
      if (!isYouTubeRuntimePage()) return;
      syncRealtimePanelLayout();
      syncRealtimeOverlayLayout();
    });
  }, Math.max(0, Number(delayMs) || 0));
}

function triggerYouTubeLayoutReflow() {
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  try {
    watchFlexy?.dispatchEvent?.(new Event('iron-resize', { bubbles: true, composed: true }));
  } catch (_) {}
  try {
    window.dispatchEvent(new Event('resize'));
  } catch (_) {}
}

function forceRealtimePanelDockedLayout() {
  triggerYouTubeLayoutReflow();
  syncRealtimePanelLayout();
  scheduleRealtimePanelLayoutSyncBurst([0, 80, 180, 320, 520, 900]);
  window.setTimeout(() => triggerYouTubeLayoutReflow(), 120);
  window.setTimeout(() => triggerYouTubeLayoutReflow(), 420);
}

function clearRealtimeWatchLayoutClasses(watchFlexy) {
  watchFlexy?.classList?.remove(
    YT_RT_WATCH_ACTIVE_CLASS,
    YT_RT_TARGET_FULL_CLASS,
    YT_RT_TARGET_PLAYER_FULL_CLASS,
    YT_RT_TARGET_PLAYER_CONTAINER_CLASS,
    YT_RT_TARGET_SECONDARY_CLASS,
    YT_RT_HIDE_NATIVE_CAPTIONS_CLASS
  );
}

function scheduleRealtimePanelLayoutSyncBurst(delays = [0, 120, 320, 720]) {
  for (const timer of ytRtLayoutBurstTimers) {
    clearTimeout(timer);
  }
  ytRtLayoutBurstTimers = [];
  for (const delay of delays) {
    const timer = window.setTimeout(() => {
      scheduleRealtimePanelLayoutSync(0);
    }, Math.max(0, Number(delay) || 0));
    ytRtLayoutBurstTimers.push(timer);
  }
}

function bindRealtimeLayoutEvents() {
  if (ytRtLayoutEventsBound) return;
  ytRtLayoutEventsBound = true;
  const onViewportChange = () => scheduleRealtimePanelLayoutSyncBurst();
  window.addEventListener('fullscreenchange', onViewportChange);
  window.addEventListener('webkitfullscreenchange', onViewportChange);
  window.addEventListener('resize', () => scheduleRealtimePanelLayoutSync(80));
  window.addEventListener('yt-navigate-finish', () => scheduleRealtimePanelLayoutSync(120), true);
  document.addEventListener(
    'click',
    (event) => {
      const triggerButton = event?.target?.closest?.('.ytp-fullscreen-button, .ytp-size-button');
      if (!triggerButton) return;
      scheduleRealtimePanelLayoutSyncBurst();
    },
    true
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (!event || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const key = String(event.key || '').toLowerCase();
      if (key !== 'f' && key !== 't') return;
      scheduleRealtimePanelLayoutSyncBurst([60, 180, 420, 900]);
    },
    true
  );
}

function ensureWatchFlexyLayoutObserver() {
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  if (ytRtWatchLayoutObservedEl === watchFlexy && ytRtWatchLayoutObserver) {
    return;
  }
  if (ytRtWatchLayoutObserver) {
    ytRtWatchLayoutObserver.disconnect();
    ytRtWatchLayoutObserver = null;
  }
  ytRtWatchLayoutObservedEl = watchFlexy || null;
  if (!watchFlexy) return;
  ytRtWatchLayoutObserver = new MutationObserver(() => {
    scheduleRealtimePanelLayoutSyncBurst([0, 100, 260, 520]);
  });
  ytRtWatchLayoutObserver.observe(watchFlexy, {
    attributes: true,
    attributeFilter: [
      'class',
      'theater',
      'theater-requested_',
      'full-bleed-player',
      'fullscreen',
      'is-fullscreen_'
    ]
  });
}

function hasWatchFlexyMode(watchFlexy, token) {
  if (!watchFlexy || !token) return false;
  return Boolean(watchFlexy.hasAttribute?.(token) || watchFlexy.classList?.contains?.(token));
}

function isYouTubeFullBleedMode(watchFlexy) {
  return Boolean(
    hasWatchFlexyMode(watchFlexy, 'full-bleed-player') ||
      hasWatchFlexyMode(watchFlexy, 'theater') ||
      hasWatchFlexyMode(watchFlexy, 'theater-requested_')
  );
}

function isYouTubeFullscreenMode(watchFlexy) {
  const moviePlayer = document.getElementById('movie_player');
  const html5Player =
    moviePlayer?.querySelector?.('.html5-video-player') || document.querySelector('.html5-video-player');
  return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      hasWatchFlexyMode(watchFlexy, 'fullscreen') ||
      hasWatchFlexyMode(watchFlexy, 'is-fullscreen_') ||
      moviePlayer?.classList?.contains?.('ytp-fullscreen') ||
      html5Player?.classList?.contains?.('ytp-fullscreen') ||
      document.documentElement?.classList?.contains?.('ytp-fullscreen')
  );
}

function maybeSetupRealtimeSubtitleObserver() {
  if (!isYouTubeRuntimePage()) {
    teardownRealtimeSubtitleObserver();
    return;
  }
  ensureRealtimeSubtitleUi();
  ensureWatchFlexyLayoutObserver();
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
    ytRtFullTranscriptTriedVideoKey = '';
    ytRtHasFullTimeline = false;
    ytRtAutoCcTriedVideoKey = '';
    ytRtLoadingPromise = null;
    ytRtNextLoadAt = 0;
    ytRtLastPlaybackSeconds = -1;
    ytRtLastVideoPausedState = null;
    ytRtHtmlRetryAtByVideo.clear();
    ytRtSubtitleBlockedUntilByVideo.clear();
    ytRtNextFullTranscriptTryAtByVideo.clear();
    ytRtPlayerResponseCache.clear();
    ytRtCaptionTrackCache.clear();
    ytRtFastLaneInFlight = false;
    ytRtFastLaneEpoch += 1;
    ytRtFastLaneVideoKey = '';
    ytRtFastLaneTargets = [];
    ytRtFastLanePendingSeek = false;
    ytRtFastLanePrimaryChunkStart = -1;
    ytRtBackfillInFlight = false;
    ytRtBackfillCursor = 0;
    clearTimeout(ytRtBackfillTimer);
    ytRtBackfillTimer = 0;
    ytRtOverlayPendingItemId = '';
    ytRtTranslationInflight.clear();
    ytRtBackfillFailedAt.clear();
    ytRtBudgetSourcesByVideo.clear();
    ytRtChunkInflight.clear();
    ytRtChunkLastRequestAt.clear();
    ytRtFullTranscriptInflightByVideo.clear();
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
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  if (!panel) {
    clearRealtimeWatchLayoutClasses(watchFlexy);
    return;
  }
  watchFlexy?.classList?.remove(
    YT_RT_WATCH_ACTIVE_CLASS,
    YT_RT_TARGET_FULL_CLASS,
    YT_RT_TARGET_PLAYER_FULL_CLASS,
    YT_RT_TARGET_PLAYER_CONTAINER_CLASS,
    YT_RT_TARGET_SECONDARY_CLASS
  );

  if (panel.classList.contains('is-hidden')) {
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    syncNativeCaptionVisibility();
    syncRealtimeOverlayLayout();
    return;
  }
  const fullBleedContainer = document.getElementById('full-bleed-container');
  const playerFullBleedContainer = document.getElementById('player-full-bleed-container');
  const secondaryContainer = document.getElementById('secondary');
  const playerContainer =
    document.getElementById('player-container-outer') ||
    document.getElementById('player-container-inner') ||
    document.getElementById('player');
  const isVisibleContainer = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isFullscreenMode = isYouTubeFullscreenMode(watchFlexy);
  const isFullBleedMode = isYouTubeFullBleedMode(watchFlexy);
  let targetContainer = null;
  if (isFullscreenMode && fullBleedContainer) {
    targetContainer = fullBleedContainer;
  } else if (isFullBleedMode && isVisibleContainer(fullBleedContainer)) {
    targetContainer = fullBleedContainer;
  } else if (!isFullscreenMode && isVisibleContainer(secondaryContainer)) {
    targetContainer = secondaryContainer;
  } else if (isVisibleContainer(fullBleedContainer)) {
    targetContainer = fullBleedContainer;
  } else if (isVisibleContainer(playerFullBleedContainer)) {
    targetContainer = playerFullBleedContainer;
  } else if (isVisibleContainer(playerContainer)) {
    targetContainer = playerContainer;
  }

  if (targetContainer) {
    const shouldInsertFirstInSecondary = targetContainer.id === 'secondary';
    if (panel.parentElement !== targetContainer) {
      if (shouldInsertFirstInSecondary && targetContainer.firstElementChild) {
        targetContainer.insertBefore(panel, targetContainer.firstElementChild);
      } else {
        targetContainer.appendChild(panel);
      }
    } else if (shouldInsertFirstInSecondary && targetContainer.firstElementChild !== panel) {
      targetContainer.insertBefore(panel, targetContainer.firstElementChild);
    }
    watchFlexy?.classList?.add(YT_RT_WATCH_ACTIVE_CLASS);
    if (targetContainer.id === 'secondary') {
      watchFlexy?.classList?.add(YT_RT_TARGET_SECONDARY_CLASS);
    } else if (targetContainer.id === 'full-bleed-container') {
      watchFlexy?.classList?.add(YT_RT_TARGET_FULL_CLASS);
    } else if (targetContainer.id === 'player-full-bleed-container') {
      watchFlexy?.classList?.add(YT_RT_TARGET_PLAYER_FULL_CLASS);
    } else {
      watchFlexy?.classList?.add(YT_RT_TARGET_PLAYER_CONTAINER_CLASS);
    }
    syncNativeCaptionVisibility();
    syncRealtimeOverlayLayout();
    return;
  }

  if (panel.parentElement !== document.body) {
    document.body.appendChild(panel);
  }
  syncNativeCaptionVisibility();
  syncRealtimeOverlayLayout();
}

function teardownRealtimeSubtitleObserver() {
  if (ytRtObserver) {
    ytRtObserver.disconnect();
    ytRtObserver = null;
  }
  if (ytRtWatchLayoutObserver) {
    ytRtWatchLayoutObserver.disconnect();
    ytRtWatchLayoutObserver = null;
  }
  ytRtWatchLayoutObservedEl = null;
  clearTimeout(ytRtDebounceTimer);
  ytRtDebounceTimer = 0;
  clearTimeout(ytRtLayoutSyncTimer);
  ytRtLayoutSyncTimer = 0;
  if (ytRtLayoutSyncRaf) {
    cancelAnimationFrame(ytRtLayoutSyncRaf);
    ytRtLayoutSyncRaf = 0;
  }
  for (const timer of ytRtLayoutBurstTimers) {
    clearTimeout(timer);
  }
  ytRtLayoutBurstTimers = [];
  clearTimeout(ytRtBackfillTimer);
  ytRtBackfillTimer = 0;
  ytRtOverlayPendingItemId = '';
  clearInterval(ytRtPlaybackTimer);
  ytRtPlaybackTimer = 0;
  ytRtLoadingPromise = null;
  ytRtNextLoadAt = 0;
  ytRtLastPlaybackSeconds = -1;
  ytRtLastVideoPausedState = null;
  ytRtFastLaneInFlight = false;
  ytRtFastLaneVideoKey = '';
  ytRtFastLaneTargets = [];
  ytRtFastLanePendingSeek = false;
  ytRtFastLanePrimaryChunkStart = -1;
  ytRtBackfillInFlight = false;
  ytRtBackfillCursor = 0;
  ytRtTranslationInflight.clear();
  ytRtBackfillFailedAt.clear();
  ytRtBudgetSourcesByVideo.clear();
  ytRtChunkInflight.clear();
  ytRtChunkLastRequestAt.clear();
  ytRtFullTranscriptInflightByVideo.clear();
  ytRtNextFullTranscriptTryAtByVideo.clear();
  document
    .querySelector('ytd-watch-flexy')
    ?.classList?.remove(
      YT_RT_WATCH_ACTIVE_CLASS,
      YT_RT_TARGET_FULL_CLASS,
      YT_RT_TARGET_PLAYER_FULL_CLASS,
      YT_RT_TARGET_PLAYER_CONTAINER_CLASS,
      YT_RT_TARGET_SECONDARY_CLASS,
      YT_RT_HIDE_NATIVE_CAPTIONS_CLASS
    );
}

function syncNativeCaptionVisibility() {
  const watchFlexy = document.querySelector('ytd-watch-flexy');
  const panel = document.getElementById(YT_RT_PANEL_ID);
  const shouldHideNative =
    Boolean(watchFlexy) &&
    Boolean(panel) &&
    !panel.classList.contains('is-hidden') &&
    ytRtEnabled === true;
  watchFlexy?.classList?.toggle(YT_RT_HIDE_NATIVE_CAPTIONS_CLASS, shouldHideNative);
}

function getRealtimeOverlayAnchorContainer() {
  return (
    document.getElementById('movie_player') ||
    document.getElementById('player-full-bleed-container') ||
    document.getElementById('full-bleed-container') ||
    document.getElementById('player-container-outer') ||
    document.getElementById('player') ||
    null
  );
}

function getRealtimeOverlayPos() {
  if (ytRtOverlayPos) return ytRtOverlayPos;
  try {
    const raw = localStorage.getItem(YT_RT_OVERLAY_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const x = Number(parsed?.xPct);
      const y = Number(parsed?.yPct);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        ytRtOverlayPos = {
          xPct: Math.min(95, Math.max(5, x)),
          yPct: Math.min(95, Math.max(5, y))
        };
        return ytRtOverlayPos;
      }
    }
  } catch (_) {}
  ytRtOverlayPos = { xPct: 50, yPct: 84 };
  return ytRtOverlayPos;
}

function setRealtimeOverlayPos(nextPos, persist = true) {
  const x = Number(nextPos?.xPct);
  const y = Number(nextPos?.yPct);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  ytRtOverlayPos = {
    xPct: Math.min(95, Math.max(5, x)),
    yPct: Math.min(95, Math.max(5, y))
  };
  if (persist) {
    try {
      localStorage.setItem(YT_RT_OVERLAY_POS_KEY, JSON.stringify(ytRtOverlayPos));
    } catch (_) {}
  }
}

function applyRealtimeOverlayPos() {
  const overlay = document.getElementById(YT_RT_OVERLAY_ID);
  if (!overlay) return;
  const pos = getRealtimeOverlayPos();
  overlay.style.left = `${pos.xPct}%`;
  overlay.style.top = `${pos.yPct}%`;
}

function syncRealtimeOverlayLayout() {
  const overlay = document.getElementById(YT_RT_OVERLAY_ID);
  if (!overlay) return;
  const container = getRealtimeOverlayAnchorContainer();
  if (container && overlay.parentElement !== container) {
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    overlay.remove();
    container.appendChild(overlay);
  } else if (!container && overlay.parentElement !== document.body) {
    overlay.remove();
    document.body.appendChild(overlay);
  }
  applyRealtimeOverlayPos();
}

function enableRealtimeOverlayDrag(overlay) {
  if (!overlay || ytRtOverlayDragBound) return;
  const handle = overlay.querySelector('[data-yt-rt-overlay-drag]');
  if (!handle) return;
  ytRtOverlayDragBound = true;

  let dragging = false;
  let boundRect = null;
  const onPointerMove = (event) => {
    if (!dragging || !boundRect) return;
    const xPct = ((event.clientX - boundRect.left) / Math.max(1, boundRect.width)) * 100;
    const yPct = ((event.clientY - boundRect.top) / Math.max(1, boundRect.height)) * 100;
    setRealtimeOverlayPos({ xPct, yPct }, false);
    applyRealtimeOverlayPos();
  };
  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove('is-dragging');
    setRealtimeOverlayPos(getRealtimeOverlayPos(), true);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  };

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const container = overlay.parentElement;
    if (!container) return;
    event.preventDefault();
    boundRect = container.getBoundingClientRect();
    dragging = true;
    overlay.classList.add('is-dragging');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  });

  window.addEventListener('resize', () => {
    applyRealtimeOverlayPos();
  });
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
    const video = getCurrentVideoElement();
    const paused = Boolean(video?.paused);
    if (ytRtLastVideoPausedState !== paused) {
      ytRtLastVideoPausedState = paused;
      if (!paused) {
        const videoKey = ytRtTranscriptLoadedVideoKey;
        if (videoKey && hasUntranslatedTimelineItems()) {
          scheduleBackfillLane(videoKey, 120);
        }
      }
    }
    syncRealtimeActiveItemByPlayback(true);
  }, YT_RT_PLAYBACK_SYNC_MS);
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
      const attempts = [];
      const format = requestUrl.includes('fmt=vtt') ? 'vtt' : 'json3';
      const result = await fetchSubtitleWithBridgeRetry(requestUrl, format, attempts);
      const lastAttempt = attempts[attempts.length - 1] || null;
      console.info('[yt-cc] bridge fallback fetch', {
        videoKey,
        format,
        ok: Boolean(result?.ok),
        status: Number(lastAttempt?.status || 0),
        ct: String(lastAttempt?.contentType || ''),
        reason: String(lastAttempt?.reason || ''),
        timedtext: getTimedtextUrlSummary(requestUrl)
      });
      if (!result?.ok || !result?.body) continue;
      const events = parseCaptionEventsFromText(result.body);
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
    const text = normalizeCaptionText(item?.text || '');
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
  ytRtLastPlaybackSeconds = -1;
  renderRealtimeSubtitleList();
  syncRealtimeActiveItemByPlayback(true);

  const canTranslate = await ensureRealtimeTranslationCapability();
  if (canTranslate === false) {
    renderRealtimeSubtitleList();
  }
  triggerActiveSentenceTranslation(videoKey, ytRtActiveIndex);
  scheduleBackfillLane(videoKey, 1800);
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
    // Do not permanently disable translation on transient readiness check failure.
    ytRtCanTranslate = null;
    return true;
  }
  return ytRtCanTranslate !== false;
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

async function requestRealtimeBatchTranslation(sentences) {
  const payload = Array.isArray(sentences)
    ? sentences.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!payload.length) return [];

  const rpcBatchSize = Math.max(1, Number(YT_RT_BACKFILL_BATCH_RPC_SIZE) || 1);
  const merged = [];
  for (let i = 0; i < payload.length; i += rpcBatchSize) {
    const chunk = payload.slice(i, i + rpcBatchSize);
    try {
      const res = await safeSendMessageAsync({
        type: 'deepseek-translate-batch',
        payload: { sentences: chunk }
      });
      const translations = Array.isArray(res?.translations)
        ? res.translations.map((item) => String(item || '').trim())
        : [];
      if (translations.length !== chunk.length) {
        return [];
      }
      merged.push(...translations);
    } catch (_) {
      return [];
    }
  }
  return merged.length === payload.length ? merged : [];
}

async function requestRealtimeGroupedTranslation(sentences) {
  const payload = Array.isArray(sentences)
    ? sentences.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!payload.length) return [];
  try {
    const res = await safeSendMessageAsync({
      type: 'deepseek-translate-grouped',
      payload: { segments: payload }
    });
    const translations = Array.isArray(res?.translations)
      ? res.translations.map((item) => String(item || '').trim())
      : [];
    if (translations.length === payload.length) {
      return translations;
    }
  } catch (_) {}
  return [];
}

function syncRealtimeActiveItemByPlayback(shouldScroll = true) {
  if (!ytRtItems.length) return;
  const seconds = getCurrentVideoTimeSeconds();
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const prevSeconds = ytRtLastPlaybackSeconds;
  ytRtLastPlaybackSeconds = seconds;
  const isSeekJump =
    Number.isFinite(prevSeconds) && Math.abs(seconds - prevSeconds) > YT_RT_SEEK_JUMP_SECONDS;
  const index = findRealtimeItemIndexByTime(seconds);
  if (index < 0 || index >= ytRtItems.length) return;
  if (index === ytRtActiveIndex && ytRtItems[index]?.id === ytRtActiveItemId) {
    if (isSeekJump) {
      triggerActiveSentenceTranslation(ytRtTranscriptLoadedVideoKey, index, { isSeek: true });
    }
    return;
  }

  ytRtActiveIndex = index;
  ytRtActiveItemId = ytRtItems[index]?.id || '';
  ytRtOverlayPendingItemId = ytRtActiveItemId;
  renderRealtimeSubtitleOverlay(ytRtItems[index] || null);
  updateRealtimeActiveRow(shouldScroll);
  triggerActiveSentenceTranslation(ytRtTranscriptLoadedVideoKey, index, { isSeek: isSeekJump });
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
  ytRtOverlayPendingItemId = ytRtActiveItemId;
  renderRealtimeSubtitleOverlay(ytRtItems[index] || null);
  updateRealtimeActiveRow(shouldScroll);
  triggerActiveSentenceTranslation(ytRtTranscriptLoadedVideoKey, index, { isSeek: true });
}

function triggerActiveSentenceTranslation(videoKey, index, { isSeek = false } = {}) {
  if (!ytRtEnabled) return;
  if (!videoKey || videoKey !== ytRtTranscriptLoadedVideoKey) return;
  if (!Number.isInteger(index) || index < 0 || index >= ytRtItems.length) return;
  scheduleRealtimeTranslation(videoKey, index, { isSeek });
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
    scrollActiveRowInList(listEl, target);
  }
}

function scrollActiveRowInList(listEl, rowEl) {
  if (!listEl || !rowEl) return;
  const viewTop = listEl.scrollTop;
  const viewBottom = viewTop + listEl.clientHeight;
  const rowTop = rowEl.offsetTop;
  const rowBottom = rowTop + rowEl.offsetHeight;
  const safePadding = Math.max(18, Math.round(listEl.clientHeight * 0.12));
  const isAbove = rowTop < viewTop + safePadding;
  const isBelow = rowBottom > viewBottom - safePadding;
  if (!isAbove && !isBelow) return;

  const centeredTop = Math.max(0, rowTop - (listEl.clientHeight - rowEl.offsetHeight) / 2);
  listEl.scrollTo({
    top: centeredTop,
    behavior: 'smooth'
  });
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

function scheduleRealtimeTranslation(videoKey, centerIndex, { isSeek = false } = {}) {
  if (!ytRtEnabled) return;
  if (!videoKey || videoKey !== ytRtTranscriptLoadedVideoKey) return;
  if (!Number.isInteger(centerIndex) || centerIndex < 0 || centerIndex >= ytRtItems.length) return;

  ytRtFastLaneVideoKey = videoKey;
  ytRtFastLaneEpoch += 1;
  ytRtFastLaneTargets = buildFastLaneChunkStarts(centerIndex, { isSeek });
  ytRtFastLanePendingSeek = Boolean(isSeek);
  ytRtFastLanePrimaryChunkStart = ytRtFastLaneTargets.length ? ytRtFastLaneTargets[0] : -1;
  runFastLane();
}

function scheduleBackfillLane(videoKey, delayMs = YT_RT_BACKFILL_IDLE_DELAY_MS) {
  if (!ytRtEnabled) return;
  if (!videoKey || videoKey !== ytRtTranscriptLoadedVideoKey) return;
  if (!ytRtHasFullTimeline || !ytRtItems.length) return;
  if (isCurrentVideoPaused()) return;
  clearTimeout(ytRtBackfillTimer);
  ytRtBackfillTimer = window.setTimeout(() => {
    runBackfillLane(videoKey).catch(() => {});
  }, Math.max(0, Number(delayMs) || 0));
}

async function runFastLane() {
  if (ytRtFastLaneInFlight) return;
  ytRtFastLaneInFlight = true;
  try {
    while (ytRtFastLaneTargets.length) {
      const epoch = ytRtFastLaneEpoch;
      const videoKey = ytRtFastLaneVideoKey;
      if (!videoKey || videoKey !== ytRtTranscriptLoadedVideoKey) return;
      const primaryChunkStart = ytRtFastLanePrimaryChunkStart;
      const chunkStarts = Array.from(new Set(ytRtFastLaneTargets.filter((item) => Number.isInteger(item))));
      const isSeek = ytRtFastLanePendingSeek;
      ytRtFastLaneTargets = [];
      for (const chunkStart of chunkStarts) {
        if (epoch !== ytRtFastLaneEpoch) {
          break;
        }
        await translateTimelineChunk(videoKey, chunkStart, {
          isSeek,
          allowSingleFallback: chunkStart === primaryChunkStart,
          activeIndex: ytRtActiveIndex
        });
      }
    }
  } finally {
    ytRtFastLaneInFlight = false;
    if (ytRtFastLaneTargets.length) {
      window.setTimeout(() => runFastLane(), 0);
    }
  }
}

function getChunkStartForIndex(index) {
  const size = Math.max(1, Number(YT_RT_ACTIVE_GROUP_MAX_SEGMENTS) || 1);
  return Math.max(0, Math.floor(index / size) * size);
}

function buildFastLaneChunkStarts(centerIndex, { isSeek = false } = {}) {
  if (!Number.isInteger(centerIndex) || centerIndex < 0) return [];
  const size = Math.max(1, Number(YT_RT_ACTIVE_GROUP_MAX_SEGMENTS) || 1);
  const total = ytRtItems.length;
  if (!total) return [];
  const starts = [];
  const currentStart = getChunkStartForIndex(centerIndex);
  starts.push(currentStart);

  const standbyCount = Math.max(0, Number(YT_RT_FAST_STANDBY_CHUNKS) || 0);
  for (let step = 1; step <= standbyCount; step += 1) {
    const nextStart = currentStart + size * step;
    if (nextStart < total) starts.push(nextStart);
  }
  if (isSeek) {
    const prevStart = currentStart - size;
    if (prevStart >= 0) starts.push(prevStart);
  }
  return Array.from(new Set(starts));
}

async function translateTimelineChunk(
  videoKey,
  chunkStart,
  { isSeek = false, allowSingleFallback = false, activeIndex = -1 } = {}
) {
  if (!videoKey || videoKey !== ytRtTranscriptLoadedVideoKey) return false;
  if (!Number.isInteger(chunkStart) || chunkStart < 0 || chunkStart >= ytRtItems.length) return false;

  const chunkKey = `${videoKey}:${chunkStart}`;
  const existing = ytRtChunkInflight.get(chunkKey);
  if (existing) {
    await existing;
    return true;
  }

  const now = Date.now();
  if (!isSeek) {
    const lastAt = Number(ytRtChunkLastRequestAt.get(chunkKey) || 0);
    if (lastAt > 0 && now - lastAt < YT_RT_CHUNK_RETRY_COOLDOWN_MS) {
      return false;
    }
  }
  const size = Math.max(1, Number(YT_RT_ACTIVE_GROUP_MAX_SEGMENTS) || 1);
  const chunkEnd = Math.min(ytRtItems.length - 1, chunkStart + size - 1);
  const budgetMode = isSeek ? 'seek' : 'normal';
  const entries = collectChunkPendingEntries(videoKey, chunkStart, chunkEnd, { budgetMode, activeIndex });
  if (!entries.length) return true;

  ytRtChunkLastRequestAt.set(chunkKey, now);
  const promise = translateEntryGroup(videoKey, entries, {
    timeoutMs: isSeek ? YT_RT_FAST_TIMEOUT_MS : YT_RT_ACTIVE_GROUP_TIMEOUT_MS,
    allowSingleFallback: true,
    activeIndex,
    allowBatchFallback: false
  }).finally(() => {
    if (ytRtChunkInflight.get(chunkKey) === promise) {
      ytRtChunkInflight.delete(chunkKey);
    }
  });
  ytRtChunkInflight.set(chunkKey, promise);
  return promise;
}

async function runBackfillLane(videoKey) {
  if (ytRtBackfillInFlight) return;
  if (!ytRtHasFullTimeline || !ytRtItems.length) return;
  if (videoKey !== ytRtTranscriptLoadedVideoKey) return;
  if (isCurrentVideoPaused()) return;
  if (ytRtFastLaneInFlight) {
    scheduleBackfillLane(videoKey, YT_RT_BACKFILL_IDLE_DELAY_MS);
    return;
  }

  const targets = collectBackfillTargets(YT_RT_BACKFILL_BATCH_TRANSLATE_SIZE);
  if (!targets.length) return;

  ytRtBackfillInFlight = true;
  try {
    const pendingEntries = collectBackfillPendingEntries(targets);
    if (!pendingEntries.length) return;
    const groups = buildBackfillGroups(pendingEntries);
    if (!groups.length) return;

    for (const group of groups) {
      if (videoKey !== ytRtTranscriptLoadedVideoKey) return;
      if (ytRtFastLaneInFlight) {
        scheduleBackfillLane(videoKey, YT_RT_BACKFILL_IDLE_DELAY_MS);
        return;
      }
      await translateEntryGroup(videoKey, group, {
        timeoutMs: YT_RT_BACKFILL_BATCH_TIMEOUT_MS,
        allowSingleFallback: false,
        allowBatchFallback: true
      });
    }
  } finally {
    ytRtBackfillInFlight = false;
    if (videoKey === ytRtTranscriptLoadedVideoKey && hasUntranslatedTimelineItems()) {
      scheduleBackfillLane(videoKey, YT_RT_BACKFILL_IDLE_DELAY_MS);
    }
  }
}

function collectWindowPendingEntries(
  videoKey,
  centerIndex,
  { ahead = YT_RT_TRANSLATE_WINDOW_AHEAD, behind = YT_RT_TRANSLATE_WINDOW_BEHIND, budgetMode = 'normal', limit = 0 } = {}
) {
  if (!Number.isInteger(centerIndex) || centerIndex < 0 || centerIndex >= ytRtItems.length) return [];
  const min = Math.max(0, centerIndex - Math.max(0, Number(behind) || 0));
  const max = Math.min(ytRtItems.length - 1, centerIndex + Math.max(0, Number(ahead) || 0));
  const maxCount = Math.max(0, Number(limit) || 0);
  const now = Date.now();
  const entries = [];
  const candidates = [centerIndex];
  const maxDistance = Math.max(centerIndex - min, max - centerIndex);
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const left = centerIndex - distance;
    const right = centerIndex + distance;
    if (left >= min) candidates.push(left);
    if (right <= max) candidates.push(right);
  }

  for (const index of candidates) {
    const item = ytRtItems[index];
    if (!item || item.translation) continue;
    const source = String(item.source || '').trim();
    if (!source) continue;
    if (ytRtTranslationCache.has(source)) {
      const cached = ytRtTranslationCache.get(source);
      item.translation = cached;
      updateRealtimeItemTranslation(item.id, cached);
      if (item.id === ytRtActiveItemId) {
        renderRealtimeSubtitleOverlay(item);
      }
      continue;
    }
    if (ytRtTranslationInflight.has(source)) continue;
    const failedAt = Number(ytRtBackfillFailedAt.get(item.id) || 0);
    if (index !== centerIndex && failedAt > 0 && now - failedAt < YT_RT_BACKFILL_RETRY_COOLDOWN_MS) {
      continue;
    }
    if (!canConsumeTranslateBudget(videoKey, source, budgetMode)) continue;
    entries.push({
      index,
      id: item.id,
      source,
      start: Number(item.videoTimeSeconds || 0),
      end: Number(item.endTimeSeconds || 0)
    });
    if (maxCount > 0 && entries.length >= maxCount) break;
  }

  entries.sort((a, b) => a.index - b.index);
  return entries;
}

function collectChunkPendingEntries(
  videoKey,
  chunkStart,
  chunkEnd,
  { budgetMode = 'normal', activeIndex = -1 } = {}
) {
  if (!Number.isInteger(chunkStart) || !Number.isInteger(chunkEnd) || chunkStart > chunkEnd) return [];
  const now = Date.now();
  const entries = [];
  for (let index = chunkStart; index <= chunkEnd; index += 1) {
    const item = ytRtItems[index];
    if (!item || item.translation) continue;
    const source = String(item.source || '').trim();
    if (!source) continue;
    if (ytRtTranslationCache.has(source)) {
      const cached = ytRtTranslationCache.get(source);
      item.translation = cached;
      updateRealtimeItemTranslation(item.id, cached);
      if (item.id === ytRtActiveItemId) {
        renderRealtimeSubtitleOverlay(item);
      }
      continue;
    }
    if (ytRtTranslationInflight.has(source)) continue;
    const failedAt = Number(ytRtBackfillFailedAt.get(item.id) || 0);
    if (index !== activeIndex && failedAt > 0 && now - failedAt < YT_RT_BACKFILL_RETRY_COOLDOWN_MS) {
      continue;
    }
    if (!canConsumeTranslateBudget(videoKey, source, budgetMode)) continue;
    entries.push({
      index,
      id: item.id,
      source,
      start: Number(item.videoTimeSeconds || 0),
      end: Number(item.endTimeSeconds || 0)
    });
  }
  return entries;
}

function markEntriesFailed(entries) {
  const now = Date.now();
  for (const entry of entries) {
    if (!entry?.id) continue;
    ytRtBackfillFailedAt.set(entry.id, now);
  }
}

async function translateEntryGroup(
  videoKey,
  entries,
  {
    timeoutMs = YT_RT_BACKFILL_BATCH_TIMEOUT_MS,
    allowSingleFallback = false,
    activeIndex = -1,
    allowBatchFallback = false
  } = {}
) {
  if (!videoKey || videoKey !== ytRtTranscriptLoadedVideoKey) return false;
  if (!Array.isArray(entries) || !entries.length) return false;

  let resolveInflight = null;
  const inflightMarker = new Promise((resolve) => {
    resolveInflight = resolve;
  });
  const inflightSources = new Set();
  for (const entry of entries) {
    if (!entry?.source || inflightSources.has(entry.source)) continue;
    ytRtTranslationInflight.set(entry.source, inflightMarker);
    inflightSources.add(entry.source);
  }

  try {
    const sources = entries.map((entry) => entry.source);
    let translations = await requestRealtimeGroupedTranslationWithTimeout(sources, timeoutMs);
    if (allowBatchFallback && translations.length !== entries.length) {
      translations = await requestRealtimeBatchTranslationWithTimeout(sources, timeoutMs);
    }
    if (translations.length === entries.length) {
      applyBackfillTranslations(videoKey, entries, translations);
      return true;
    }

    if (allowSingleFallback) {
      const fallbackEntry =
        entries.find((entry) => entry.index === activeIndex) ||
        entries.find((entry) => entry.id === ytRtActiveItemId) ||
        entries[0];
      if (fallbackEntry?.source) {
        const fallbackTranslation = await requestRealtimeSentenceTranslationWithTimeout(
          fallbackEntry.source,
          Math.max(1200, Math.min(Number(timeoutMs) || YT_RT_FAST_TIMEOUT_MS, YT_RT_FAST_TIMEOUT_MS))
        );
        if (fallbackTranslation) {
          applyBackfillTranslations(videoKey, [fallbackEntry], [fallbackTranslation]);
          return true;
        }
      }
    }

    markEntriesFailed(entries);
    return false;
  } finally {
    if (resolveInflight) resolveInflight('');
    for (const source of inflightSources) {
      if (ytRtTranslationInflight.get(source) === inflightMarker) {
        ytRtTranslationInflight.delete(source);
      }
    }
  }
}

function collectBackfillPendingEntries(targets) {
  const now = Date.now();
  const entries = [];
  for (const index of targets) {
    const item = ytRtItems[index];
    if (!item || item.translation) continue;
    const source = String(item.source || '').trim();
    if (!source) continue;
    if (ytRtTranslationCache.has(source)) {
      const cached = ytRtTranslationCache.get(source);
      item.translation = cached;
      updateRealtimeItemTranslation(item.id, cached);
      continue;
    }
    if (ytRtTranslationInflight.has(source)) continue;
    const failedAt = Number(ytRtBackfillFailedAt.get(item.id) || 0);
    if (failedAt > 0 && now - failedAt < YT_RT_BACKFILL_RETRY_COOLDOWN_MS) continue;
    entries.push({
      index,
      id: item.id,
      source,
      start: Number(item.videoTimeSeconds || 0),
      end: Number(item.endTimeSeconds || 0)
    });
  }
  return entries;
}

function buildBackfillGroups(entries) {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a, b) => a.index - b.index);
  const targetSegments = Math.max(2, Number(YT_RT_BACKFILL_GROUP_TARGET_SEGMENTS) || 5);
  const maxSegments = Math.max(targetSegments, Number(YT_RT_BACKFILL_GROUP_MAX_SEGMENTS) || targetSegments);
  const maxChars = Math.max(400, Number(YT_RT_BACKFILL_GROUP_MAX_CHARS) || 1200);
  const groups = [];
  let current = [];
  let currentChars = 0;

  const pushCurrent = () => {
    if (current.length) groups.push(current);
    current = [];
    currentChars = 0;
  };

  sorted.forEach((entry) => {
    const source = String(entry.source || '');
    if (!source.trim()) return;
    const wouldExceedChars = current.length > 0 && currentChars + source.length > maxChars;
    const reachedTarget = current.length >= targetSegments;
    const reachedMax = current.length >= maxSegments;

    if (wouldExceedChars || reachedTarget || reachedMax) {
      pushCurrent();
    }
    current.push(entry);
    currentChars += source.length;
  });

  pushCurrent();

  // Merge tiny tail into previous group when safe, to reduce 1-2 segment requests.
  if (groups.length >= 2) {
    const tail = groups[groups.length - 1];
    const prev = groups[groups.length - 2];
    const tailChars = tail.reduce((sum, entry) => sum + String(entry?.source || '').length, 0);
    const prevChars = prev.reduce((sum, entry) => sum + String(entry?.source || '').length, 0);
    if (
      tail.length > 0 &&
      tail.length < Math.min(targetSegments, 3) &&
      prev.length + tail.length <= maxSegments &&
      prevChars + tailChars <= maxChars
    ) {
      prev.push(...tail);
      groups.pop();
    }
  }

  return groups;
}

function applyBackfillTranslations(videoKey, entries, translations) {
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const translated = String(translations[i] || '').trim();
    if (!translated) {
      ytRtBackfillFailedAt.set(entry.id, Date.now());
      continue;
    }
    if (videoKey !== ytRtTranscriptLoadedVideoKey) return;
    const item = ytRtItems[entry.index];
    if (!item || item.id !== entry.id) continue;
    if (item.translation) continue;
    ytRtTranslationCache.set(entry.source, translated);
    if (ytRtTranslationCache.size > 1200) {
      const firstKey = ytRtTranslationCache.keys().next().value;
      if (firstKey) ytRtTranslationCache.delete(firstKey);
    }
    item.translation = translated;
    ytRtBackfillFailedAt.delete(entry.id);
    updateRealtimeItemTranslation(item.id, translated);
    if (item.id === ytRtActiveItemId) {
      renderRealtimeSubtitleOverlay(item);
    }
  }
}

function collectBackfillTargets(maxCount = YT_RT_BACKFILL_STEP_BATCH) {
  const total = ytRtItems.length;
  if (!total) return [];
  const now = Date.now();
  const targets = [];
  let cursor = Number.isInteger(ytRtBackfillCursor) ? ytRtBackfillCursor : 0;
  cursor = ((cursor % total) + total) % total;

  const limit = Math.max(1, Number(maxCount) || 1);
  for (let step = 0; step < total && targets.length < limit; step += 1) {
    const index = (cursor + step) % total;
    const item = ytRtItems[index];
    if (!item || item.translation) continue;
    const source = String(item.source || '').trim();
    if (!source) continue;
    if (ytRtTranslationCache.has(source)) continue;
    if (ytRtTranslationInflight.has(source)) continue;
    const failedAt = Number(ytRtBackfillFailedAt.get(item.id) || 0);
    if (failedAt > 0 && now - failedAt < YT_RT_BACKFILL_RETRY_COOLDOWN_MS) continue;
    targets.push(index);
  }

  ytRtBackfillCursor = (cursor + Math.max(1, targets.length || limit)) % total;
  return targets;
}

function hasUntranslatedTimelineItems() {
  return ytRtItems.some((item) => item && !item.translation);
}

function getTranslateBudgetSet(videoKey) {
  if (!videoKey) return null;
  let set = ytRtBudgetSourcesByVideo.get(videoKey);
  if (!set) {
    set = new Set();
    ytRtBudgetSourcesByVideo.set(videoKey, set);
  }
  return set;
}

function canConsumeTranslateBudget(videoKey, source, mode = 'normal') {
  const cleanSource = String(source || '').trim();
  if (!cleanSource) return false;
  const set = getTranslateBudgetSet(videoKey);
  if (!set) return false;
  if (set.has(cleanSource)) return true;
  const used = set.size;
  const reserve = Math.max(
    0,
    Math.min(Number(YT_RT_BUDGET_TOTAL) || 0, Number(YT_RT_BUDGET_SEEK_RESERVE) || 0)
  );
  const normalCap = Math.max(0, (Number(YT_RT_BUDGET_TOTAL) || 0) - reserve);
  const cap = mode === 'seek' ? Number(YT_RT_BUDGET_TOTAL) || 0 : normalCap;
  if (cap <= 0 || used >= cap) return false;
  set.add(cleanSource);
  return true;
}

async function translateTimelineItemByIndex(
  videoKey,
  index,
  { timeoutMs = 2400, markBackfillFailure = false, budgetMode = 'normal' } = {}
) {
  const item = ytRtItems[index];
  if (!item) return false;
  if (videoKey !== ytRtTranscriptLoadedVideoKey) return false;
  if (item.translation) return true;

  const source = String(item.source || '').trim();
  if (!source) return false;

  const cached = ytRtTranslationCache.get(source);
  if (cached) {
    item.translation = cached;
    updateRealtimeItemTranslation(item.id, cached);
    if (item.id === ytRtActiveItemId) {
      renderRealtimeSubtitleOverlay(item);
    }
    return true;
  }

  let inflight = ytRtTranslationInflight.get(source);
  if (!inflight) {
    if (!canConsumeTranslateBudget(videoKey, source, budgetMode)) {
      return false;
    }
    inflight = requestRealtimeSentenceTranslationWithTimeout(source, timeoutMs)
      .then((translated) => {
        const text = String(translated || '').trim();
        if (text) {
          ytRtTranslationCache.set(source, text);
          if (ytRtTranslationCache.size > 1200) {
            const firstKey = ytRtTranslationCache.keys().next().value;
            if (firstKey) ytRtTranslationCache.delete(firstKey);
          }
        }
        return text;
      })
      .finally(() => {
        ytRtTranslationInflight.delete(source);
      });
    ytRtTranslationInflight.set(source, inflight);
  }

  const translated = await inflight;
  if (!translated) {
    if (markBackfillFailure && item?.id) {
      ytRtBackfillFailedAt.set(item.id, Date.now());
    }
    if (item.id === ytRtActiveItemId) {
      renderRealtimeSubtitleOverlay(item);
    }
    return false;
  }
  if (videoKey !== ytRtTranscriptLoadedVideoKey) return false;
  if (item.translation) return true;
  item.translation = translated;
  if (item?.id) ytRtBackfillFailedAt.delete(item.id);
  if (item.id === ytRtOverlayPendingItemId) {
    ytRtOverlayPendingItemId = '';
  }
  updateRealtimeItemTranslation(item.id, translated);
  if (item.id === ytRtActiveItemId) {
    renderRealtimeSubtitleOverlay(item);
  }
  return true;
}

async function requestRealtimeSentenceTranslationWithTimeout(sentence, timeoutMs) {
  const timeout = Math.max(400, Number(timeoutMs) || 1200);
  let timedOut = false;
  const timeoutPromise = new Promise((resolve) => {
    window.setTimeout(() => {
      timedOut = true;
      resolve('');
    }, timeout);
  });
  const translated = await Promise.race([requestRealtimeSentenceTranslation(sentence), timeoutPromise]);
  if (timedOut) return '';
  return String(translated || '').trim();
}

async function requestRealtimeBatchTranslationWithTimeout(sentences, timeoutMs) {
  const payload = Array.isArray(sentences)
    ? sentences.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!payload.length) return [];
  const timeout = Math.max(600, Number(timeoutMs) || 2400);
  let timedOut = false;
  const timeoutPromise = new Promise((resolve) => {
    window.setTimeout(() => {
      timedOut = true;
      resolve([]);
    }, timeout);
  });
  const translated = await Promise.race([
    requestRealtimeBatchTranslation(payload),
    timeoutPromise
  ]);
  if (timedOut) return [];
  return Array.isArray(translated) ? translated.map((item) => String(item || '').trim()) : [];
}

async function requestRealtimeGroupedTranslationWithTimeout(sentences, timeoutMs) {
  const payload = Array.isArray(sentences)
    ? sentences.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!payload.length) return [];
  const timeout = Math.max(800, Number(timeoutMs) || 2800);
  let timedOut = false;
  const timeoutPromise = new Promise((resolve) => {
    window.setTimeout(() => {
      timedOut = true;
      resolve([]);
    }, timeout);
  });
  const translated = await Promise.race([
    requestRealtimeGroupedTranslation(payload),
    timeoutPromise
  ]);
  if (timedOut) return [];
  return Array.isArray(translated) ? translated.map((item) => String(item || '').trim()) : [];
}

function loadRealtimeTranscript(forceReload = false) {
  const isForceReload = Boolean(forceReload);
  const videoKey = getCurrentYouTubeVideoKey();
  if (
    !isForceReload &&
    ytRtLoadingPromise &&
    videoKey &&
    videoKey === ytRtTranscriptLoadingVideoKey
  ) {
    return ytRtLoadingPromise;
  }

  ytRtTranscriptLoadingVideoKey = videoKey;
  ytRtLoadingPromise = ensureRealtimeTranscriptLoaded(isForceReload).finally(() => {
    ytRtTranscriptLoadingVideoKey = '';
    ytRtLoadingPromise = null;
  });
  return ytRtLoadingPromise;
}

function resolveFullTranscriptRetryMs(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'NO_SUBTITLES' || normalized === 'UNSUPPORTED') {
    return YT_RT_FULL_TRANSCRIPT_RETRY_NO_SUB_MS;
  }
  if (normalized === 'HTML_RESPONSE') {
    return YT_RT_FULL_TRANSCRIPT_RETRY_HTML_MS;
  }
  if (normalized === 'NETWORK_ERROR' || normalized === 'PARSE_ERROR') {
    return YT_RT_FULL_TRANSCRIPT_RETRY_FAIL_MS;
  }
  return YT_RT_FULL_TRANSCRIPT_RETRY_MS;
}

async function ensureRealtimeTranscriptLoaded(forceReload = false) {
  const videoKey = getCurrentYouTubeVideoKey();
  if (!videoKey) return;
  if (forceReload) {
    ytRtLastCaption = '';
    ytRtFullTranscriptTriedVideoKey = '';
    ytRtHasFullTimeline = false;
  }
  if (isYouTubeAdPlaying()) {
    ytRtStatusText = '广告播放中，广告结束后自动读取字幕...';
    if (!ytRtItems.length) renderRealtimeSubtitleList();
    return;
  }
  ytRtTranscriptLoadedVideoKey = videoKey;
  await ensureRealtimeTranslationCapability();

  if (isYouTubeCcEnabled() && !ytRtHasFullTimeline) {
    const now = Date.now();
    const nextTryAt = Number(ytRtNextFullTranscriptTryAtByVideo.get(videoKey) || 0);
    if (now >= nextTryAt) {
      ytRtFullTranscriptTriedVideoKey = videoKey;
      ytRtNextFullTranscriptTryAtByVideo.set(videoKey, now + YT_RT_FULL_TRANSCRIPT_RETRY_MS);
      ytRtStatusText = 'CC 已开启，正在加载全量字幕...';
      renderRealtimeSubtitleList();
      const fullLoadResult = await tryLoadFullTranscriptOnce(videoKey, {
        allowBridgeFallback: Boolean(forceReload)
      });
      if (fullLoadResult.loaded) {
        ytRtNextFullTranscriptTryAtByVideo.delete(videoKey);
        return;
      }
      ytRtNextFullTranscriptTryAtByVideo.set(
        videoKey,
        now + resolveFullTranscriptRetryMs(fullLoadResult.status)
      );
    }
  }

  if (ytRtHasFullTimeline && ytRtItems.length) {
    return;
  }

  const subtitleText = getCurrentYoutubeSubtitleText();
  if (!subtitleText) {
    if (!ytRtItems.length) {
      ytRtStatusText = '等待页面字幕流...（请先开启 CC）';
      renderRealtimeSubtitleList();
    }
    return;
  }
  if (subtitleText === ytRtLastCaption) return;
  ytRtLastCaption = subtitleText;
  ytRtStatusText = '';
  const currentTime = getCurrentVideoTimeSeconds();
  pushRealtimeSourceOnlyItem(subtitleText, currentTime);
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
  const captionRoots = document.querySelectorAll('.ytp-caption-segment');
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

function isCurrentVideoPaused() {
  const video = getCurrentVideoElement();
  if (!video) return false;
  return Boolean(video.paused);
}

function isYouTubeCcEnabled() {
  const ccBtn = document.querySelector('.ytp-subtitles-button');
  if (!ccBtn) return false;
  const pressed = String(ccBtn.getAttribute('aria-pressed') || '').toLowerCase();
  return pressed === 'true';
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

async function tryLoadFullTranscriptOnce(videoKey, options = {}) {
  const key = String(videoKey || '').trim();
  if (!key) return { loaded: false, status: 'INVALID_VIDEO' };

  const existing = ytRtFullTranscriptInflightByVideo.get(key);
  if (existing) return existing;

  const allowBridgeFallback = options?.allowBridgeFallback === true;
  const loadingTask = (async () => {
    try {
      const track = await requestCaptionTrackFromBridge(key);
      let fallbackUrl = '';
      if (!track?.baseUrl) {
        fallbackUrl = await findTimedtextUrlFromPerformanceWithRetry(key);
      }
      if (!track?.baseUrl && !fallbackUrl) {
        return { loaded: false, status: 'NO_SUBTITLES' };
      }

      const pageContext = await buildPageContextPayload(key, track, fallbackUrl);
      const subtitleBundle = await requestSubtitleBundle(key, track, fallbackUrl, pageContext);
      const status = String(subtitleBundle?.status || '').toUpperCase();
      if (status === 'OK') {
        const items = mapSubtitleBundleToRealtimeItems(subtitleBundle, key);
        if (items.length) {
          await applyLoadedRealtimeItems(key, items);
          ytRtHasFullTimeline = true;
          return { loaded: true, status: 'OK' };
        }
        return { loaded: false, status: 'PARSE_ERROR' };
      }

      if (allowBridgeFallback && (status === 'HTML_RESPONSE' || status === 'NO_SUBTITLES')) {
        const fallbackItems = await tryLoadSubtitlesViaBridgeFallback(key, track, fallbackUrl);
        if (fallbackItems.length) {
          await applyLoadedRealtimeItems(key, fallbackItems);
          ytRtHasFullTimeline = true;
          return { loaded: true, status: 'OK' };
        }
      }

      return { loaded: false, status: status || 'FAILED' };
    } catch (err) {
      console.warn('[yt-cc] full transcript load failed', {
        videoKey: key,
        message: normalizeExtensionError(err)
      });
      return { loaded: false, status: 'NETWORK_ERROR' };
    }
  })()
    .finally(() => {
      if (ytRtFullTranscriptInflightByVideo.get(key) === loadingTask) {
        ytRtFullTranscriptInflightByVideo.delete(key);
      }
    });

  ytRtFullTranscriptInflightByVideo.set(key, loadingTask);
  return loadingTask;
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
    document.body.appendChild(panel);
  }

  const hasPanelScaffold =
    Boolean(panel.querySelector('[data-yt-rt-list]')) &&
    Boolean(panel.querySelector('[data-yt-rt-load-cc]')) &&
    Boolean(panel.querySelector('[data-yt-rt-hide]'));
  if (!hasPanelScaffold) {
    panel.innerHTML = `
      <div class="yt-rt-panel__header">
        <span class="yt-rt-panel__title">实时翻译</span>
        <div class="yt-rt-panel__actions">
          <button type="button" class="yt-rt-btn yt-rt-btn--ghost" data-yt-rt-load-cc>加载CC</button>
          <button type="button" class="yt-rt-btn yt-rt-btn--ghost" data-yt-rt-hide>隐藏</button>
        </div>
      </div>
      <div class="yt-rt-panel__list" data-yt-rt-list></div>
    `;
  }

  const loadCcBtn = panel.querySelector('[data-yt-rt-load-cc]');
  const hideBtn = panel.querySelector('[data-yt-rt-hide]');
  if (loadCcBtn && loadCcBtn.dataset.ytRtBound !== '1') {
    loadCcBtn.dataset.ytRtBound = '1';
    loadCcBtn.addEventListener('click', async () => {
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
  }
  if (hideBtn && hideBtn.dataset.ytRtBound !== '1') {
    hideBtn.dataset.ytRtBound = '1';
    hideBtn.addEventListener('click', () => {
      panel.classList.add('is-hidden');
      clearRealtimeWatchLayoutClasses(document.querySelector('ytd-watch-flexy'));
      const reopenBtn = document.getElementById(YT_RT_REOPEN_BTN_ID);
      if (reopenBtn) reopenBtn.classList.add('is-active');
      forceRealtimePanelDockedLayout();
      renderRealtimeSubtitleOverlay(ytRtItems[ytRtActiveIndex] || null);
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
    document.body.appendChild(reopenBtn);
  }
  if (reopenBtn.dataset.ytRtBound !== '1') {
    reopenBtn.dataset.ytRtBound = '1';
    reopenBtn.addEventListener('click', () => {
      panel?.classList.remove('is-hidden');
      reopenBtn?.classList.remove('is-active');
      forceRealtimePanelDockedLayout();
      renderRealtimeSubtitleList();
      syncRealtimeActiveItemByPlayback(true);
      renderRealtimeSubtitleOverlay(ytRtItems[ytRtActiveIndex] || null);
      if (!ytRtItems.length) {
        loadRealtimeTranscript(false)
          .then(() => {
            renderRealtimeSubtitleList();
            syncRealtimeActiveItemByPlayback(true);
            renderRealtimeSubtitleOverlay(ytRtItems[ytRtActiveIndex] || null);
          })
          .catch(() => {});
      }
    });
  }

  syncRealtimePanelLayout();

  let overlay = document.getElementById(YT_RT_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = YT_RT_OVERLAY_ID;
    overlay.innerHTML = `
      <button type="button" class="yt-rt-overlay__drag-handle" data-yt-rt-overlay-drag title="拖动字幕位置">⋮⋮</button>
      <div class="yt-rt-overlay__source" data-yt-rt-source></div>
      <div class="yt-rt-overlay__translation" data-yt-rt-translation></div>
    `;
    document.body.appendChild(overlay);
    enableRealtimeOverlayDrag(overlay);
    const overlaySource = overlay.querySelector('[data-yt-rt-source]');
    overlaySource?.addEventListener('click', (event) => {
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
  }
  syncRealtimeOverlayLayout();
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

function pushRealtimeSourceOnlyItem(source, videoTimeSeconds = -1) {
  const cleanSource = String(source || '').trim();
  if (!cleanSource) return;
  const canMergeWithLast =
    ytRtItems.length &&
    ytRtItems[ytRtItems.length - 1].source === cleanSource &&
    Math.abs(
      Number(ytRtItems[ytRtItems.length - 1].videoTimeSeconds || -1) -
        Number(videoTimeSeconds || -1)
    ) <= 1.5;

  if (canMergeWithLast) {
    if (Number.isFinite(videoTimeSeconds) && videoTimeSeconds >= 0) {
      ytRtItems[ytRtItems.length - 1].videoTimeSeconds = videoTimeSeconds;
    }
  } else {
    ytRtItems.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      source: cleanSource,
      translation: '',
      videoTimeSeconds: Number.isFinite(videoTimeSeconds) ? videoTimeSeconds : -1,
      createdAt: Date.now()
    });
    if (ytRtItems.length > YT_RT_MAX_ITEMS) {
      ytRtItems = ytRtItems.slice(-YT_RT_MAX_ITEMS);
    }
  }

  ytRtActiveItemId = ytRtItems[ytRtItems.length - 1]?.id || '';
  renderRealtimeSubtitleList();
  syncRealtimeActiveItemByPlayback(false);
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

  const source = String(item.source || '').trim();
  const translation = String(item.translation || '').trim();
  const isActive = item.id === ytRtActiveItemId;
  const isPending = Boolean(source) && ytRtTranslationInflight.has(source);
  const shouldHoldForSync =
    isActive &&
    !translation &&
    ytRtOverlayPendingItemId === ytRtActiveItemId &&
    isPending;

  if (shouldHoldForSync) {
    sourceEl.textContent = '';
    translationEl.textContent = '';
    translationEl.style.display = 'none';
    overlay.classList.remove('is-active');
    return;
  }

  sourceEl.innerHTML = buildRealtimeSourceHtml(source);
  translationEl.textContent = translation;
  translationEl.style.display = ytRtCanTranslate === false || !translation ? 'none' : 'block';
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
      startEcdictLookup(word, anchorRect, { preferLeft: true });
    });

    row.addEventListener('click', (event) => {
      if (event.target?.closest?.('.yt-rt-item__play')) return;
      setRealtimeActiveById(item.id, false);
    });

    row.appendChild(playBtn);
    row.appendChild(source);
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
