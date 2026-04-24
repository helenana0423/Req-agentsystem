// src/views/TableView.js
// 表格视图

import { state, getFilteredRequirements, openDrawer } from '../store/store.js';
import { escapeHtml, formatDate, relativeTime } from '../utils/helpers.js';

let sortKey = 'updated_at';
let sortAsc = false;

export function renderTable(root) {
  let reqs = getFilteredRequirements();

  reqs = [...reqs].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    let cmp;
    if (sortKey === 'priority') {
      const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
      cmp = (order[av] ?? 9) - (order[bv] ?? 9);
    } else if (sortKey === 'progress') {
      cmp = (av || 0) - (bv || 0);
    } else if (sortKey === 'planned_end' || sortKey === 'updated_at' || sortKey === 'created_at') {
      cmp = new Date(av || 0) - new Date(bv || 0);
    } else {
      cmp = String(av).localeCompare(String(bv), 'zh');
    }
    return sortAsc ? cmp : -cmp;
  });

  root.className = 'flex-1 overflow-hidden flex flex-col';
  root.innerHTML = `
    <div class="flex-shrink-0 px-5 py-3 bg-white border-b flex items-center justify-between">
      <h2 class="text-sm font-semibold text-gray-900">🗂️ 需求表格</h2>
      <div class="text-xs text-gray-500">共 <b class="text-gray-900">${reqs.length}</b> 条</div>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 sticky top-0 z-10">
          <tr class="text-xs text-gray-500">
            ${col('code',         '编号',      'w-28')}
            ${col('title',        '标题')}
            ${col('business_line','业务线',    'w-24')}
            ${col('owner',        '负责人',    'w-20')}
            ${col('status',       '状态',      'w-20')}
            ${col('priority',     '优先级',    'w-16')}
            ${col('progress',     '进度',      'w-24')}
            ${col('planned_end',  '截止日期',  'w-28')}
            <th class="text-left px-3 py-2 font-medium w-20">阻塞</th>
            ${col('updated_at',   '更新',      'w-24')}
          </tr>
        </thead>
        <tbody>
          ${reqs.length === 0 ? `
            <tr><td colspan="10" class="text-center py-16 text-gray-400">
              <div class="text-3xl mb-2">📭</div>
              <div>没有符合条件的需求</div>
            </td></tr>
          ` : reqs.map(r => renderRow(r)).join('')}
        </tbody>
      </table>
    </div>
  `;

  root.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = false; }
      renderTable(root);
    });
  });

  root.querySelectorAll('tr[data-req-id]').forEach(tr => {
    tr.addEventListener('click', () => openDrawer(tr.dataset.reqId));
  });
}

function col(key, label, wClass = '') {
  const active = sortKey === key;
  const arrow = active ? (sortAsc ? '↑' : '↓') : '';
  return `
    <th class="text-left px-3 py-2 font-medium cursor-pointer select-none hover:text-brand-700 ${wClass}" data-sort="${key}">
      <span>${label}</span>
      <span class="text-brand-600 ml-0.5">${arrow}</span>
    </th>
  `;
}

function renderRow(r) {
  const blockers = state.blockers.filter(b => b.requirement_id === r.id && b.status === 'active');
  return `
    <tr class="border-t hover:bg-brand-50/40 cursor-pointer transition-colors" data-req-id="${r.id}">
      <td class="px-3 py-2 font-mono text-xs text-gray-500">${r.code}</td>
      <td class="px-3 py-2">
        <div class="font-medium text-gray-900 truncate max-w-md" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</div>
        ${r.tags?.length ? `<div class="flex gap-1 mt-1">${r.tags.slice(0, 3).map(t => `<span class="chip bg-gray-100 text-gray-600 text-[10px]">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </td>
      <td class="px-3 py-2 text-xs text-gray-600">${escapeHtml(r.business_line)}</td>
      <td class="px-3 py-2 text-xs">${escapeHtml(r.owner)}</td>
      <td class="px-3 py-2"><span class="chip status-${r.status}">${r.status}</span></td>
      <td class="px-3 py-2"><span class="chip prio-${r.priority}">${r.priority}</span></td>
      <td class="px-3 py-2">
        <div class="flex items-center gap-2">
          <div class="flex-1 progress-bar" style="width: 60px;"><div class="progress-fill" style="width: ${r.progress || 0}%"></div></div>
          <span class="text-[10px] text-gray-500 w-8">${r.progress || 0}%</span>
        </div>
      </td>
      <td class="px-3 py-2 text-xs text-gray-600">${formatDate(r.planned_end)}</td>
      <td class="px-3 py-2">
        ${blockers.length ? `<span class="chip bg-red-100 text-red-700 text-[10px]" title="${escapeHtml(blockers[0].description)}">🚨 ${blockers.length}</span>` : `<span class="text-gray-300">—</span>`}
      </td>
      <td class="px-3 py-2 text-xs text-gray-400">${relativeTime(r.updated_at)}</td>
    </tr>
  `;
}
