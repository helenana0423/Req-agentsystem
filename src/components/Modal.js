// src/components/Modal.js
// 通用 Modal 组件

export function openModal({ title, icon, content, confirmText = '确认', cancelText = '取消', onConfirm, size = 'md', hideFooter = false }) {
  const root = document.getElementById('modal-root');
  const sizeClass = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size] || 'max-w-lg';

  const backdrop = document.createElement('div');
  backdrop.className = 'fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4 drawer-backdrop';
  backdrop.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full ${sizeClass} max-h-[90vh] flex flex-col overflow-hidden drawer-panel" style="animation: fadeIn .2s ease">
      <div class="px-5 py-3 border-b flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-2">
          ${icon ? `<span class="text-lg">${icon}</span>` : ''}
          <h3 class="text-base font-semibold text-gray-900">${title}</h3>
        </div>
        <button class="btn-icon modal-close"><i class="lucide lucide-x"></i></button>
      </div>
      <div class="flex-1 overflow-y-auto p-5">${content}</div>
      ${hideFooter ? '' : `
      <div class="px-5 py-3 border-t bg-gray-50 flex items-center justify-end gap-2 flex-shrink-0">
        <button class="modal-cancel px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">${cancelText}</button>
        <button class="modal-confirm px-4 py-1.5 text-sm text-white bg-brand-600 hover:bg-brand-700 rounded">${confirmText}</button>
      </div>`}
    </div>
  `;
  root.appendChild(backdrop);

  const close = () => {
    backdrop.style.opacity = '0';
    backdrop.style.transition = 'opacity .15s';
    setTimeout(() => backdrop.remove(), 150);
  };

  backdrop.querySelector('.modal-close').addEventListener('click', close);
  backdrop.querySelector('.modal-cancel')?.addEventListener('click', close);
  backdrop.querySelector('.modal-confirm')?.addEventListener('click', () => {
    if (onConfirm) onConfirm(close);
    else close();
  });
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) close();
  });
  return close;
}
