// src/main.js
// 应用入口

import { state, subscribe, bootstrap } from './store/store.js';
import { renderHeader } from './components/Header.js';
import { renderSidebar } from './components/Sidebar.js';
import { renderKanban } from './views/KanbanView.js';
import { renderTable } from './views/TableView.js';
import { renderGantt } from './views/GanttView.js';
import { renderDrawer } from './components/Drawer.js';
import { renderExtractor } from './components/Extractor.js';
import { renderChat } from './components/Chat.js';
import { escapeHtml } from './utils/helpers.js';

function renderModeBanner() {
  // 根据 state.mode 显示顶部提示条
  const existing = document.getElementById('mode-banner');
  if (state.mode === 'loading') {
    if (!existing) {
      const el = document.createElement('div');
      el.id = 'mode-banner';
      el.className = 'flex-shrink-0 px-4 py-1.5 text-xs text-center bg-gray-100 text-gray-600';
      el.innerHTML = '⏳ 正在连接后端...';
      document.body.insertBefore(el, document.getElementById('app'));
    }
    return;
  }
  if (state.mode === 'offline') {
    if (!existing) {
      const el = document.createElement('div');
      el.id = 'mode-banner';
      el.className = 'flex-shrink-0 px-4 py-1.5 text-xs text-center bg-amber-50 text-amber-800 border-b border-amber-200';
      el.innerHTML = '⚠️ 后端未连接 · 当前为<b>离线演示模式</b>，所有修改仅保存在浏览器 localStorage';
      document.body.insertBefore(el, document.getElementById('app'));
    }
    return;
  }
  if (state.mode === 'online-seed') {
    if (!existing) {
      const el = document.createElement('div');
      el.id = 'mode-banner';
      el.className = 'flex-shrink-0 px-4 py-1.5 text-xs text-center bg-sky-50 text-sky-800 border-b border-sky-200';
      el.innerHTML = '🌱 后端已连接但数据为空 · 当前显示前端演示数据，首次新建需求后会写入后端';
      document.body.insertBefore(el, document.getElementById('app'));
    }
    return;
  }
  // online 模式：移除横幅
  if (existing) existing.remove();
}

function render() {
  const app = document.getElementById('app');

  if (!app.dataset.inited) {
    app.dataset.inited = '1';
    app.innerHTML = `
      <div id="header-slot"></div>
      <div class="flex flex-1 overflow-hidden">
        <div id="sidebar-slot"></div>
        <main id="main-slot" class="flex-1 overflow-hidden flex flex-col bg-gray-50"></main>
      </div>
      <div id="chat-slot"></div>
      <footer class="flex-shrink-0 py-3 text-center text-xs text-gray-400 border-t bg-white">
        <p>ReqBoard · v1.0 · <span id="footer-mode">${state.mode}</span></p>
      </footer>
    `;
  }

  renderModeBanner();

  const footerMode = document.getElementById('footer-mode');
  if (footerMode) {
    const modeLabel = {
      'loading': '⏳ 连接中',
      'online': '🟢 在线（后端真源）',
      'online-seed': '🌱 在线 · 演示数据',
      'offline': '🟠 离线模式',
    }[state.mode] || state.mode;
    footerMode.textContent = modeLabel + (state.llmEnabled ? ' · ✨ LLM 已启用' : ' · 🤖 本地规则引擎');
  }

  // loading 态不渲染主内容
  if (state.mode === 'loading') {
    document.getElementById('main-slot').innerHTML = `
      <div class="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <div class="text-center">
          <div class="text-4xl mb-3">⏳</div>
          <div>正在加载...</div>
        </div>
      </div>
    `;
    return;
  }

  renderHeader(document.getElementById('header-slot'));
  renderSidebar(document.getElementById('sidebar-slot'));

  const mainSlot = document.getElementById('main-slot');
  if (state.view === 'kanban') renderKanban(mainSlot);
  else if (state.view === 'table') renderTable(mainSlot);
  else if (state.view === 'gantt') renderGantt(mainSlot);

  renderDrawer(document.getElementById('drawer-root'));
  renderExtractor(document.getElementById('modal-root'));
  renderChat(document.getElementById('chat-slot'));
}

// 初始渲染（loading 态）
render();

// 订阅状态变更
subscribe(render);

// 异步引导：探测后端 + 拉数据
bootstrap();

// 调试钩子
window.__reqboard = {
  state,
  reload: () => bootstrap(),
};
