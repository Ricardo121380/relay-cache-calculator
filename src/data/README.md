# 模型价格预设说明

`models.json` 内置**各模型厂商官方 API 价格快照**（单位：每 1M token，币种见 `currency`）。

- 每条预设包含 `updatedAt`（快照日期，统一 2026-08-23）与 `sourceUrl`（官方定价页）；
- `cacheWritePerMillion` 在厂商明确区分缓存写入价格时提供；选择预设后会带入精确用量计算；
- `notes` 记录上下文分档、缓存 TTL、推广期等价格附注；
- 官方 API 价格会随厂商调整而变动，**本快照仅供参考，以各官方页面为准**；页面已提供"价格来源"直达链接；
- 用户可在界面覆盖任意字段，或新增自定义模型；
- `example-standard` 是标准验收样例（10/1/30，参考价），与开发方案 §6 完全一致，仅供演示。

## 来源（官方定价页）

| 模型 | 官方定价页 |
|---|---|
| DeepSeek-V4-Flash / Pro | https://api-docs.deepseek.com/zh-cn/quick_start/pricing |
| GLM-5.2 / GLM-4.7 / GLM-4.5-Air | https://open.bigmodel.cn/pricing |
| Kimi K3 | https://platform.kimi.ai/docs/pricing/chat-k3 |
| Qwen3.7-Max（国际站美元价） | https://www.alibabacloud.com/help/tc/model-studio/qwen3-7-max |
| GPT-5.6 Sol / Terra / Luna | https://developers.openai.com/api/docs/pricing |
| Claude Opus 5 / Sonnet 5 / Haiku 4.5 | https://platform.claude.com/docs/en/about-claude/pricing |
| Gemini 3.7 Flash | https://ai.google.dev/gemini-api/docs/pricing |
