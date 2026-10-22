# OrderWeave

OrderWeave 是面向小型餐饮店铺的菜单、外卖订单与配送管理平台，使用 DeepSeek 服务端接口解析订单文字。

GitHub 源码仓库：[caozheyu780/OrderWeave](https://github.com/caozheyu780/OrderWeave)（私有）。

## Source upload and merchant data

Menu entries, uploaded dish photos, merchant accounts and orders are stored in the website origin's browser localStorage, not in the source repository. Uploading this source does not upload that browser storage. Repository tests contain fictional examples, not an export of a merchant's saved menu or orders.

Local environment files, runtime databases, generated builds, backup exports, screenshots and deployment archives are excluded by `.gitignore`. Keep API keys in server-side secrets; `.env.example` lists variable names with an empty key. Do not manually add merchant backup files or browser profile data to Git. AI extraction separately sends the submitted order text and menu names/aliases to DeepSeek as described below; that runtime request is not a GitHub source upload.

## 运行和检查

首次安装：`npm run install:ci`。

本地开发：`node scripts/run-framework.mjs dev`，默认打开 http://127.0.0.1:5173 。

自动测试：`node --test tests/*.test.mjs`。类型检查：`node node_modules/typescript/bin/tsc --noEmit`。

构建：`node scripts/run-framework.mjs build`。网站使用 Vinext + Cloudflare Workers，通过 Sites 发布；保留 `.openai/hosting.json` 的原项目 ID 和私有访问策略。原来的静态前端已移到 `public/`，网站根路径和浏览器数据键保持不变，已有线上菜单与订单可继续使用。

## DeepSeek 配置

在 Sites 的服务端环境变量中添加：

- `DEEPSEEK_API_KEY`：设为 **Secret**。
- `DEEPSEEK_MODEL`：默认 `deepseek-flash`，可选的服务端模型配置。

配置变更后需重新部署版本才能生效。本地开发可使用被 Git 忽略的 `.dev.vars`，字段名见 `.env.example`；不要提交真实密钥。构建本身不需要密钥。

只使用 DeepSeek 官方端点 `https://api.deepseek.com/chat/completions`，密钥仅由服务端发送到该端点；不会出现在浏览器、API响应、源码或客户数据导出中。禁用 HTTP 重定向，避免将请求转发到未知目标。

页面入口仍为“添加订单 → 文字识别”。输入文字或上传 TXT 后，用户点击“使用 DeepSeek 识别并核对”，本次文字、菜单的菜名/别名/ID/制作时间，以及浏览器当地时间和时区发送至服务端；**不上传菜单图片**。缺少密钥时按钮禁用并提示。可主动选择“仅使用基础规则识别”，不会把规则解析伪装为 AI 结果。

`GET /api/ai-status` 返回是否配置以及模型名，不返回密钥。`POST /api/parse-order` 使用 JSON 模式抽取菜品、数量、预约送达时间、客户、联系方式、地址、口味、备注及需要核对的问题。两个 API 均需要 Sites 提供的 ChatGPT 登录身份。POST 另有同源检查、请求大小限制及每个运行实例内的简单节流；保留当前仅所有者可访问的站点权限。本地开发通过 starter 的 `/signin-with-chatgpt?return_to=/` 模拟登录。

服务端验证请求和模型结果、恢复菜单中真实的 ID/制作时长，并检查日期格式。菜名含错别字、同音字、简称或近似表述时，AI 会给出合理菜单猜测，保留原文、匹配依据及最多三个有效候选，；绑定别名标为 `alias`，唯一且高度相似的拼写标为 `similar`，两者仅提示、不要求额外勾选，其余不确定建议标为 `guessed`；完全无关的菜品标为 `unmatched`，不强行匹配。匹配分类由服务端结合原文和当前菜单校验，不采信模型自己声明的高置信度；原文证据无法验证时保留待核对。不捏造缺失的地址、联系方式或姓名。

猜测及未匹配行必须由商家逐项勾选核对；可选择其他菜单菜品或输入菜单中的准确菜名，编辑后会清除该行勾选，要求重新确认。未匹配时“AI 建议菜品”显示无，原文只供参考，不会预填为可接受的菜品。所有文字导入订单（包括基础规则解析）的每一行都必须属于当前菜单；即使勾选确认，菜单外菜名也无法保存。新增行以及修改已有导入订单同样执行校验。若菜单中尚无该菜，请先在菜单管理中添加。

所有文字导入订单都还需要一次完整订单确认，确认前不写入订单，取消可以返回修改。识别原文、AI 建议、商家修改及最终确认时间会随订单保存，并可在详情查看。不完整结果仍需补全必填项，识别不会自动创建订单。

错误码区分：未配置密钥、密钥无效、余额不足、请求过多、模型配置问题、超时、响应异常和网络故障。前端显示可读提示，不向客户端泄露上游响应正文。单笔兼容接口上游超时 30 秒；批量识别上游超时 60 秒，浏览器超时 75 秒。

接口结构与测试见 `lib/deepseek.mjs`、`app/api/`、`tests/deepseek.test.mjs`。本地测试使用模拟响应，不消耗 AI 余额；配置真实密钥后另做一次真实请求验证。

## 原有功能

- 中文、英文和马来语（Bahasa Melayu）切换、本地商家账号注册与登录（随机盐 + PBKDF2 SHA-256）。
- 菜名、图片、描述、材料和制作时长录入、修改及删除；图片压缩到最长边 800px。
- 订单菜品、数量、预约、地址、联系方式、口味、备注和客户姓名；可手填菜单外菜品。
- 订单状态、搜索、进行中/全部/已送达筛选；修改和送达均需确认。
- 导出当前账号菜单和订单为 JSON；目前没有导入恢复界面。

菜单与订单继续仅保存在当前网站来源的 localStorage，不存入云端数据库；不同设备、浏览器、端口和域名的数据互不共享。清除网站数据会删除记录，建议定期导出。商家本地账号用于区分本机记录，线上站点和 AI API 的访问权限由 Sites 的 ChatGPT 登录与私有策略保护。

当前不包含顾客在线下单、支付、骑手系统及通知。

## Batch text import

DeepSeek text extraction supports up to 20 independent orders from 20,000 characters. Requests use `batch: true`; responses contain `orders` and batch-level `warnings`. Each order retains its own source excerpt and warnings. Missing fields are left blank. Oversized batches fail explicitly instead of silently dropping orders. The legacy single-order API shape remains available when batch is omitted.

Extraction opens an unsaved review list. Merchants can edit or remove individual orders. Complete orders with exact, bound-alias or unique strong-name matches require no per-order checkbox; missing required fields, unlisted menu items and unreviewed uncertain dish matches block addition. Editing an uncertain order requires dish-level review. A final summary confirms the whole batch, followed by one localStorage write with independent IDs and order numbers. Canceling final confirmation returns to the list without saving. Discarding the list saves nothing. Pending drafts are held in memory and are lost on page refresh. Basic rules still handle one order only and explicitly warn against using them to split multiple orders.

## Bound names and match notices

Menu editing supports up to 20 other names per dish (one per line, up to 100 characters each). Primary names and aliases are normalized and deduplicated; a name cannot belong to two dishes. Aliases are stored with the existing local menu and included in data exports. Both DeepSeek and basic rules resolve them to the canonical dish ID/name. Existing menu records without aliases continue to work.

A bound name with source evidence is classified as `alias`. Unique close spelling is classified as `similar`: at least four normalized characters, at most one or two edits, similarity at least 0.75, and a margin of at least 0.20 over the next dish; obvious ingredient/size conflicts are excluded. These are deterministic spelling rules, not an AI probability estimate. Both show original-to-menu-name notices in the list and editor without a checkbox. Semantic guesses without a close spelling or a bound name remain uncertain. Ambiguous and unmatched dishes still require explicit handling. The final whole-batch confirmation remains required for every import.

## Interface languages

The first-run language chooser and the existing language selector support 简体中文, English and Bahasa Melayu. Malay uses language code ms and ms-MY date formatting. The selected interface language persists in the existing browser preference and is restored after reload/sign-in. Authentication, menu/alias editing, order status/details, AI notices/errors, matching review and batch confirmation have Malay translations. Merchant-entered dish names, aliases, customer data and original order text keep their original contents. Model-written explanations retain their source language; known system-generated explanations are localized for display without changing saved records.

## Project identity

OrderWeave is the product name across Chinese, English and Malay. The Site display title, browser metadata, app wordmark, login introduction and project package name use OrderWeave. New exports are named orderweave-backup-YYYY-MM-DD.json and include application: OrderWeave. Existing browser storage/session keys, backup format identifier, Site project ID and deployed URL retain their established values for data compatibility. Historical work-log entries retain the names that were current when recorded.
