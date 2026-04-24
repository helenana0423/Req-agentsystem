# ReqBoard · 技术栈选型 v1.0

| 项目 | 内容 |
| --- | --- |
| 文档类型 | 技术栈推荐（Tech Stack） |
| 版本 | v1.0 |
| 基于 | PRD v1.4 + design_document.md v1.0 |
| 文档日期 | 2026-04-24 |
| 选型原则 | **简单且健壮** |

> 本文档给出 ReqBoard 各层的技术选型决策，包含**为什么选**与**为什么拒**。
> PRD 与产品设计详见 [`PRD.md`](./PRD.md) 和 [`design_document.md`](./design_document.md)。

---

## 0. 选型哲学

### 0.1 "简单"与"健壮"的权衡

这两个词经常被摆在一起说，但本质上会冲突。我们的取舍顺序：

1. **先问"能不能不加"**——能用原生就不引库，能单进程就不拆服务
2. **再问"引入后带来什么"**——库必须解决**现在就存在**的问题，不能为"将来可能会用"而引
3. **最后问"换掉会不会疼"**——抽象层要薄，换掉时代价小

**冲突时的默认选择**：优先"简单"，把"健壮"让位于"接口可替换"。例如 SQLite 单文件（简单）对小团队够用，未来换 Postgres 时因为用了 SQLModel/SQLAlchemy，代价极小。

### 0.2 四条准则

1. **零构建 > 有构建**：前端坚持原生 JS + ES Modules + Tailwind CDN
2. **单进程 > 多进程**：FastAPI 一个进程同时 serve API + 静态文件，不用 nginx/node 反代
3. **单文件存储 > 多服务**：SQLite 一路到底，压到边界再切 PG
4. **薄封装 > 框架**：LLM 直调 SDK，不用 LangChain；RAG 需要时才上 LlamaIndex

### 0.3 目标场景

- **用户规模**：个人或 3~10 人小团队
- **数据规模**：< 1000 条需求，< 500 条依赖，< 200 个活跃 blocker
- **部署方式**：本地单机（一键脚本），跑在 PM 自己的电脑或内网一台低配 Linux 机器
- **LLM 形态**：用户自带 API Key（OpenAI / DeepSeek / Anthropic 三选一）

---

## 1. 技术栈总表

| 层 | 选型 | 版本 | 备注 |
| --- | --- | --- | --- |
| **前端运行环境** | 现代浏览器（Chrome/Edge/Safari 最近两年版本） | — | 依赖 ES Modules + Fetch + SSE |
| **前端语言** | 原生 JavaScript（ES2022+） | — | 不用 TypeScript、不用 React/Vue |
| **前端样式** | Tailwind CSS（CDN 模式） | 3.x | Play CDN，零配置 |
| **前端图标** | Lucide（lucide-static CSS 类） | latest | 按需插入，小部分场景用 emoji |
| **前端构建** | 无 | — | ES Modules 直接浏览器跑 |
| **前端状态管理** | 自研 Pub/Sub（`src/store/store.js`） | — | 150 行足够 |
| **前端持久化** | localStorage（仅 UI 状态 + 离线缓存） | — | 业务数据走后端 |
| **后端语言** | Python | 3.9+ | 系统自带，零安装 |
| **Web 框架** | FastAPI | 0.128+ | 异步、自带 OpenAPI、SSE 简单 |
| **ORM** | SQLModel（SQLAlchemy 2.x + Pydantic 2.x） | 0.0.34+ | FastAPI 作者同款 |
| **数据库（MVP）** | SQLite（aiosqlite 驱动） | 3.x | 零部署，一个 .db 文件 |
| **数据库（v2.0）** | PostgreSQL | 16+ | 小团队协作才切 |
| **LLM SDK** | OpenAI Python SDK（同时兼容 DeepSeek） | 1.30+ | 直调，不用框架 |
| **LLM SDK（可选）** | Anthropic Python SDK | 0.34+ | 用户选 Claude 时用 |
| **RAG（v1.2+）** | LlamaIndex（仅 core + sqlite-vss） | 未来引入 | v1.0 不需要 |
| **向量库（v1.2+）** | sqlite-vss → 规模大后换 Chroma | 未来引入 | MVP 不需要 |
| **多步 Agent（v2.0+）** | LangGraph（独立引入，非 LangChain 全家桶） | 未来引入 | 当前不需要 |
| **可观测（可选）** | 自研 JSONL 日志 → 规模大后换 Langfuse | — | 不用 LangSmith |
| **部署** | `uvicorn app.main:app` 一条命令 | — | 不用 Docker（MVP） |
| **开发工具** | ruff（Python lint）+ 浏览器 DevTools（前端） | — | 不用 ESLint |

---

## 2. 前端技术栈

### 2.1 为什么坚持原生 JS

v0.0 版本已经用原生 JS + ES Modules 实现了整个产品（13 个 JS 文件、Kanban/Table/Gantt/Drawer/Chat/Extractor 全功能）。事实证明对 ReqBoard 这个规模，React/Vue 不是必需品。

**原生 JS 在这个场景下的优势**：

| 维度 | 原生 JS | React + Vite |
| --- | --- | --- |
| 首次启动 | 打开浏览器即跑 | 要 `npm install`（几百 MB node_modules） |
| 构建时间 | 无 | 每次改代码 300~800ms HMR |
| 调试 | 源码 = 运行代码，DevTools 直接看 | 需要 sourcemap，栈深 |
| 部署 | 上传文件到任何静态 serve | 先 build，再上传 dist |
| 维护升级 | 浏览器自己管 | 依赖升级频繁，peer deps 冲突 |
| 学习曲线 | 会 JS 就能改 | 要懂 React + Vite + Tailwind plugin |

**代价**：
- 没有组件化复用（但我们的组件本身不多，复用度低）
- 没有类型系统（用 JSDoc 在关键函数上标注即可）
- 没有 HMR（改代码要刷新页面，但页面首屏 < 200ms，可接受）

### 2.2 Pub/Sub 状态管理（不用 Redux/Zustand）

v0.0 的 `src/store/store.js` 的核心逻辑：

```js
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); }
export function emit() {
  saveState(state);       // 持久化
  listeners.forEach(fn => fn(state));
}
```

这 10 行代码就是全部的"状态管理库"。每个 render 函数 subscribe 一次，数据变更时自动重渲染。**在 ReqBoard 规模下完全够用**。

**不用 Redux/Zustand/MobX 的理由**：这些库解决的是"大型应用中多组件共享复杂状态"的问题，我们的 state 只有 15 个字段，自研 Pub/Sub 零成本。

### 2.3 Tailwind CDN（不用构建版 Tailwind）

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config = { theme: { extend: { colors: { brand: {...} } } } }</script>
```

**优势**：
- 零构建，改样式即刷新即见
- 配置也走 script，直接在 HTML 里改

**代价**：
- 生产环境包体略大（JIT Play CDN 约 130KB gzipped，但 CDN 有缓存）
- 不能用 @apply 等高级特性（我们目前不用）

**何时切到构建版**：当样式代码出现大量重复、或需要服务端渲染时。ReqBoard 当前不需要。

### 2.4 拒绝清单

| 技术 | 拒绝理由 |
| --- | --- |
| React / Vue / Angular | 规模过度，v0.0 已证明原生够用 |
| TypeScript | 用 JSDoc 标注关键函数即可；避免构建步骤 |
| Vite / Webpack | ES Modules 直接跑，不需要打包 |
| Redux / Zustand / MobX | Pub/Sub 10 行代码够用 |
| shadcn/ui / Material-UI | 所有组件 v0.0 已用 Tailwind + 原生标签实现 |
| Chart.js / ECharts | 当前没有图表需求；甘特图自研 SVG |
| dnd-kit | v0.0 用 HTML5 原生 drag-and-drop 已实现 |
| dhtmlx-gantt | 自研甘特图已完成（GanttView.js 384 行），且无 GPL 协议传染风险 |

---

## 3. 后端技术栈

### 3.1 FastAPI + SQLModel（Python 生态）

**为什么 Python**：
- 系统自带（macOS/Linux 都有 3.9+），安装成本零
- LLM 生态最完整（OpenAI SDK 首发、LangChain/LlamaIndex 原生支持 Python）
- 你之前的 DeepAnalyze 项目经验可复用
- FastAPI + Pydantic 2 的异步体验非常好

**为什么 FastAPI 不是 Flask/Django**：
- 异步原生（我们的 Agent 抽取耗时 5~15s，同步会阻塞）
- 自动生成 OpenAPI 文档（`/docs` 即可交互）
- SSE 简单（用 `sse-starlette`，5 行代码）
- 类型提示友好（Pydantic 自动校验请求体）

**为什么 SQLModel 不是纯 SQLAlchemy**：
- FastAPI 作者出品，和 Pydantic 类型系统统一
- 一套模型同时当 ORM + Request/Response schema，不用写两份
- 底层就是 SQLAlchemy 2.x，需要复杂查询可直接下沉到 SQL

### 3.2 SQLite 单文件存储

**为什么 MVP 用 SQLite**：
- **零部署**：没有数据库进程，一个 .db 文件搞定
- **备份极简**：`cp reqboard.db backup.db` 即可；甚至可以用 Git 版本化
- **单用户场景够快**：WAL 模式下，1000 条需求、500 条依赖、所有查询 < 10ms
- **迁移到 PG 时代价小**：SQLModel 的 model 不变，只改 `database_url`

**SQLite 的性能边界**：
- 单写者多读者模型。MVP 单用户，无瓶颈
- 超过 3 人并发写时性能会抖动 → v1.1 协作版再切 PG
- 文件大小超过 10GB 时需考虑（我们的场景永远不会到）

**数据备份策略**：
- 每次 `uvicorn` 启动时自动备份前一版到 `backend/data/backups/YYYY-MM-DD.db`
- 保留 30 天

### 3.3 API 设计：REST + SSE（不用 GraphQL）

**为什么 REST**：
- 前端只有 2~3 个视图，查询模式固定，不需要 GraphQL 的字段选择能力
- OpenAPI 生态成熟，`/docs` 可交互调试
- FastAPI 对 REST 的支持是一等公民

**为什么 SSE 而不是 WebSocket**：
- Agent 问答是"单向流（服务端 → 客户端）"，SSE 是天然形态
- SSE 是 HTTP 标准，穿透代理 / CORS / 认证都和普通请求一致
- WebSocket 要多维护一套连接状态和重连逻辑，MVP 不值得

### 3.4 目录结构

```
backend/
├─ app/
│  ├─ main.py             # FastAPI 入口，lifespan + CORS + 路由注册
│  ├─ core/
│  │  ├─ config.py        # Settings（Pydantic Settings，读 .env）
│  │  └─ database.py      # engine + get_session
│  ├─ models/
│  │  └─ models.py        # 6 张表的 SQLModel 定义
│  ├─ api/
│  │  ├─ requirements.py  # 需求 CRUD + 变更历史
│  │  ├─ progress.py      # 进展动态 + 阻塞项
│  │  ├─ dependencies.py  # 依赖 + 延期传导 + 关键路径
│  │  └─ agent.py         # Agent 抽取 + 问答（SSE）
│  └─ services/
│     └─ llm_client.py    # LLM 薄封装（150 行）
├─ data/
│  ├─ reqboard.db         # SQLite 文件
│  └─ backups/            # 自动备份
└─ requirements.txt       # Python 依赖（< 15 个包）
```

### 3.5 拒绝清单（后端）

| 技术 | 拒绝理由 |
| --- | --- |
| Django | 太重，自带 admin 我们用不上 |
| Flask | 缺异步，SSE 和 function calling 都不方便 |
| GraphQL（Strawberry / Ariadne） | 查询模式固定，没有必要 |
| Celery + Redis | MVP 单用户没有异步任务队列需求；APScheduler 足够 |
| MongoDB | 数据是强关系型（外键、级联），SQL 更合适 |
| Docker（MVP 阶段） | 单进程一条命令跑起来，v1.1 协作版再加 |

---

## 4. LLM 技术栈

### 4.1 直调 SDK（不用 LangChain）

**核心决策：用 `openai` SDK 直调，自研 `LLMClient` 薄封装（150 行），不引入 LangChain**。

这条决策已经在 PRD §11.2 和 design_document.md ADR-002 明确。简短复述理由：

1. **ReqBoard 只有 2 种 LLM 形态**（单轮抽取 + 带工具的问答），两者 OpenAI SDK 原生都支持（JSON mode + tools 参数）
2. **LangChain 抽象过度**，`Runnable/Chain/LCEL` 对单轮调用来说是大炮打蚊子
3. **LangChain API 不稳定**，v0.x 反复重构，升级成本高
4. **prompt 控制力被削弱**，PRD 附录 A 的严格 schema 需要 100% 透明
5. **换模型很简单**：OpenAI SDK 原生兼容 DeepSeek（只要改 `base_url`）；Anthropic 用单独 SDK，在 LLMClient 里做桥接

**LLMClient 接口设计**：

```python
class LLMClient:
    def enabled(self) -> bool               # 是否有 API Key
    async def extract_actions(text, context) -> dict    # Extractor
    async def ask_stream(question, context) -> AsyncGenerator[str]  # Chat
    async def embed(texts) -> list[list[float]]         # v1.2+ 用
```

整个接口只有 4 个方法。换任何 LLM 供应商只改 `_get_client()` 的实现。

### 4.2 供应商策略

| 供应商 | 模型 | 何时用 |
| --- | --- | --- |
| **OpenAI** | gpt-4o-mini | 默认，性价比高，JSON mode 稳定 |
| **DeepSeek** | deepseek-chat / deepseek-reasoner | 成本敏感场景；国内访问稳定；OpenAI SDK 兼容模式 |
| **Anthropic** | claude-haiku / claude-sonnet | 需要强指令遵循时（Extractor 抽取复杂纪要） |

**Key 管理**：
- 用户自备，写入根目录 `.env`（不提交 Git）
- 未配置 Key 时，后端返回 `llm_enabled: false`，前端自动降级到规则引擎

### 4.3 Prompt 工程原则

1. **System prompt 集中在 `llm_client.py`**，不分散到各处
2. **严格 JSON schema**：Extractor 用 `response_format={"type":"json_object"}` 强约束
3. **失败降级**：JSON 解析失败时，返回 `{actions: [], parse_error: true, raw: ...}`
4. **不在 prompt 里做计算**：关键路径、延期传导这类算法由 Python 工具完成，LLM 只负责解读结果

### 4.4 可观测性（可选，分阶段）

| 阶段 | 方案 | 说明 |
| --- | --- | --- |
| v0.1~v0.7 | 自研 JSONL 日志 | `.workbuddy/llm-logs/YYYY-MM-DD.jsonl` 每行一次调用，用 `jq` 查 |
| v0.8+ | Langfuse（可选） | 开源、不绑定框架、Docker 跑一个实例即可；比 LangSmith 更中立 |

**不用 LangSmith 的理由**：深度绑定 LangChain 生态，我们不用 LangChain 就享受不到核心价值。

### 4.5 RAG / 多步 Agent：**按需延迟引入**

这是最关键的一条：**不为"将来可能用到"而提前铺设框架**。

| 能力 | 现在要吗 | 将来用什么 | 触发条件 |
| --- | --- | --- | --- |
| 单轮抽取 | ✅ 现在 | OpenAI SDK | — |
| 工具调用（Chat 里查需求） | ✅ 现在 | OpenAI SDK 的 `tools` 参数 | — |
| RAG 检索 | ❌ 暂不 | **LlamaIndex**（非 LangChain） | v1.2+ 加入会议纪要归档时 |
| 多步 Agent | ❌ 暂不 | **LangGraph**（独立引入，非 LangChain 全家桶） | v2.0+ 需要自动规划评审流程时 |

**LlamaIndex 不是 LangChain**：虽然常被并列提起，但 LlamaIndex 是独立项目，专注 RAG，接口比 LangChain 的 Retriever 清晰。

**LangGraph 不是 LangChain**：LangGraph 是 LangChain 作者的**独立项目**，可以完全不依赖 LangChain 使用，专注"状态机驱动的多步 Agent"。需要时单独引入即可，不会被 LangChain 拖下水。

### 4.6 LLM 层拒绝清单

| 技术 | 拒绝理由 |
| --- | --- |
| **LangChain** | ReqBoard 的 AI 复杂度用不到；抽象过度、API 不稳、削弱 prompt 控制力 |
| LangSmith | 强绑定 LangChain，不用 LangChain 就享受不到价值 |
| Haystack | 功能偏 RAG 全套，MVP 阶段不需要；将来用 LlamaIndex 更专注 |
| 本地模型推理（ollama/vLLM） | 用户明确选云端 API；本地推理需要 GPU，和"个人电脑部署"冲突 |
| Fine-tuning | 好 prompt + function calling 已足够；调参成本远高于收益 |

---

## 5. 部署与运维

### 5.1 MVP 部署方式：一条命令

```bash
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

前端由 FastAPI 同时 serve（`app.mount("/src", StaticFiles(...))` + 根路由返回 `index.html`）。

**优势**：
- 无 Docker、无 nginx、无 pm2、无 supervisor
- 用户在自己电脑上跑，关掉终端就停
- 开机自启用 systemd / launchd（按需，文档提供示例）

### 5.2 一键启动脚本（start.sh）

```bash
#!/usr/bin/env bash
cd backend
python3 -m pip install -q -r requirements.txt  # 首次自动装依赖
python3 -m uvicorn app.main:app --port 8000
```

### 5.3 v1.1+ 协作版部署

当团队使用时（3~10 人共享一个实例）：

- **容器化**：Dockerfile + docker-compose.yml
- **反代**：nginx 或 Caddy（自动 HTTPS）
- **数据库**：仍用 SQLite（WAL 模式），超过 3 并发写再考虑 PG
- **日志**：写 `/var/log/reqboard/` + logrotate
- **备份**：每日 cron 打 tar.gz 到对象存储

### 5.4 v2.0 多人协作版

- **数据库**：切到 Postgres
- **认证**：JWT + SSO（接企业 OIDC）
- **部署**：Kubernetes + Helm（如果真到这个规模）

---

## 6. 依赖清单

### 6.1 后端 Python 依赖（< 15 个）

```
fastapi>=0.128        # Web 框架
uvicorn[standard]     # ASGI 服务器
sqlmodel              # ORM + 模型定义
pydantic>=2.5         # 数据校验
pydantic-settings     # 从 .env 读配置
python-dotenv         # .env 文件支持
aiosqlite             # SQLite 异步驱动
greenlet              # SQLAlchemy 异步桥接
sse-starlette         # SSE 支持
python-multipart      # 文件上传
aiofiles              # 异步文件 IO
openpyxl              # Excel 导入导出（v0.5+）
httpx                 # HTTP 客户端（调 LLM 用）
openai>=1.30          # OpenAI SDK（同时兼容 DeepSeek）
anthropic>=0.34       # Claude SDK（可选）
```

**总计约 15 个包**，全部是 PyPI 首页前 100 的稳定项目。

### 6.2 前端依赖（全部 CDN）

```html
<!-- Tailwind CDN -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Lucide 图标（CSS class 形式） -->
<link rel="stylesheet" href="https://unpkg.com/lucide-static@latest/font/lucide.css" />
```

**零 npm 依赖，零构建。**

### 6.3 未来阶段引入

| 阶段 | 新依赖 | 用途 |
| --- | --- | --- |
| v0.5 | openpyxl | Excel 导入导出 |
| v1.1 | apscheduler | 定时任务（企微日报、自动顺延） |
| v1.1 | mcp-server-tapd（或 fastmcp） | TAPD 对接 |
| v1.2 | llama-index-core + sqlite-vss | 会议纪要归档 RAG |
| v1.3 | chromadb | 向量库规模化 |
| v2.0 | langgraph（独立） | 多步 Agent 编排 |
| v2.0 | psycopg[binary] | Postgres 驱动 |

---

## 7. 常见问题

### Q1: 不用 TypeScript 会不会出大量 bug？

**不会**。理由：
- 规模小（13 个 JS 文件 < 2000 行）
- 核心数据结构在 `mockData.js` 里有完整定义，当"类型文档"用
- 关键函数用 JSDoc 标注（如 `/** @param {Requirement} r */`），VS Code 自动提示
- 有真实 bug 时先加测试再改代码，而不是上 TS

**何时考虑 TS**：代码量超过 5000 行，或团队扩到 5 人以上。

### Q2: 不用 React 将来要换怎么办？

**分阶段迁移**，不用一次全换：
1. **组件粒度对齐**：现有 `Header.js / Sidebar.js / Drawer.js` 本身就是"类组件"结构，迁移时一对一换成 React 组件
2. **store 层不变**：Pub/Sub 模式在 React 里可以用 `useSyncExternalStore` 无缝包装
3. **样式不变**：Tailwind class 名完全兼容

**真要换的工作量**：估算 5~7 天（但我不建议换，除非产品扩展到 100+ 页面）。

### Q3: SQLite 性能真的够吗？

**MVP 和 v1.1 协作版都够**。数据支撑：
- 1000 条需求 + 500 条依赖 + 2000 条进展，总数据 < 10MB
- WAL 模式下，SELECT < 5ms，INSERT < 10ms
- 瓶颈在"单写者"：当超过 3 人同时写需求时会排队（但业务场景下很少并发写同一条）

**何时切 Postgres**：
- 并发写 > 3 人持续出现
- 数据量 > 100MB
- 需要复杂分析查询（GROUP BY + 窗口函数大量使用）

### Q4: 为什么不用 Docker？

**MVP 阶段三个理由**：
1. 用户跑在自己电脑上，`python3 -m uvicorn` 比 Docker 更直接
2. Docker 增加运维复杂度（镜像构建、volume 挂载、网络配置）
3. 数据库是 SQLite 单文件，备份/迁移比 Docker volume 简单

**v1.1+ 协作版用 Docker**，因为：
- 要跑在服务器上，容器化方便统一环境
- 可以 docker-compose 加上 nginx + 定时备份服务

### Q5: 为什么真的不用 LangChain？

已在 §4.1 展开详细理由。一句话：**ReqBoard 的 AI 复杂度用不到 LangChain 解决的问题**，而用了会带来抽象过度、API 不稳、prompt 控制力削弱三个明显代价。

将来真需要多步 Agent 时，用 **LangGraph 独立引入**，不用整套 LangChain 生态。

### Q6: 延迟引入策略会不会积累技术债？

**不会，前提是接口抽象得当**：
- LLM 调用走 `LLMClient` 统一接口，未来换框架只改这一个文件
- 数据访问走 SQLModel，换 PG 只改 `database_url`
- 前端 API 调用走 `src/api/` 封装，换 baseUrl 或改成 GraphQL 只改这一层

**反之，提前引入才是技术债**：引入 LangChain 后，团队会顺手用它的各种子模块，锁定加深，真要换时代价更大。

---

## 8. 决策对照表（与常见方案比较）

| 能力 | ReqBoard 选择 | 业界常见 | 差异原因 |
| --- | --- | --- | --- |
| 前端框架 | 原生 JS | React / Vue | 规模小，原生够用 |
| 前端构建 | 无 | Vite / Webpack | ES Modules 直接跑 |
| 前端状态 | Pub/Sub 自研 | Redux / Zustand | 10 行代码够用 |
| UI 库 | Tailwind + 原生标签 | shadcn / MUI | 自写组件更贴合产品 |
| 后端语言 | Python | Go / Node.js | LLM 生态、团队栈 |
| Web 框架 | FastAPI | Django / Flask | 异步 + SSE + 类型 |
| ORM | SQLModel | SQLAlchemy / Prisma | 和 Pydantic 统一 |
| 数据库 | SQLite → PG | MySQL / PG | 本地部署简单 |
| LLM | 直调 SDK | LangChain | 抽象过度，用不上 |
| RAG | 暂不做 → LlamaIndex | LangChain.RAG | 专业工具做专业事 |
| 部署 | 脚本启动 | Docker + k8s | MVP 规模匹配 |

---

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-04-24 | 初稿，基于 PRD v1.4 + design_document.md v1.0，明确"简单且健壮"的选型准则 |
