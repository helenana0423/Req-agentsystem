// src/components/Chat.js
// Agent 问答浮条与面板

import { state, toggleChat, computeCriticalPath, simulateDelayPropagation, getActiveBlockersFor } from '../store/store.js';
import { escapeHtml, formatDate, relativeTime } from '../utils/helpers.js';
import { blockerTypes } from '../data/mockData.js';

// 生成稳定 id（不用 uuid 避免导入环）
function genId() {
  return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

let chatMessages = [
  {
    id: genId(),
    role: 'assistant',
    content: '你好，我是 ReqBoard Agent 👋\n\n你可以问我：\n• 某条需求的进展 / 阻塞 / 变更历史\n• 当前所有被阻塞的需求\n• 某条需求延期 N 天的影响\n• 关键路径 / 人员维度的汇总',
    time: new Date().toISOString(),
  }
];

// 当前正在流式的控制器（支持中断）
let currentStreamController = null;

const PRESET_QUESTIONS = [
  'REQ-42 现在进展怎么样？',
  '哪些需求被阻塞了？',
  '关键路径上有哪些需求？',
  '本周 P0 需求状态',
  'Helena负责的未上线需求',
  'REQ-42 延期 3 天影响哪些下游？',
];

export function renderChat(root) {
  root.innerHTML = `
    <!-- 浮条按钮 -->
    <button id="chat-toggle" class="fixed bottom-5 right-5 z-30 px-4 py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 ${state.chatOpen ? 'hidden' : ''}">
      💬 <span class="text-sm font-medium">问问 Agent</span>
    </button>

    ${state.chatOpen ? renderChatPanel() : ''}
  `;

  root.querySelector('#chat-toggle')?.addEventListener('click', toggleChat);
  if (state.chatOpen) bindChatPanel(root);
}

function renderChatPanel() {
  return `
    <div class="fixed bottom-5 right-5 z-30 w-[420px] h-[600px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden drawer-panel" style="animation: slideInRight .2s;">
      <!-- Header -->
      <div class="flex-shrink-0 px-4 py-3 bg-gradient-to-r from-brand-600 to-brand-700 text-white flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">🤖</div>
          <div>
            <div class="text-sm font-semibold">ReqBoard Agent</div>
            <div class="text-[10px] text-white/70">基于本地需求库回答</div>
          </div>
        </div>
        <button id="chat-close"
          class="w-8 h-8 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/15 transition-colors text-lg leading-none"
          title="收起 Agent 面板"
          aria-label="收起">
          ×
        </button>
      </div>

      <!-- 消息列表 -->
      <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        ${chatMessages.map(renderMessage).join('')}
      </div>

      <!-- 预设问题 -->
      <div class="flex-shrink-0 px-3 py-2 border-t bg-white overflow-x-auto whitespace-nowrap">
        ${PRESET_QUESTIONS.map(q => `
          <button class="preset-q inline-block mr-1.5 mb-1 px-2.5 py-1 text-[11px] text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-full">${escapeHtml(q)}</button>
        `).join('')}
      </div>

      <!-- 输入栏 -->
      <div class="flex-shrink-0 p-3 border-t bg-white">
        <div class="flex items-center gap-2">
          <input id="chat-input" type="text" placeholder="问一下需求状态..."
            class="flex-1 px-3 py-2 text-sm bg-gray-50 rounded-lg focus:bg-white border border-transparent"/>
          <button id="chat-send"
            class="w-9 h-9 flex items-center justify-center text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-all"
            title="发送 (Enter)"
            aria-label="发送"
            data-mode="send">
            <!-- 纸飞机（发送态）-->
            <svg class="send-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 2 11 13"/>
              <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
            <!-- 正方形（中断态，默认隐藏）-->
            <svg class="stop-icon hidden" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderMessage(m) {
  if (m.role === 'user') {
    return `
      <div class="flex justify-end" data-msg-id="${m.id}">
        <div class="max-w-[85%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm">
          ${escapeHtml(m.content)}
        </div>
      </div>
    `;
  }
  // assistant 消息：pending 态（无 content 且正在 streaming）显示三点动画
  const isPending = m.streaming && !m.content;
  const body = isPending
    ? `<span class="chat-pending-dots"><span></span><span></span><span></span></span>`
    : formatMessageContent(m.content || '');
  return `
    <div class="flex gap-2" data-msg-id="${m.id}">
      <div class="flex-shrink-0 w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-sm">🤖</div>
      <div class="max-w-[85%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm text-gray-800 leading-relaxed">
        <div class="msg-body">${body}</div>
        ${m.citations && !isPending ? `<div class="mt-2 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
          📎 引用：${m.citations.map(c => escapeHtml(c)).join(' · ')}
        </div>` : ''}
      </div>
    </div>
  `;
}

function formatMessageContent(content) {
  // 保留换行和粗体
  return escapeHtml(content)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function bindChatPanel(root) {
  root.querySelector('#chat-close').addEventListener('click', toggleChat);

  const input = root.querySelector('#chat-input');
  const sendBtn = root.querySelector('#chat-send');
  const handleSendOrAbort = () => {
    const mode = sendBtn.dataset.mode;
    if (mode === 'abort') {
      // 中断当前流式
      if (currentStreamController) {
        currentStreamController.abort();
        currentStreamController = null;
      }
      return;
    }
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    askAgent(q);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && sendBtn.dataset.mode === 'send') handleSendOrAbort();
  });
  sendBtn.addEventListener('click', handleSendOrAbort);

  root.querySelectorAll('.preset-q').forEach(b => {
    b.addEventListener('click', () => {
      if (sendBtn.dataset.mode === 'abort') return; // 正在回答中，屏蔽预设
      input.value = b.textContent;
      handleSendOrAbort();
    });
  });

  // 滚动到底部
  const msgsEl = root.querySelector('#chat-messages');
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

// 切换发送按钮为 "发送/中断" 两种态
function setSendButtonMode(mode) {
  const btn = document.getElementById('chat-send');
  if (!btn) return;
  btn.dataset.mode = mode;
  const sendIcon = btn.querySelector('.send-icon');
  const stopIcon = btn.querySelector('.stop-icon');
  if (mode === 'abort') {
    btn.title = '中断回答';
    btn.setAttribute('aria-label', '中断');
    btn.classList.remove('bg-brand-600', 'hover:bg-brand-700');
    btn.classList.add('bg-red-500', 'hover:bg-red-600');
    sendIcon?.classList.add('hidden');
    stopIcon?.classList.remove('hidden');
  } else {
    btn.title = '发送 (Enter)';
    btn.setAttribute('aria-label', '发送');
    btn.classList.remove('bg-red-500', 'hover:bg-red-600');
    btn.classList.add('bg-brand-600', 'hover:bg-brand-700');
    sendIcon?.classList.remove('hidden');
    stopIcon?.classList.add('hidden');
  }
}

export function openChatWithQuestion(q) {
  if (!state.chatOpen) {
    state.chatOpen = true;
    import('../store/store.js').then(m => m.emit && m.emit());
    setTimeout(() => askAgent(q), 200);
  } else {
    askAgent(q);
  }
}

async function askAgent(question) {
  // 用户消息
  chatMessages.push({
    id: genId(),
    role: 'user',
    content: question,
    time: new Date().toISOString(),
  });

  // 助手占位消息：pending 态（streaming=true 且 content 为空）
  const placeholder = {
    id: genId(),
    role: 'assistant',
    content: '',
    time: new Date().toISOString(),
    streaming: true,
  };
  chatMessages.push(placeholder);
  renderChatList();

  // 在线 + LLM 启用 → 走后端 SSE
  if (state.mode === 'online' && state.llmEnabled) {
    setSendButtonMode('abort');
    currentStreamController = new AbortController();

    try {
      const { askAgentStream } = await import('../api/agent.js');

      await askAgentStream(
        question,
        // onChunk
        (chunk) => {
          placeholder.content += chunk;
          updateMessageDom(placeholder);
        },
        // onDone
        () => {
          placeholder.streaming = false;
          updateMessageDom(placeholder); // 重渲染去掉 pending 标记
          setSendButtonMode('send');
          currentStreamController = null;
        },
        // onError
        (err) => {
          // 若是主动中断
          if (err && /abort|aborted|cancel/i.test(String(err))) {
            if (!placeholder.content) {
              placeholder.content = '（已中断）';
            } else {
              placeholder.content += '\n\n_（已中断）_';
            }
          } else {
            // 非中断错误 → 降级到本地规则引擎
            const fallback = generateAnswer(question);
            placeholder.content = `⚠️ LLM 调用失败：${err}\n\n已降级到本地规则引擎回答：\n\n${fallback.content}`;
            placeholder.citations = fallback.citations;
          }
          placeholder.streaming = false;
          updateMessageDom(placeholder);
          setSendButtonMode('send');
          currentStreamController = null;
        },
        // signal
        currentStreamController.signal,
      );
      return;
    } catch (e) {
      console.error('[Chat] askAgentStream 异常:', e);
      // 走到下面的本地规则引擎兜底
      setSendButtonMode('send');
      currentStreamController = null;
    }
  }

  // 本地规则引擎（LLM 未启用 或 上面 fallback）
  setTimeout(() => {
    const answer = generateAnswer(question);
    placeholder.content = answer.content;
    placeholder.citations = answer.citations;
    placeholder.streaming = false;
    updateMessageDom(placeholder);
  }, 300 + Math.random() * 300);
}

// 全量渲染（只在消息数量变化时调用）
function renderChatList() {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  el.innerHTML = chatMessages.map(renderMessage).join('');
  el.scrollTop = el.scrollHeight;
}

// 增量更新单条消息的 DOM（流式过程中用，避免闪烁 + 避免全量 innerHTML 带来的状态丢失）
function updateMessageDom(m) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const el = container.querySelector(`[data-msg-id="${m.id}"]`);
  if (!el) {
    // DOM 里没有，降级到全量渲染
    renderChatList();
    return;
  }
  // 直接替换这一条的 innerHTML（保留外层结构稳定，不重绘整个列表）
  const newHtml = renderMessage(m);
  // 用 outerHTML 整体替换单条
  el.outerHTML = newHtml;
  container.scrollTop = container.scrollHeight;
}

// ========== 回答生成器（结构化查询 + 简单 RAG 模拟） ==========
function generateAnswer(q) {
  const ql = q.toLowerCase();
  const reqs = state.requirements;
  const blockers = state.blockers;

  // 尝试解析编号
  const codeMatch = q.match(/REQ[-\s]?(\d{4}-\d{4}|\d{2,4})/i);
  const refReq = codeMatch ? findReqByRef(codeMatch[0], reqs) : null;

  // 问题1：延期影响
  if (refReq && /(延期|晚\s*\d|推迟)/.test(q)) {
    const dm = q.match(/(\d+)\s*天/);
    const days = dm ? Number(dm[1]) : 3;
    const newEnd = addDaysToDate(refReq.planned_end, days);
    const affected = simulateDelayPropagation(refReq.id, newEnd);
    if (affected.length === 0) {
      return { content: `✅ ${refReq.code} 延期 ${days} 天不会影响下游需求（没有下游依赖，或 pushDays 未触发传导）。`, citations: [`${refReq.code} 依赖关系`] };
    }
    let text = `**${refReq.code}（${refReq.title}）延期 ${days} 天**，将影响以下 ${affected.length} 条下游需求：\n\n`;
    affected.forEach(a => {
      text += `• ${a.code} 《${a.title}》：${formatDate(a.oldEnd)} → **${formatDate(a.newEnd)}**（+${a.pushDays} 天）\n`;
    });
    text += `\n💡 建议：检查关键路径，或与下游负责人协商资源补位。`;
    return { content: text, citations: ['依赖图', '延期传导算法'] };
  }

  // 问题2：关键路径
  if (/(关键路径|critical)/.test(q)) {
    const critical = computeCriticalPath();
    const items = [...critical].map(id => reqs.find(r => r.id === id)).filter(Boolean);
    if (!items.length) return { content: '当前没有明显的关键路径（可能是需求间依赖较少）。' };
    items.sort((a, b) => new Date(a.planned_end) - new Date(b.planned_end));
    let text = `🔥 当前项目的关键路径上共 **${items.length}** 条需求：\n\n`;
    items.forEach(r => {
      text += `• ${r.code} 《${r.title}》· ${r.status} · 截止 ${formatDate(r.planned_end)}\n`;
    });
    text += `\n这些需求中任何一条延期，都会影响整体项目交付。`;
    return { content: text, citations: ['CPM 关键路径算法', '依赖关系'] };
  }

  // 问题3：阻塞汇总
  if (/(阻塞|卡在|卡点|blocker)/.test(q)) {
    const active = blockers.filter(b => b.status === 'active');
    if (refReq) {
      const my = active.filter(b => b.requirement_id === refReq.id);
      if (!my.length) return { content: `${refReq.code} 当前**无活跃阻塞**。` };
      let text = `${refReq.code}《${refReq.title}》当前有 ${my.length} 个活跃阻塞：\n\n`;
      my.forEach(b => {
        const days = Math.max(1, Math.round((new Date('2026-04-23') - new Date(b.created_at)) / 86400000));
        text += `• **${blockerTypes[b.blocker_type]}**：${b.description}\n`;
        text += `  已持续 ${days} 天${b.blocking_person ? '，阻塞方：' + b.blocking_person : ''}${b.expected_resolve_date ? '，预期 ' + formatDate(b.expected_resolve_date) + ' 解除' : ''}\n`;
      });
      return { content: text, citations: [`${refReq.code} blocker 表`] };
    }
    if (!active.length) return { content: '🎉 当前没有任何活跃阻塞，团队推进顺畅。' };
    let text = `🚨 当前共 **${active.length}** 条需求被阻塞：\n\n`;
    active.forEach(b => {
      const r = reqs.find(r => r.id === b.requirement_id);
      const days = Math.max(1, Math.round((new Date('2026-04-23') - new Date(b.created_at)) / 86400000));
      text += `• ${r?.code || '?'} 《${r?.title || '?'}》· ${blockerTypes[b.blocker_type]} · 已 ${days} 天\n  ${b.description.slice(0, 60)}\n`;
    });
    return { content: text, citations: ['Blocker 表', 'Active 筛选'] };
  }

  // 问题4：单条进展
  if (refReq && /(进展|状态|怎么样|到哪|做到)/.test(q)) {
    const notes = state.progressNotes
      .filter(n => n.requirement_id === refReq.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    const active = blockers.filter(b => b.requirement_id === refReq.id && b.status === 'active');
    let text = `**${refReq.code}《${refReq.title}》**\n`;
    text += `当前状态：**${refReq.status}** · 进度 ${refReq.progress || 0}% · 负责人 ${refReq.owner}\n`;
    if (refReq.planned_end) text += `计划完成：${formatDate(refReq.planned_end)}\n`;
    if (active.length) {
      text += `\n🚨 **活跃阻塞 ${active.length} 项：**\n`;
      active.forEach(b => {
        const days = Math.max(1, Math.round((new Date('2026-04-23') - new Date(b.created_at)) / 86400000));
        text += `• ${b.description}（已 ${days} 天）\n`;
      });
    }
    if (notes.length) {
      text += `\n📝 **最近进展：**\n`;
      notes.forEach(n => {
        text += `• ${formatDate(n.created_at)} · ${n.content.slice(0, 80)}\n`;
      });
    }
    return { content: text, citations: [`${refReq.code} 进展时间线`, `${refReq.code} Blocker`] };
  }

  // 问题5：边界 / scope
  if (refReq && /(边界|scope|范围)/.test(q)) {
    let text = `**${refReq.code}《${refReq.title}》当前功能边界：**\n\n${refReq.scope || '（未填写 scope）'}`;
    const scopeChanges = state.changes.filter(c => c.requirement_id === refReq.id && c.change_type === 'scope_adjust');
    if (scopeChanges.length) {
      text += `\n\n---\n📜 **历史 scope 调整：** ${scopeChanges.length} 次\n`;
      scopeChanges.forEach(c => {
        text += `• ${formatDate(c.created_at)}：${c.reason || '-'}\n`;
      });
    }
    return { content: text, citations: ['requirement.scope', 'change 表 scope_adjust 类型'] };
  }

  // 问题6：优先级 / 时间范围汇总
  const pMatch = q.match(/P[0-3]/i);
  if (pMatch) {
    const p = pMatch[0].toUpperCase();
    let list = reqs.filter(r => r.priority === p);
    if (/(未上线|未完成|在做)/.test(q)) list = list.filter(r => r.status !== '已上线' && r.status !== '已取消');
    if (/(本周|这周|最近)/.test(q)) {
      const weekStart = new Date('2026-04-23'); weekStart.setDate(weekStart.getDate() - 3);
      const weekEnd = new Date('2026-04-23'); weekEnd.setDate(weekEnd.getDate() + 4);
      list = list.filter(r => {
        const t = new Date(r.updated_at);
        return t >= weekStart && t <= weekEnd;
      });
    }
    if (!list.length) return { content: `没有找到符合条件的 ${p} 需求。` };
    let text = `🔍 **${p} 需求共 ${list.length} 条：**\n\n`;
    list.forEach(r => {
      text += `• ${r.code}《${r.title}》· ${r.status} · ${r.progress || 0}% · @${r.owner}\n`;
    });
    return { content: text, citations: [`priority=${p}`] };
  }

  // 问题7：负责人（支持中文 2-4 字 和 英文名）
  const ownerMatch = q.match(/([A-Za-z]{2,20}|[\u4e00-\u9fa5]{2,4})(?:负责|手上|的需求|的)/);
  if (ownerMatch) {
    const owner = ownerMatch[1];
    let list = reqs.filter(r => r.owner === owner || r.dev_owner === owner);
    if (/(未上线|在做|开发中)/.test(q)) list = list.filter(r => r.status !== '已上线' && r.status !== '已取消');
    if (!list.length) return { content: `没有找到 ${owner} 相关的需求。（请确认拼写或是否为当前用户）` };
    let text = `👤 **${owner} 相关需求 ${list.length} 条：**\n\n`;
    list.forEach(r => {
      text += `• ${r.code}《${r.title}》· ${r.status} · ${r.progress || 0}%\n`;
    });
    return { content: text, citations: [`owner/dev_owner = ${owner}`] };
  }

  // 兜底
  return {
    content: '抱歉，我目前只能回答以下类型的问题：\n\n• 具体需求的进展/阻塞/边界（如：REQ-42 怎么样？）\n• 整体汇总（如：P0 需求有哪些？Helena手上的需求）\n• 依赖分析（如：REQ-42 延期 3 天影响谁？关键路径是什么？）\n\n演示版规则引擎能力有限，真实 v1.0 会接入 LLM + RAG。',
  };
}

function findReqByRef(ref, reqs) {
  const s = String(ref).trim();
  const codeMatch = s.match(/REQ[-\s]?(\d{4}-\d{4}|\d{2,4})/i);
  if (codeMatch) {
    const found = reqs.find(r => r.code === codeMatch[0]);
    if (found) return found;
    const num = codeMatch[0].match(/\d+$/)?.[0];
    if (num) return reqs.find(r => r.code.endsWith(num.padStart(4, '0'))) || null;
  }
  return null;
}

function addDaysToDate(iso, n) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
