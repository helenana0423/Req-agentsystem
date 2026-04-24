# ReqBoard · 需求管理看板

> **给业务侧 PM 的轻量需求工作台**：粘贴一段会议纪要或群聊片段 → Agent 自动抽取需求变更 → 用户确认 → 一键入库。支持自然语言问答需求状态与迭代历史。

![status](https://img.shields.io/badge/status-MVP-blue)
![python](https://img.shields.io/badge/python-3.9%2B-3776ab)
![frontend](https://img.shields.io/badge/frontend-Vanilla%20JS%20%2B%20Tailwind-38bdf8)
![backend](https://img.shields.io/badge/backend-FastAPI%20%2B%20SQLite-009688)
![llm](https://img.shields.io/badge/LLM-Kimi%20%2F%20OpenAI%20%2F%20DeepSeek-7c3aed)

---

## 🎯 这是什么

一个跑在本机（或单台小服务器）上的**个人/小团队需求看板**，解决 PM 面对的三大痛点：

1. **TAPD 太重，企微文档太散** → 需要一个轻量但结构化的真源
2. **需求进展散落在 N 个群聊和会议纪要里** → 粘贴纪要让 Agent 抽取
3. **录入门槛高**（30 分钟会议要花 20 分钟录 TAPD） → Agent 起草 + 人工确认一键入库

### 明确不做的事

- ❌ 不做 Bug 跟踪（让 TAPD/Jira 去做）
- ❌ 不做资源排期与人效管理
- ❌ 不做多租户 SaaS
- ❌ 不自动监听企微群聊（合规/成本/体验都不划算）
- ❌ **Agent 永远不会自动改库**，所有变更必须人工二次确认

---

## ✨ 核心能力

| 模块 | 说明 |
|------|------|
| **看板/表格/甘特三视图** | Kanban 拖拽改状态、Table 10 列详表、Gantt 按业务线分组 + 关键路径 + 延期传导 |
| **Agent 抽取器** | 粘贴会议纪要 → 返回 10 种结构化动作（新建/状态变更/范围调整/加里程碑/加决策/加风险/登记阻塞/解除阻塞 等），每条都可单独勾选入库 |
| **Agent 问答（SSE 流式）** | 右下角浮条 6 条预设问题，支持流式回答 + 回答引用原始需求 ID + 可中断 |
| **进展时间线 + 阻塞登记** | dot + line 叙事时间轴，5 种进展类型 + 一键登记/解除阻塞 |
| **延期传导模拟器** | 改一条需求时间 → BFS 遍历下游依赖 → 预览影响链（MVP 只做 dry-run） |
| **LLM 三层兜底** | 后端启用 → 真实调 LLM；后端未配 Key → 前端本地规则引擎；调用失败 → 降级规则引擎 + Toast |
| **单进程双职责** | FastAPI 同一个端口同时 serve API 和前端静态文件，`localhost:8000` 一个地址全搞定 |

---

## 🏗 技术栈

**原则：简单且健壮**。优先零构建、单进程、单文件存储，但所有接口预留可替换点。

### 前端

- 原生 ES Module JS（不用 React / Vue）
- Tailwind CSS 通过 CDN 引入（不用 PostCSS 构建）
- 自研 Pub/Sub store（`src/store/store.js`）
- Chart.js 做图表（甘特/统计）
- 入口：`index.html` + `src/` 目录

### 后端

- FastAPI + SQLModel（Pydantic v2）
- SQLite（`backend/reqboard.db`，单文件存储）
- sse-starlette 做流式响应
- 自研 `LLMClient` 薄封装，支持 OpenAI / DeepSeek / **Moonshot (Kimi)** / Anthropic

### 明确的技术决策

- ❌ **不用 LangChain**（抽象过度、API 不稳、prompt 控制力削弱）
- ⏸ **RAG 延迟引入**：v1.2+ 用 LlamaIndex（不是 LangChain）
- ⏸ **多步 Agent 延迟引入**：v2.0+ 用 LangGraph 独立（不是整套 LangChain）

详见 [`tech_stack.md`](./tech_stack.md)。

---

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/helenana0423/Req-agentsystem.git
cd Req-agentsystem
```

### 2. 配置环境变量（可选，不配也能跑）

```bash
cp .env.example .env
```

编辑 `.env` 填入 LLM 配置。**推荐 Kimi（Moonshot）**，国内直连免翻墙：

```bash
LLM_ENABLED=true
LLM_PROVIDER=moonshot
LLM_API_KEY=sk-xxxxxxxxxxxxxx
LLM_MODEL=moonshot-v1-8k
LLM_EXTRACT_MODEL=moonshot-v1-32k
```

也支持 OpenAI / DeepSeek / Anthropic。不配 LLM 的话，前端会自动降级到本地规则引擎演示。

### 3. 一键启动

```bash
./start.sh
```

或者手动：

```bash
pip install -r backend/requirements.txt
cd backend
python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. 打开浏览器

访问 👉 **<http://localhost:8000>**

首次启动会自动 seed 12 条 mock 需求（5 款游戏业务线：PUBG Mobile / Honor of Kings / 彩虹六号 / Nikke / GunStar）。

---

## 📂 目录结构

```
Req-agentsystem/
├── README.md                 # 本文件
├── PRD.md                    # v1.4 产品需求文档
├── design_document.md        # v1.0 设计文档（信息架构 + 状态机 + ADR）
├── tech_stack.md             # v1.0 技术栈选型与决策
├── index.html                # 前端入口（原生 JS + Tailwind CDN）
├── src/                      # 前端源码
│   ├── main.js               # Bootstrap + 模式横幅
│   ├── store/store.js        # 自研 Pub/Sub + 双模式（online/offline）
│   ├── api/                  # API 封装层
│   │   ├── client.js         # fetch 封装 + probeBackend
│   │   ├── requirements.js   # CRUD + 甘特计算
│   │   └── agent.js          # Agent 抽取 + SSE 流式问答
│   ├── components/           # UI 组件（Chat/Extractor/Header/Sidebar/Drawer/Modal）
│   ├── views/                # Kanban / Table / Gantt 三视图
│   ├── data/mockData.js      # 种子数据
│   └── utils/helpers.js
├── backend/                  # FastAPI 后端
│   ├── app/
│   │   ├── main.py           # 入口 + lifespan seed 钩子 + 静态托管
│   │   ├── core/             # config / database / seed
│   │   ├── models/           # 6 张表（requirement/progress_note/blocker/dependency/change_log/meeting_note）
│   │   ├── api/              # 路由（requirements/progress/dependencies/agent）
│   │   └── services/llm_client.py  # LLM 薄封装
│   └── requirements.txt
├── start.sh                  # 一键启动脚本
├── .env.example              # LLM 配置示例
└── .gitignore
```

---

## 🔑 关键设计

### 三种运行模式

前端启动时会 probe 后端：

| 模式 | 条件 | 行为 |
|------|------|------|
| `online` | 后端连通 + 有数据 | 数据完全从后端拉 |
| `online-seed` | 后端连通但空库 | 显示前端 mock 演示种子，新建时写入后端 |
| `offline` | 后端不可达 | localStorage 模式，所有写操作只保留在本地 |

### 乐观更新 + 失败回滚

所有 CRUD：先改本地 state + emit（UI 立即响应），再异步调 API，失败时回滚 + Toast 提示。

### Agent 抽取的 10 种动作

```
create / update / status_change / scope_adjust /
add_milestone / add_decision / add_risk /
add_progress / add_blocker / resolve_blocker
```

每条动作带置信度 + 原文引用 + diff 对比，用户勾选后才入库。

详见 [`PRD.md §4.2`](./PRD.md) 和 [`design_document.md §5`](./design_document.md)。

---

## 🛣 演进路线

| 版本 | 状态 | 主要能力 |
|------|------|---------|
| v0.0 | ✅ 已交付 | 纯前端演示版，localStorage 存储 |
| v0.1 | ✅ 已交付 | 后端真源 + Kimi LLM 真实接入 + 全量 CRUD API |
| v1.0 | 🚧 MVP | 联调完整、导入导出、设置页、Toast |
| v1.1 | 📅 规划 | TAPD 双向同步 + 企微机器人通知 |
| v1.2 | 📅 规划 | 会议纪要归档索引（LlamaIndex） |
| v1.3 | 📅 规划 | 文档库（PRD/设计稿），Chroma |
| v2.0 | 📅 远期 | 多步 Agent（LangGraph）+ 跨项目知识中台 |

---

## 🛡 安全与隐私

- `.env`（含 LLM API Key）已在 `.gitignore` 中，**绝不提交**
- SQLite 数据库文件 `reqboard.db` 也已排除
- 本项目设计为**本地部署**，不建议直接暴露到公网；如需分享预览，用 Render/ngrok 临时穿透
- Agent 会把需求/纪要片段发给 LLM Provider，敏感业务数据请谨慎使用

---

## 📜 License

MIT（个人项目，欢迎 fork 改造）

---

## 🙋 作者

[@helenana0423](https://github.com/helenana0423) · 腾讯 AI 产品经理 · 本项目是日常工作中解决"企微文档 + 群聊 + TAPD"混乱现状的实验性工具
