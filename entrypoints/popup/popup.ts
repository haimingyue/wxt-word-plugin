// @ts-nocheck
const statusEl = document.getElementById('status');

document.getElementById('btn-options').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

document.getElementById('btn-ping').addEventListener('click', () => {
  status('检查中...');
  chrome.runtime.sendMessage({ type: 'ping-anki' }, (res) => {
    if (res?.success) {
      status('AnkiConnect 正常');
    } else {
      status(`失败：${res?.message || '无法连接到 8765 端口'}`);
    }
  });
});

function status(text) {
  statusEl.textContent = `状态：${text}`;
}


