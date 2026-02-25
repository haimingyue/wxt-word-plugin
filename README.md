# Anki Example Collector (WXT)

这是 `word-extra-plugin` 的 WXT 版本，功能保持一致：
选词采集例句、DeepSeek 释义/翻译、短语检测、生词本与本地词典查询等。

DeepSeek 支持两种模式：
- 登录 extra-word 账号后，VIP 用户会优先走后端代理（`/api/v1/deepseek/v1/chat/completions`），无需本地配置 Key。
- 未登录或非 VIP 用户可继续配置自己的 `DeepSeek API Key / 模型`（默认 `deepseek-chat`，接口固定官方地址）。

开发命令：
1. `pnpm install`
2. `pnpm dev`

加载扩展：
1. Chrome 打开 `chrome://extensions`，开启开发者模式。
2. 加载目录：`wxt-word-extra-plugin/.output/chrome-mv3-dev`
