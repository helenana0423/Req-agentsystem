// src/utils/helpers.js
// 工具函数集合

export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function nowIso() {
  return new Date().toISOString();
}

// 日期工具（以 2026-04-23 为"今天"的基准，方便 Mock 数据呈现一致性）
export const TODAY_ISO = '2026-04-23';
export function todayDate() { return new Date(TODAY_ISO); }

export function parseDate(s) {
  if (!s) return null;
  return new Date(s);
}

export function formatDate(iso, withTime = false) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (!withTime) return `${y}-${m}-${day}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function daysBetween(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  return Math.round((d2 - d1) / 86400000);
}

export function addDays(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function relativeTime(iso) {
  if (!iso) return '';
  const diff = (todayDate() - new Date(iso)) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}天前`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}个月前`;
  return `${Math.floor(mo / 12)}年前`;
}

// HTML 转义
export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 简单 markdown 渲染（加粗、换行、列表）
export function renderMarkdown(md) {
  if (!md) return '<span class="text-gray-400">暂无内容</span>';
  let html = escapeHtml(md);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-5 list-disc">$1</li>');
  html = html.replace(/(<li.+<\/li>\n?)+/g, m => `<ul class="my-1">${m}</ul>`);
  html = html.replace(/\n/g, '<br/>');
  return html;
}

// Toast
export function toast(message, type = 'info', duration = 2200) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconMap = { success: '✅', error: '❌', info: 'ℹ️', warn: '⚠️' };
  el.innerHTML = `<span>${iconMap[type] || iconMap.info}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all .2s';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

// 防抖
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// 深拷贝
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// 生成下一个 REQ 编号
export function nextReqCode(existing) {
  const year = 2026;
  const nums = existing
    .map(r => r.code && r.code.match(new RegExp(`REQ-${year}-(\\d+)`)))
    .filter(Boolean)
    .map(m => parseInt(m[1]));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `REQ-${year}-${String(next).padStart(4, '0')}`;
}

// 状态映射到进度
export const STATUS_TO_PROGRESS = {
  '待评审': 0, '已立项': 10, '开发中': 50, '测试中': 80, '已上线': 100, '已搁置': null,
};

// 相似度（粗糙实现，MVP 用于 Agent 抽取匹配）
export function similarity(a, b) {
  if (!a || !b) return 0;
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  if (sa === sb) return 1;
  // 简单字符集交集比例
  const setA = new Set(sa);
  const setB = new Set(sb);
  let inter = 0;
  setA.forEach(c => { if (setB.has(c)) inter++; });
  return inter / Math.max(setA.size, setB.size);
}
