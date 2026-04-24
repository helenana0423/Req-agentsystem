// src/components/Sidebar.js
// 筛选侧边栏

import { state, updateFilters, clearFilters } from '../store/store.js';
import { businessLines, statuses, priorities } from '../data/mockData.js';
import { escapeHtml } from '../utils/helpers.js';

export function renderSidebar(root) {
  root.className = 'flex-shrink-0 w-56 border-r border-gray-200 bg-white overflow-y-auto';

  const f = state.filters;
  const owners = [...new Set(state.requirements.map(r => r.owner).filter(Boolean))];
  const tags = [...new Set(state.requirements.flatMap(r => r.tags || []))];

  // 统计每个状态的数量
  const countByStatus = {};
  statuses.forEach(s => { countByStatus[s] = 0; });
  state.requirements.forEach(r => { if (countByStatus[r.status] !== undefined) countByStatus[r.status]++; });

  const activeBlockerCount = state.blockers.filter(b => b.status === 'active').length;

  const total = state.requirements.length;
  const filtered = getFilteredCount();

  root.innerHTML = `
    <div class="p-4 space-y-5">
      <!-- 筛选总览 -->
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-semibold text-gray-900 uppercase tracking-wide">筛选</h2>
        ${hasActiveFilter(f) ? `<button id="clear-filter" class="text-[10px] text-brand-600 hover:text-brand-800">清除</button>` : ''}
      </div>

      <div class="text-xs text-gray-500">
        显示 <span class="font-semibold text-brand-700">${filtered}</span> / ${total} 条
      </div>

      <!-- 快捷入口 -->
      <div class="space-y-1">
        <button data-quick="all" class="w-full text-left px-2 py-1.5 text-sm rounded ${!f.onlyBlocked ? 'bg-brand-50 text-brand-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}">
          📋 全部需求
        </button>
        <button data-quick="blocked" class="w-full text-left px-2 py-1.5 text-sm rounded flex items-center justify-between ${f.onlyBlocked ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}">
          <span>🚨 阻塞项</span>
          ${activeBlockerCount ? `<span class="text-[10px] px-1.5 py-0.5 bg-red-500 text-white rounded-full">${activeBlockerCount}</span>` : ''}
        </button>
      </div>

      ${filterGroup('业务线', 'business_lines', businessLines, f.business_lines)}
      ${filterGroup('负责人', 'owners', owners, f.owners, true)}
      ${filterGroup('状态', 'statuses', statuses, f.statuses, false, countByStatus)}
      ${filterGroup('优先级', 'priorities', priorities, f.priorities)}
      ${tags.length ? filterGroup('标签', 'tags', tags, f.tags, true) : ''}

      <!-- 视图提示 -->
      <div class="mt-4 p-3 bg-gradient-to-br from-brand-50 to-brand-100/30 rounded-lg text-xs text-brand-900 leading-relaxed border border-brand-200/40">
        <div class="font-semibold mb-1 flex items-center gap-1">💡 使用小贴士</div>
        <div class="text-brand-700/80">
          ${viewTip(state.view)}
        </div>
      </div>
    </div>
  `;

  // 事件绑定
  root.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.quick;
      updateFilters({ onlyBlocked: q === 'blocked' });
    });
  });

  root.querySelectorAll('input[type="checkbox"][data-filter]').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.filter;
      const val = cb.dataset.value;
      const curr = state.filters[key] || [];
      const next = cb.checked ? [...curr, val] : curr.filter(x => x !== val);
      updateFilters({ [key]: next });
    });
  });

  root.querySelector('#clear-filter')?.addEventListener('click', clearFilters);
}

function filterGroup(title, key, items, selected, compact = false, counts = null) {
  if (!items.length) return '';
  return `
    <div>
      <h3 class="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">${title}</h3>
      <div class="space-y-0.5 ${compact && items.length > 5 ? 'max-h-32 overflow-y-auto' : ''}">
        ${items.map(item => {
          const isSel = selected.includes(item);
          const count = counts && counts[item] !== undefined ? counts[item] : null;
          return `
            <label class="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" data-filter="${key}" data-value="${escapeHtml(item)}" ${isSel ? 'checked' : ''} class="w-3.5 h-3.5 accent-brand-600"/>
              <span class="text-sm ${isSel ? 'font-medium text-brand-700' : 'text-gray-700'} flex-1 truncate">${escapeHtml(item)}</span>
              ${count !== null ? `<span class="text-[10px] text-gray-400">${count}</span>` : ''}
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function hasActiveFilter(f) {
  return f.business_lines.length || f.owners.length || f.statuses.length ||
         f.priorities.length || f.tags.length || f.onlyBlocked || f.keyword;
}

function getFilteredCount() {
  // 避免循环依赖：这里复写一次筛选逻辑
  const f = state.filters;
  const kw = (f.keyword || '').toLowerCase().trim();
  return state.requirements.filter(r => {
    if (kw) {
      const hay = [r.code, r.title, r.description, r.owner, ...(r.tags || [])].join(' ').toLowerCase();
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
  }).length;
}

function viewTip(view) {
  if (view === 'kanban') return '拖拽卡片可改变状态；有🚨标记的需求表示存在活跃阻塞项。';
  if (view === 'table') return '点击列头可排序；多条件叠加筛选。';
  if (view === 'gantt') return '红底行表示存在阻塞；红框进度条为关键路径节点；点击进度条可查看详情。';
  return '';
}
