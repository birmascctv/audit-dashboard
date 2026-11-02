import { ref } from 'vue';

export const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
export const lastUpdatedAt = ref(null);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { online.value = true; });
  window.addEventListener('offline', () => { online.value = false; });
}

export function markApiSuccess() {
  lastUpdatedAt.value = Date.now();
  online.value = true;
}

export function markApiFailure() {
  online.value = false;
}
