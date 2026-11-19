export function removeWorkspace(state, id) {
  const workspaces = state.workspaces.filter(workspace => workspace.id !== id);
  if (!workspaces.length || workspaces.length === state.workspaces.length) return state;
  const workspaceId = state.workspaceId === id ? workspaces[0].id : state.workspaceId;
  const chats = state.chats.filter(chat => chat.workspaceId !== id);
  const activeChatId = chats.find(chat => chat.id === state.activeChatId && chat.workspaceId === workspaceId)?.id
    ?? chats.findLast(chat => chat.workspaceId === workspaceId)?.id ?? null;
  const branchId = activeChatId === state.activeChatId && chats.some(chat => chat.id === state.branchId && chat.workspaceId === workspaceId) ? state.branchId : null;
  const retained = Object.fromEntries(['notes', 'tasks', 'memories', 'cards', 'edges', 'concepts'].map(key => [key, (state[key] || []).filter(item => item.workspaceId !== id)]));
  return { ...state, ...retained, chats, workspaces, workspaceId, activeChatId, branchId };
}
