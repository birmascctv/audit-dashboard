import { ref } from 'vue';

const toasts = ref([]);
let nextId = 1;

export function useToast() {
  function show(message, type = 'info', ms = 3500) {
    const id = nextId++;
    toasts.value.push({ id, message, type });
    setTimeout(() => dismiss(id), ms);
  }
  function dismiss(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }
  return {
    toasts,
    dismiss,
    show,
    success: (m, ms) => show(m, 'success', ms),
    error: (m, ms) => show(m, 'error', ms || 5000),
    info: (m, ms) => show(m, 'info', ms),
  };
}
