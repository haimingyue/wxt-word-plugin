// @ts-nocheck
const statusBadgeEl = document.getElementById('status-badge');
const pageStateEl = document.getElementById('page-state');
const selectionToggleEl = document.getElementById('toggle-selection-meaning');
const translatePageBtn = document.getElementById('btn-translate-page');
const optionsBtn = document.getElementById('btn-options');
const pingBtn = document.getElementById('btn-ping');

const DEFAULT_PREFS = {
  selectionMeaningEnabled: true
};

let popupState = {
  prefs: { ...DEFAULT_PREFS },
  pageTranslated: false,
  pageTranslationInFlight: false
};

optionsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

pingBtn.addEventListener('click', () => {
  setStatus('检查中...', 'busy');
  chrome.runtime.sendMessage({ type: 'ping-anki' }, (res) => {
    if (res?.success) {
      setStatus('AnkiConnect 正常', 'success');
    } else {
      setStatus(`失败：${res?.message || '无法连接到 8765 端口'}`, 'error');
    }
  });
});

selectionToggleEl.addEventListener('change', async () => {
  const checked = selectionToggleEl.checked;
  setStatus('保存中...', 'busy');
  const result = await sendMessageToActiveTab({
    type: 'extension-set-prefs',
    payload: {
      selectionMeaningEnabled: checked
    }
  });
  if (!result?.success) {
    selectionToggleEl.checked = !checked;
    setStatus(result?.message || '保存失败', 'error');
    return;
  }
  popupState.prefs = {
    ...popupState.prefs,
    ...(result?.prefs || {})
  };
  renderPopupState();
  setStatus(checked ? '已开启划词释义' : '已关闭划词释义', 'success');
});

translatePageBtn.addEventListener('click', async () => {
  if (translatePageBtn.disabled) return;
  const restoring = popupState.pageTranslated === true;
  setStatus(restoring ? '恢复原文中...' : '翻译网站中...', 'busy');
  renderPageButtonState(true);
  const response = await sendMessageToActiveTab({
    type: restoring ? 'extension-restore-page' : 'extension-translate-page'
  });
  if (!response?.success) {
    renderPageButtonState(false);
    setStatus(response?.message || '操作失败', 'error');
    return;
  }
  popupState.pageTranslated = Boolean(response?.pageTranslated);
  popupState.pageTranslationInFlight = false;
  renderPopupState();
  setStatus(
    popupState.pageTranslated ? `已翻译 ${Number(response?.count || 0)} 段文本` : '已恢复原文',
    'success'
  );
});

initPopup().catch((err) => {
  setStatus(err?.message || '初始化失败', 'error');
});

async function initPopup() {
  setStatus('正在读取页面状态...', 'busy');
  const response = await sendMessageToActiveTab({ type: 'extension-get-state' });
  if (!response?.success) {
    popupState = {
      prefs: { ...DEFAULT_PREFS },
      pageTranslated: false,
      pageTranslationInFlight: false
    };
    renderPopupState();
    setStatus(response?.message || '当前页面不可用', 'error');
    return;
  }
  popupState = {
    prefs: {
      ...DEFAULT_PREFS,
      ...(response?.prefs || {})
    },
    pageTranslated: Boolean(response?.pageTranslated),
    pageTranslationInFlight: Boolean(response?.pageTranslationInFlight)
  };
  renderPopupState();
  setStatus('待命', '');
}

function renderPopupState() {
  selectionToggleEl.checked = popupState.prefs.selectionMeaningEnabled !== false;
  pageStateEl.textContent = popupState.pageTranslated ? '已翻译，可恢复原文' : '未翻译';
  renderPageButtonState(Boolean(popupState.pageTranslationInFlight));
}

function renderPageButtonState(isBusy) {
  translatePageBtn.disabled = Boolean(isBusy);
  translatePageBtn.classList.toggle('is-restoring', popupState.pageTranslated === true);
  if (isBusy) {
    translatePageBtn.textContent = popupState.pageTranslated ? '恢复中...' : '翻译中...';
    return;
  }
  translatePageBtn.textContent = popupState.pageTranslated ? '显示原文（恢复）' : '翻译当前网站';
}

function setStatus(text, type = '') {
  statusBadgeEl.textContent = text || '待命';
  statusBadgeEl.className = 'status-badge';
  if (type === 'success') statusBadgeEl.classList.add('is-success');
  if (type === 'busy') statusBadgeEl.classList.add('is-busy');
  if (type === 'error') statusBadgeEl.classList.add('is-error');
}

async function sendMessageToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { success: false, message: '未找到当前标签页' };
  }

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (
      !msg.toLowerCase().includes('receiving end does not exist') &&
      !msg.toLowerCase().includes('could not establish connection')
    ) {
      return { success: false, message: msg || '页面通信失败' };
    }
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
  } catch (_) {}

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (err) {
    return { success: false, message: String(err?.message || err || '页面通信失败') };
  }
}
