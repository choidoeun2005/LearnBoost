import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { removeWorkspace } from '../src/workspace-actions.js';

test('workspace deletion removes its local records, restores a valid selection, and preserves shared data', () => {
  const collections = ['notes', 'tasks', 'memories', 'cards', 'edges', 'concepts'];
  const record = workspaceId => ({ id: workspaceId, workspaceId });
  const state = {
    workspaces: [{ id: 'a' }, { id: 'b' }], workspaceId: 'a', activeChatId: 'a', branchId: 'branch',
    chats: [record('a'), { id: 'branch', workspaceId: 'a' }, record('b')], documents: [{ id: 'shared' }],
    ...Object.fromEntries(collections.map(key => [key, [record('a'), record('b')]])),
  };
  const result = removeWorkspace(state, 'a');
  assert.equal(result.workspaceId, 'b');
  assert.equal(result.activeChatId, 'b');
  assert.equal(result.branchId, null);
  for (const key of [...collections, 'chats']) assert.deepEqual(result[key], [record('b')]);
  assert.equal(result.documents, state.documents);
  assert.equal(removeWorkspace(result, 'b'), result);
  assert.equal(removeWorkspace(result, 'missing'), result);
});
