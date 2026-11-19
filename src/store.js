import { initialState, localizeSavedState } from './seeds.js';

export const workspaceStorageKey = 'learnboost-workspace';
export const themeStorageKey = 'learnboost-theme';
export const uid = () => crypto.randomUUID();
export const dayKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(workspaceStorageKey) ?? localStorage.getItem('sidequestly-workspace'));
    if (stored?.version === 1 && ['workspaces', 'chats', 'notes', 'tasks', 'memories', 'cards', 'edges'].every(key => Array.isArray(stored[key]))) return localizeSavedState(stored);
  } catch {}
  return structuredClone(initialState);
}

export async function api(url, { onEvent, ...options } = {}) {
  const response = await fetch(`/api${url}`, { ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
  if (response.ok && response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        pending += done ? '\n' : value;
        const lines = pending.split('\n');
        pending = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'done') return event;
          if (event.type === 'error') throw new Error(event.error);
          onEvent?.(event);
        }
        if (done) throw new Error('답변을 받는 중 연결이 끊겼어요. 질문을 다시 보낼 수 있어요.');
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
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
