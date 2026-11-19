export const understandingLevels = ['처음 접함', '익숙하지 않음', '기본 이해', '설명할 수 있음', '응용할 수 있음'];

export function workspaceConcepts(state, workspaceId) {
  return (state.concepts || []).filter(concept => concept.workspaceId === workspaceId);
}

export function conceptNameKey(name) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko');
}

export function learningProfile(concepts) {
  return concepts.map(({ id, name, category, level, locked }) => ({ id, name, category, level, locked }));
}

export function applyConceptSuggestions(state, workspaceId, snapshot, suggestions, revision) {
  if (!state.workspaces.some(workspace => workspace.id === workspaceId)) return state;
  const previous = state.concepts || [];
  const expected = new Map(snapshot.map(concept => [concept.id, concept.revision]));
  const updates = new Map(suggestions.updates.map(item => [item.id, item.level]));
  const items = previous.map(concept => {
    if (concept.workspaceId !== workspaceId || concept.locked || !expected.has(concept.id) || expected.get(concept.id) !== concept.revision || !updates.has(concept.id)) return concept;
    const level = updates.get(concept.id);
    if (!Number.isInteger(level) || level < 1 || level > 5 || Math.abs(level - concept.level) !== 1) return concept;
    return { ...concept, level, revision, updatedBy: 'ai' };
  });
  const names = new Set([...workspaceConcepts(state, workspaceId), ...snapshot].map(concept => conceptNameKey(concept.name)));
  for (const [index, suggestion] of suggestions.additions.entries()) {
    const key = conceptNameKey(suggestion.name);
    if (!key || names.has(key)) continue;
    names.add(key);
    items.push({ id: `${revision}-${index}`, workspaceId, name: suggestion.name, category: suggestion.category, notes: suggestion.notes, level: 3, locked: false, revision, updatedBy: 'ai' });
  }
  return { ...state, concepts: items };
}
