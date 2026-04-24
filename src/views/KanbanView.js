// src/views/KanbanView.js
// 看板视图

import { state, getFilteredRequirements, openDrawer, updateRequirement } from '../store/store.js';
import { statuses } from '../data/mockData.js';
import { escapeHtml, relativeTime, formatDate } from '../utils/helpers.js';

export function renderKanban(root) {
  const reqs = getFilteredRequirements();

  const cols = statuses.map(s => ({
    status: s,
    items: reqs.filter(r => r.status === s),
  }));

  root.className = 'flex-1 overflow-hidden flex flex-col';
  root.innerHTML = `
    <div class="flex-shrink-0 px-5 py-3 bg-white border-b flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold text-gray-900">📋 需求看板</h2>
        <span class="text-xs text-gray-400">拖拽卡片改变状态</span>
      </div>
      <div class="text-xs text-gray-500">共 <b class="text-gray-900">${reqs.length}</b> 条需求</div>
    </div>

    <div class="flex-1 overflow-x-auto overflow-y-hidden p-4">
      <div class="flex gap-3 h-full" style="min-width: max-content;">
        ${cols.map(col => renderColumn(col)).join('')}
      </div>
    </div>
  `;

  bindDnd(root);
  bindCards(root);
}

function renderColumn({ status, items }) {
  const colorMap = {
    '待评审': 'bg-gray-100 border-gray-300 text-gray-700',
    '已立项': 'bg-blue-100 border-blue-300 text-blue-800',
    '开发中': 'bg-amber-100 border-amber-300 text-amber-800',
    '测试中': 'bg-indigo-100 border-indigo-300 text-indigo-800',
    '已上线': 'bg-emerald-100 border-emerald-300 text-emerald-800',
    '已搁置': 'bg-gray-100 border-gray-300 text-gray-500',
  };
  return `
    <div class="kanban-col flex flex-col w-72 flex-shrink-0 bg-gray-50/80 rounded-xl border border-gray-200 overflow-hidden transition-colors" data-status="${escapeHtml(status)}">
      <div class="px-3 py-2.5 flex items-center justify-between border-b ${colorMap[status] || ''}">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">${escapeHtml(status)}</span>
          <span class="px-1.5 py-0.5 bg-white/70 text-xs font-medium rounded-full">${items.length}</span>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
        ${items.length === 0 ? `
          <div class="text-center py-8 text-xs text-gray-300">
            <div class="text-2xl mb-1">·</div>
            暂无需求
          </div>
        ` : items.map(r => renderCard(r)).join('')}
      </div>
    </div>
  `;
}

function renderCard(r) {
  const blockers = state.blockers.filter(b => b.requirement_id === r.id && b.status === 'active');
  const latestNote = state.progressNotes
    .filter(n => n.requirement_id === r.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

  const blockerDays = blockers[0]
    ? Math.max(1, Math.round((new Date('2026-04-23') - new Date(blockers[0].created_at)) / 86400000))
    : 0;

  const deps = state.dependencies.filter(d => d.to_id === r.id || d.from_id === r.id).length;

  return `
    <div
      class="kanban-card group bg-white border border-gray-200 rounded-lg p-3 shadow-card hover:shadow-card-hover hover:border-brand-300"
      draggable="true"
      data-req-id="${r.id}"
    >
      <!-- 头部 -->
      <div class="flex items-start gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-1 flex-wrap">
            <span class="chip prio-${r.priority}">${r.priority}</span>
            <span class="text-[10px] text-gray-400 font-mono">${r.code}</span>
            ${blockers.length ? `<span class="chip bg-red-100 text-red-700 text-[10px]">🚨 ${blockerDays}天</span>` : ''}
          </div>
          <div class="text-sm font-medium text-gray-900 leading-snug line-clamp-2" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</div>
        </div>
      </div>

      <!-- 元信息 -->
      <div class="flex items-center gap-2 text-xs text-gray-500 mb-2">
        <span class="inline-flex items-center gap-1" title="业务线">
          <span class="w-1.5 h-1.5 rounded-full bg-brand-400"></span>
          ${escapeHtml(r.business_line)}
        </span>
        <span>·</span>
        <span title="负责人">👤 ${escapeHtml(r.owner)}</span>
        ${deps > 0 ? `<span>·</span><span title="依赖数">🔗 ${deps}</span>` : ''}
      </div>

      <!-- 进度条 -->
      ${r.status !== '已搁置' ? `
      <div class="mb-2">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${r.progress || 0}%"></div>
        </div>
        <div class="mt-0.5 flex justify-between text-[10px] text-gray-400">
          <span>${r.progress || 0}%</span>
          ${r.planned_end ? `<span>截止 ${formatDate(r.planned_end)}</span>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- 阻塞或进展 -->
      ${blockers.length ? `
        <div class="mt-2 px-2 py-1.5 bg-red-50 border-l-2 border-red-400 rounded text-[11px] text-red-800 line-clamp-1" title="${escapeHtml(blockers[0].description)}">
          🚨 ${escapeHtml(blockers[0].description.slice(0, 40))}${blockers[0].description.length > 40 ? '…' : ''}
        </div>
      ` : latestNote ? `
        <div class="mt-2 px-2 py-1.5 bg-gray-50 border-l-2 border-gray-300 rounded text-[11px] text-gray-600 line-clamp-1">
          📝 ${formatDate(latestNote.created_at)} · ${escapeHtml((latestNote.content || '').slice(0, 40))}${(latestNote.content || '').length > 40 ? '…' : ''}
        </div>
      ` : `
        <div class="mt-2 text-[10px] text-gray-400">
          ⏱ 更新于 ${relativeTime(r.updated_at)}
        </div>
      `}
    </div>
  `;
}

function bindDnd(root) {
  let draggingId = null;

  root.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      draggingId = card.dataset.reqId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingId);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggingId = null;
    });
  });

  root.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = draggingId || e.dataTransfer.getData('text/plain');
      const newStatus = col.dataset.status;
      const req = state.requirements.find(r => r.id === id);
      if (req && req.status !== newStatus) {
        updateRequirement(id, { status: newStatus }, { reason: '看板拖拽变更' });
        import('../utils/helpers.js').then(({ toast }) => {
          toast(`${req.code} → ${newStatus}`, 'success');
        });
      }
    });
  });
}

function bindCards(root) {
  root.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', e => {
      // 不在拖拽中
      if (!e.target.closest('.dragging')) {
        openDrawer(card.dataset.reqId);
      }
    });
  });
}
