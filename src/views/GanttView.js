// src/views/GanttView.js
// 甘特图视图：时间线 + 依赖连线 + 关键路径 + Blocker 高亮

import {
  state, getFilteredRequirements, openDrawer,
  setGanttZoom, toggleCriticalPath, computeCriticalPath,
} from '../store/store.js';
import { escapeHtml, formatDate, addDays, todayDate } from '../utils/helpers.js';

const ROW_HEIGHT = 36;
const LEFT_WIDTH = 260;

export function renderGantt(root) {
  const reqs = getFilteredRequirements().filter(r => r.planned_start && r.planned_end);

  // 按业务线分组
  const groups = {};
  reqs.forEach(r => {
    if (!groups[r.business_line]) groups[r.business_line] = [];
    groups[r.business_line].push(r);
  });
  // 组内按 planned_start 排序
  Object.values(groups).forEach(arr => arr.sort((a, b) => new Date(a.planned_start) - new Date(b.planned_start)));

  // 计算时间范围
  const allDates = reqs.flatMap(r => [new Date(r.planned_start), new Date(r.planned_end)]);
  if (!allDates.length) {
    root.className = 'flex-1 overflow-hidden flex items-center justify-center';
    root.innerHTML = `<div class="text-center text-gray-400">
      <div class="text-5xl mb-3">📊</div>
      <div class="text-sm">没有可展示的需求（需要 planned_start 和 planned_end）</div>
    </div>`;
    return;
  }
  let minD = new Date(Math.min(...allDates));
  let maxD = new Date(Math.max(...allDates));
  minD.setDate(minD.getDate() - 3);
  maxD.setDate(maxD.getDate() + 3);

  const zoom = state.ganttZoom;
  const dayWidth = zoom === 'day' ? 32 : zoom === 'week' ? 14 : 5;
  const totalDays = Math.ceil((maxD - minD) / 86400000);
  const mainWidth = totalDays * dayWidth;

  // 计算关键路径
  const critical = computeCriticalPath();

  // 列表
  const flatList = [];
  Object.keys(groups).sort().forEach(bl => {
    flatList.push({ type: 'group', name: bl, count: groups[bl].length });
    groups[bl].forEach(r => flatList.push({ type: 'req', req: r }));
  });

  const totalHeight = flatList.length * ROW_HEIGHT;

  root.className = 'flex-1 overflow-hidden flex flex-col';
  root.innerHTML = `
    <div class="flex-shrink-0 px-5 py-2.5 bg-white border-b flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="text-sm font-semibold text-gray-900">📊 甘特图</h2>
        <span class="text-xs text-gray-400">拖拽进度条调整时间（演示版仅点击查看详情）</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex bg-gray-100 rounded-lg p-0.5">
          ${['day', 'week', 'month'].map(z => `
            <button data-zoom="${z}" class="gantt-zoom px-2.5 py-1 text-xs rounded-md ${zoom === z ? 'bg-white shadow-sm text-brand-700 font-medium' : 'text-gray-500'}">
              ${z === 'day' ? '日' : z === 'week' ? '周' : '月'}
            </button>
          `).join('')}
        </div>
        <button id="toggle-critical" class="px-2.5 py-1 text-xs rounded-lg ${state.ganttFocusCritical ? 'bg-red-100 text-red-700 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
          🔥 ${state.ganttFocusCritical ? '仅显示关键路径' : '关键路径'}
        </button>
        <div class="flex items-center gap-3 text-[11px] text-gray-500 ml-2">
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-brand-500"></span>进度</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded border-2 border-red-600"></span>关键路径</span>
          <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-red-100 border border-red-300"></span>阻塞中</span>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-auto bg-white relative" id="gantt-scroll">
      <div class="relative" style="width: ${LEFT_WIDTH + mainWidth}px; height: ${totalHeight + 48}px;">

        <!-- 时间轴 header -->
        <div class="sticky top-0 z-20 bg-white border-b flex" style="height: 48px;">
          <div class="flex-shrink-0 border-r bg-gray-50 flex items-center px-3 text-xs font-semibold text-gray-600" style="width: ${LEFT_WIDTH}px;">
            业务线 / 需求
          </div>
          <div class="relative" style="width: ${mainWidth}px; height: 48px;">
            ${renderTimeAxis(minD, maxD, dayWidth, zoom)}
          </div>
        </div>

        <!-- 行区 -->
        <div class="relative" style="width: ${LEFT_WIDTH + mainWidth}px;">
          <!-- 左侧名称 -->
          <div class="absolute left-0 top-0 bg-white border-r z-10" style="width: ${LEFT_WIDTH}px;">
            ${flatList.map((item, i) => renderLeftRow(item, i, critical)).join('')}
          </div>

          <!-- 右侧主区 -->
          <div class="absolute top-0" style="left: ${LEFT_WIDTH}px; width: ${mainWidth}px; height: ${totalHeight}px;">
            <!-- 今日线 -->
            ${renderTodayLine(minD, dayWidth, totalHeight)}
            <!-- 竖向网格 -->
            ${renderGrid(minD, maxD, dayWidth, totalHeight, zoom)}
            <!-- 依赖连线 SVG -->
            <svg class="absolute inset-0 pointer-events-none" width="${mainWidth}" height="${totalHeight}" style="z-index: 3;">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <polygon points="0 0, 8 4, 0 8" class="gantt-dep-arrow"/>
                </marker>
                <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <polygon points="0 0, 8 4, 0 8" class="gantt-dep-arrow critical"/>
                </marker>
              </defs>
              ${renderDependencyLines(flatList, state.dependencies, minD, dayWidth, critical)}
            </svg>
            <!-- 行 -->
            ${flatList.map((item, i) => renderGanttRow(item, i, minD, dayWidth, critical)).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll('.gantt-zoom').forEach(btn => {
    btn.addEventListener('click', () => setGanttZoom(btn.dataset.zoom));
  });
  root.querySelector('#toggle-critical').addEventListener('click', toggleCriticalPath);

  // ===== 甘特图拖拽 =====
  bindGanttDrag(root, minD, dayWidth);

  root.querySelectorAll('.left-row-clickable').forEach(el => {
    el.addEventListener('click', () => openDrawer(el.dataset.reqId));
  });

  // 自动滚动到今天
  setTimeout(() => {
    const scroll = root.querySelector('#gantt-scroll');
    const todayOffset = (todayDate() - minD) / 86400000 * dayWidth + LEFT_WIDTH;
    if (scroll && todayOffset > scroll.clientWidth / 2) {
      scroll.scrollLeft = todayOffset - scroll.clientWidth / 3;
    }
  }, 50);
}

// ========== 拖拽绑定 ==========
function bindGanttDrag(root, minD, dayWidth) {
  const DRAG_THRESHOLD = 4; // 小于此像素视为点击
  let dragging = null; // { bar, reqId, mode: 'move'|'start'|'end', startX, origStart, origEnd, tooltip }

  const pxToDays = (px) => Math.round(px / dayWidth);
  const dateAddDays = (iso, days) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  root.querySelectorAll('.gantt-bar').forEach(bar => {
    bar.addEventListener('mousedown', (e) => {
      const handle = e.target.closest('.gantt-handle');
      const mode = handle ? handle.dataset.handle : 'move';
      const canDrag = bar.classList.contains('gantt-bar-draggable');

      if (mode === 'move' && !canDrag) {
        // 已上线/已取消的不能拖整体，但仍支持点击查看
        return;
      }
      if ((mode === 'start' || mode === 'end') && !canDrag) return;

      e.preventDefault();
      e.stopPropagation();

      dragging = {
        bar,
        reqId: bar.dataset.reqId,
        mode,
        startX: e.clientX,
        origStart: bar.dataset.start,
        origEnd: bar.dataset.end,
        origLeft: parseFloat(bar.style.left),
        origWidth: parseFloat(bar.style.width),
        moved: false,
        tooltip: null,
      };
    });

    bar.addEventListener('click', (e) => {
      // 只有非拖拽时才触发查看详情
      if (!dragging || !dragging.moved) {
        openDrawer(bar.dataset.reqId);
      }
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    if (Math.abs(dx) < DRAG_THRESHOLD && !dragging.moved) return;
    dragging.moved = true;
    dragging.bar.classList.add('gantt-bar-dragging');

    const days = pxToDays(dx);

    let newStart = dragging.origStart;
    let newEnd = dragging.origEnd;
    let newLeft = dragging.origLeft;
    let newWidth = dragging.origWidth;

    if (dragging.mode === 'move') {
      newStart = dateAddDays(dragging.origStart, days);
      newEnd = dateAddDays(dragging.origEnd, days);
      newLeft = dragging.origLeft + days * dayWidth;
    } else if (dragging.mode === 'start') {
      // 不能让 start 超过 end
      const maxDays = Math.floor((new Date(dragging.origEnd) - new Date(dragging.origStart)) / 86400000) - 1;
      const appliedDays = Math.min(days, maxDays);
      newStart = dateAddDays(dragging.origStart, appliedDays);
      newLeft = dragging.origLeft + appliedDays * dayWidth;
      newWidth = dragging.origWidth - appliedDays * dayWidth;
    } else if (dragging.mode === 'end') {
      const minDays = -(Math.floor((new Date(dragging.origEnd) - new Date(dragging.origStart)) / 86400000) - 1);
      const appliedDays = Math.max(days, minDays);
      newEnd = dateAddDays(dragging.origEnd, appliedDays);
      newWidth = dragging.origWidth + appliedDays * dayWidth;
    }

    // 实时更新 bar 位置
    dragging.bar.style.left = newLeft + 'px';
    dragging.bar.style.width = Math.max(20, newWidth) + 'px';
    dragging.pending = { newStart, newEnd };

    // 浮层显示新日期
    if (!dragging.tooltip) {
      dragging.tooltip = document.createElement('div');
      dragging.tooltip.className = 'gantt-drag-tooltip';
      document.body.appendChild(dragging.tooltip);
    }
    dragging.tooltip.style.left = (e.clientX + 12) + 'px';
    dragging.tooltip.style.top = (e.clientY - 30) + 'px';
    dragging.tooltip.innerHTML = `
      <div class="text-[10px] text-gray-400">${dragging.mode === 'move' ? '整体平移' : (dragging.mode === 'start' ? '调整开始' : '调整结束')}</div>
      <div class="text-xs font-medium">${newStart} ~ ${newEnd}</div>
    `;
  });

  document.addEventListener('mouseup', async (e) => {
    if (!dragging) return;
    const { bar, reqId, moved, pending, tooltip } = dragging;
    if (tooltip) tooltip.remove();
    bar.classList.remove('gantt-bar-dragging');

    if (moved && pending && (pending.newStart !== dragging.origStart || pending.newEnd !== dragging.origEnd)) {
      // 调 store 写入
      const { updateRequirement } = await import('../store/store.js');
      const { toast } = await import('../utils/helpers.js');
      try {
        await updateRequirement(reqId, {
          planned_start: pending.newStart,
          planned_end: pending.newEnd,
        }, { reason: '甘特图拖拽调整' });
        toast(`已更新：${pending.newStart} ~ ${pending.newEnd}`, 'success');
      } catch (err) {
        toast('更新失败，已回滚', 'error');
      }
    }
    dragging = null;
  });
}

function renderTimeAxis(minD, maxD, dayWidth, zoom) {
  const months = [];
  const d = new Date(minD);
  d.setDate(1);
  while (d < maxD) {
    const next = new Date(d); next.setMonth(next.getMonth() + 1);
    const start = Math.max(0, (d - minD) / 86400000) * dayWidth;
    const end = Math.min((maxD - minD) / 86400000, (next - minD) / 86400000) * dayWidth;
    months.push({ label: `${d.getFullYear()}年${d.getMonth() + 1}月`, left: start, width: end - start });
    d.setMonth(d.getMonth() + 1);
  }

  // 次级刻度
  const subTicks = [];
  if (zoom === 'day') {
    // 每天一个刻度
    const cur = new Date(minD);
    while (cur <= maxD) {
      const off = (cur - minD) / 86400000 * dayWidth;
      subTicks.push({ label: cur.getDate(), left: off, isWeekend: cur.getDay() === 0 || cur.getDay() === 6 });
      cur.setDate(cur.getDate() + 1);
    }
  } else if (zoom === 'week') {
    // 每周一
    const cur = new Date(minD);
    while (cur.getDay() !== 1) cur.setDate(cur.getDate() + 1);
    while (cur <= maxD) {
      const off = (cur - minD) / 86400000 * dayWidth;
      subTicks.push({ label: `${cur.getMonth() + 1}/${cur.getDate()}`, left: off });
      cur.setDate(cur.getDate() + 7);
    }
  }

  return `
    <div class="absolute top-0 left-0 right-0 h-6 border-b border-gray-100">
      ${months.map(m => `
        <div class="absolute top-0 h-6 flex items-center px-2 text-[11px] font-medium text-gray-700 border-r border-gray-200" style="left: ${m.left}px; width: ${m.width}px;">
          ${m.label}
        </div>
      `).join('')}
    </div>
    <div class="absolute top-6 left-0 right-0 h-6">
      ${subTicks.map(t => `
        <div class="absolute top-0 h-6 flex items-center justify-center text-[10px] ${t.isWeekend ? 'text-red-400' : 'text-gray-400'}" style="left: ${t.left}px; width: ${dayWidth * (zoom === 'week' ? 7 : 1)}px;">
          ${t.label}
        </div>
      `).join('')}
    </div>
  `;
}

function renderGrid(minD, maxD, dayWidth, totalHeight, zoom) {
  const lines = [];
  const cur = new Date(minD);
  let i = 0;
  while (cur <= maxD) {
    const off = i * dayWidth;
    const dayOfWeek = cur.getDay();
    const isMonthStart = cur.getDate() === 1;
    const isWeekStart = dayOfWeek === 1;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    if (zoom === 'day') {
      // 每日竖线
      lines.push(`<div class="absolute top-0" style="left: ${off}px; width: 1px; height: ${totalHeight}px; background: ${isMonthStart ? '#e5e7eb' : '#f3f4f6'};"></div>`);
      if (isWeekend) {
        lines.push(`<div class="absolute top-0" style="left: ${off}px; width: ${dayWidth}px; height: ${totalHeight}px; background: rgba(243,244,246,0.5);"></div>`);
      }
    } else if (zoom === 'week') {
      if (isWeekStart || isMonthStart) {
        lines.push(`<div class="absolute top-0" style="left: ${off}px; width: 1px; height: ${totalHeight}px; background: ${isMonthStart ? '#e5e7eb' : '#f3f4f6'};"></div>`);
      }
    } else {
      if (isMonthStart) {
        lines.push(`<div class="absolute top-0" style="left: ${off}px; width: 1px; height: ${totalHeight}px; background: #e5e7eb;"></div>`);
      }
    }
    cur.setDate(cur.getDate() + 1);
    i++;
  }
  return lines.join('');
}

function renderTodayLine(minD, dayWidth, totalHeight) {
  const todayOffset = (todayDate() - minD) / 86400000 * dayWidth;
  return `
    <div class="gantt-today-line" style="left: ${todayOffset}px; height: ${totalHeight}px; z-index: 20;">
      <div class="gantt-today-label" style="top: -22px;">今天</div>
    </div>
  `;
}

function renderLeftRow(item, i, critical) {
  const top = i * ROW_HEIGHT;
  if (item.type === 'group') {
    return `
      <div class="absolute left-0 right-0 border-b bg-gradient-to-r from-gray-50 to-white flex items-center px-3" style="top: ${top}px; height: ${ROW_HEIGHT}px;">
        <span class="text-xs font-bold text-gray-800">${escapeHtml(item.name)}</span>
        <span class="ml-2 text-[10px] text-gray-400">${item.count} 个</span>
      </div>
    `;
  }
  const r = item.req;
  const isCrit = critical.has(r.id);
  const hasBlocker = state.blockers.some(b => b.requirement_id === r.id && b.status === 'active');
  return `
    <div class="absolute left-0 right-0 border-b hover:bg-brand-50/30 cursor-pointer left-row-clickable flex items-center pl-6 pr-3 gap-2" data-req-id="${r.id}" style="top: ${top}px; height: ${ROW_HEIGHT}px;">
      ${hasBlocker ? '<span class="text-red-500" title="有阻塞">🚨</span>' : ''}
      ${isCrit ? '<span class="text-red-600 text-xs" title="关键路径">🔥</span>' : ''}
      <span class="text-[10px] text-gray-400 font-mono flex-shrink-0">${r.code.replace('REQ-2026-', '')}</span>
      <span class="text-xs text-gray-800 truncate" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</span>
      <span class="chip prio-${r.priority} text-[9px] ml-auto flex-shrink-0">${r.priority}</span>
    </div>
  `;
}

function renderGanttRow(item, i, minD, dayWidth, critical) {
  const top = i * ROW_HEIGHT;
  if (item.type === 'group') {
    return `<div class="absolute left-0 right-0 border-b bg-gradient-to-r from-gray-50/60 to-transparent" style="top: ${top}px; height: ${ROW_HEIGHT}px;"></div>`;
  }
  const r = item.req;
  const hasBlocker = state.blockers.some(b => b.requirement_id === r.id && b.status === 'active');
  const isCrit = critical.has(r.id);

  const start = new Date(r.planned_start);
  const end = new Date(r.planned_end);
  const left = (start - minD) / 86400000 * dayWidth;
  const width = Math.max(20, (end - start) / 86400000 * dayWidth);
  const progress = r.progress || 0;

  const statusColor = {
    '待评审': 'linear-gradient(90deg, #9ca3af, #6b7280)',
    '已立项': 'linear-gradient(90deg, #60a5fa, #3b82f6)',
    '开发中': 'linear-gradient(90deg, #fbbf24, #f59e0b)',
    '测试中': 'linear-gradient(90deg, #818cf8, #6366f1)',
    '已上线': 'linear-gradient(90deg, #34d399, #10b981)',
    '已搁置': 'linear-gradient(90deg, #d1d5db, #9ca3af)',
  }[r.status] || 'linear-gradient(90deg, #a78bfa, #7c3aed)';

  const bgColor = r.status === '已上线' ? '#d1fae5' : '#f3f4f6';
  const critClass = isCrit ? 'gantt-critical-bar' : '';
  const rowBg = hasBlocker ? 'gantt-blocker-row' : '';

  const barTop = (ROW_HEIGHT - 22) / 2;
  const canDrag = r.status !== '已上线' && r.status !== '已取消';

  return `
    <div class="absolute left-0 right-0 border-b gantt-row ${rowBg}" style="top: ${top}px; height: ${ROW_HEIGHT}px;">
      <div
        class="gantt-bar ${critClass} ${canDrag ? 'gantt-bar-draggable' : ''}"
        data-req-id="${r.id}"
        data-start="${r.planned_start}"
        data-end="${r.planned_end}"
        style="left: ${left}px; width: ${width}px; top: ${barTop}px; background: ${bgColor};"
        title="${escapeHtml(r.title)} | ${formatDate(r.planned_start)} ~ ${formatDate(r.planned_end)} | 进度 ${progress}%${canDrag ? '\n拖拽：两端调整起止日期，中间整体平移' : ''}"
      >
        <div class="gantt-bar-fill" style="width: ${progress}%; background: ${statusColor}; pointer-events: none;"></div>
        <span class="relative z-10 px-2 text-[10px] font-medium truncate ${progress > 30 ? 'text-white' : 'text-gray-700'}" style="pointer-events: none;">
          ${progress}%
        </span>
        ${canDrag ? `
          <span class="gantt-handle gantt-handle-left" data-handle="start" title="拖动调整开始日期"></span>
          <span class="gantt-handle gantt-handle-right" data-handle="end" title="拖动调整结束日期"></span>
        ` : ''}
      </div>
    </div>
  `;
}

function renderDependencyLines(flatList, deps, minD, dayWidth, critical) {
  // 建立 reqId -> rowIndex
  const rowMap = new Map();
  flatList.forEach((item, idx) => {
    if (item.type === 'req') rowMap.set(item.req.id, idx);
  });

  return deps.map(d => {
    const fromRow = rowMap.get(d.from_id);
    const toRow = rowMap.get(d.to_id);
    if (fromRow == null || toRow == null) return '';

    const fromReq = state.requirements.find(r => r.id === d.from_id);
    const toReq = state.requirements.find(r => r.id === d.to_id);
    if (!fromReq?.planned_end || !toReq?.planned_start) return '';

    const fromEnd = new Date(fromReq.planned_end);
    const toStart = new Date(toReq.planned_start);

    const x1 = (fromEnd - minD) / 86400000 * dayWidth;
    const y1 = fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
    const x2 = (toStart - minD) / 86400000 * dayWidth;
    const y2 = toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

    // 折线：x1,y1 -> x1+10,y1 -> x1+10,y2 -> x2,y2
    const mid = x1 + 10;
    const path = `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2 - 2} ${y2}`;
    const isCrit = critical.has(d.from_id) && critical.has(d.to_id);
    const cls = `gantt-dep-line ${isCrit ? 'critical' : ''}`;
    const marker = isCrit ? 'arrow-crit' : 'arrow';
    return `<path d="${path}" class="${cls}" marker-end="url(#${marker})"/>`;
  }).join('');
}
