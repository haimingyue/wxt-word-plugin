// @ts-nocheck
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
const ANKI_URL = 'http://127.0.0.1:8765';
const MODEL_FIELD_MAP = {
  model: 'main-field-options',
  phraseModel: 'phrase-field-options',
  vocabModel: 'vocab-field-options'
};

const form = document.getElementById('config-form');
const statusEl = document.getElementById('status');
const authStatusEl = document.getElementById('auth-status');
const loginBtn = document.getElementById('btn-login');
const logoutBtn = document.getElementById('btn-logout');

document.addEventListener('DOMContentLoaded', () => {
  restore()
    .then(() => {
      bindDeckListeners();
      bindModelListeners();
      return Promise.all([loadAnkiLists(), refreshAuthStatus()]);
    })
    .catch((err) => status(err?.message || '加载失败'));
});
form.addEventListener('submit', saveConfig);
document.getElementById('btn-ping').addEventListener('click', ping);
document.getElementById('btn-load-anki').addEventListener('click', loadAnkiLists);
loginBtn.addEventListener('click', handleLogin);
logoutBtn.addEventListener('click', handleLogout);

async function restore() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  form.deck.value = stored.deck || DEFAULT_CONFIG.deck;
  form.model.value = stored.model || DEFAULT_CONFIG.model;
  form.wordField.value = stored.wordField || DEFAULT_CONFIG.wordField;
  form.exampleField.value = stored.exampleField || DEFAULT_CONFIG.exampleField;
  form.sourceField.value = stored.sourceField ?? DEFAULT_CONFIG.sourceField;
  form.phraseDeck.value = stored.phraseDeck || DEFAULT_CONFIG.phraseDeck;
  form.phraseModel.value = stored.phraseModel || DEFAULT_CONFIG.phraseModel;
  form.phraseField.value = stored.phraseField || DEFAULT_CONFIG.phraseField;
  form.reasonField.value = stored.reasonField || DEFAULT_CONFIG.reasonField;
  form.examplesField.value = stored.examplesField || DEFAULT_CONFIG.examplesField;
  form.vocabDeck.value = stored.vocabDeck || DEFAULT_CONFIG.vocabDeck;
  form.vocabModel.value = stored.vocabModel || DEFAULT_CONFIG.vocabModel;
  form.vocabWordField.value = stored.vocabWordField || DEFAULT_CONFIG.vocabWordField;
  form.vocabPhoneticField.value =
    stored.vocabPhoneticField || DEFAULT_CONFIG.vocabPhoneticField;
  form.vocabDefinitionField.value =
    stored.vocabDefinitionField || DEFAULT_CONFIG.vocabDefinitionField;
  form.vocabTranslationField.value =
    stored.vocabTranslationField || DEFAULT_CONFIG.vocabTranslationField;
  form.vocabPosField.value = stored.vocabPosField || DEFAULT_CONFIG.vocabPosField;
  form.vocabCollinsField.value =
    stored.vocabCollinsField || DEFAULT_CONFIG.vocabCollinsField;
  form.vocabOxfordField.value =
    stored.vocabOxfordField || DEFAULT_CONFIG.vocabOxfordField;
  form.vocabTagField.value = stored.vocabTagField || DEFAULT_CONFIG.vocabTagField;
  form.vocabBncField.value = stored.vocabBncField || DEFAULT_CONFIG.vocabBncField;
  form.vocabFrqField.value = stored.vocabFrqField || DEFAULT_CONFIG.vocabFrqField;
  form.vocabExchangeField.value =
    stored.vocabExchangeField || DEFAULT_CONFIG.vocabExchangeField;
  form.vocabDetailField.value =
    stored.vocabDetailField || DEFAULT_CONFIG.vocabDetailField;
  form.vocabAudioField.value =
    stored.vocabAudioField || DEFAULT_CONFIG.vocabAudioField;
  form.vocabExampleField.value =
    stored.vocabExampleField || DEFAULT_CONFIG.vocabExampleField;
  form.deepseekApiKey.value = stored.deepseekApiKey || '';
  form.deepseekModel.value = stored.deepseekModel || DEFAULT_CONFIG.deepseekModel;
  form.deepseekEndpoint.value = DEFAULT_CONFIG.deepseekEndpoint;
  form.backendBaseUrl.value = stored.backendBaseUrl || DEFAULT_CONFIG.backendBaseUrl;
  status('已加载');
}

async function saveConfig(event) {
  event.preventDefault();
  const config = {
    deck: form.deck.value.trim(),
    model: form.model.value.trim(),
    wordField: form.wordField.value.trim(),
    exampleField: form.exampleField.value.trim(),
    sourceField: form.sourceField.value.trim(),
    phraseDeck: form.phraseDeck.value.trim() || DEFAULT_CONFIG.phraseDeck,
    phraseModel: form.phraseModel.value.trim() || DEFAULT_CONFIG.phraseModel,
    phraseField: form.phraseField.value.trim() || DEFAULT_CONFIG.phraseField,
    reasonField: form.reasonField.value.trim() || DEFAULT_CONFIG.reasonField,
    examplesField: form.examplesField.value.trim() || DEFAULT_CONFIG.examplesField,
    vocabDeck: form.vocabDeck.value.trim() || DEFAULT_CONFIG.vocabDeck,
    vocabModel: form.vocabModel.value.trim() || DEFAULT_CONFIG.vocabModel,
    vocabWordField: form.vocabWordField.value.trim() || DEFAULT_CONFIG.vocabWordField,
    vocabPhoneticField:
      form.vocabPhoneticField.value.trim() || DEFAULT_CONFIG.vocabPhoneticField,
    vocabDefinitionField:
      form.vocabDefinitionField.value.trim() || DEFAULT_CONFIG.vocabDefinitionField,
    vocabTranslationField:
      form.vocabTranslationField.value.trim() ||
      DEFAULT_CONFIG.vocabTranslationField,
    vocabPosField: form.vocabPosField.value.trim() || DEFAULT_CONFIG.vocabPosField,
    vocabCollinsField:
      form.vocabCollinsField.value.trim() || DEFAULT_CONFIG.vocabCollinsField,
    vocabOxfordField:
      form.vocabOxfordField.value.trim() || DEFAULT_CONFIG.vocabOxfordField,
    vocabTagField: form.vocabTagField.value.trim() || DEFAULT_CONFIG.vocabTagField,
    vocabBncField: form.vocabBncField.value.trim() || DEFAULT_CONFIG.vocabBncField,
    vocabFrqField: form.vocabFrqField.value.trim() || DEFAULT_CONFIG.vocabFrqField,
    vocabExchangeField:
      form.vocabExchangeField.value.trim() || DEFAULT_CONFIG.vocabExchangeField,
    vocabDetailField:
      form.vocabDetailField.value.trim() || DEFAULT_CONFIG.vocabDetailField,
    vocabAudioField:
      form.vocabAudioField.value.trim() || DEFAULT_CONFIG.vocabAudioField,
    vocabExampleField:
      form.vocabExampleField.value.trim() || DEFAULT_CONFIG.vocabExampleField,
    deepseekApiKey: form.deepseekApiKey.value.trim(),
    deepseekModel: form.deepseekModel.value.trim(),
    deepseekEndpoint: DEFAULT_CONFIG.deepseekEndpoint,
    backendBaseUrl: DEFAULT_CONFIG.backendBaseUrl
  };
  await chrome.storage.sync.set(config);
  status('已保存');
}

async function handleLogin() {
  const username = String(form.backendUsername?.value || '').trim();
  const password = String(form.backendPassword?.value || '').trim();
  if (!username || !password) {
    setAuthStatus('账号状态：请输入用户名和密码');
    return;
  }

  setAuthButtonsLoading(true);
  setAuthStatus('账号状态：登录中...');
  try {
    const res = await sendMessage({
      type: 'auth-login',
      payload: { username, password }
    });
    if (!res?.success || !res?.auth) {
      throw new Error(res?.message || '登录失败');
    }
    form.backendPassword.value = '';
    renderAuthStatus(res.auth);
  } catch (err) {
    setAuthStatus(`账号状态：登录失败（${err?.message || '未知错误'}）`);
  } finally {
    setAuthButtonsLoading(false);
  }
}

async function handleLogout() {
  setAuthButtonsLoading(true);
  try {
    const res = await sendMessage({ type: 'auth-logout' });
    if (!res?.success) {
      throw new Error(res?.message || '退出失败');
    }
    form.backendPassword.value = '';
    setAuthStatus('账号状态：未登录');
  } catch (err) {
    setAuthStatus(`账号状态：退出失败（${err?.message || '未知错误'}）`);
  } finally {
    setAuthButtonsLoading(false);
  }
}

async function refreshAuthStatus() {
  try {
    const res = await sendMessage({ type: 'auth-get-status', payload: { refresh: true } });
    if (!res?.success) {
      throw new Error(res?.message || '获取账号状态失败');
    }
    renderAuthStatus(res.auth);
  } catch (err) {
    setAuthStatus(`账号状态：${err?.message || '获取失败'}`);
  }
}

function renderAuthStatus(auth) {
  const username = String(auth?.username || '').trim();
  const vip = Number(auth?.vip) === 1;
  const expiresAt = String(auth?.expiresAt || '').trim();
  if (!auth?.token) {
    setAuthStatus('账号状态：未登录');
    return;
  }
  const roleText = vip ? 'VIP' : '普通用户';
  const expireText = expiresAt ? `，到期：${expiresAt}` : '';
  setAuthStatus(`账号状态：已登录 ${username || '未知用户'}（${roleText}${expireText}）`);
}

function setAuthStatus(text) {
  if (!authStatusEl) return;
  authStatusEl.textContent = text;
}

function setAuthButtonsLoading(loading) {
  loginBtn.disabled = loading;
  logoutBtn.disabled = loading;
  loginBtn.textContent = loading ? '处理中...' : '登录账号';
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || '请求失败'));
        return;
      }
      resolve(response);
    });
  });
}

function ping() {
  status('检查中...');
  chrome.runtime.sendMessage({ type: 'ping-anki' }, (res) => {
    if (res?.success) {
      status('AnkiConnect 正常');
    } else {
      status(`失败：${res?.message || '无法连接到 8765 端口'}`);
    }
  });
}

function status(text) {
  statusEl.textContent = text;
}

async function loadAnkiLists() {
  status('加载 Anki 列表中...');
  try {
    const [decks, models] = await Promise.all([
      ankiInvoke('deckNames'),
      ankiInvoke('modelNames')
    ]);
    fillDatalist('deck-options', decks);
    fillDatalist('model-options', models);
    fillDeckSelects(decks);
    fillModelSelects(models);
    await Promise.all([
      updateFieldOptions('model', 'main-field-options'),
      updateFieldOptions('phraseModel', 'phrase-field-options'),
      updateFieldOptions('vocabModel', 'vocab-field-options')
    ]);
    syncFieldSelects();
    status('已加载 Anki 列表');
  } catch (err) {
    status(`加载失败：${err?.message || err}`);
  }
}

function bindModelListeners() {
  form.model.addEventListener('change', () => {
    syncModelSelect('model');
    updateFieldOptions('model', 'main-field-options');
  });
  form.phraseModel.addEventListener('change', () => {
    syncModelSelect('phraseModel');
    updateFieldOptions('phraseModel', 'phrase-field-options');
  });
  form.vocabModel.addEventListener('change', () => {
    syncModelSelect('vocabModel');
    updateFieldOptions('vocabModel', 'vocab-field-options');
  });
  bindModelSelects();
}

function bindDeckListeners() {
  form.deck.addEventListener('change', () => {
    syncDeckSelect('deck');
  });
  form.phraseDeck.addEventListener('change', () => {
    syncDeckSelect('phraseDeck');
  });
  form.vocabDeck.addEventListener('change', () => {
    syncDeckSelect('vocabDeck');
  });
  bindDeckSelects();
}

async function updateFieldOptions(modelInputName, datalistId) {
  const modelName = form[modelInputName]?.value?.trim();
  if (!modelName) {
    fillDatalist(datalistId, []);
    return;
  }
  try {
    const fields = await ankiInvoke('modelFieldNames', { modelName });
    fillDatalist(datalistId, fields);
    syncFieldSelects();
  } catch (err) {
    fillDatalist(datalistId, []);
  }
}

function fillDatalist(id, items) {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = '';
  (items || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    list.appendChild(option);
  });
}

function fillModelSelects(models) {
  const selects = document.querySelectorAll('[data-model-select]');
  selects.forEach((select) => {
    const inputName = select.dataset.modelSelect;
    const current = form[inputName]?.value?.trim() || '';
    fillSelect(select, models, current, '选择模板');
  });
}

function fillSelect(select, items, selected, placeholderText) {
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = placeholderText || '请选择';
  select.appendChild(placeholder);
  (items || []).forEach((item) => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
  if (selected) {
    select.value = selected;
  }
}

function fillDeckSelects(decks) {
  const selects = document.querySelectorAll('[data-deck-select]');
  selects.forEach((select) => {
    const inputName = select.dataset.deckSelect;
    const current = form[inputName]?.value?.trim() || '';
    fillSelect(select, decks, current, '选择牌组');
  });
}

function bindModelSelects() {
  const selects = document.querySelectorAll('[data-model-select]');
  selects.forEach((select) => {
    select.addEventListener('change', () => {
      const modelName = select.value || '';
      const inputName = select.dataset.modelSelect;
      if (!inputName) return;
      if (modelName) {
        form[inputName].value = modelName;
      }
      const datalistId = MODEL_FIELD_MAP[inputName];
      if (datalistId) {
        updateFieldOptions(inputName, datalistId);
      }
    });
  });
  bindFieldSelects();
}

function bindDeckSelects() {
  const selects = document.querySelectorAll('[data-deck-select]');
  selects.forEach((select) => {
    select.addEventListener('change', () => {
      const deckName = select.value || '';
      const inputName = select.dataset.deckSelect;
      if (!inputName) return;
      if (deckName) {
        form[inputName].value = deckName;
      }
    });
  });
}

function syncModelSelect(inputName) {
  const select = document.querySelector(`[data-model-select="${inputName}"]`);
  if (!select) return;
  select.value = form[inputName]?.value?.trim() || '';
}

function syncDeckSelect(inputName) {
  const select = document.querySelector(`[data-deck-select="${inputName}"]`);
  if (!select) return;
  select.value = form[inputName]?.value?.trim() || '';
}

function bindFieldSelects() {
  const selects = document.querySelectorAll('[data-field-select]');
  selects.forEach((select) => {
    select.addEventListener('change', () => {
      const fieldName = select.value || '';
      const inputName = select.dataset.fieldSelect;
      if (!inputName) return;
      if (fieldName) {
        form[inputName].value = fieldName;
      }
      syncFieldSelects();
    });
  });
}

function syncFieldSelects() {
  const selects = document.querySelectorAll('[data-field-select]');
  selects.forEach((select) => {
    const inputName = select.dataset.fieldSelect;
    const listId = select.dataset.fieldList;
    if (!inputName || !listId) return;
    const options = Array.from(document.querySelectorAll(`#${listId} option`)).map(
      (opt) => opt.value
    );
    const current = form[inputName]?.value?.trim() || '';
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选择字段';
    select.appendChild(placeholder);
    options.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
    if (current) {
      select.value = current;
    }
  });
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

