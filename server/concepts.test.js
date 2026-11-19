import test from 'node:test';
import assert from 'node:assert/strict';
import { applyConceptSuggestions, workspaceConcepts } from '../src/concepts.js';

test('AI concept updates stay in the original workspace and preserve manual edits and locks', () => {
  const entry = (id, name, details = {}) => ({ id, workspaceId: 'one', name, category: '', level: 3, notes: '', locked: false, revision: 'original', ...details });
  const original = [entry('a', '그래프'), entry('b', 'DFS'), entry('c', '이진 탐색'), entry('d', '큐', { workspaceId: 'two' })];
  const state = { workspaces: [{ id: 'one' }, { id: 'two' }], concepts: [original[0], { ...original[1], locked: true, revision: 'locked' }, { ...original[2], level: 5, revision: 'manual' }, original[3]] };
  const changes = { updates: original.map(({ id }) => ({ id, level: 4 })), additions: [{ name: 'ＤＦＳ', category: '', notes: '' }, { name: '큐', category: '자료구조', notes: '선입선출' }] };
  const updated = applyConceptSuggestions(state, 'one', workspaceConcepts({ concepts: original }, 'one'), changes, 'evaluation');
  assert.deepEqual(updated.concepts.map(({ id, level }) => [id, level]), [['a', 4], ['b', 3], ['c', 5], ['d', 3], ['evaluation-1', 3]]);
  assert.equal(updated.concepts[0].updatedBy, 'ai');
  assert.equal(updated.concepts.at(-1).workspaceId, 'one');
  assert.equal(state.concepts[0].level, 3);
});
