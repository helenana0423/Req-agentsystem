// src/components/Drawer.js
// 需求详情抽屉：进展时间线 / 详情 / 变更历史 / 附件

import {
  state, closeDrawer, setDrawerTab, getRequirement,
  getActiveBlockersFor, getChangesFor, getNotesFor, getDependenciesFor,
  updateRequirement, addProgressNote, resolveBlocker, addBlocker,
  simulateDelayPropagation,
} from '../store/store.js';
import { noteTypes, blockerTypes, statuses, priorities, businessLines } from '../data/mockData.js';
import { escapeHtml, formatDate, relativeTime, renderMarkdown, toast, addDays } from '../utils/helpers.js';
import { openModal } from './Modal.js';

export function renderDrawer(root) {
  const reqId = state.drawerReqId;
  if (!reqId) { root.innerHTML = ''; return; }
  const r = getRequirement(reqId);
  if (!r) { root.innerHTML = ''; return; }

  const tab = state.drawerTab;

  root.innerHTML = `
    <div class="fixed inset-0 z-40 flex justify-end">
      <div class="flex-1 bg-black/40 drawer-backdrop" id="drawer-backdrop"></div>
      <div class="w-[720px] max-w-[calc(100vw-80px)] bg-white shadow-2xl flex flex-col drawer-panel">
        <!-- Header -->
        <div class="flex-shrink-0 px-5 py-3 border-b">
          <div class="flex items-start justify-between gap-3 mb-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                <span class="text-[10px] font-mono text-gray-400">${r.code}</span>
                <span class="chip prio-${r.priority}">${r.priority}</span>
                <span class="chip status-${r.status}">${r.status}</span>
                <span class="chip bg-gray-100 text-gray-600">${escapeHtml(r.business_line)}</span>
              </div>
              <h2 class="text-base font-semibold text-gray-900 leading-snug">${escapeHtml(r.title)}</h2>
              <div class="mt-1 text-xs text-gray-500">
                👤 ${escapeHtml(r.owner)} ${r.dev_owner ? `&nbsp;·&nbsp; 🛠 ${escapeHtml(r.dev_owner)}` : ''}
                &nbsp;·&nbsp; 更新于 ${relativeTime(r.updated_at)}
              </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <button id="ask-agent-btn" class="px-2.5 py-1 text-xs rounded-md bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:shadow-md">
                💬 问它一下
              </button>
              <button class="btn-icon" id="drawer-close">
                <i class="lucide lucide-x"></i>
              </button>
            </div>
          </div>

          <!-- Tab -->
          <div class="flex gap-1 -mb-3 mt-2">
            ${['timeline', 'detail', 'change', 'attachment'].map(t => {
              const labels = { timeline: '📝 进展时间线', detail: '📄 详情', change: '🔄 变更历史', attachment: '📎 附件' };
              const counts = {
                timeline: getNotesFor(r.id).length,
                change: getChangesFor(r.id).length,
                attachment: 0,
              };
              const badge = counts[t] ? `<span class="ml-1 text-[10px] text-gray-400">(${counts[t]})</span>` : '';
              return `
                <button data-tab="${t}" class="tab-btn px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-colors ${
                  tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }">
                  ${labels[t]}${badge}
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto">
          ${tab === 'timeline' ? renderTimeline(r) : ''}
          ${tab === 'detail' ? renderDetail(r) : ''}
          ${tab === 'change' ? renderChangeLog(r) : ''}
          ${tab === 'attachment' ? renderAttachments(r) : ''}
        </div>

        <!-- 底部快捷操作 -->
        ${tab === 'timeline' ? renderQuickAdd(r) : ''}
      </div>
    </div>
  `;

  root.querySelector('#drawer-backdrop').addEventListener('click', closeDrawer);
  root.querySelector('#drawer-close').addEventListener('click', closeDrawer);
  root.querySelectorAll('.tab-btn').forEach(b => {
    b.addEventListener('click', () => setDrawerTab(b.dataset.tab));
  });

  root.querySelector('#ask-agent-btn')?.addEventListener('click', () => {
    import('./Chat.js').then(({ openChatWithQuestion }) => {
      openChatWithQuestion(`${r.code} 现在进展怎么样？`);
    });
  });

  bindTimelineActions(root, r);
  bindDetailActions(root, r);
}

function renderTimeline(r) {
  const notes = getNotesFor(r.id);
  const activeBlockers = getActiveBlockersFor(r.id);

  return `
    <div class="p-5 space-y-4">
      <!-- 活跃阻塞区 -->
      ${activeBlockers.length ? `
        <div class="border border-red-200 bg-red-50/60 rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-red-800 flex items-center gap-1">🚨 活跃阻塞项（${activeBlockers.length}）</h3>
          </div>
          <div class="space-y-2">
            ${activeBlockers.map(b => {
              const days = Math.max(1, Math.round((new Date('2026-04-23') - new Date(b.created_at)) / 86400000));
              return `
                <div class="bg-white border border-red-200 rounded p-2.5">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="chip bg-red-100 text-red-700">${blockerTypes[b.blocker_type] || b.blocker_type}</span>
                        <span class="text-[10px] text-red-600">已 ${days} 天</span>
                        ${b.expected_resolve_date ? `<span class="text-[10px] text-gray-500">预期 ${formatDate(b.expected_resolve_date)} 解除</span>` : ''}
                      </div>
                      <div class="text-sm text-gray-800">${escapeHtml(b.description)}</div>
                      ${b.blocking_person ? `<div class="text-[11px] text-gray-500 mt-1">阻塞方：${escapeHtml(b.blocking_person)}</div>` : ''}
                    </div>
                    <button data-resolve-blocker="${b.id}" class="flex-shrink-0 px-2 py-1 text-[11px] text-green-700 bg-green-50 hover:bg-green-100 rounded border border-green-200">
                      ✓ 解除
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Note 时间线 -->
      ${notes.length === 0 ? `
        <div class="empty-state text-center py-10 text-gray-400 text-sm">
          <div class="text-3xl mb-2">📖</div>
          暂无进展记录，在下方输入栏快速记一笔吧
        </div>
      ` : `
        <div class="space-y-3">
          ${notes.map(n => renderTimelineItem(n)).join('')}
        </div>
      `}
    </div>
  `;
}

function renderTimelineItem(n) {
  const meta = noteTypes[n.note_type] || noteTypes.progress;
  return `
    <div class="timeline-item">
      <div class="timeline-dot ${meta.color}" title="${meta.label}">
        <span style="font-size: 10px;">${meta.icon}</span>
      </div>
      <div class="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-card transition-shadow">
        <div class="flex items-center justify-between mb-1 flex-wrap gap-1">
          <div class="flex items-center gap-2">
            <span class="chip ${meta.color} text-[10px]">${meta.label}</span>
            <span class="text-xs text-gray-500">${escapeHtml(n.author)}</span>
            ${n.source === 'agent_extract' ? '<span class="chip bg-brand-100 text-brand-700 text-[10px]">✨ Agent</span>' : ''}
          </div>
          <span class="text-[10px] text-gray-400">${formatDate(n.created_at, true)}</span>
        </div>
        <div class="text-sm text-gray-800 whitespace-pre-wrap">${escapeHtml(n.content)}</div>
        ${n.source_ref ? `
          <details class="mt-2">
            <summary class="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">📎 原文片段</summary>
            <div class="mt-1 text-[11px] text-gray-500 bg-gray-50 p-2 rounded border-l-2 border-gray-300">${escapeHtml(n.source_ref)}</div>
          </details>
        ` : ''}
        ${(n.linked_users || []).length ? `<div class="mt-1 text-[10px] text-gray-400">关联：${n.linked_users.map(u => `@${escapeHtml(u)}`).join(' ')}</div>` : ''}
      </div>
    </div>
  `;
}

function renderQuickAdd(r) {
  return `
    <div class="flex-shrink-0 p-3 border-t bg-gray-50">
      <div class="flex items-center gap-2">
        <select id="quick-note-type" class="px-2 py-1.5 text-xs border rounded bg-white">
          <option value="progress">📝 进展</option>
          <option value="milestone">🎯 里程碑</option>
          <option value="decision">⚖️ 决议</option>
          <option value="risk">⚠️ 风险</option>
          <option value="comment">💬 评论</option>
        </select>
        <input id="quick-note-input" type="text" placeholder="记一笔进展，回车发送..." class="flex-1 px-3 py-1.5 text-sm border rounded bg-white"/>
        <button id="quick-note-submit" class="px-3 py-1.5 text-xs text-white bg-brand-600 hover:bg-brand-700 rounded">发送</button>
        <button id="add-blocker-btn" class="px-3 py-1.5 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded" title="新增阻塞">
          🚨 阻塞
        </button>
      </div>
    </div>
  `;
}

function renderDetail(r) {
  const deps = getDependenciesFor(r.id);
  return `
    <div class="p-5 space-y-5">
      <!-- 基本信息 -->
      <section>
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">基本信息</h3>
        <div class="grid grid-cols-2 gap-3 text-sm">
          ${infoItem('业务线', `<select data-field="business_line" class="edit-field text-sm text-gray-800 bg-transparent hover:bg-gray-50 px-1 rounded cursor-pointer">${businessLines.map(b => `<option value="${b}" ${r.business_line === b ? 'selected' : ''}>${b}</option>`).join('')}</select>`)}
          ${infoItem('状态', `<select data-field="status" class="edit-field text-sm text-gray-800 bg-transparent hover:bg-gray-50 px-1 rounded cursor-pointer">${statuses.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
          ${infoItem('优先级', `<select data-field="priority" class="edit-field text-sm text-gray-800 bg-transparent hover:bg-gray-50 px-1 rounded cursor-pointer">${priorities.map(p => `<option value="${p}" ${r.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`)}
          ${infoItem('进度', `<input type="number" min="0" max="100" value="${r.progress || 0}" data-field="progress" class="edit-field w-16 px-1 bg-transparent hover:bg-gray-50 rounded"/> <span class="text-gray-400">%</span>`)}
          ${infoItem('产品负责人', `<input data-field="owner" value="${escapeHtml(r.owner || '')}" class="edit-field bg-transparent hover:bg-gray-50 px-1 rounded w-full"/>`)}
          ${infoItem('开发负责人', `<input data-field="dev_owner" value="${escapeHtml(r.dev_owner || '')}" class="edit-field bg-transparent hover:bg-gray-50 px-1 rounded w-full"/>`)}
          ${infoItem('计划开始', `<input type="date" data-field="planned_start" value="${r.planned_start || ''}" class="edit-field bg-transparent hover:bg-gray-50 px-1 rounded"/>`)}
          ${infoItem('计划完成', `<input type="date" data-field="planned_end" value="${r.planned_end || ''}" class="edit-field bg-transparent hover:bg-gray-50 px-1 rounded"/>`)}
          ${infoItem('来源', escapeHtml(r.source || '-'))}
          ${infoItem('创建时间', formatDate(r.created_at, true))}
        </div>
      </section>

      <!-- 描述 -->
      <section>
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">📄 描述</h3>
        <div class="text-sm text-gray-800 bg-gray-50 rounded p-3 leading-relaxed">
          ${renderMarkdown(r.description)}
        </div>
      </section>

      <!-- Scope -->
      <section>
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🎯 当前功能边界 (Scope)</h3>
        <div class="text-sm text-gray-800 bg-amber-50/40 border border-amber-100 rounded p-3 leading-relaxed">
          ${renderMarkdown(r.scope)}
        </div>
      </section>

      <!-- Tags -->
      ${r.tags?.length ? `
        <section>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🏷 标签</h3>
          <div class="flex flex-wrap gap-1.5">
            ${r.tags.map(t => `<span class="chip bg-brand-100 text-brand-700">${escapeHtml(t)}</span>`).join('')}
          </div>
        </section>
      ` : ''}

      <!-- 依赖关系 -->
      <section>
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🔗 依赖关系</h3>
        <div class="space-y-2">
          <div class="text-xs text-gray-500">前置（完成后本需求才能推进）：</div>
          <div class="space-y-1">
            ${deps.upstream.length ? deps.upstream.map(d => {
              const f = getRequirement(d.from_id);
              return `<div class="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                <span class="chip bg-blue-100 text-blue-700 text-[10px]">${d.dep_type}</span>
                <span class="text-xs text-gray-400 font-mono">${f?.code || d.from_id}</span>
                <span class="text-sm text-gray-800 flex-1 truncate">${escapeHtml(f?.title || '未知')}</span>
                <span class="chip status-${f?.status || '待评审'} text-[10px]">${f?.status || ''}</span>
              </div>`;
            }).join('') : `<div class="text-xs text-gray-400 px-2">无</div>`}
          </div>
          <div class="text-xs text-gray-500 mt-2">后置（依赖本需求完成）：</div>
          <div class="space-y-1">
            ${deps.downstream.length ? deps.downstream.map(d => {
              const t = getRequirement(d.to_id);
              return `<div class="flex items-center gap-2 text-sm p-2 bg-gray-50 rounded">
                <span class="chip bg-indigo-100 text-indigo-700 text-[10px]">${d.dep_type}</span>
                <span class="text-xs text-gray-400 font-mono">${t?.code || d.to_id}</span>
                <span class="text-sm text-gray-800 flex-1 truncate">${escapeHtml(t?.title || '未知')}</span>
                <span class="chip status-${t?.status || '待评审'} text-[10px]">${t?.status || ''}</span>
              </div>`;
            }).join('') : `<div class="text-xs text-gray-400 px-2">无</div>`}
          </div>
        </div>
      </section>

      <!-- 延期传导模拟器 -->
      <section class="bg-orange-50/30 border border-orange-100 rounded-lg p-3">
        <h3 class="text-xs font-semibold text-orange-800 mb-2">🔮 延期传导模拟</h3>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-600">假设完成日期改为：</span>
          <input type="date" id="sim-date" value="${r.planned_end || ''}" class="px-2 py-1 text-xs border rounded"/>
          <button id="sim-btn" class="px-2.5 py-1 text-xs bg-orange-500 text-white hover:bg-orange-600 rounded">模拟影响</button>
        </div>
        <div id="sim-result" class="mt-2"></div>
      </section>
    </div>
  `;
}

function infoItem(label, value) {
  return `
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500 min-w-[80px]">${label}:</span>
      <div class="text-sm text-gray-800 flex-1">${value}</div>
    </div>
  `;
}

function renderChangeLog(r) {
  const changes = getChangesFor(r.id);
  if (!changes.length) return `<div class="p-10 text-center text-gray-400 text-sm"><div class="text-3xl mb-2">📋</div>暂无变更</div>`;

  return `
    <div class="p-5 space-y-2">
      ${changes.map(c => {
        const srcMap = {
          manual: { label: '手动', color: 'bg-gray-100 text-gray-700' },
          agent_extract: { label: 'Agent抽取', color: 'bg-brand-100 text-brand-700' },
          import: { label: '导入', color: 'bg-blue-100 text-blue-700' },
          tapd_sync: { label: 'TAPD', color: 'bg-indigo-100 text-indigo-700' },
        };
        const src = srcMap[c.source] || srcMap.manual;
        const typeMap = {
          create: '🆕 创建',
          update: '✏️ 更新',
          status_change: '🔄 状态变更',
          scope_adjust: '🎯 边界调整',
          comment: '💬 评论',
        };
        return `
          <div class="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-card transition-shadow">
            <div class="flex items-center justify-between mb-1.5 flex-wrap gap-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-gray-700">${typeMap[c.change_type] || c.change_type}</span>
                ${c.field ? `<span class="chip bg-gray-100 text-gray-600 text-[10px]">${c.field}</span>` : ''}
                <span class="chip ${src.color} text-[10px]">${src.label}</span>
              </div>
              <span class="text-[10px] text-gray-400">${formatDate(c.created_at, true)} · ${escapeHtml(c.operator)}</span>
            </div>
            ${c.field && (c.old_value || c.new_value) ? `
              <div class="flex items-center gap-2 text-xs my-1">
                <span class="px-1.5 py-0.5 bg-red-50 text-red-700 rounded line-through">${escapeHtml(c.old_value || '空')}</span>
                <span class="text-gray-400">→</span>
                <span class="px-1.5 py-0.5 bg-green-50 text-green-700 rounded">${escapeHtml(c.new_value || '空')}</span>
              </div>
            ` : ''}
            ${c.reason ? `<div class="text-xs text-gray-500 mt-1">💬 ${escapeHtml(c.reason)}</div>` : ''}
            ${c.source_ref ? `
              <details class="mt-1.5">
                <summary class="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">📎 原文片段</summary>
                <div class="mt-1 text-[11px] text-gray-500 bg-gray-50 p-2 rounded border-l-2 border-brand-300">${escapeHtml(c.source_ref)}</div>
              </details>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderAttachments(r) {
  return `
    <div class="p-10 text-center text-gray-400">
      <div class="text-4xl mb-2">📎</div>
      <div class="text-sm">附件功能演示版未开放</div>
      <div class="text-xs mt-1">MVP 仅保留数据结构，UI 放到 v0.5 阶段实现</div>
    </div>
  `;
}

function bindTimelineActions(root, r) {
  // 解除 blocker
  root.querySelectorAll('[data-resolve-blocker]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.resolveBlocker;
      const note = prompt('阻塞解除说明（可选）：', '');
      if (note !== null) {
        resolveBlocker(id, note);
        toast('阻塞已解除', 'success');
      }
    });
  });
  // 快速添加 note
  const inp = root.querySelector('#quick-note-input');
  const typeSel = root.querySelector('#quick-note-type');
  const submit = () => {
    const content = inp?.value.trim();
    if (!content) return;
    addProgressNote({ requirement_id: r.id, note_type: typeSel.value, content });
    toast('进展已记录', 'success');
    inp.value = '';
  };
  root.querySelector('#quick-note-submit')?.addEventListener('click', submit);
  inp?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
  });
  // 新增 blocker
  root.querySelector('#add-blocker-btn')?.addEventListener('click', () => openAddBlockerModal(r));
}

function bindDetailActions(root, r) {
  root.querySelectorAll('.edit-field').forEach(el => {
    el.addEventListener('change', () => {
      const field = el.dataset.field;
      let value = el.value;
      if (field === 'progress') value = Number(value);
      updateRequirement(r.id, { [field]: value }, { reason: '详情页编辑' });
      toast(`${field} 已更新`, 'success');
    });
  });

  // 模拟延期
  root.querySelector('#sim-btn')?.addEventListener('click', () => {
    const date = root.querySelector('#sim-date').value;
    if (!date) return toast('请选择日期', 'error');
    const affected = simulateDelayPropagation(r.id, date);
    const resDiv = root.querySelector('#sim-result');
    if (affected.length === 0) {
      resDiv.innerHTML = `<div class="text-xs text-green-700 bg-green-50 rounded p-2">✅ 不影响下游需求（或日期未延后）</div>`;
    } else {
      resDiv.innerHTML = `
        <div class="text-xs bg-white border border-orange-200 rounded p-2">
          <div class="font-medium text-orange-800 mb-1.5">⚠️ 将影响 ${affected.length} 条下游需求：</div>
          <div class="space-y-1">
            ${affected.map(a => `
              <div class="flex items-center justify-between">
                <span class="text-gray-700 truncate">${escapeHtml(a.code)} · ${escapeHtml(a.title)}</span>
                <span class="text-gray-500 font-mono">${formatDate(a.oldEnd)} → ${formatDate(a.newEnd)} <span class="text-red-600">+${a.pushDays}天</span></span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  });
}

function openAddBlockerModal(r) {
  openModal({
    title: '新增阻塞项',
    icon: '🚨',
    content: `
      <form id="blk-form" class="space-y-3 text-sm">
        <div>
          <label class="block text-xs text-gray-500 mb-1">阻塞类型</label>
          <select name="blocker_type" class="w-full px-3 py-1.5 border rounded">
            ${Object.entries(blockerTypes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">阻塞描述 *</label>
          <textarea name="description" required rows="3" class="w-full px-3 py-1.5 border rounded" placeholder="例如：等法务确认跨境合规..."></textarea>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-gray-500 mb-1">阻塞方/责任人</label>
            <input name="blocking_person" class="w-full px-3 py-1.5 border rounded" placeholder="例如：法务·张三"/>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">预期解除时间</label>
            <input name="expected_resolve_date" type="date" class="w-full px-3 py-1.5 border rounded"/>
          </div>
        </div>
      </form>
    `,
    confirmText: '新增',
    onConfirm: (close) => {
      const fd = new FormData(document.getElementById('blk-form'));
      if (!fd.get('description')) return toast('请填写描述', 'error');
      addBlocker({
        requirement_id: r.id,
        blocker_type: fd.get('blocker_type'),
        description: fd.get('description'),
        blocking_person: fd.get('blocking_person') || null,
        expected_resolve_date: fd.get('expected_resolve_date') || null,
      });
      toast('阻塞项已添加', 'success');
      close();
    }
  });
}
