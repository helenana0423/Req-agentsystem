// src/store/store.js
// 核心状态管理
// v0.1+：后端为真源 + 前端乐观更新；后端不可达时退化为 v0.0 的 localStorage 模式

import {
  initialRequirements, initialDependencies, initialBlockers,
  initialProgressNotes, initialChanges,
} from '../data/mockData.js';
import { uuid, nowIso, addDays } from '../utils/helpers.js';
import { probeBackend } from '../api/client.js';

// 失败提示（失败回滚后调）
function notifyError(msg) {
  try {
    // 动态导入避免循环依赖
    import('../utils/helpers.js').then(({ toast }) => toast(msg, 'error', 3500));
  } catch {}
}

// 生成下一个 REQ 编号（仅乐观更新/离线模式用，在线模式后端会覆盖）
function generateNextCode() {
  const year = new Date().getFullYear();
  const nums = state.requirements
    .map(r => r.code && r.code.match(new RegExp(`REQ-${year}-(\\d+)`)))
    .filter(Boolean)
    .map(m => parseInt(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `REQ-${year}-${String(next).padStart(4, '0')}`;
}
import {
  fetchConfig,
  fetchRequirements, createRequirement as apiCreateReq,
  updateRequirementApi, deleteRequirementApi, fetchChanges,
  fetchProgressNotes, createProgressNote as apiCreateNote, deleteProgressNoteApi,
  fetchBlockers, createBlockerApi, resolveBlockerApi,
  fetchDependencies, createDependencyApi, deleteDependencyApi,
  propagateDelayApi, fetchCriticalPath,
} from '../api/requirements.js';

// v2 提升版本号：业务线从"海外游戏等"改为 5 款游戏，老缓存里的业务线值不在新枚举里会导致筛选异常，抛弃老数据
const STORAGE_KEY = 'reqboard_v2_state';
const OLD_STORAGE_KEYS = ['reqboard_v1_state'];

// 清理老版本缓存（一次性）
try {
  OLD_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
} catch {}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('loadState failed', e);
    return null;
  }
}

function saveState(state) {
  try {
    // v1.0: 只缓存 UI 状态 + 离线模式的业务数据
    const payload = {
      filters: state.filters,
      view: state.view,
      settings: state.settings,
    };
    // 离线模式下也缓存业务数据，以便下次打开仍能用
    if (state.mode === 'offline') {
      payload.requirements = state.requirements;
      payload.dependencies = state.dependencies;
      payload.blockers = state.blockers;
      payload.progressNotes = state.progressNotes;
      payload.changes = state.changes;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('saveState failed', e);
  }
}

function freshMockData() {
  return {
    requirements: JSON.parse(JSON.stringify(initialRequirements)),
    dependencies: JSON.parse(JSON.stringify(initialDependencies)),
    blockers: JSON.parse(JSON.stringify(initialBlockers)),
    progressNotes: JSON.parse(JSON.stringify(initialProgressNotes)),
    changes: JSON.parse(JSON.stringify(initialChanges)),
  };
}

const persisted = loadState();

export const state = {
  // 业务数据（online 时从后端拉；offline 时从 localStorage 或 mock 读）
  requirements: persisted?.requirements || [],
  dependencies: persisted?.dependencies || [],
  blockers: persisted?.blockers || [],
  progressNotes: persisted?.progressNotes || [],
  changes: persisted?.changes || [],

  // 视图/UI 状态
  view: persisted?.view || 'kanban',
  filters: persisted?.filters || {
    keyword: '',
    business_lines: [],
    owners: [],
    statuses: [],
    priorities: [],
    tags: [],
    onlyBlocked: false,
  },
  settings: persisted?.settings
    ? (() => {
        // 兼容老缓存：把旧默认用户"王晓琳"迁移到 Helena
        const s = persisted.settings;
        if (s.currentUser === '王晓琳') s.currentUser = 'Helena';
        return s;
      })()
    : {
    progressMode: 'manual',
    autoBlockerFromDep: false,
    autoDelayPropagate: false,
    currentUser: 'Helena',
  },

  // 运行时
  drawerReqId: null,
  drawerTab: 'timeline',
  extractorOpen: false,
  chatOpen: false,
  ganttZoom: 'day', // day | week | month（默认精确到日）
  ganttFocusCritical: false,

  // v1.0 新增：模式 + 后端配置
  mode: 'loading',     // loading | online | offline
  llmEnabled: false,   // 后端 LLM 是否已配 Key
  backendConfig: null, // 从 /api/config 拉的枚举配置
};

// ===== 订阅 =====
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit() {
  saveState(state);
  listeners.forEach(fn => fn(state));
}

// ===== 初始化 =====

/**
 * 启动时调：探测后端，拉数据，决定 online/offline 模式
 */
export async function bootstrap() {
  state.mode = 'loading';
  emit();

  const probe = await probeBackend();
  if (!probe.ok) {
    // 进入离线模式：用 localStorage 或 mock 数据
    console.warn('[ReqBoard] 后端不可达，进入离线模式（数据仅保存在 localStorage）');
    state.mode = 'offline';
    state.llmEnabled = false;
    if (!persisted?.requirements || persisted.requirements.length === 0) {
      Object.assign(state, freshMockData());
    }
    emit();
    return;
  }

  state.mode = 'online';
  state.llmEnabled = !!probe.llm_enabled;

  try {
    // 并发拉配置 + 4 个业务实体
    const [config, reqs, blockers, deps] = await Promise.all([
      fetchConfig(),
      fetchRequirements({ limit: 500 }),
      fetchBlockers(),
      fetchDependencies(),
    ]);

    state.backendConfig = config;
    state.llmEnabled = !!config.llm_enabled;

    state.requirements = (reqs.items || []).map(normalizeRequirement);
    state.blockers = (blockers.items || []).map(normalizeBlocker);
    state.dependencies = deps.items || [];

    // 首次启动若后端空库 → 用 mock 数据 seed（便于立即演示）
    if (state.requirements.length === 0) {
      console.log('[ReqBoard] 后端空库，使用 mock 数据作为演示种子（仅前端显示，不写后端）');
      Object.assign(state, freshMockData());
      state.mode = 'online-seed';  // 特殊模式：UI 是后端连通的，但数据是前端 mock
    } else {
      // 已有业务数据，逐条拉 progress + changes（避免首屏太慢，只拉前 20 条）
      const topReqs = state.requirements.slice(0, 20);
      const results = await Promise.all(topReqs.map(r =>
        Promise.all([fetchProgressNotes(r.id), fetchChanges(r.id)])
          .then(([p, c]) => ({ reqId: r.id, notes: p.items || [], changes: c.items || [] }))
          .catch(() => ({ reqId: r.id, notes: [], changes: [] }))
      ));
      state.progressNotes = results.flatMap(r => r.notes);
      state.changes = results.flatMap(r => r.changes);
    }

    emit();
  } catch (e) {
    console.error('[ReqBoard] 拉取后端数据失败:', e);
    state.mode = 'offline';
    if (!persisted?.requirements?.length) Object.assign(state, freshMockData());
    emit();
  }
}

// 字段格式规整（后端返回 snake_case 日期字符串，前端已经兼容）
function normalizeRequirement(r) {
  return {
    ...r,
    tags: typeof r.tags === 'string' ? (() => {
      try { return JSON.parse(r.tags); } catch { return r.tags.split(/\s+/).filter(Boolean); }
    })() : (r.tags || []),
  };
}

function normalizeBlocker(b) {
  return { ...b };
}

// 懒加载某条需求的进展 + 变更历史（Drawer 打开时调）
export async function ensureRequirementDetails(requirementId) {
  if (state.mode === 'offline' || state.mode === 'online-seed') return;

  const hasNotes = state.progressNotes.some(n => n.requirement_id === requirementId);
  const hasChanges = state.changes.some(c => c.requirement_id === requirementId);
  if (hasNotes && hasChanges) return;

  try {
    const [p, c] = await Promise.all([
      fetchProgressNotes(requirementId),
      fetchChanges(requirementId),
    ]);
    // 去重追加
    const existingNoteIds = new Set(state.progressNotes.map(n => n.id));
    const existingChangeIds = new Set(state.changes.map(c => c.id));
    state.progressNotes.push(...(p.items || []).filter(n => !existingNoteIds.has(n.id)));
    state.changes.push(...(c.items || []).filter(c => !existingChangeIds.has(c.id)));
    emit();
  } catch (e) {
    console.warn('[ReqBoard] ensureRequirementDetails 失败', e);
  }
}

// ===== UI Actions =====
export function setView(v) { state.view = v; emit(); }
export function updateFilters(patch) { state.filters = { ...state.filters, ...patch }; emit(); }
export function clearFilters() {
  state.filters = {
    keyword: '', business_lines: [], owners: [], statuses: [],
    priorities: [], tags: [], onlyBlocked: false,
  };
  emit();
}

export function openDrawer(reqId, tab = 'timeline') {
  state.drawerReqId = reqId;
  state.drawerTab = tab;
  emit();
  // 懒加载详情
  ensureRequirementDetails(reqId);
}
export function closeDrawer() { state.drawerReqId = null; emit(); }
export function setDrawerTab(tab) { state.drawerTab = tab; emit(); }

export function openExtractor() { state.extractorOpen = true; emit(); }
export function closeExtractor() { state.extractorOpen = false; emit(); }
export function toggleChat() { state.chatOpen = !state.chatOpen; emit(); }

export function setGanttZoom(z) { state.ganttZoom = z; emit(); }
export function toggleCriticalPath() { state.ganttFocusCritical = !state.ganttFocusCritical; emit(); }

// ===== 辅助：后端可用性判断 =====
function isOnline() {
  return state.mode === 'online';
}

// ===== 需求 CRUD（乐观更新）=====

export async function addRequirement(req) {
  const tempId = uuid();
  const tempCode = req.code || generateNextCode();
  const optimistic = {
    id: tempId,
    code: tempCode,
    title: req.title,
    business_line: req.business_line || '其他',
    owner: req.owner || state.settings.currentUser,
    dev_owner: req.dev_owner || '',
    status: req.status || '待评审',
    priority: req.priority || 'P2',
    description: req.description || '',
    scope: req.scope || '',
    source: req.source || '',
    tags: req.tags || [],
    planned_start: req.planned_start || null,
    planned_end: req.planned_end || null,
    expected_release: req.expected_release || req.planned_end || null,
    actual_start: req.actual_start || null,
    actual_release: req.actual_release || null,
    progress: req.progress ?? 0,
    estimated_days: req.estimated_days ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    active_blocker_count: 0,
  };

  // 乐观更新
  state.requirements.unshift(optimistic);
  emit();

  // 离线模式：直接本地写
  if (!isOnline()) {
    addChange({
      requirement_id: tempId, change_type: 'create',
      reason: '手动创建', source: req._source || 'manual',
      source_ref: req._source_ref || null,
      operator: state.settings.currentUser,
    });
    return optimistic;
  }

  // 在线模式：调后端
  try {
    const saved = await apiCreateReq({
      ...req,
      _source: req._source || 'manual',
      _source_ref: req._source_ref,
      operator: state.settings.currentUser,
    });
    // 用后端返回的替换乐观数据
    const idx = state.requirements.findIndex(r => r.id === tempId);
    if (idx >= 0) state.requirements[idx] = normalizeRequirement(saved);
    emit();
    return saved;
  } catch (e) {
    // 失败回滚
    state.requirements = state.requirements.filter(r => r.id !== tempId);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

export async function updateRequirement(id, patch, opts = {}) {
  const req = state.requirements.find(r => r.id === id);
  if (!req) return null;

  // 记录变更流水（本地）
  const source = opts.source || 'manual';
  const source_ref = opts.source_ref || null;
  const reason = opts.reason || '';

  const optimisticPatch = {};
  Object.keys(patch).forEach(key => {
    if (key === 'id' || key === 'created_at') return;
    if (req[key] !== patch[key]) {
      const old = req[key];
      const neu = patch[key];
      const changeType = key === 'status' ? 'status_change' : (key === 'scope' ? 'scope_adjust' : 'update');
      addChange({
        requirement_id: id, change_type: changeType,
        field: key, old_value: String(old ?? ''), new_value: String(neu ?? ''),
        reason, source, source_ref,
        operator: state.settings.currentUser,
      });
      optimisticPatch[key] = neu;
    }
  });

  // 快照用于失败回滚
  const snapshot = { ...req };

  // 乐观更新
  Object.assign(req, optimisticPatch);
  req.updated_at = nowIso();

  // 联动：status → 已上线 时自动解除相关 blocker
  if (patch.status === '已上线') {
    state.blockers.forEach(b => {
      if (b.status === 'active' && b.linked_requirement_id === id) {
        b.status = 'resolved';
        b.resolved_at = nowIso();
        b.resolved_note = `前置需求 ${req.code} 已上线，自动解除`;
        addProgressNoteLocal({
          requirement_id: b.requirement_id, note_type: 'unblock',
          content: `前置需求 ${req.code} 已完成，阻塞自动解除`,
          author: 'System',
        });
      }
    });
  }
  emit();

  if (!isOnline()) return req;

  // 在线模式：调后端
  try {
    const saved = await updateRequirementApi(id, {
      ...patch,
      _source: source,
      _source_ref: source_ref,
      _reason: reason,
      operator: state.settings.currentUser,
    });
    Object.assign(req, normalizeRequirement(saved));
    emit();
    return req;
  } catch (e) {
    // 失败回滚
    Object.assign(req, snapshot);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

export async function deleteRequirement(id) {
  const snapshotReq = state.requirements.find(r => r.id === id);
  const snapshot = {
    req: snapshotReq,
    deps: state.dependencies.filter(d => d.from_id === id || d.to_id === id),
    blockers: state.blockers.filter(b => b.requirement_id === id),
    notes: state.progressNotes.filter(p => p.requirement_id === id),
  };

  state.requirements = state.requirements.filter(r => r.id !== id);
  state.dependencies = state.dependencies.filter(d => d.from_id !== id && d.to_id !== id);
  state.blockers = state.blockers.filter(b => b.requirement_id !== id);
  state.progressNotes = state.progressNotes.filter(p => p.requirement_id !== id);
  emit();

  if (!isOnline()) return;

  try {
    await deleteRequirementApi(id);
  } catch (e) {
    // 回滚
    if (snapshot.req) state.requirements.push(snapshot.req);
    state.dependencies.push(...snapshot.deps);
    state.blockers.push(...snapshot.blockers);
    state.progressNotes.push(...snapshot.notes);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

// ===== 变更流水 =====
export function addChange(c) {
  state.changes.push({
    id: uuid(),
    requirement_id: c.requirement_id,
    change_type: c.change_type,
    field: c.field || null,
    old_value: c.old_value ?? null,
    new_value: c.new_value ?? null,
    reason: c.reason || '',
    source: c.source || 'manual',
    source_ref: c.source_ref || null,
    operator: c.operator || state.settings.currentUser,
    created_at: nowIso(),
  });
}

// ===== 进展 Note =====

/** 仅本地写（联动用，不调 API） */
function addProgressNoteLocal(n) {
  const note = {
    id: uuid(),
    requirement_id: n.requirement_id,
    note_type: n.note_type || 'progress',
    content: n.content || '',
    author: n.author || state.settings.currentUser,
    source: n.source || 'manual',
    source_ref: n.source_ref || null,
    linked_requirement_ids: n.linked_requirement_ids || [],
    linked_users: n.linked_users || [],
    created_at: nowIso(),
  };
  state.progressNotes.push(note);
  return note;
}

export async function addProgressNote(n) {
  const note = addProgressNoteLocal(n);
  emit();

  if (!isOnline()) return note;

  try {
    const saved = await apiCreateNote(n.requirement_id, {
      note_type: note.note_type,
      content: note.content,
      author: note.author,
      source: note.source,
      source_ref: note.source_ref,
    });
    // 用后端 ID 替换
    const idx = state.progressNotes.findIndex(x => x.id === note.id);
    if (idx >= 0) state.progressNotes[idx] = saved;
    emit();
    return saved;
  } catch (e) {
    state.progressNotes = state.progressNotes.filter(x => x.id !== note.id);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

export async function deleteProgressNote(id) {
  const snapshot = state.progressNotes.find(n => n.id === id);
  state.progressNotes = state.progressNotes.filter(n => n.id !== id);
  emit();

  if (!isOnline()) return;

  try {
    await deleteProgressNoteApi(id);
  } catch (e) {
    if (snapshot) state.progressNotes.push(snapshot);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

// ===== Blocker =====

export async function addBlocker(b) {
  const tempId = uuid();
  const blk = {
    id: tempId,
    requirement_id: b.requirement_id,
    blocker_type: b.blocker_type || 'other',
    description: b.description || '',
    blocking_person: b.blocking_person || null,
    blocking_team: b.blocking_team || null,
    linked_requirement_id: b.linked_requirement_id || null,
    expected_resolve_date: b.expected_resolve_date || null,
    status: 'active',
    created_at: nowIso(),
    resolved_at: null,
    resolved_note: null,
  };
  state.blockers.push(blk);
  // 同步写一条 blocker note
  addProgressNoteLocal({
    requirement_id: b.requirement_id, note_type: 'blocker',
    content: `【${blk.blocker_type}】${b.description}`,
    author: state.settings.currentUser,
  });
  emit();

  if (!isOnline()) return blk;

  try {
    const saved = await createBlockerApi(b);
    const idx = state.blockers.findIndex(x => x.id === tempId);
    if (idx >= 0) state.blockers[idx] = saved;
    emit();
    return saved;
  } catch (e) {
    state.blockers = state.blockers.filter(x => x.id !== tempId);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

export async function resolveBlocker(id, resolvedNote = '') {
  const blk = state.blockers.find(b => b.id === id);
  if (!blk) return;
  const snapshot = { ...blk };

  blk.status = 'resolved';
  blk.resolved_at = nowIso();
  blk.resolved_note = resolvedNote;
  addProgressNoteLocal({
    requirement_id: blk.requirement_id, note_type: 'unblock',
    content: `阻塞已解除：${blk.description}${resolvedNote ? ' - ' + resolvedNote : ''}`,
    author: state.settings.currentUser,
  });
  emit();

  if (!isOnline()) return;

  try {
    await resolveBlockerApi(id, resolvedNote);
  } catch (e) {
    Object.assign(blk, snapshot);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

// ===== 依赖 =====

export async function addDependency(dep) {
  if (dep.from_id === dep.to_id) return { ok: false, error: '不能自依赖' };
  const exists = state.dependencies.find(d => d.from_id === dep.from_id && d.to_id === dep.to_id);
  if (exists) return { ok: false, error: '依赖已存在' };

  // 本地环检测（先快速拒绝，后端还会再检测一次）
  const cycle = detectCycle(state.dependencies.concat([dep]));
  if (cycle) return { ok: false, error: `检测到环：${cycle.join(' → ')}` };

  const tempId = uuid();
  const optimistic = {
    id: tempId,
    from_id: dep.from_id, to_id: dep.to_id,
    dep_type: dep.dep_type || 'FS',
    lag_days: dep.lag_days || 0,
    note: dep.note || '',
    created_by: state.settings.currentUser,
    created_at: nowIso(),
  };
  state.dependencies.push(optimistic);
  emit();

  if (!isOnline()) return { ok: true };

  try {
    const saved = await createDependencyApi({
      from_id: dep.from_id,
      to_id: dep.to_id,
      dep_type: dep.dep_type || 'FS',
      lag_days: dep.lag_days || 0,
      note: dep.note || '',
      created_by: state.settings.currentUser,
    });
    const idx = state.dependencies.findIndex(d => d.id === tempId);
    if (idx >= 0) state.dependencies[idx] = saved;
    emit();
    return { ok: true };
  } catch (e) {
    state.dependencies = state.dependencies.filter(d => d.id !== tempId);
    emit();
    return { ok: false, error: e.message || '创建失败' };
  }
}

export async function deleteDependency(id) {
  const snapshot = state.dependencies.find(d => d.id === id);
  state.dependencies = state.dependencies.filter(d => d.id !== id);
  emit();

  if (!isOnline()) return;
  try {
    await deleteDependencyApi(id);
  } catch (e) {
    if (snapshot) state.dependencies.push(snapshot);
    emit();
    notifyError(`操作失败：${e.message || e}`);
  }
}

function detectCycle(deps) {
  const adj = new Map();
  deps.forEach(d => {
    if (!adj.has(d.from_id)) adj.set(d.from_id, []);
    adj.get(d.from_id).push(d.to_id);
  });
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  function dfs(node) {
    if (visiting.has(node)) {
      const idx = path.indexOf(node);
      return path.slice(idx).concat(node);
    }
    if (visited.has(node)) return null;
    visiting.add(node); path.push(node);
    const nexts = adj.get(node) || [];
    for (const n of nexts) {
      const c = dfs(n);
      if (c) return c;
    }
    visiting.delete(node); visited.add(node); path.pop();
    return null;
  }
  for (const node of adj.keys()) {
    const c = dfs(node);
    if (c) return c.map(id => {
      const r = (state.requirements.find(r => r.id === id) || {});
      return r.code || id;
    });
  }
  return null;
}

// ===== 重置 =====
export function resetData() {
  const fresh = freshMockData();
  Object.assign(state, fresh);
  state.mode = 'offline'; // 重置后切到离线（避免和后端错位）
  emit();
}

// ===== 派生查询 =====
export function getRequirement(id) { return state.requirements.find(r => r.id === id); }
export function getActiveBlockersFor(reqId) { return state.blockers.filter(b => b.requirement_id === reqId && b.status === 'active'); }
export function getChangesFor(reqId) {
  return state.changes
    .filter(c => c.requirement_id === reqId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
export function getNotesFor(reqId) {
  return state.progressNotes
    .filter(n => n.requirement_id === reqId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
export function getDependenciesFor(reqId) {
  return {
    upstream: state.dependencies.filter(d => d.to_id === reqId),
    downstream: state.dependencies.filter(d => d.from_id === reqId),
  };
}

export function getFilteredRequirements() {
  const f = state.filters;
  const kw = (f.keyword || '').toLowerCase().trim();
  return state.requirements.filter(r => {
    if (kw) {
      const hay = [r.code, r.title, r.description, r.owner, r.dev_owner, ...(r.tags || [])].join(' ').toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (f.business_lines.length && !f.business_lines.includes(r.business_line)) return false;
    if (f.owners.length && !f.owners.includes(r.owner)) return false;
    if (f.statuses.length && !f.statuses.includes(r.status)) return false;
    if (f.priorities.length && !f.priorities.includes(r.priority)) return false;
    if (f.tags.length && !(r.tags || []).some(t => f.tags.includes(t))) return false;
    if (f.onlyBlocked) {
      const has = state.blockers.some(b => b.requirement_id === r.id && b.status === 'active');
      if (!has) return false;
    }
    return true;
  });
}

// ===== 关键路径 CPM（本地计算，快，不调后端）=====
export function computeCriticalPath() {
  const reqs = state.requirements.filter(r => r.planned_start && r.planned_end && r.status !== '已取消' && r.status !== '已搁置');
  const adj = new Map();
  const rev = new Map();
  reqs.forEach(r => { adj.set(r.id, []); rev.set(r.id, []); });
  state.dependencies.forEach(d => {
    if (adj.has(d.from_id) && adj.has(d.to_id)) {
      adj.get(d.from_id).push({ to: d.to_id, lag: d.lag_days || 0 });
      rev.get(d.to_id).push({ from: d.from_id, lag: d.lag_days || 0 });
    }
  });
  const inDeg = new Map();
  reqs.forEach(r => inDeg.set(r.id, rev.get(r.id).length));
  const order = [];
  const q = reqs.filter(r => inDeg.get(r.id) === 0).map(r => r.id);
  while (q.length) {
    const id = q.shift();
    order.push(id);
    (adj.get(id) || []).forEach(e => {
      inDeg.set(e.to, inDeg.get(e.to) - 1);
      if (inDeg.get(e.to) === 0) q.push(e.to);
    });
  }
  const ef = new Map();
  reqs.forEach(r => ef.set(r.id, new Date(r.planned_end).getTime()));
  let projectEnd = 0;
  ef.forEach(v => { if (v > projectEnd) projectEnd = v; });
  const lf = new Map();
  [...order].reverse().forEach(id => {
    const r = state.requirements.find(x => x.id === id);
    const downs = adj.get(id) || [];
    if (!downs.length) {
      lf.set(id, new Date(r.planned_end).getTime());
    } else {
      let minLS = Infinity;
      downs.forEach(e => {
        const down = state.requirements.find(x => x.id === e.to);
        const downLS = (lf.get(e.to) ?? new Date(down.planned_end).getTime()) - (new Date(down.planned_end) - new Date(down.planned_start));
        const candidate = downLS - e.lag * 86400000;
        if (candidate < minLS) minLS = candidate;
      });
      lf.set(id, Math.min(minLS, projectEnd));
    }
  });
  const critical = new Set();
  reqs.forEach(r => {
    const slack = (lf.get(r.id) - ef.get(r.id)) / 86400000;
    if (slack <= 0.5) critical.add(r.id);
  });
  return critical;
}

// ===== 延期传导（本地 BFS dry-run）=====
export function simulateDelayPropagation(reqId, newEndIso) {
  const req = state.requirements.find(r => r.id === reqId);
  if (!req || !req.planned_end) return [];
  const affected = [];
  const newEnd = new Date(newEndIso);
  const delta = Math.ceil((newEnd - new Date(req.planned_end)) / 86400000);
  if (delta <= 0) return [];
  const queue = [{ id: reqId, pushDays: delta }];
  const pushed = new Map();
  pushed.set(reqId, delta);
  while (queue.length) {
    const cur = queue.shift();
    const downstreams = state.dependencies.filter(d => d.from_id === cur.id);
    downstreams.forEach(d => {
      const down = state.requirements.find(r => r.id === d.to_id);
      if (!down) return;
      const pushDays = cur.pushDays;
      const existing = pushed.get(d.to_id) || 0;
      if (pushDays > existing) {
        pushed.set(d.to_id, pushDays);
        queue.push({ id: d.to_id, pushDays });
        affected.push({
          requirementId: d.to_id,
          code: down.code, title: down.title,
          oldEnd: down.planned_end,
          newEnd: addDays(down.planned_end, pushDays),
          pushDays,
        });
      }
    });
  }
  return affected;
}

// ===== 导入导出 =====
export function exportJson() {
  return JSON.stringify({
    requirements: state.requirements,
    dependencies: state.dependencies,
    blockers: state.blockers,
    progressNotes: state.progressNotes,
    changes: state.changes,
    exportedAt: nowIso(),
  }, null, 2);
}

export function importJson(obj) {
  if (obj.requirements) state.requirements = obj.requirements;
  if (obj.dependencies) state.dependencies = obj.dependencies;
  if (obj.blockers) state.blockers = obj.blockers;
  if (obj.progressNotes) state.progressNotes = obj.progressNotes;
  if (obj.changes) state.changes = obj.changes;
  state.mode = 'offline'; // 导入后切离线（不同步到后端，避免误覆盖）
  emit();
}

export function exportCsv() {
  const headers = ['code', 'title', 'business_line', 'owner', 'dev_owner', 'status', 'priority', 'planned_start', 'planned_end', 'progress', 'tags'];
  const rows = state.requirements.map(r => headers.map(h => {
    let v = r[h];
    if (Array.isArray(v)) v = v.join('|');
    if (v == null) v = '';
    v = String(v).replace(/"/g, '""');
    return `"${v}"`;
  }).join(','));
  return [headers.join(','), ...rows].join('\n');
}
