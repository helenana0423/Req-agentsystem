// src/components/Extractor.js
// Agent 粘贴纪要抽取面板

import {
  state, closeExtractor, addRequirement, updateRequirement,
  addProgressNote, addBlocker, resolveBlocker,
} from '../store/store.js';
import { escapeHtml, nextReqCode, toast, similarity } from '../utils/helpers.js';
import { businessLines, statuses, priorities, blockerTypes } from '../data/mockData.js';

let extractedActions = []; // 运行时缓存
let rawText = '';

const SAMPLES = [
  `2026-04-23 PUBG Mobile 业务线周会纪要

1. REQ-2026-0042 海外合规改造：脱敏SDK 接口联调完成，今天进入灰度。
2. REQ-42 目前卡在法务张三的跨境合规确认，预计周五前能回复。
3. 评审结论：本期去掉海外白名单功能，移到 v1.1。对应 scope 需要更新。
4. REQ-2026-0043 推送服务海外节点：依赖 REQ-42 脱敏SDK 发布后启动，目前还在等。
5. 新需求：PUBG Mobile 夏日节活动投放链路需要做全链路验证，预计 5 月底启动。对接人：Helena。业务线：PUBG Mobile。P1。
6. REQ-2026-0044 Honor of Kings 批量活动配置：测试第一轮发现 3 个 bug 已修复，今日二次提测。
7. 风险：若法务本周未确认，REQ-43/45 都会被推迟一周以上。`,

  `【产品-开发同步】2026-04-22

REQ-2026-0047 Honor of Kings 防沉迷升级：认证服务上线预发，今天开始客户端联调。进度 55% → 60%。
REQ-2026-0049 充值补单优化：卡在 SRE，支付网关灰度不稳定。建议升级 P0 优先处理。
REQ-2026-0050 Nikke 卡池埋点规范化：立项评审通过，下周开发接入。
决议：GunStar AI NPC 多轮对话 (REQ-52) 因 Q2 LLM 成本冲突，正式搁置至 Q3。`,
];

export function renderExtractor(root) {
  if (!state.extractorOpen) { root.innerHTML = ''; return; }

  root.innerHTML = `
    <div class="fixed inset-0 bg-black/40 z-[80] flex items-center justify-center p-4 drawer-backdrop">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden drawer-panel">
        <!-- Header -->
        <div class="flex-shrink-0 px-5 py-3 border-b flex items-center justify-between bg-gradient-to-r from-brand-50 to-white">
          <div class="flex items-center gap-2">
            <span class="text-xl">✨</span>
            <div>
              <h3 class="text-base font-semibold text-gray-900">粘贴纪要 · Agent 自动抽取</h3>
              <p class="text-[11px] text-gray-500">Agent 只产出提案，不会自动写库 · 所有操作需要你逐项确认</p>
            </div>
          </div>
          <button id="extractor-close"
            class="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors text-xl leading-none"
            title="关闭（ESC）"
            aria-label="关闭">
            ×
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-hidden flex">
          <!-- 左：输入 -->
          <div class="w-1/2 flex flex-col border-r">
            <div class="flex-shrink-0 px-4 pt-3 pb-2">
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-medium text-gray-700">📋 粘贴会议纪要 / 群聊片段</label>
                <div class="flex gap-1">
                  <button data-sample="0" class="sample-btn text-[10px] px-2 py-0.5 border border-brand-200 text-brand-700 hover:bg-brand-50 rounded">示例1</button>
                  <button data-sample="1" class="sample-btn text-[10px] px-2 py-0.5 border border-brand-200 text-brand-700 hover:bg-brand-50 rounded">示例2</button>
                </div>
              </div>
            </div>
            <textarea id="extract-input" placeholder="将会议纪要或群聊片段粘贴到这里，Agent 会识别新增需求、状态变更、进展、阻塞、决议等动作..." class="flex-1 mx-4 mb-3 p-3 text-sm border rounded-lg resize-none font-mono leading-relaxed">${escapeHtml(rawText)}</textarea>
            <div class="flex-shrink-0 px-4 pb-3 flex items-center justify-between">
              <span class="text-[10px] text-gray-400">模型：Claude 4.7（演示）· 阈值：相似度 > 0.5 视为更新已有需求</span>
              <button id="do-extract" class="px-4 py-1.5 text-sm text-white bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 rounded-lg shadow-sm">
                🚀 开始抽取
              </button>
            </div>
          </div>

          <!-- 右：结果 -->
          <div class="w-1/2 flex flex-col overflow-hidden">
            <div class="flex-shrink-0 px-4 py-2.5 border-b flex items-center justify-between">
              <div class="text-xs font-medium text-gray-700">
                🧠 Agent 拟执行清单 <span id="action-count" class="text-gray-400"></span>
              </div>
              <div class="flex gap-1">
                <button id="select-all" class="text-[10px] text-brand-600 hover:underline">全选</button>
                <span class="text-gray-300">|</span>
                <button id="select-none" class="text-[10px] text-gray-500 hover:underline">全不选</button>
              </div>
            </div>
            <div id="extract-result" class="flex-1 overflow-y-auto p-3 bg-gray-50">
              <div class="empty-state text-center py-20 text-gray-400">
                <div class="text-4xl mb-2">🤖</div>
                <div class="text-sm">粘贴纪要并点击「开始抽取」</div>
                <div class="text-xs mt-1">或点击左上角示例快速体验</div>
              </div>
            </div>
            <div class="flex-shrink-0 px-4 py-3 border-t bg-white flex items-center justify-between">
              <div class="text-[11px] text-gray-500" id="apply-summary">&nbsp;</div>
              <button id="apply-actions" class="px-4 py-1.5 text-sm text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed" disabled>
                ✓ 确认写入
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // 事件绑定
  const closeExtractorHandler = () => {
    rawText = '';
    extractedActions = [];
    closeExtractor();
  };
  root.querySelector('#extractor-close').addEventListener('click', closeExtractorHandler);

  // 点击遮罩关闭
  const backdrop = root.querySelector('.fixed.inset-0');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeExtractorHandler();
    });
  }

  // ESC 关闭
  const escHandler = (e) => {
    if (e.key === 'Escape' && state.extractorOpen) {
      closeExtractorHandler();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  root.querySelector('#extract-input').addEventListener('input', e => {
    rawText = e.target.value;
  });

  root.querySelectorAll('.sample-btn').forEach(b => {
    b.addEventListener('click', () => {
      rawText = SAMPLES[Number(b.dataset.sample)];
      root.querySelector('#extract-input').value = rawText;
    });
  });

  root.querySelector('#do-extract').addEventListener('click', async () => {
    const text = root.querySelector('#extract-input').value;
    if (!text.trim()) return toast('请先粘贴内容', 'error');
    rawText = text;
    await doExtract(text, root);
  });

  root.querySelector('#select-all').addEventListener('click', () => {
    extractedActions.forEach(a => a.selected = true);
    refreshResult(root);
  });
  root.querySelector('#select-none').addEventListener('click', () => {
    extractedActions.forEach(a => a.selected = false);
    refreshResult(root);
  });

  root.querySelector('#apply-actions').addEventListener('click', () => applyActions(root));
}

async function doExtract(text, root) {
  const resultEl = root.querySelector('#extract-result');
  resultEl.innerHTML = `
    <div class="text-center py-16">
      <div class="inline-block w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full spinner"></div>
      <div class="text-sm text-gray-500 mt-3" id="extract-status">Agent 正在分析纪要...</div>
    </div>
  `;

  // 在线 + LLM 启用 → 调后端；否则 → 本地规则引擎
  if (state.mode === 'online' && state.llmEnabled) {
    try {
      const { extractFromText: extractApi } = await import('../api/agent.js');
      const result = await extractApi(text);
      if (result.enabled && result.actions && result.actions.length) {
        // 规整后端返回为前端需要的格式
        extractedActions = result.actions.map(a => ({
          action: a.action || a.type,
          reqCode: a.reqCode || a.target_code,
          reqId: (state.requirements.find(r => r.code === (a.reqCode || a.target_code)) || {}).id,
          summary: a.summary || '',
          payload: a.payload || a.fields || {},
          diff: a.diff,
          sourceText: a.sourceText || a.source_snippet,
          confidence: a.confidence,
          selected: true,
        }));
        refreshResult(root);
        return;
      }
      // 后端未启用 LLM 或返回为空 → fallback
      console.log('[Extractor] 后端 LLM 未启用或无动作，使用本地规则引擎');
    } catch (e) {
      console.warn('[Extractor] 后端抽取失败，降级到本地规则引擎:', e);
      const status = root.querySelector('#extract-status');
      if (status) status.textContent = '后端抽取失败，已降级到本地规则引擎...';
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // 本地规则引擎
  await new Promise(r => setTimeout(r, 600 + Math.random() * 300));
  extractedActions = extractFromText(text);
  refreshResult(root);
}

function refreshResult(root) {
  const resultEl = root.querySelector('#extract-result');
  const countEl = root.querySelector('#action-count');
  const applyBtn = root.querySelector('#apply-actions');
  const sumEl = root.querySelector('#apply-summary');

  if (extractedActions.length === 0) {
    resultEl.innerHTML = `
      <div class="text-center py-16 text-gray-400">
        <div class="text-3xl mb-2">🤷</div>
        <div class="text-sm">没有识别出可执行的动作</div>
        <div class="text-xs mt-1">可以重新编辑原文或直接手动录入</div>
      </div>
    `;
    countEl.textContent = '';
    applyBtn.disabled = true;
    sumEl.textContent = '';
    return;
  }

  const selectedCount = extractedActions.filter(a => a.selected).length;
  countEl.textContent = `（${selectedCount}/${extractedActions.length} 已选）`;
  applyBtn.disabled = selectedCount === 0;
  sumEl.textContent = selectedCount ? `即将执行 ${selectedCount} 个动作` : '请选择要执行的动作';

  resultEl.innerHTML = extractedActions.map((a, idx) => renderAction(a, idx)).join('');

  resultEl.querySelectorAll('[data-toggle]').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.dataset.toggle);
      extractedActions[idx].selected = cb.checked;
      refreshResult(root);
    });
  });
}

function renderAction(a, idx) {
  const typeMeta = {
    create:         { icon: '🆕', label: '新增需求', color: 'bg-green-100 text-green-700' },
    update:         { icon: '✏️', label: '更新需求', color: 'bg-blue-100 text-blue-700' },
    status_change:  { icon: '🔄', label: '状态变更', color: 'bg-indigo-100 text-indigo-700' },
    scope_adjust:   { icon: '🎯', label: '边界调整', color: 'bg-amber-100 text-amber-700' },
    add_progress:   { icon: '📝', label: '新增进展', color: 'bg-gray-100 text-gray-700' },
    add_blocker:    { icon: '🚨', label: '新增阻塞', color: 'bg-red-100 text-red-700' },
    resolve_blocker:{ icon: '✅', label: '解除阻塞', color: 'bg-green-100 text-green-700' },
    add_milestone:  { icon: '🎯', label: '里程碑',   color: 'bg-brand-100 text-brand-700' },
    add_decision:   { icon: '⚖️', label: '决议',     color: 'bg-amber-100 text-amber-700' },
    add_risk:       { icon: '⚠️', label: '风险',     color: 'bg-orange-100 text-orange-700' },
  };
  const meta = typeMeta[a.action] || { icon: '·', label: a.action, color: 'bg-gray-100 text-gray-700' };
  const selectedClass = a.selected ? 'selected' : (a.selected === false ? 'ignored' : '');

  return `
    <div class="proposal-card ${selectedClass} bg-white border border-gray-200 rounded-lg p-3 mb-2">
      <div class="flex items-start gap-2">
        <label class="flex items-center pt-1">
          <input type="checkbox" data-toggle="${idx}" ${a.selected ? 'checked' : ''} class="w-4 h-4 accent-brand-600"/>
        </label>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap mb-1">
            <span class="chip ${meta.color}">${meta.icon} ${meta.label}</span>
            ${a.reqCode ? `<span class="text-[10px] font-mono text-gray-400">${escapeHtml(a.reqCode)}</span>` : ''}
            ${a.confidence != null ? `<span class="text-[10px] text-gray-400">置信度 ${(a.confidence * 100).toFixed(0)}%</span>` : ''}
          </div>
          <div class="text-sm text-gray-900 mb-1">${escapeHtml(a.summary)}</div>
          ${a.diff ? `<div class="text-xs flex items-center gap-1.5 my-1">
            <span class="text-gray-400">${escapeHtml(a.diff.field || '')}:</span>
            <span class="px-1.5 py-0.5 bg-red-50 text-red-700 rounded line-through">${escapeHtml(a.diff.old || '空')}</span>
            <span class="text-gray-400">→</span>
            <span class="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">${escapeHtml(a.diff.new || '空')}</span>
          </div>` : ''}
          ${a.sourceText ? `
            <details class="mt-1">
              <summary class="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">📎 原文片段</summary>
              <div class="mt-1 text-[11px] text-gray-500 bg-gray-50 p-2 rounded border-l-2 border-brand-300">${escapeHtml(a.sourceText)}</div>
            </details>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function applyActions(root) {
  const selected = extractedActions.filter(a => a.selected);
  if (!selected.length) return;
  let created = 0, updated = 0, noteAdded = 0, blocked = 0;
  selected.forEach(a => {
    try {
      if (a.action === 'create') {
        addRequirement({
          code: a.payload.code || nextReqCode(state.requirements),
          title: a.payload.title,
          business_line: a.payload.business_line || '其他',
          owner: a.payload.owner || state.settings.currentUser,
          status: a.payload.status || '待评审',
          priority: a.payload.priority || 'P2',
          description: a.payload.description || a.sourceText || '',
          source: a.payload.source || 'Agent 抽取',
          _source: 'agent_extract',
          _source_ref: a.sourceText,
        });
        created++;
      } else if (a.action === 'update' || a.action === 'status_change' || a.action === 'scope_adjust') {
        if (a.reqId) {
          updateRequirement(a.reqId, a.payload, {
            source: 'agent_extract',
            source_ref: a.sourceText,
            reason: a.summary,
          });
          updated++;
        }
      } else if (a.action === 'add_progress' || a.action === 'add_milestone' || a.action === 'add_decision' || a.action === 'add_risk') {
        if (a.reqId) {
          const typeMap = { add_progress: 'progress', add_milestone: 'milestone', add_decision: 'decision', add_risk: 'risk' };
          addProgressNote({
            requirement_id: a.reqId,
            note_type: typeMap[a.action],
            content: a.payload.content,
            source: 'agent_extract',
            source_ref: a.sourceText,
          });
          noteAdded++;
        }
      } else if (a.action === 'add_blocker') {
        if (a.reqId) {
          addBlocker({
            requirement_id: a.reqId,
            blocker_type: a.payload.blocker_type || 'other',
            description: a.payload.description,
            blocking_person: a.payload.blocking_person,
          });
          blocked++;
        }
      } else if (a.action === 'resolve_blocker') {
        if (a.blockerId) {
          resolveBlocker(a.blockerId, a.payload.content || '');
          blocked++;
        }
      }
    } catch (e) { console.warn(e); }
  });

  const summary = [
    created ? `新建 ${created} 条需求` : '',
    updated ? `更新 ${updated} 条` : '',
    noteAdded ? `进展 ${noteAdded} 条` : '',
    blocked ? `阻塞动作 ${blocked} 个` : '',
  ].filter(Boolean).join(' · ');
  toast(`已写入：${summary || '无'}`, 'success');

  rawText = '';
  extractedActions = [];
  closeExtractor();
}

// ========================= 核心：从文本抽取动作（模拟 LLM） =========================
function extractFromText(text) {
  const actions = [];
  const existingReqs = state.requirements;
  const existingBlockers = state.blockers.filter(b => b.status === 'active');

  // 先提取每个 "段落" 或 "行"，优先按编号行 / 换行切分
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

  lines.forEach(line => {
    const result = analyzeLine(line, existingReqs, existingBlockers);
    if (result) {
      result.forEach(a => {
        actions.push({
          ...a,
          selected: true,
          sourceText: line,
        });
      });
    }
  });

  return actions;
}

function findReqByRef(ref, reqs) {
  if (!ref) return null;
  const s = String(ref).trim();
  // 精确匹配 code
  const codeMatch = s.match(/REQ-\d{4}-\d{4}|REQ-\d+/);
  if (codeMatch) {
    const q = codeMatch[0];
    // 规范化短版本 REQ-42 → 查找末尾匹配
    const found = reqs.find(r => r.code === q) ||
                  reqs.find(r => r.code.endsWith(q.replace('REQ-', '').replace(/-/g, '')) ||
                                 r.code.replace(/\D/g, '').endsWith(q.replace(/\D/g, '')));
    if (found) return found;
    // 匹配短号
    const num = q.match(/\d+$/)?.[0];
    if (num) {
      const fuzzy = reqs.find(r => r.code.endsWith(num.padStart(4, '0')));
      if (fuzzy) return fuzzy;
    }
  }
  // 按标题模糊
  let best = null, bestScore = 0;
  reqs.forEach(r => {
    const sc = similarity(s.slice(0, 20), r.title.slice(0, 20));
    if (sc > bestScore) { bestScore = sc; best = r; }
  });
  if (bestScore > 0.5) return best;
  return null;
}

function analyzeLine(line, existingReqs, existingBlockers) {
  const actions = [];
  // 尝试找出这行里的需求 code
  const codeMatch = line.match(/REQ[-\s]?(\d{4}-\d{4}|\d{2,4})/i);
  const refReq = codeMatch ? findReqByRef(codeMatch[0], existingReqs) : null;

  // ============ 规则1：阻塞解除 ============
  if (refReq && /(法务.*回|不再卡|可以(继续|推进)|解除了?|已解决|回复了?)/.test(line)) {
    const active = existingBlockers.find(b => b.requirement_id === refReq.id);
    if (active) {
      actions.push({
        action: 'resolve_blocker', reqId: refReq.id, reqCode: refReq.code,
        blockerId: active.id,
        summary: `${refReq.code} 阻塞已解除`,
        payload: { content: line },
        confidence: 0.85,
      });
      return actions;
    }
  }

  // ============ 规则2：阻塞识别 ============
  if (refReq && /(卡在|卡点|被阻塞|阻塞|等.*确认|等.*回复|等待)/.test(line)) {
    const blkType = /法务/.test(line) ? 'external_dep'
                  : /(技术|SRE|架构)/.test(line) ? 'technical'
                  : /(决策|评审)/.test(line) ? 'pending_decision'
                  : 'other';
    const personMatch = line.match(/(法务[·:：·]?\w+|@?\w+(?=\s|$))/);
    actions.push({
      action: 'add_blocker', reqId: refReq.id, reqCode: refReq.code,
      summary: `${refReq.code} 新增阻塞`,
      payload: {
        blocker_type: blkType,
        description: line.replace(/^\d+[\.、]?\s*/, '').slice(0, 120),
        blocking_person: personMatch ? personMatch[1] : null,
      },
      confidence: 0.75,
    });
    return actions;
  }

  // ============ 规则3：边界调整（决议去掉/取消功能）============
  if (refReq && /(去掉|移除|移到\s*v|移出|不做|取消|delay).+?(功能|范围|scope)/i.test(line)) {
    actions.push({
      action: 'scope_adjust', reqId: refReq.id, reqCode: refReq.code,
      summary: `${refReq.code} 边界调整`,
      diff: { field: 'scope', old: refReq.scope?.slice(0, 40) || '(原 scope)', new: line.slice(0, 60) },
      payload: { scope: (refReq.scope || '') + '\n\n**调整 [' + new Date().toLocaleDateString() + ']**：' + line },
      confidence: 0.8,
    });
    actions.push({
      action: 'add_decision', reqId: refReq.id, reqCode: refReq.code,
      summary: `${refReq.code} 决议记录`,
      payload: { content: line.replace(/^\d+[\.、]?\s*/, '') },
      confidence: 0.8,
    });
    return actions;
  }

  // ============ 规则4：状态变更识别 ============
  if (refReq) {
    // 测试中 / 提测 / 自测完成 → 测试中
    if (/(提测|自测完成|进入测试|开始测试|转测)/.test(line)) {
      if (refReq.status !== '测试中') {
        actions.push({
          action: 'status_change', reqId: refReq.id, reqCode: refReq.code,
          summary: `${refReq.code} 状态：${refReq.status} → 测试中`,
          diff: { field: 'status', old: refReq.status, new: '测试中' },
          payload: { status: '测试中' },
          confidence: 0.85,
        });
      }
    }
    // 上线 / 已发布 / 全量 → 已上线
    if (/(上线|已发布|全量|灰度通过)/.test(line) && !/(预发|灰度中|即将)/.test(line)) {
      if (refReq.status !== '已上线') {
        actions.push({
          action: 'status_change', reqId: refReq.id, reqCode: refReq.code,
          summary: `${refReq.code} 状态：${refReq.status} → 已上线`,
          diff: { field: 'status', old: refReq.status, new: '已上线' },
          payload: { status: '已上线', actual_release: new Date().toISOString().slice(0, 10) },
          confidence: 0.7,
        });
      }
    }
    // 搁置 / 挪到 Q
    if (/(搁置|挪到|推迟至|Q[234])/i.test(line)) {
      if (refReq.status !== '已搁置') {
        actions.push({
          action: 'status_change', reqId: refReq.id, reqCode: refReq.code,
          summary: `${refReq.code} 状态：${refReq.status} → 已搁置`,
          diff: { field: 'status', old: refReq.status, new: '已搁置' },
          payload: { status: '已搁置' },
          confidence: 0.75,
        });
      }
    }
  }

  // ============ 规则5：进度/完成百分比更新 ============
  if (refReq) {
    const pm = line.match(/(\d+)\s*%/);
    if (pm && /(进度|完成)/.test(line)) {
      const newP = Number(pm[1]);
      if (newP >= 0 && newP <= 100 && newP !== (refReq.progress || 0)) {
        actions.push({
          action: 'update', reqId: refReq.id, reqCode: refReq.code,
          summary: `${refReq.code} 进度更新为 ${newP}%`,
          diff: { field: 'progress', old: String(refReq.progress || 0), new: String(newP) },
          payload: { progress: newP },
          confidence: 0.85,
        });
      }
    }
  }

  // ============ 规则6：里程碑 / 联调完成 / 功能完成 ============
  if (refReq && /(联调完成|开发完成|功能完成|里程碑|一阶段完成|评审通过)/.test(line)) {
    actions.push({
      action: 'add_milestone', reqId: refReq.id, reqCode: refReq.code,
      summary: `${refReq.code} 里程碑记录`,
      payload: { content: line.replace(/^\d+[\.、]?\s*/, '') },
      confidence: 0.75,
    });
  }

  // ============ 规则7：风险 ============
  if (refReq && /(风险|可能.*影响|担心|如果.*(延迟|延期|未))/.test(line)) {
    actions.push({
      action: 'add_risk', reqId: refReq.id, reqCode: refReq.code,
      summary: `${refReq.code} 风险记录`,
      payload: { content: line.replace(/^\d+[\.、]?\s*/, '') },
      confidence: 0.7,
    });
    return actions;
  }

  // ============ 规则8：新需求 ============
  if (!refReq && /(新需求|新增需求|需要做)/.test(line) && line.length > 10) {
    // 简单提取：先去掉 "新需求：" 前缀
    const cleaned = line.replace(/^(新需求|新增需求|需要做)[:：]?/, '').trim();
    let priority = 'P2';
    const pMatch = cleaned.match(/P[0-3]/i);
    if (pMatch) priority = pMatch[0].toUpperCase();
    let bl = businessLines.find(b => cleaned.includes(b)) || '其他';
    // 负责人
    const ownerMatch = cleaned.match(/(?:对接人|负责人|owner)[:：]?\s*([\u4e00-\u9fa5]{2,4})/);
    const title = cleaned.split(/[，,。]/)[0].slice(0, 40);
    actions.push({
      action: 'create',
      summary: `新需求：${title}`,
      payload: {
        title,
        business_line: bl,
        priority,
        owner: ownerMatch ? ownerMatch[1] : null,
        status: '待评审',
        source: 'Agent 抽取自纪要',
      },
      confidence: 0.6,
    });
    return actions;
  }

  // ============ 规则9：一般性进展（兜底） ============
  if (refReq && actions.length === 0 && line.length > 8) {
    actions.push({
      action: 'add_progress', reqId: refReq.id, reqCode: refReq.code,
      summary: `${refReq.code} 进展记录`,
      payload: { content: line.replace(/^\d+[\.、]?\s*/, '') },
      confidence: 0.5,
    });
  }

  return actions.length ? actions : null;
}
