// src/js/toast.js
//
// Notificação não-bloqueante para substituir alert(), que trava a thread e
// fica particularmente ruim no celular. Vive fora da árvore de #app (anexada
// direto no body) para não ser apagada a cada render().

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = 'error') {
  const el = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  el.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  const remove = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  };
  setTimeout(remove, 5000);
  toast.onclick = remove;
}
