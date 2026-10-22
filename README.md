# OrderWeave

OrderWeave 是面向小型餐饮店铺的菜单、外卖订单与配送管理平台，使用 DeepSeek 服务端接口解析订单文字。

GitHub 源码仓库：[caozheyu780/OrderWeave](https://github.com/caozheyu780/OrderWeave)（私有）。

## Current mode: browser-local storage

This release uses browser-local accounts and storage. D1/R2 bindings are disabled, and the frontend does not call the cloud workspace API. Separate local operator accounts share a store in the same browser and website origin; different devices/browsers do not synchronize. AI extraction still uses the existing authenticated server endpoint and provider secret.

Sign in with an existing legacy local account, or create a local store and administrator account. Every store has a permanent, reusable store code; choose Join local store and enter it to register another operator with their own display name and credentials. Existing stores receive a code when signed in or when the account list is opened. Switch accounts through sign-out/sign-in, or use separate tabs in the same browser. Menus, images, orders, credentials (salted hashes) and order logs persist after reload. All store members can view the account list and store code. Only the administrator can delete ordinary accounts after confirmation; open sessions lose access, while orders and historical attribution remain intact. Administrator accounts cannot be deleted. The order log records saved order creation, edits, imports and delivery only; navigation, language changes, menu edits and account housekeeping do not create entries. Older non-order entries remain stored but are hidden from the log. Local permissions and audit records are not a server-enforced multi-device security system.

## Source upload and merchant data

The application stores accounts, menus/photos, orders and logs in browser localStorage under orderweave-demo-v1. Tab sessions use sessionStorage. These runtime records are outside the source repository and are never part of a GitHub source upload. The original takeaway-desk-v1 records and language preference are preserved. Clearing browser data removes these records; export business-data backups regularly. Repository tests contain fictional examples, not an export of a merchant's saved menu or orders.

Local environment files, runtime databases, generated builds, backup exports, screenshots and deployment archives are excluded by `.gitignore`. Keep API keys in server-side secrets; `.env.example` lists variable names with an empty key. Do not manually add merchant backup files or browser profile data to Git. AI extraction separately sends the submitted order text and menu names/aliases to DeepSeek as described below; that runtime request is not a GitHub source upload.

## 运行和检查

首次安装：`npm run install:ci`。

本地开发：`node scripts/run-framework.mjs dev`，默认打开 http://127.0.0.1:5173 。

自动测试：`node --test tests/*.test.mjs`。类型检查：`node node_modules/typescript/bin/tsc --noEmit`。

构建：`node scripts/run-framework.mjs build`。网站使用 Vinext + Cloudflare Workers，通过 Sites 发布；保留 `.openai/hosting.json` 的原项目 ID 和私有访问策略。原来的静态前端已移到 `public/`，网站根路径和浏览器数据键保持不变，旧版本机账号、菜单与订单保留，直接用原账号和密码登录即可沿用。

## DeepSeek 配置

在 Sites 的服务端环境变量中添加：

- `DEEPSEEK_API_KEY`：设为 **Secret**。
- `DEEPSEEK_MODEL`：默认 `deepseek-flash`，可选的服务端模型配置。

配置变更后需重新部署版本才能生效。本地开发可使用被 Git 忽略的 `.dev.vars`，字段名见 `.env.example`；不要提交真实密钥。构建本身不需要密钥。

只使用 DeepSeek 官方端点 `https://api.deepseek.com/chat/completions`，密钥仅由服务端发送到该端点；不会出现在浏览器、API响应、源码或客户数据导出中。禁用 HTTP 重定向，避免将请求转发到未知目标。

页面入口仍为“添加订单 → 文字识别”。输入文字或上传 TXT 后，用户点击“使用 DeepSeek 识别并核对”，本次文字、菜单的菜名/别名/ID/制作时间，以及浏览器当地时间和时区发送至服务端；**不上传菜单图片**。缺少密钥时按钮禁用并提示。可主动选择“仅使用基础规则识别”，不会把规则解析伪装为 AI 结果。

`GET /api/ai-status` 返回是否配置以及模型名，不返回密钥。`POST /api/parse-order` 使用 JSON 模式抽取菜品、数量、预约送达时间、客户、联系方式、地址、口味、备注及需要核对的问题。两个 AI API 均保留 Sites 提供的 ChatGPT 登录身份校验。当前本地存储模式不依赖 D1 店铺成员表；若以后恢复云端模式，原成员校验代码仍保留。POST 另有同源检查、请求大小限制及每个运行实例内的简单节流；保留当前仅所有者可访问的站点权限。本地开发通过 starter 的 `/signin-with-chatgpt?return_to=/` 模拟登录。

服务端验证请求和模型结果、恢复菜单中真实的 ID/制作时长，并检查日期格式。菜名含错别字、同音字、简称或近似表述时，AI 会给出合理菜单猜测，保留原文、匹配依据及最多三个有效候选，；绑定别名标为 `alias`，唯一且高度相似的拼写标为 `similar`，两者仅提示、不要求额外勾选，其余不确定建议标为 `guessed`；完全无关的菜品标为 `unmatched`，不强行匹配。匹配分类由服务端结合原文和当前菜单校验，不采信模型自己声明的高置信度；原文证据无法验证时保留待核对。不捏造缺失的地址、联系方式或姓名。

猜测及未匹配行必须由商家逐项勾选核对；可选择其他菜单菜品或输入菜单中的准确菜名，编辑后会清除该行勾选，要求重新确认。未匹配时“AI 建议菜品”显示无，原文只供参考，不会预填为可接受的菜品。所有文字导入订单（包括基础规则解析）的每一行都必须属于当前菜单；即使勾选确认，菜单外菜名也无法保存。新增行以及修改已有导入订单同样执行校验。若菜单中尚无该菜，请先在菜单管理中添加。

所有文字导入订单都还需要一次完整订单确认，确认前不写入订单，取消可以返回修改。识别原文、AI 建议、商家修改及最终确认时间会随订单保存，并可在详情查看。不完整结果仍需补全必填项，识别不会自动创建订单。

错误码区分：未配置密钥、密钥无效、余额不足、请求过多、模型配置问题、超时、响应异常和网络故障。前端显示可读提示，不向客户端泄露上游响应正文。单笔兼容接口上游超时 30 秒；批量识别上游超时 60 秒，浏览器超时 75 秒。

接口结构与测试见 `lib/deepseek.mjs`、`app/api/`、`tests/deepseek.test.mjs`。本地测试使用模拟响应，不消耗 AI 余额；配置真实密钥后另做一次真实请求验证。

## 原有功能

- 中文、英文和马来语（Bahasa Melayu）切换、本地店铺及独立操作员账号登录；网站入口仍遵循原 Sites 私有访问策略。
- 菜名、图片、描述、材料和制作时长录入、修改及删除；图片压缩到最长边 800px。
- 订单菜品、数量、预约、地址、联系方式、口味、备注和客户姓名；可手填菜单外菜品。
- 订单状态、搜索、进行中/全部/已送达筛选；修改和送达均需确认。
- 导出当前账号菜单和订单为 JSON；目前没有导入恢复界面。

菜单、图片、订单、操作员及操作日志保存在当前浏览器，同一店铺的本地操作员共享；不同设备、浏览器或网站来源的数据暂不共享。旧版账号的盐/哈希、菜单和历史日期会直接沿用，原存储不覆盖。密码只在本机验证；操作日志记录本机时间和实际登录的操作员账号。建议定期导出业务数据备份。

当前不包含顾客在线下单、支付、骑手系统及通知。

## Batch text import

DeepSeek text extraction supports up to 20 independent orders from 20,000 characters. Requests use `batch: true`; responses contain `orders` and batch-level `warnings`. Each order retains its own source excerpt and warnings. Missing fields are left blank. Oversized batches fail explicitly instead of silently dropping orders. The legacy single-order API shape remains available when batch is omitted.

Extraction opens an unsaved review list. Merchants can edit or remove individual orders. Complete orders with exact, bound-alias or unique strong-name matches require no per-order checkbox; missing required fields, unlisted menu items and unreviewed uncertain dish matches block addition. Editing an uncertain order requires dish-level review. A final summary confirms the whole batch, followed by one atomic local-storage save with independent IDs and order numbers. Canceling final confirmation returns to the list without saving. Discarding the list saves nothing. Pending drafts are held in memory and are lost on page refresh. Basic rules still handle one order only and explicitly warn against using them to split multiple orders.

## Bound names and match notices

Menu editing supports up to 20 other names per dish (one per line, up to 100 characters each). Primary names and aliases are normalized and deduplicated; a name cannot belong to two dishes. Aliases are stored with the local store menu and included in data exports. Both DeepSeek and basic rules resolve them to the canonical dish ID/name. Existing menu records without aliases continue to work.

A bound name with source evidence is classified as `alias`. Unique close spelling is classified as `similar`: at least four normalized characters, at most one or two edits, similarity at least 0.75, and a margin of at least 0.20 over the next dish; obvious ingredient/size conflicts are excluded. These are deterministic spelling rules, not an AI probability estimate. Both show original-to-menu-name notices in the list and editor without a checkbox. Semantic guesses without a close spelling or a bound name remain uncertain. Ambiguous and unmatched dishes still require explicit handling. The final whole-batch confirmation remains required for every import.

## Interface languages

The first-run language chooser and the existing language selector support 简体中文, English and Bahasa Melayu. Malay uses language code ms and ms-MY date formatting. The selected interface language persists in the existing browser preference and is restored after reload/sign-in. Authentication, menu/alias editing, order status/details, AI notices/errors, matching review and batch confirmation have Malay translations. Merchant-entered dish names, aliases, customer data and original order text keep their original contents. Model-written explanations retain their source language; known system-generated explanations are localized for display without changing saved records.

## Project identity

OrderWeave is the product name across Chinese, English and Malay. The Site display title, browser metadata, app wordmark, login introduction and project package name use OrderWeave. New exports are named orderweave-backup-YYYY-MM-DD.json and include application: OrderWeave. Existing browser storage/session keys, backup format identifier, Site project ID and deployed URL retain their established values for data compatibility. Historical work-log entries retain the names that were current when recorded.

## Half-hour delivery windows

Delivery scheduling uses a date plus one of 48 daily half-hour slots. New and edited orders store scheduledAt as the slot start and scheduledEndAt as its end. A point such as 12:20 maps to 12:00–12:30; an exact 12:30 maps to 12:30–13:00. The 23:30–00:00 window ends on the following calendar day.

DeepSeek extracts the actual requested start/end; shared server rules assign a containing slot. Explicit ranges must fit in a single slot. A range such as 12:15–12:45 or 12:00–13:00 is left unresolved with a warning, requiring the merchant to choose. Basic-rule text import follows the same rule for supported clock expressions. Original recognized times are retained for review; all imported orders still require final merchant confirmation.

Legacy orders with only a point scheduledAt display as their containing windows without modifying localStorage during page load. Editing/saving or confirming new imports persists explicit start/end fields. List/detail/confirmation views and the date/slot selectors are localized in Chinese, English and Malay.

## Recipes and material summaries

Menu ingredients are structured per-serving rows: name, quantity and unit. Each recipe supports 1–50 ingredients, quantities from 0.001 to 1,000,000 with up to three decimal places, and g, kg, ml, l, pieces, slices, spoons or portions. Existing ingredient names are suggested to encourage consistent naming. Legacy text recipes remain readable; editing splits obvious separators into names and requires the merchant to supply quantities and units without guessing.

Order cards and details show ingredient requirements multiplied by servings. The Materials page switches between all undelivered orders (including future orders) and orders actually delivered today, using this device's local calendar date and deliveredAt rather than the scheduled date. Ingredient names normalize case/spacing; g/kg combine as g and ml/l as ml. Incompatible units remain separate. Missing quantities or recipes are listed outside numeric totals. Consumption is recipe-based and does not include waste or ad hoc substitutions.

New orders capture materialSnapshot recipes with the local order, including manual, basic-rule and AI batch orders. Same-dish edits keep the recipe snapshot and recalculate using the edited serving count; switching dishes captures the newly selected recipe. Menu changes or deletion cannot alter saved snapshots. Old orders without snapshots explicitly use an estimate from the current menu, where available. Delivering an old order freezes this estimate; unavailable recipes remain visible as incomplete. These additions do not rewrite browser storage on load or send ingredient recipes to DeepSeek or GitHub.

## Local operator persistence and compatibility

The browser adapter is public/local-workspace.js; public/cloud-api.js retains the prior frontend function boundary but delegates locally without fetch. Accounts use salted PBKDF2 SHA-256 (150,000 iterations), unique login names and per-tab sessions. Administrators can invite, revoke, disable or re-enable local operators. Invite codes are hashed in storage, expire after 24 hours and can be redeemed once in this browser. Business data and audit rows are committed together. Every save checks the store revision. Web Locks serialize writers across tabs when available; a same-context queue and stale-storage check remain as fallback.

Legacy records are read only when the new local database does not yet exist. A successful original-password login persists their independent local copy and records a restoration event without changing the original key or historic delivery dates. Corrupt data stops writes; quota failures preserve previously saved records. Separate storage contexts start with separate data. Exports contain business data and exclude account passwords/hashes.

Cloud workspace source and immutable schema history remain for future use, but lib/app-mode.mjs selects LOCAL_DEMO=true and hosting.json declares d1/r2 as null. The cloud workspace route is inactive in this release. Existing remote resources are not deleted by application code; no remote account/data copy is silently claimed. Restoring cloud mode later requires an explicit configuration and migration plan.

## Preparation and delivery countdowns

Order cards display summed dish preparation minutes multiplied by servings, with an incomplete-time notice for custom/legacy entries lacking durations. This is a workload estimate rather than a parallel kitchen scheduling model. A per-second timer compares the current device time with the selected delivery window's start. Less than 20 minutes remaining is amber, overdue is red, and delivered orders stop alerts. Exactly 20 minutes remains normal. Invalid/missing schedules are not given invented countdowns.
