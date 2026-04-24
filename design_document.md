# ReqBoard · 产品设计文档 v1.0

| 项目 | 内容 |
| --- | --- |
| 文档类型 | 产品设计文档（Design Document） |
| 版本 | v1.0 |
| 基于 | PRD v1.4（2026-04-24） |
| 文档日期 | 2026-04-24 |
| 目标读者 | 产品自查、设计师参考、开发实现前的总览 |

> 本文档是 PRD 的后续产物——**PRD 回答"做什么"，本文档回答"怎么设计"**。技术栈选型见 [`tech_stack.md`](./tech_stack.md)。

---

## 0. 设计原则

### 0.1 四条核心原则

1. **进展不是状态枚举值，是叙事 + 结构化阻塞**
   TAPD 用"状态"回答"需求怎么样了"，ReqBoard 用"进展时间线 + 活跃阻塞"回答。这是产品本质差异，所有 UI 和数据模型都围绕它。

2. **Agent 产出提案，人做决策**
   抽取器从不自动写库；问答器只读不写。**"AI 帮我起草，我点一下确认" > "AI 直接改我的数据"**。

3. **每一次改动都要有溯源**
   所有变更进 `requirement_change`，标记 `source`。Agent 产生的变更额外记 `source_ref`（原文片段）。

4. **降级路径永远留着**
   LLM 未启用 → 前端规则引擎兜底；后端不可达 → localStorage 只读模式；抽取失败 → draft + 原文保留。

### 0.2 三条视觉原则

1. **信息密度分层**：卡片（轻）→ 列表（中）→ 详情抽屉（重）
2. **颜色传达语义**：紫色=品牌/主操作；红色=阻塞/高优；绿色=完成；不滥用状态色
3. **Emoji 只用于强情感识别点**：🚨/🔥/✨/🎯，其他地方用 Lucide icon

---

## 1. 信息架构

### 1.1 全局结构

```
ReqBoard（单页应用，无多级路由）
├─ 顶栏：Logo / 搜索 / 视图切换 / 粘贴纪要 / 新建 / 更多 / 用户头像
├─ 主区
│   ├─ 左侧筛选栏（跨视图共享）
│   └─ 视图内容（Kanban / Table / Gantt 三选一）
├─ Drawer（覆盖层，4 tab：进展时间线 / 详情 / 变更历史 / 附件）
├─ Chat 浮条（右下角固定，展开 420×600）
└─ Modal（Extractor / 新建需求 / 设置）
```

**不做多级路由的原因**：业务 PM 的核心场景是"看 + 改 + 问"，覆盖层模式比页面切换更快。

### 1.2 数据对象关系

```
requirement ──┬── requirement_change (N)   字段级 diff（"status: 开发中 → 测试中"）
              ├── progress_note (N)        叙事型进展（"前端 UI 完成 80%"）
              ├── blocker (N)              结构化阻塞（"卡在法务，已 2 天"）
              ├── attachment (N)           v0.5 开放
              └── requirement_dependency (M×M)  自关联，环检测
```

**三者职责严格不重叠**：change = 字段 diff；note = 叙事；blocker = 结构化待解决项。

---

## 2. 核心用户流程

### 2.1 流程 A：粘贴纪要批量录入（最高频场景）

```
开完周会 → 点「✨ 粘贴纪要」→ Extractor 弹窗
  → 粘贴原文（或点示例）→ 点「🚀 开始抽取」
  → 右侧出现 N 条动作（默认全选）
  → 用户审查（可单取消、可全不选）
  → 点「✓ 确认写入」
  → 逐条调后端 API → Toast 汇总结果 → 看板刷新
```

**关键设计**：逐条调后端（而非批量 /confirm），单条失败不影响其他，且复用 CRUD 接口。

### 2.2 流程 B：查看某需求现状

三种入口：
- Kanban 卡片（一眼看到🚨标记）
- 搜索 REQ-42 → 筛选结果点击
- Chat 问"REQ-42 怎么样"

→ Drawer 默认打开"进展时间线"tab → 看到活跃阻塞区 + Note 时间线 → 如需深入切"详情"或"变更历史"→ 或点"💬 问它一下"自动发问。

### 2.3 流程 C：延期影响分析

Drawer → 详情 tab → 底部"🔮 延期传导模拟器"→ 选新日期 → 点「模拟影响」→ 展示受影响下游清单（dry-run，不改库）→ 用户决定改不改。

### 2.4 流程 D：快速记一笔进展

Drawer 底部输入栏 → 选类型（进展/里程碑/决议/风险/评论）→ 输入内容 → 回车 → 时间线顶部出现新条目。

### 2.5 流程 E：登记阻塞

Drawer 底部「🚨 阻塞」→ Modal 填类型/描述/阻塞方/预期解除日 → 确认 → blocker 表 + 进展 note 双写 → 卡片立即出现🚨标记。

### 2.6 流程 F：解除阻塞

两种入口：
- 时间线活跃阻塞区的「✓ 解除」按钮 → prompt 填说明
- Extractor 识别"REQ-42 可以继续" → resolve_blocker 动作

→ blocker.status = resolved → 自动写 unblock note → 🚨标记消失。

---

## 3. 模块设计

### 3.1 顶栏

**布局逻辑**：视觉重心从左到右递减——品牌 → 高频（搜索/视图）→ 核心差异化（粘贴纪要，唯一紫色渐变主按钮）→ 次频 → 低频。

### 3.2 左侧筛选栏

固定 224px，不折叠。
- **筛选总览**："N/M 条"计数 + 清除按钮（仅当有激活筛选时出现）
- **快捷入口**：全部需求 / 🚨 阻塞项（红色计数徽章）—— 视图大集合切换
- **多选筛选**：业务线 / 负责人 / 状态（带计数）/ 优先级 / 标签 —— 维度交集
- **使用小贴士**：按当前视图变换文案

### 3.3 Kanban 视图

#### 卡片信息层级（关键）

```
层 1: [P0] REQ-2026-0042  [🚨 2天]      ← 身份（必显）
层 2: 海外合规改造 - 跨境数据传输        ← 主标题（2 行截断）
层 3: ● 海外游戏 · 👤 王晓琳 · 🔗 3     ← 元信息
层 4: ▓▓▓▓▓▓░░░░ 60% · 截止 05-10     ← 进度（已搁置无）
层 5: [动态块]                          ← 优先级规则见下
```

**层 5 优先级规则**：
1. 有活跃 blocker → 红底显示第一个 blocker 描述
2. 无 blocker 但有进展 note → 灰底显示最新 note
3. 都没有 → "⏱ 更新于 X 天前"

这规则确保**同等卡片尺寸下，优先暴露最危险的信息**。

#### 拖拽

HTML5 原生 drag-and-drop；目标列紫色浅底高亮；松手调 API + Toast + 自动写变更流水。

### 3.4 Table 视图

10 列 × 行，列头排序。优先级按 P0>P1>P2>P3 语义排序（非字典序）。列头 sticky top。

### 3.5 Gantt 视图

#### 布局

```
┌─────────┬──────────────────────────────┐
│ 左侧    │ 时间轴 header (48px sticky)  │
│ 260px   │──────────────────────────────│
│ 🔥 🚨   │   [进度条1]──▶[进度条2]      │
│ REQ-42  │        [进度条3]             │
│ 组头    │   (依赖连线 SVG + 今日红线)  │
└─────────┴──────────────────────────────┘
```

按业务线分组，组内按 `planned_start` 升序。

#### 缩放三档

| 档位 | px/天 | 刻度 |
| --- | --- | --- |
| 日 | 32 | 每日数字，周末灰底 + 红字 |
| 周（默认） | 14 | 每周一"月/日" |
| 月 | 5 | 仅月份分隔 |

#### 进度条

- 行高 36px，条高 22px
- 背景色：已上线=绿浅 / 其他=灰浅
- 填充：按状态 gradient（灰/蓝/黄/紫/绿）
- 进度 > 30% 条内白字；≤ 30% 条外黑字

#### 关键路径

- CPM 算法：`slack ≤ 0` 即关键路径节点
- 视觉：红色外框 + 左侧 🔥
- 两模式切换：
  - A（默认）：标亮，其他节点可见
  - B：**仅显示**关键路径，其他隐藏

#### Blocker 联动

- 整行红底（rgba 254,226,226,0.35）+ 左侧 🚨
- 悬浮显示卡点摘要

#### 依赖连线

SVG 折线：`M x1,y1 L (x1+10),y1 L (x1+10),y2 L (x2-2),y2` + 箭头；关键路径红色加粗。

#### 今日线

红色 2px 垂直线 + 顶部"今天"标签 + **加载时自动滚动**（今日线居屏幕 1/3 位置）。

### 3.6 详情抽屉

#### 结构

- 720px 宽，`max-w: calc(100vw-80px)`
- 右滑入 200ms，ESC 关闭，点击遮罩关闭
- 头部固定（跨 tab 保留），下面切 tab 内容

#### 进展时间线 tab（默认）

```
┌ 🚨 活跃阻塞（1）━━━━━━━━━━━━━━━━━┐
│ [外部依赖] 已 2 天 · 预期 04-25     │
│ 等法务确认跨境合规                  │
│ 阻塞方：法务·张三    [✓ 解除]      │
└────────────────────────────────────┘

🎯  里程碑 · 李明 · 04-23 14:32
    └ 后端接口联调完成

🚨  阻塞 · 王晓琳 · 04-22 10:15 [✨Agent]
    └ 卡在法务跨境合规确认
    ▶ 📎 原文片段

📝  进展 · 李明 · 04-21 18:05
    └ 前端 UI 完成 80%，剩表单校验

─────────────────────────────────────
[📝 进展▾] [记一笔...] [发送] [🚨阻塞]
```

左侧圆点用 note_type 配色 + 圆点之间 2px 灰竖线串联。

#### 详情 tab

6 section：基本信息（内联编辑）/ 描述（灰底 markdown）/ Scope（黄底，强调"当前边界"语义）/ 标签 / 依赖关系（前置+后置分列）/ 🔮 延期传导模拟器（橙底）。

#### 变更历史 tab

每条卡片：变更类型 emoji + 字段 chip + 来源徽章 + diff（old 红删除线 → new 绿底）+ 可展开原文。

### 3.7 Chat 浮条

#### 折叠态
右下角紫色渐变胶囊按钮"💬 问问 Agent"。

#### 展开态（420×600）

```
┌ 🤖 ReqBoard Agent           [×] ┐  ← 紫渐变头
├──────────────────────────────────┤
│ [消息列表 scroll]                │
│ 用户: REQ-42 怎么样？            │
│ 🤖: **REQ-2026-0042**...        │
│ 📎 引用：REQ-42 时间线           │
├──────────────────────────────────┤
│ 预设问题横滚（6 条）             │
├──────────────────────────────────┤
│ [输入框]                   [发送]│
└──────────────────────────────────┘
```

**Citations 必选**：每条 AI 回答底部灰色小字"📎 引用：XX · YY"。

#### Drawer 联动

点 Drawer 的"💬 问它一下" → 打开浮条（如关闭）→ 延迟 200ms 自动提问 `{code} 现在进展怎么样？`。

### 3.8 Extractor 弹窗

#### 布局（max-w-5xl，左右两栏）

左栏：示例按钮 × 2 + textarea + 抽取按钮
右栏：清单计数（N/M 已选）+ 全选/全不选 + 动作卡片列表 + 确认写入

#### 动作卡片三态

- 未选中：白底灰框
- 选中：紫色描边 + 紫底
- 已忽略：灰色 opacity 0.45

#### 10 种动作 UI

| 类型 | Chip | 使用 diff |
| --- | --- | --- |
| 🆕 新增需求 | 绿 | ✗ |
| ✏️ 更新需求 | 蓝 | ✓ |
| 🔄 状态变更 | 靛蓝 | ✓ |
| 🎯 边界调整 | 琥珀 | ✓ |
| 📝 新增进展 | 灰 | ✗ |
| 🎯 里程碑 | 紫 | ✗ |
| ⚖️ 决议 | 琥珀 | ✗ |
| ⚠️ 风险 | 橙 | ✗ |
| 🚨 新增阻塞 | 红 | ✗ |
| ✅ 解除阻塞 | 绿 | ✗ |

---

## 4. 状态机与联动规则

### 4.1 需求状态机

```
待评审 → 已立项 → 开发中 → 测试中 → 已上线（终态）
   任意状态 → 已搁置 / 已取消（终态）
```

**软约束**（不硬阻止）：允许任意状态跳转；每次跳转写 `requirement_change.change_type=status_change`。

**已上线时的联动**：自动解除所有 `linked_requirement_id == this.id` 的 active blocker（见 §4.3）。

### 4.2 Blocker 状态机

```
active → (resolveBlocker / 前置上线 / Agent 抽取解除) → resolved
```

resolved 不可逆；需要新阻塞就建新的。

### 4.3 三大联动机制

#### 联动 A：依赖 → 自动产生 Blocker（默认关）

```
触发条件（AND）：
  1. 存在 FS 依赖 A → B
  2. A.status ≠ '已上线'
  3. B.planned_start ≤ today
  4. settings.dep_auto_blocker = true

动作：在 B 上创建 Blocker（upstream_req 类型，linked_requirement_id = A.id）+ 写 blocker note

解除：A 变已上线时触发 → blocker resolved + unblock note
```

**默认关的原因**：避免用户刚建依赖还没配好就被自动 Blocker 吓到。

#### 联动 B：粘贴纪要 → 自动识别

Extractor 识别 10 种动作句式，确认后批量写入。LLM 未启用时，前端正则规则引擎兜底（9 条规则覆盖高频句式）。

#### 联动 C：Blocker → 警示 + 顺延

**C.1 视觉警示（必做）**：Kanban 🚨 + Gantt 整行红底 + Drawer 头部计数
**C.2 自动顺延（默认关）**：`settings.auto_delay_propagate=true` 时，每日扫描，active blocker 每多 1 天 → `planned_end +1`
**C.3 Agent 增强**：
- "REQ-42 卡了几天？" → 查活跃天数
- "如果今天不解除，REQ-45 推到何时？" → 活跃天数 + BFS 模拟
- "所有被阻塞的" → 聚合查询

### 4.4 延期传导（BFS dry-run）

```python
def propagate_delay(req_id, new_end_date):
    req = get(req_id)
    delta = (new_end_date - req.planned_end).days
    if delta <= 0: return []

    affected = []
    pushed = {req_id: delta}
    queue = [(req_id, delta)]

    while queue:
        cur_id, push_days = queue.pop(0)
        for dep in deps_where_from(cur_id):
            down = get(dep.to_id)
            if not down.planned_end: continue
            if push_days > pushed.get(dep.to_id, 0):
                pushed[dep.to_id] = push_days
                affected.append({...})
                queue.append((dep.to_id, push_days))
    return affected
```

复杂度 O(V+E)，个人场景下毫秒级。**不写库**，让用户看完再决定。

### 4.5 环检测（DFS，加依赖前）

```python
def has_cycle(new_from, new_to, existing):
    adj = build_adj(existing + [(new_from, new_to)])
    visiting, visited, path = set(), set(), []

    def dfs(node):
        if node in visiting: return path[path.index(node):] + [node]
        if node in visited: return None
        visiting.add(node); path.append(node)
        for n in adj.get(node, []):
            if cycle := dfs(n): return cycle
        visiting.remove(node); visited.add(node); path.pop()
        return None

    return dfs(new_from)
```

成环时 API 返回 400 + 环上节点 code 列表，前端 Toast 显示。

### 4.6 关键路径 CPM

```
1. 过滤：排除 已搁置/已取消 + 必须有 planned_start/end
2. 拓扑排序
3. 正向算 EF（最早完成） = max(前置 EF + lag) + 自身 duration
4. 逆向算 LF（最晚完成） = min(后继 LS - lag)
5. slack = LF - EF
6. slack ≤ 0.5 天 的节点 → 关键路径
```

结果：`{critical_ids: [...], items: [{code, title, status, planned_end}]}`

### 4.7 进度计算

设置切换两种模式：
- **手动**（默认）：用户填 0-100
- **状态映射**：待评审 0 / 已立项 10 / 开发中 50 / 测试中 80 / 已上线 100；已搁置/已取消保留原值

---

## 5. 数据流与状态管理

### 5.1 前端状态管理模式（Pub/Sub）

v0.0 用的 Pub/Sub 模式非常契合这个产品的规模，v1.0 继续保留：

```
UI 事件 → store action → 改 state → emit() → 所有 subscribers 重新 render
```

**state 字段分两组**：

| 类别 | 字段 | 说明 |
| --- | --- | --- |
| **业务数据**（远端真源，v1.0+ 从后端拉取） | requirements / dependencies / blockers / progressNotes / changes | |
| **UI 状态**（本地，存 localStorage） | view / filters / settings / drawerReqId / drawerTab / extractorOpen / chatOpen / ganttZoom / ganttFocusCritical | 刷新后保留视图位置 |

### 5.2 数据流演进（v0.0 → v1.0）

```
v0.0（已交付）：
  action() → 直接改 state → saveState(localStorage) → emit()

v1.0（规划）：
  action() → 乐观改 state + emit() （UI 立即响应）
          → POST /api/... → 返回后 reconcile
          → 失败时回滚 state + Toast 错误
```

**乐观更新策略**：
- CRUD 和进展记录：乐观（UI 先响应，失败回滚）
- 环检测 / 延期传导 / 关键路径：**严格**（等后端返回，这些涉及复杂逻辑，不能乐观）

### 5.3 store Actions 清单

函数签名保持 v0.0 不变，内部实现从 localStorage 切到 HTTP：

| 类别 | Action |
| --- | --- |
| 视图/UI | `setView` / `updateFilters` / `clearFilters` / `openDrawer` / `closeDrawer` / `setDrawerTab` / `openExtractor` / `closeExtractor` / `toggleChat` / `setGanttZoom` / `toggleCriticalPath` |
| 需求 CRUD | `addRequirement` / `updateRequirement` / `deleteRequirement` |
| 变更流水 | `addChange`（内部自动调用） |
| 进展 | `addProgressNote` / `deleteProgressNote` |
| 阻塞 | `addBlocker` / `resolveBlocker` |
| 依赖 | `addDependency` / `deleteDependency` |
| 派生查询 | `getRequirement` / `getActiveBlockersFor` / `getChangesFor` / `getNotesFor` / `getDependenciesFor` / `getFilteredRequirements` |
| 计算 | `computeCriticalPath` / `simulateDelayPropagation` |
| 导入导出 | `exportJson` / `exportCsv` / `importJson` / `resetData` |

### 5.4 离线/降级策略

- **后端不可达**：localStorage 缓存最近一次成功拉取的数据，前端进入只读模式（禁用所有写 action + 顶部黄色 banner "离线模式"）
- **LLM 未启用**：Extractor 和 Chat 显示"前端规则引擎"角标，内部走本地规则

---

## 6. API 契约

所有接口前缀 `/api`，JSON 请求响应，错误返回 `{detail: "..."}` + 4xx/5xx。

### 6.1 基础

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回 `{status, version, llm_enabled}` |
| GET | `/api/config` | 业务枚举配置（业务线/状态/优先级/进度模式/llm_enabled） |

### 6.2 需求 CRUD

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/requirements` | 列表（支持 business_line / owner / status / priority / search / has_blocker / offset / limit 过滤） |
| GET | `/api/requirements/{id}` | 详情 |
| POST | `/api/requirements` | 创建（自动生成 code） |
| PUT | `/api/requirements/{id}` | 更新（支持 _source / _source_ref / _reason 带来源） |
| DELETE | `/api/requirements/{id}` | 删除（级联） |
| GET | `/api/requirements/{id}/changes` | 变更历史 |

### 6.3 进展与阻塞

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/requirements/{id}/progress` | 某需求的进展时间线 |
| POST | `/api/requirements/{id}/progress` | 新增进展 note |
| DELETE | `/api/progress/{note_id}` | 删除进展 |
| GET | `/api/blockers` | 阻塞列表（支持 requirement_id / blocker_type / status / business_line 过滤） |
| POST | `/api/blockers` | 新建阻塞（自动写 blocker note） |
| PATCH | `/api/blockers/{id}/resolve` | 解除阻塞（自动写 unblock note） |

### 6.4 依赖与甘特

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/dependencies` | 所有依赖 |
| GET | `/api/requirements/{id}/dependencies?direction=upstream\|downstream` | 某需求的依赖 |
| POST | `/api/dependencies` | 新建依赖（含环检测，成环返回 400 + 环上节点） |
| DELETE | `/api/dependencies/{id}` | 删除依赖 |
| POST | `/api/gantt/propagate-delay` | 延期传导 dry-run |
| GET | `/api/gantt/critical-path` | 关键路径 |

### 6.5 Agent

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/agent/extract` | 抽取纪要，返回 `{enabled, actions[]}`；LLM 未启用时 `enabled: false`，前端切规则引擎 |
| POST | `/api/agent/ask` | 问答，**SSE 流式**，事件 `message` + `done` + `error` |

### 6.6 SSE 事件格式

```
event: message
data: {"content": "部分文本"}

event: message
data: {"content": "更多文本"}

event: done
data: {"status": "ok"}
```

错误：

```
event: error
data: {"error": "错误描述"}
```

---

## 7. 非功能设计

### 7.1 性能预算

| 场景 | 目标 |
| --- | --- |
| 首屏 | < 1s（100 条需求下） |
| 视图切换 | < 300ms |
| 筛选响应 | < 200ms（防抖后） |
| 甘特图首屏 | < 1s（200 条需求） |
| 延期传导 dry-run | < 200ms |
| Agent 抽取 | < 15s（300-800 字纪要） |
| Agent 问答首字 | < 2s（SSE） |

### 7.2 可访问性

- 键盘快捷键：ESC 关闭 Drawer/Modal；Enter 发送输入框
- 所有 icon 按钮带 aria-label
- 对比度：遵循 WCAG AA（文字/背景 ≥ 4.5:1）
- 拖拽保留键盘替代方案（详情 tab 状态下拉）

### 7.3 国际化准备

MVP 只做中文，但：
- 业务线/状态/优先级等枚举统一从 `/api/config` 拉取，不硬编码
- UI 文案集中在 `src/i18n/zh.js`（v0.3 抽取），未来加 en.js 即可
- 日期统一 ISO 8601，时区 UTC+8 固定（个人使用不做多时区）

### 7.4 错误边界

| 故障 | 降级方式 |
| --- | --- |
| 后端宕机 | localStorage 只读模式 + 顶部 banner |
| LLM 未配置 | Extractor/Chat 切前端规则引擎 |
| LLM 超时 | 30s 后提示"超时，请重试"，原文保留 |
| LLM 返回非 JSON | Extractor 返回 `parse_error: true` + 原文塞回 textarea |
| SQLite 损坏 | 自动恢复最近一次 `.workbuddy/backup/YYYY-MM-DD.db` |

---

## 8. 组件拆解（前端代码组织）

```
src/
├─ main.js              # 入口，render + subscribe 绑定
├─ store/
│   └─ store.js         # 所有 state + actions + 派生查询
├─ api/
│   ├─ client.js        # fetch 封装（v1.0 新增）
│   ├─ requirements.js  # 需求/进展/阻塞/依赖 API
│   └─ agent.js         # Extract/Ask + SSE 解析
├─ data/
│   └─ mockData.js      # v0.0 演示模式的初始数据（v1.0 后端空库时 seed 用）
├─ components/
│   ├─ Header.js        # 顶栏
│   ├─ Sidebar.js       # 左侧筛选栏
│   ├─ Drawer.js        # 详情抽屉
│   ├─ Modal.js         # 通用模态框
│   ├─ Chat.js          # Agent 问答浮条
│   └─ Extractor.js     # 粘贴纪要弹窗
├─ views/
│   ├─ KanbanView.js
│   ├─ TableView.js
│   └─ GanttView.js
└─ utils/
    └─ helpers.js       # uuid / formatDate / escape / toast / 相似度 ...
```

**原则**：
- components 只做视图渲染 + 事件绑定，**不含业务逻辑**
- 业务逻辑集中在 store/store.js
- API 调用集中在 api/，不让 components 直接 fetch

---

## 9. 架构决策记录（ADR）

### ADR-001：不用 React/Vue/框架
- **选择**：原生 JS + ES Modules + Pub/Sub
- **理由**：v0.0 证明单文件 13 个模块足够、零构建、依赖 = 浏览器自带
- **风险**：规模失控时 UI 复杂度上升
- **应对**：v2.0 多人协作版再评估引入

### ADR-002：不用 LangChain
- **选择**：直调 OpenAI SDK + 自研 LLMClient 薄封装
- **理由**：ReqBoard 只有"单轮抽取"和"RAG 问答 + 工具调用"两条 pipeline，LangChain 抽象过度
- **风险**：未来多步 Agent 需要重写编排
- **应对**：需要时引入 LangGraph（非 LangChain），抽象更薄

### ADR-003：MVP 不用 LlamaIndex
- **选择**：v1.0 SQL 直查够用
- **理由**：需求量 < 200 条时，后端直接 `SELECT` 配合前端计算，性能远超 RAG 检索
- **触发引入条件**：v1.2+ 加入会议纪要归档索引时

### ADR-004：SQLite 单文件存储
- **选择**：SQLite + aiosqlite
- **理由**：MVP 单用户，零部署；备份只需复制一个 .db 文件
- **触发换 PG 条件**：v1.1 协作版 + 3 人以上并发写

### ADR-005：前端数据源：localStorage → 后端 API
- **v0.0**：localStorage 真源（离线可用，演示场景）
- **v1.0**：后端 API 真源；localStorage 只缓存 UI 状态（view / filters / settings）
- **过渡策略**：store.js 函数签名保持不变，内部实现切换

### ADR-006：Agent 产出提案不自动写库
- **选择**：Extractor 永远产出"拟执行清单"，用户勾选确认后才写
- **理由**：LLM 抽取会漏"讨论但未决议"的内容；需求变更是严肃操作，自动改会出事故
- **权衡**：牺牲少量自动化，换回用户信任

### ADR-007：甘特图自研（不用 dhtmlx-gantt）
- **v1.3 原决定**：MVP 首选 dhtmlx-gantt
- **v1.4 改为自研**：v0.0 的 `GanttView.js`（384 行）已经实现了时间线/依赖线/关键路径/Blocker 高亮/CPM，且体验更贴合产品需求
- **理由**：自研的代码量在可控范围（< 500 行），避免 GPL 协议传染风险 + 样式 100% 可控
- **不做**：拖拽调整时间（v0.8 再加）

### ADR-008：进度模式双轨（手动 vs 状态映射）
- **选择**：设置页让用户选，默认手动
- **理由**：小团队 PM 喜欢手动填精确值；新手或演示场景用状态映射省事
- **实现**：`settings.progressMode` 切换，不做强制

---

## 10. 演进路线（阶段性目标）

| 阶段 | 前端 | 后端 | 数据源 | LLM |
| --- | --- | --- | --- | --- |
| v0.0 ✅ | 原生 JS + Tailwind CDN | 无 | localStorage | 前端规则引擎 |
| v0.1 🚧 | 无改动（UI 不变） | FastAPI + SQLModel + 6 张表 | SQLite | 规则引擎 |
| v0.3 | store 切后端 API | JSON 导入导出 | SQLite | 规则引擎 |
| v0.5 | Extractor/Chat 改调后端 | LLM 代理 /api/agent/* | SQLite | OpenAI/DeepSeek |
| v0.7 | 进展模块联调 | 进展/阻塞/依赖联动落库 | SQLite | LLM 真实抽取 |
| v0.8 | 甘特图拖拽交互 | 延期传导真实联动 | SQLite | + 工具调用 |
| v1.0 MVP 🎯 | 全功能 | 全 API | SQLite | + RAG 问答 |
| v1.1 | TAPD 推送按钮 + 企微日报配置 | MCP 客户端 | SQLite | 加索引层（LlamaIndex） |
| v1.2 | 腾讯会议纪要导入 UI | 纪要归档 API | + Chroma 向量库 | + 纪要索引 |
| v2.0 | 协作版（多人） | + JWT + 权限 | + Postgres | + 知识中台 |

---

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v1.0 | 2026-04-24 | 初稿，基于 PRD v1.4 + v0.0 前端演示版的实际实现 |
