const PANEL_ID = 'anki-example-panel';
const TOAST_ID = 'anki-example-toast';
const MEANING_PANEL_ID = 'deepseek-meaning-panel';
const MEANING_MAX_LEN = 64;
const AUDIO_WAVES_ICON = chrome.runtime.getURL('assets/audio-waves.png');
const AUTO_POPUP_COOLDOWN_MS = 600;
let preferredTtsAccent = 'us';
let lastAutoPopupSelection = '';
let lastAutoPopupAt = 0;

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

async function startEcdictLookup(prefilledSelection) {
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
  const rect = getSelectionRect(window.getSelection());
  const normalizedWord = await normalizeSelection(selected);
  const data = {
    word: normalizedWord,
    sentence,
    sourceUrl: location.href,
    sourceTitle: document.title,
    skipTranslation: true,
    skipMeaning: true
  };
  return openMeaningPanel(
    data,
    rect,
    {
      skipMeaning: true,
      hideSendToAnki: true,
      hideVocab: true,
      hidePhrase: true,
      hideTranslation: true,
      hideTtsWord: true,
      hideTtsSentence: true,
      title: '本地词典',
      meaningPlaceholder: '',
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
