# OrderWeave

## Receiving, kitchen and order approval

The merchant Orders page includes daily receiving-hour settings with a store time zone. Disabled scheduling accepts all day; enabled windows include the opening minute and exclude the closing minute. An earlier closing time crosses midnight. Buyer checkout rechecks current receiving hours and keeps the cart if closed. Merchants can still manually enter or import orders for reconciliation. Existing stores default to unrestricted receiving hours.

New buyer orders start as `awaiting_acceptance`. A red numeric badge on Add Order counts these requests, and Add Order displays their review inbox alongside manual/AI entry. Merchants explicitly accept or decline; declining requires a reason. Both decisions require confirmation and are recorded with the operator/time. Before acceptance, orders do not contribute to active-order counts, kitchen production, ingredient requirements or urgency alerts. Declined orders remain visible in order history and to their buyer, with the reason. They cannot be moved back to production through ordinary editing. Existing buyer orders from earlier versions retain their current status. Local simulated payment records are preserved; no real charges/refunds occur.

The Kitchen preparation page groups only accepted pending/preparing orders by delivery window, dish and options/preferences, with serving counts, notes, related order numbers and estimated work minutes. It excludes delivering, delivered, unconfirmed and rejected orders. Date and half-hour filters can narrow the list; a blank date shows all dates. Ingredient requirements remain on the separate Materials page. Order sorting supports natural location order, creation time, scheduled delivery and actual delivery, in either direction; missing values remain last.

Menu and order imports now persist a batch ID and metadata for create, draft edit, entry removal, discard and final confirmation. Logs identify the operator, timestamp, batch kind/ID and remaining entry count, without copying source text. Final confirmation atomically saves all remaining records, their batch links and the confirmation log. Record batch links and buyer decisions cannot be rewritten through generic save operations. Batch drafts themselves still live in memory: reloading does not restore unfinished input, although its batch activity remains logged. Business JSON exports include receiving-hour and batch metadata; public menu exports continue excluding internal data.

Cross-device ordering is still outside the current local-storage mode: buyers and operators must use the same browser storage context. A future shared-storage version should keep store boundaries, operator permissions, merchant approval and the same batch/audit model, and migrate local records explicitly rather than exposing local browser storage or pretending store codes synchronize devices.

OrderWeave 是面向小型餐饮店铺的菜单、外卖订单与配送管理平台，使用 DeepSeek 服务端接口解析订单文字。

## Buyer ordering (browser-local)

Dish photos, descriptions and preparation times are optional in manual entry, edits and AI menu review. Missing photos are stored as an empty string and rendered with a local blank placeholder; existing photos can be removed in the dish form. Blank times are stored as `null`; a provided time must be a whole number from 1 to 1,440 minutes. Menu/catalog views show that the time is not provided. Order and kitchen estimates sum known times and flag incomplete estimates, while existing orders keep their original time snapshots.

Complete AI menu batches can go directly to the final confirmation without opening each dish. Required-field or name/alias conflicts still block saving. The review footer shows complete/total counts, the first field needing attention and a shortcut to edit that dish. Final confirmation remains required before the batch is saved; optional missing photos, descriptions and times do not block it.

The sign-in screen offers Buyer sign-in and the merchant portal. Buyers use a phone number and a password (6–200 characters). A new phone number automatically creates a local buyer account; an existing number requires its original password. There is no SMS verification or password recovery service. Buyer passwords use the same salted PBKDF2 hashing as merchant accounts. The first sign-in opens profile setup with a random alphanumeric display name and an optional photo; leaving the photo blank uses a neutral blank avatar. Photos are resized locally. Phone numbers, profiles, addresses and carts remain browser runtime data and are excluded from source uploads.

Merchants add a base price in RM, an optional category, and up to eight option groups per dish. Groups may be required/optional and single/multiple choice, with up to twenty choices and nonnegative price surcharges. Prices have at most two decimals and are stored/calculated as integer sen. Existing dishes without prices remain visible but cannot be ordered until priced. Categories appear in catalog/menu browsing only, never on merchant order cards or details. Option surcharges affect price; recipe quantities/preparation times still use the merchant's per-serving dish recipe/time.

Buyers browse stores and categories, choose dish options, quantity and item notes, and add lines to their persistent cart. A cart belongs to one store; complete or explicitly clear it before adding another store's dishes. Checkout revalidates the current menu, option availability and total, then asks for a saved/new delivery address, half-hour delivery window, order notes and payment method. A final confirmation precedes any order creation. No shipping fee, tax or discount is configured in this release; checkout explicitly shows zero delivery fee.

**No real payment gateway is connected.** Wallet and card selections are clearly labeled local simulations; they record `simulated_paid` and never collect card details or charge money. Cash on delivery records `due`. Orders, payment records and cart clearing are committed together in one local storage transaction, with idempotent checkout identifiers to prevent repeated submissions. A failed or stale quote/save creates no order and leaves the cart intact. Buyer orders become immediately readable by this store's merchant accounts in the same browser. Merchants can update delivery details/status, while checkout items, options, totals and payment records remain fixed. Original recipe and price snapshots survive later menu edits. Buyer history reads the latest merchant order status.

MYR is the settlement currency. Small CNY amounts are indicative only and use a **fixed dated reference**, not a live rate or a second charge. The initial snapshot uses ECB euro reference rates for 2026-10-22: [MYR 4.5756 per EUR](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-myr.en.html) and [CNY 7.4786 per EUR](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/eurofxref-graph-cny.en.html); CNY per MYR is their ratio. The source/date is visible in the buyer UI; update the snapshot in `public/commerce.js` when needed. Saved MYR order amounts do not change with this reference.

Buyer and merchant sessions are separate so switching portals retains the corresponding signed-in account. All data remains scoped to the same browser/origin; different devices do not synchronize. The site's existing ChatGPT access gate remains in place before either local portal. Buyer ordering does not make the site public or add cloud authentication/payment services. Back up merchant business data regularly; the existing merchant export contains that store's menu/orders, not all buyer passwords, profiles or carts.

GitHub 源码仓库：[caozheyu780/OrderWeave](https://github.com/caozheyu780/OrderWeave)（私有）。

## Share a menu in group chats

In the merchant menu page, choose **Export menu**, select the dishes and optionally include descriptions, option surcharges and indicative CNY prices. Preview before downloading. **PNG downloads the current page** as a compact, high-resolution image; use the previous/next controls for longer menus. **PDF downloads every page** in an A4 document. Long descriptions and options continue on additional pages rather than being cut off. Exports above 100 pages ask the merchant to select fewer dishes or omit details and export in batches.

The export includes only the shop name, selected dish names/photos/categories/prices and the chosen public details. It excludes customer/order records, member accounts, credentials, aliases and internal material recipes. Existing business-data JSON backup remains a separate action. Exporting or canceling does not modify menus, orders or browser records. File generation runs locally in the browser, without uploading menu photos or customer data. The PDF uses raster pages to keep Chinese/English/Malay text and photos consistent with the preview; its text is not selectable. Missing or unreadable dish images use a visible placeholder, and unpriced dishes say that their price is to be confirmed.

Nested form labels now have explicit spacing above controls. Text field, textarea and select focus indicators stay inside their borders so they cannot overlap the label; keyboard and forced-color focus remain visible.

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

`GET /api/ai-status` 返回是否配置以及模型名，不返回密钥。`POST /api/parse-order` 使用 JSON 模式抽取菜品、数量、预约送达时间、客户、联系方式、地址、口味、备注及需要核对的问题。线上部署的两个 AI API 仍保留 Sites 提供的 ChatGPT 登录身份校验。本地以 `npm run dev` 启动并通过 localhost/127.0.0.1/::1 从本机访问时，AI 状态及识别接口自动使用开发身份，无需 ChatGPT 账号、登录 Cookie 或额外的模拟登录步骤。当前本地存储模式不依赖 D1 店铺成员表；若以后恢复云端模式，原成员校验代码仍保留。POST 另有同源检查、请求大小限制及每个运行实例内的简单节流；保留当前仅所有者可访问的站点权限。自动开发身份只存在于开发服务器的回环连接，并仅用于上述两个 AI 接口；不适用于局域网请求、线上部署或生产构建。原有模拟登录入口仍可用于其他开发调试。配置 `.dev.vars` 后重启开发服务即可使用本地 AI；`npm start` 是生产构建预览，不启用此开发行为。

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

DeepSeek text extraction supports up to 20 independent orders from 100,000 characters. Requests use `batch: true`; responses contain `orders` and batch-level `warnings`. Each order retains its own source excerpt and warnings. Uncertainty is shown both in a linked summary at the top and on the affected order card, including warnings that refer to an order by number. Warnings require that order to be reviewed through Edit before final batch confirmation; complete alias/strong-name matches remain informational. Exact unique source excerpts show original line numbers and a Locate in source button that selects the relevant text in the full source, also available while editing. Missing, invented or repeated excerpts are explicitly marked as not uniquely located. Position offsets come from verified input, never from model-provided numbers. Missing fields are left blank. Oversized batches fail explicitly instead of silently dropping orders. The legacy single-order API shape remains available when batch is omitted.

Extraction opens an unsaved review list. Merchants can edit or remove individual orders. Complete orders with exact, bound-alias or unique strong-name matches require no per-order checkbox; missing required fields, unlisted menu items and unreviewed uncertain dish matches block addition. Editing an uncertain order requires dish-level review. A final summary confirms the whole batch, followed by one atomic local-storage save with independent IDs and order numbers. Canceling final confirmation returns to the list without saving. Discarding the list saves nothing. Pending drafts are held in memory and are lost on page refresh. Basic rules still handle one order only and explicitly warn against using them to split multiple orders.

## Document-based AI imports

The menu page includes **AI menu import** (up to 30 dishes per batch). Both menu extraction and the existing order extraction accept pasted text or one TXT, CSV, TSV, XLS, XLSX, ODS, DOC, DOCX, ODT, RTF or text-based PDF. The browser reads documents in an isolated worker; only the extracted text is sent to DeepSeek after the merchant starts recognition. Files and embedded images/audio/video are not uploaded to the provider or persisted. Scanned PDFs have no supported OCR. Corrupt, encrypted, unsupported and oversized files produce explicit errors; existing input survives a failed read. Replacing nonempty text requires confirmation.

Limits: 20 MB compressed/input file, 100,000 extracted characters, 60 seconds to read; spreadsheets up to 30 tabs, 5,000 rows and 100 columns per tab; PDFs up to 200 pages; ZIP content up to 64 MB total and 32 MB per entry (2,000 entries and expansion ratio limits). No silent text truncation. Legacy DOC support targets Word 97+ piece tables; unsupported old files should be saved as DOCX/TXT. Spreadsheet formulas/macros and document links are never executed. PDF extraction preserves available text, not page images or guaranteed visual/table layout.

New menu dishes require verbatim source evidence. Missing descriptions, preparation times, prices, ingredient quantities/units and option surcharges stay incomplete. Each unsaved dish can be edited or removed, with a photo uploaded manually or a blank placeholder explicitly selected. Required fields and duplicate canonical names/aliases block addition. Every dish must be reviewed, followed by a final whole-batch confirmation and one revision-checked atomic local save. Nothing overwrites an existing dish. Unsaved review drafts remain in memory only.

The current DeepSeek Files API documents JPEG/PNG/GIF/WebP images, not Word/Excel/TXT/PDF document ingestion. OrderWeave uses its text chat interface after local extraction: https://api-docs.deepseek.com/guides/files_api/. The existing server secret remains `DEEPSEEK_API_KEY`; no new provider key or cloud file storage is required.

Reader dependencies are pinned and bundled locally during development/production builds: SheetJS CE 0.20.3 from the official vendor tarball (Apache-2.0), fflate 0.8.3 (MIT), PDF.js 6.4.299 (Apache-2.0), with esbuild 0.28.0 (MIT) as a build dependency. Generated assets and their combined license notice are served under `/document-vendor/`; generated vendor files, actual merchant documents and browser data are excluded from Git source.

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
