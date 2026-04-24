// src/components/Header.js
// 顶部导航栏

import {
  state, setView, updateFilters, openExtractor,
  exportJson, exportCsv, importJson, resetData, addRequirement,
} from '../store/store.js';
import { toast, escapeHtml } from '../utils/helpers.js';
import { openModal } from './Modal.js';

export function renderHeader(root) {
  root.className = 'flex-shrink-0 bg-white border-b border-gray-200 shadow-soft';
  root.innerHTML = `
    <div class="h-14 px-5 flex items-center gap-4">
      <!-- Logo -->
      <div class="flex items-center gap-2 mr-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-lg font-bold shadow-sm">R</div>
        <div>
          <div class="text-sm font-bold text-gray-900 leading-tight">ReqBoard</div>
          <div class="text-[10px] text-gray-400 leading-tight">需求管理看板 v1.0</div>
        </div>
      </div>

      <!-- 搜索框 -->
      <div class="relative flex-1 max-w-md">
        <i class="lucide lucide-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
        <input
          id="top-search"
          type="text"
          placeholder="搜索需求标题、编号、负责人、标签..."
          value="${escapeHtml(state.filters.keyword)}"
          class="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-50 border border-transparent rounded-lg focus:bg-white hover:bg-gray-100 transition-colors"
        />
      </div>

      <!-- 视图切换 -->
      <div class="flex bg-gray-100 rounded-lg p-0.5">
        ${['kanban', 'table', 'gantt'].map(v => `
          <button data-view="${v}" class="view-switch px-3 py-1 text-xs font-medium rounded-md transition-all ${state.view === v ? 'bg-white shadow-sm text-brand-700' : 'text-gray-500 hover:text-gray-700'}">
            ${v === 'kanban' ? '📋 看板' : v === 'table' ? '🗂️ 表格' : '📊 甘特'}
          </button>
        `).join('')}
      </div>

      <!-- 主按钮 -->
      <button id="btn-extractor" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 rounded-lg shadow-sm transition-all">
        ✨ 粘贴纪要
      </button>

      <button id="btn-new" class="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:border-brand-400 hover:text-brand-700 rounded-lg transition-all">
        <i class="lucide lucide-plus text-xs"></i> 新建需求
      </button>

      <!-- 更多菜单 -->
      <div class="relative" id="more-menu-wrapper">
        <button id="btn-more" class="btn-icon">
          <i class="lucide lucide-more-horizontal"></i>
        </button>
        <div id="more-menu" class="hidden absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
          <button data-action="import" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><i class="lucide lucide-upload text-xs"></i> 导入 (JSON)</button>
          <button data-action="export-json" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><i class="lucide lucide-download text-xs"></i> 导出 JSON</button>
          <button data-action="export-csv" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><i class="lucide lucide-file-text text-xs"></i> 导出 CSV</button>
          <div class="border-t my-1"></div>
          <button data-action="settings" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><i class="lucide lucide-settings text-xs"></i> 设置</button>
          <button data-action="reset" class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-600 flex items-center gap-2"><i class="lucide lucide-refresh-cw text-xs"></i> 重置 Mock 数据</button>
        </div>
      </div>

      <!-- 当前用户 -->
      <div class="flex items-center gap-2 pl-2 border-l">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-semibold">
          ${escapeHtml((state.settings.currentUser || '我').slice(0, 1))}
        </div>
        <div class="hidden lg:block">
          <div class="text-xs font-medium text-gray-900">${escapeHtml(state.settings.currentUser)}</div>
          <div class="text-[10px] text-gray-400">产品经理</div>
        </div>
      </div>
    </div>
  `;

  // 绑定事件
  root.querySelector('#top-search').addEventListener('input', e => {
    updateFilters({ keyword: e.target.value });
  });

  root.querySelectorAll('.view-switch').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });

  root.querySelector('#btn-extractor').addEventListener('click', openExtractor);
  root.querySelector('#btn-new').addEventListener('click', () => openNewReqModal());

  // 更多菜单
  const moreBtn = root.querySelector('#btn-more');
  const moreMenu = root.querySelector('#more-menu');
  moreBtn.addEventListener('click', e => {
    e.stopPropagation();
    moreMenu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => moreMenu.classList.add('hidden'), { once: true });

  moreMenu.querySelectorAll('[data-action]').forEach(b => {
    b.addEventListener('click', () => handleMenuAction(b.dataset.action));
  });
}

function handleMenuAction(action) {
  if (action === 'export-json') {
    const data = exportJson();
    download(data, 'reqboard-export.json', 'application/json');
    toast('已导出 JSON', 'success');
  } else if (action === 'export-csv') {
    const data = exportCsv();
    download('\uFEFF' + data, 'reqboard-export.csv', 'text/csv');
    toast('已导出 CSV', 'success');
  } else if (action === 'import') {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        importJson(obj);
        toast(`导入成功，共 ${obj.requirements?.length || 0} 条需求`, 'success');
      } catch (e) {
        toast('导入失败：JSON 格式错误', 'error');
      }
    };
    inp.click();
  } else if (action === 'reset') {
    if (confirm('确定要重置为初始 Mock 数据吗？所有自定义内容将丢失。')) {
      resetData();
      toast('已重置为初始数据', 'success');
    }
  } else if (action === 'settings') {
    openSettingsModal();
  }
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openNewReqModal() {
  import('../data/mockData.js').then(({ businessLines, statuses, priorities }) => {
    openModal({
      title: '新建需求',
      icon: '📝',
      content: `
        <form id="new-req-form" class="space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">需求编号</label>
              <input disabled value="（后端自动分配）" class="w-full px-3 py-1.5 border rounded bg-gray-50 text-gray-400 italic"/>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">优先级</label>
              <select name="priority" class="w-full px-3 py-1.5 border rounded">
                ${priorities.map(p => `<option value="${p}" ${p === 'P2' ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">标题 *</label>
            <input name="title" required maxlength="80" class="w-full px-3 py-1.5 border rounded" placeholder="简明扼要描述需求"/>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">业务线</label>
              <select name="business_line" class="w-full px-3 py-1.5 border rounded">
                ${businessLines.map(b => `<option>${b}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">状态</label>
              <select name="status" class="w-full px-3 py-1.5 border rounded">
                ${statuses.map(s => `<option>${s}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">产品负责人</label>
              <input name="owner" value="${escapeHtml(state.settings.currentUser)}" class="w-full px-3 py-1.5 border rounded"/>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">开发负责人</label>
              <input name="dev_owner" class="w-full px-3 py-1.5 border rounded"/>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">计划开始</label>
              <input name="planned_start" type="date" class="w-full px-3 py-1.5 border rounded"/>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">计划完成</label>
              <input name="planned_end" type="date" class="w-full px-3 py-1.5 border rounded"/>
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">描述</label>
            <textarea name="description" rows="3" class="w-full px-3 py-1.5 border rounded" placeholder="支持 markdown..."></textarea>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">标签（空格分隔）</label>
            <input name="tags" class="w-full px-3 py-1.5 border rounded" placeholder="如：合规 海外 性能"/>
          </div>
        </form>
      `,
      confirmText: '创建',
      onConfirm: async (close) => {
        const form = document.getElementById('new-req-form');
        const fd = new FormData(form);
        if (!fd.get('title')) { toast('请填写标题', 'error'); return; }
        try {
          const result = await addRequirement({
            // 不传 code —— 让后端自动生成，避免唯一约束冲突
            title: fd.get('title'),
            business_line: fd.get('business_line'),
            status: fd.get('status'),
            priority: fd.get('priority'),
            owner: fd.get('owner'),
            dev_owner: fd.get('dev_owner'),
            planned_start: fd.get('planned_start') || null,
            planned_end: fd.get('planned_end') || null,
            description: fd.get('description'),
            tags: (fd.get('tags') || '').split(/\s+/).filter(Boolean),
          });
          toast(`已创建 ${result?.code || '新需求'}`, 'success');
          close();
        } catch (e) {
          toast(`创建失败：${e.message || e}`, 'error');
        }
      }
    });
  });
}

function openSettingsModal() {
  openModal({
    title: '设置',
    icon: '⚙️',
    content: `
      <div class="space-y-4 text-sm">
        <div>
          <label class="block text-xs text-gray-500 mb-1">当前用户</label>
          <input id="set-user" value="${escapeHtml(state.settings.currentUser)}" class="w-full px-3 py-1.5 border rounded"/>
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">进度计算模式</label>
          <select id="set-progressMode" class="w-full px-3 py-1.5 border rounded">
            <option value="manual" ${state.settings.progressMode === 'manual' ? 'selected' : ''}>手动填写</option>
            <option value="status" ${state.settings.progressMode === 'status' ? 'selected' : ''}>按状态自动映射</option>
          </select>
        </div>
        <label class="flex items-center gap-2">
          <input id="set-autoBlocker" type="checkbox" ${state.settings.autoBlockerFromDep ? 'checked' : ''} class="w-4 h-4"/>
          <span class="text-sm">依赖关系自动产生 Blocker（§4.7.3 联动A）</span>
        </label>
        <label class="flex items-center gap-2">
          <input id="set-autoDelay" type="checkbox" ${state.settings.autoDelayPropagate ? 'checked' : ''} class="w-4 h-4"/>
          <span class="text-sm">Blocker 自动顺延 planned_end（§4.7.3 联动C）</span>
        </label>
        <div class="text-xs text-gray-400 bg-gray-50 rounded p-3 leading-relaxed">
          💡 所有设置仅保存在本地 localStorage，刷新页面依然生效。点击顶部「重置 Mock 数据」可恢复演示数据。
        </div>
      </div>
    `,
    confirmText: '保存',
    onConfirm: (close) => {
      state.settings.currentUser = document.getElementById('set-user').value || '我';
      state.settings.progressMode = document.getElementById('set-progressMode').value;
      state.settings.autoBlockerFromDep = document.getElementById('set-autoBlocker').checked;
      state.settings.autoDelayPropagate = document.getElementById('set-autoDelay').checked;
      toast('设置已保存', 'success');
      close();
      import('../store/store.js').then(m => m.emit && m.emit());
    }
  });
}
