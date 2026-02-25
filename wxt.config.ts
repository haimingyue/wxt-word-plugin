import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Anki Example Collector',
    version: '0.1.0',
    description: '在网页选词，确认句子后追加到 Anki 的 Example 字段，并附带来源。',
    permissions: ['storage', 'contextMenus', 'scripting', 'activeTab'],
    host_permissions: [
      'http://127.0.0.1/*',
      'https://api.deepseek.com/*',
      'http://47.120.34.161/*'
    ],
    action: {
      default_title: 'Anki Example Collector',
      default_popup: 'popup.html'
    },
    options_page: 'options.html',
    commands: {
      'capture-example': {
        suggested_key: {
          default: 'Ctrl+Shift+L'
        },
        description: '采集选中文字所在短句并发送到 Anki'
      },
      'capture-meaning': {
        suggested_key: {
          default: 'Ctrl+Shift+K'
        },
        description: '翻译单词'
      },
      'capture-translate-sentence': {
        suggested_key: {
          default: 'Ctrl+Shift+S'
        },
        description: '翻译整句'
      },
      'capture-parse-sentence': {
        suggested_key: {
          default: 'Ctrl+Shift+U'
        },
        description: '句子解析'
      }
    },
    web_accessible_resources: [
      {
        resources: ['assets/audio-waves.png'],
        matches: ['<all_urls>']
      }
    ],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        css: ['content.css'],
        run_at: 'document_idle'
      }
    ]
  }
});
