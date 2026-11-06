import test from 'node:test';
import assert from 'node:assert/strict';
import { englishSeedState, initialState, localizeSavedState } from '../src/seeds.js';
import { buildMessages } from './rag.js';

test('localization translates unchanged examples and preserves personal content and layout', () => {
  const saved = structuredClone(englishSeedState);
  saved.notes[0].nodes[0].text = 'My own research notes';
  saved.notes[0].nodes.reverse();
  saved.notes.push({ id: 'personal-note', title: 'A network of ideas', nodes: [{ id: 'personal-node', text: 'Before computers' }] });
  saved.chats[0].messages.push({ id: 'personal-message', role: 'user', content: 'And the Memex — was that ever built?' });
  saved.chats[0].pinned = true;
  saved.tasks[0].done = false;
  saved.cards[0].x = 320;
  saved.activeChatId = 'personal-chat';
  const original = structuredClone(saved);
  const migrated = localizeSavedState(saved);
  assert.equal(migrated.workspaces[0].name, initialState.workspaces[0].name);
  assert.equal(migrated.chats[0].messages[0].content, initialState.chats[0].messages[0].content);
  assert.equal(migrated.notes[0].nodes.find(node => node.id === 'node-2').text, initialState.notes[0].nodes[1].text);
  assert.equal(migrated.notes[0].nodes.find(node => node.id === 'node-1').text, 'My own research notes');
  assert.deepEqual(migrated.notes.at(-1), original.notes.at(-1));
  assert.deepEqual(migrated.chats[0].messages.at(-1), original.chats[0].messages.at(-1));
  assert.equal(migrated.chats[0].pinned, true);
  assert.equal(migrated.tasks[0].done, false);
  assert.equal(migrated.cards[0].x, 320);
  assert.equal(migrated.activeChatId, 'personal-chat');
  assert.deepEqual(saved, original);
  assert.equal(localizeSavedState(migrated), migrated);
});

test('localization keeps deleted samples deleted and never translates newly created content', () => {
  const saved = structuredClone(englishSeedState);
  saved.notes = [{ id: 'custom-note', title: 'A network of ideas', nodes: [] }];
  saved.chats = [];
  saved.tasks = [];
  const migrated = localizeSavedState(saved);
  assert.deepEqual(migrated.notes, saved.notes);
  assert.deepEqual(migrated.chats, []);
  assert.deepEqual(migrated.tasks, []);
});

test('Korean is the answer default while users can explicitly request another language', () => {
  const [system, question] = buildMessages([{ role: 'user', content: 'Please answer in English.' }], []);
  assert.match(system.content, /Respond in natural Korean by default/);
  assert.match(system.content, /Use another language only when the user explicitly requests it/);
  assert.equal(question.content, 'Please answer in English.');
});
