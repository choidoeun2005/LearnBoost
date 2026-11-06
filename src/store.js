import { initialState, localizeSavedState } from './seeds.js';

export const uid = () => crypto.randomUUID();
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem('sidequestly-workspace'));
    if (stored?.version === 1 && ['workspaces', 'chats', 'notes', 'tasks', 'memories', 'cards', 'edges'].every(key => Array.isArray(stored[key]))) return localizeSavedState(stored);
  } catch {}
  return structuredClone(initialState);
}

export async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `요청에 실패했어요 (${response.status})`);
  return result;
}

export function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
