const currentDate = new Date();
const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

export const englishSeedState = {
  version: 1,
  workspaces: [{ id: 'research', name: 'Before computers', instructions: '' }],
  workspaceId: 'research',
  activeChatId: 'example',
  branchId: 'example-branch',
  chats: [{
    id: 'example', workspaceId: 'research', title: 'How people organized knowledge before computers', date: today, example: true, documentIds: [],
    messages: [
      { id: 'question-1', role: 'user', content: 'How did the slip box handle a new idea that belonged in the middle of an existing sequence?' },
      { id: 'answer-1', role: 'assistant', content: 'Each card carried an address instead of a page number. A thought that continued card 21 could be filed behind it as 21a, and a thought branching off that became 21a1.\n\nNothing needed to be renumbered. **Every cross-reference written on another card stayed valid.** The box could grow around an idea without breaking the connections that already existed.\n\nThis is a useful way to think about your own notes: let the connections grow, instead of deciding on the perfect folder structure in advance.' },
      { id: 'question-2', role: 'user', content: 'And the Memex — was that ever built?' },
      { id: 'answer-2', role: 'assistant', content: 'The Memex was a concept described by Vannevar Bush in 1945: a desk that would store a personal library on microfilm and connect material through associative trails.\n\nIts lasting idea is that **the path a reader takes through information is itself worth keeping**. A trail records not just what you read, but how you connected it.' },
    ],
  }, {
    id: 'example-branch', workspaceId: 'research', title: 'Why stable addresses matter', date: today, parentId: 'example', sourceMessageId: 'answer-1', selection: 'Every cross-reference written on another card stayed valid.', example: true, documentIds: [],
    inherited: [{ role: 'user', content: 'How did the slip box handle a new idea?' }, { role: 'assistant', content: 'Each card has a stable address; new cards branch from it without renumbering existing cards.' }],
    messages: [
      { id: 'branch-question', role: 'user', content: 'Why did stable card addresses matter so much for cross-references?' },
      { id: 'branch-answer', role: 'assistant', content: 'A reference is only as useful as the address it points to. In a numbered notebook, inserting pages changes the location of everything after them.\n\nA stable address turns a reference into a permanent connection. You can add many cards around 21a, and an older note pointing to 21a still lands in the right place.\n\nThat is how a collection can keep growing without needing to be reorganized. Structure comes from the links between ideas, as well as from where you put them.' },
    ],
  }],
  notes: [{ id: 'note-1', workspaceId: 'research', title: 'A network of ideas', date: today, nodes: [
    { id: 'node-1', text: 'Knowledge grows through connections, not just collections. #research', depth: 0 },
    { id: 'node-2', text: 'The Memex keeps a trail through ideas.', depth: 1 },
    { id: 'node-3', text: 'The Zettelkasten gives each idea a stable address.', depth: 1 },
    { id: 'node-4', text: 'What would a digital slip box look like for my own work?', depth: 0 },
  ] }, { id: 'note-2', workspaceId: 'research', title: 'Questions worth following', date: today, nodes: [{ id: 'node-5', text: 'How can we keep the context behind an answer? #questions', depth: 0 }] }],
  tasks: [{ id: 'task-1', workspaceId: 'research', text: 'Read about associative trails', due: today, done: true }, { id: 'task-2', workspaceId: 'research', text: 'Connect two ideas in the canvas', due: today, done: false }],
  memories: [],
  cards: [{ id: 'card-1', workspaceId: 'research', noteId: 'note-1', x: 80, y: 90 }, { id: 'card-2', workspaceId: 'research', noteId: 'note-2', x: 470, y: 270 }],
  edges: [{ id: 'edge-1', workspaceId: 'research', from: 'card-1', to: 'card-2', label: 'leads to' }],
};


const translations = {
  "research": {
    "name": "컴퓨터 이전의 지식 정리"
  },
  "example": {
    "title": "컴퓨터가 없던 시절, 지식은 어떻게 정리했을까?"
  },
  "question-1": {
    "content": "기존 순서 중간에 새로운 아이디어를 넣어야 할 때, 메모 상자는 어떻게 처리했어?"
  },
  "answer-1": {
    "content": "각 카드에는 페이지 번호 대신 고유한 주소가 있었어요. 21번 카드에서 이어지는 생각은 21a, 거기서 갈라져 나온 생각은 21a1로 넣을 수 있었죠.\n\n기존 번호를 다시 매길 필요가 없었어요. **다른 카드에 적어 둔 참조도 그대로 유효했어요.** 이미 만들어 둔 연결을 깨뜨리지 않고 새로운 아이디어를 추가할 수 있었던 거예요.\n\n내 노트를 정리할 때도 활용할 수 있는 방식이에요. 처음부터 완벽한 폴더 구조를 정하기보다, 생각 사이의 연결이 자라나도록 해 보세요."
  },
  "question-2": {
    "content": "그럼 메멕스는 실제로 만들어진 거야?"
  },
  "answer-2": {
    "content": "메멕스(Memex)는 버니바 부시가 1945년에 제안한 장치예요. 개인 자료를 마이크로필름에 저장하고, 서로 연관된 자료를 하나의 경로로 연결하는 책상 형태의 구상이었어요. 구상한 모습 그대로 제작되지는 않았어요.\n\n핵심은 **독자가 정보를 따라간 경로 자체도 보존할 가치가 있다**는 생각이에요. 무엇을 읽었는지뿐 아니라, 그것들을 어떻게 연결했는지도 남기는 거죠."
  },
  "example-branch": {
    "title": "변하지 않는 주소가 중요한 이유",
    "selection": "다른 카드에 적어 둔 참조도 그대로 유효했어요.",
    "inherited": [
      {
        "role": "user",
        "content": "메모 상자는 새로운 아이디어를 어떻게 추가했어?"
      },
      {
        "role": "assistant",
        "content": "각 카드에는 고정된 주소가 있어요. 기존 카드의 번호를 바꾸지 않고 새 카드를 이어 붙일 수 있어요."
      }
    ]
  },
  "branch-question": {
    "content": "카드의 주소가 바뀌지 않는 게 참조에 왜 그렇게 중요했어?"
  },
  "branch-answer": {
    "content": "참조는 가리키는 위치가 정확할 때 의미가 있어요. 페이지 번호를 쓰는 공책에 새 페이지를 끼우면 뒤에 있는 내용의 위치가 달라질 수 있죠.\n\n고정된 주소는 참조를 지속적인 연결로 만들어 줘요. 21a 주변에 카드를 많이 추가해도, 예전에 21a를 가리키던 메모는 여전히 정확한 카드를 찾을 수 있어요.\n\n덕분에 자료가 늘어나도 전체를 다시 정리할 필요가 없어요. 생각의 구조는 보관 위치뿐 아니라 아이디어 사이의 연결에서도 만들어지거든요."
  },
  "note-1": {
    "title": "생각을 잇는 연결망"
  },
  "node-1": {
    "text": "지식은 모으는 것뿐 아니라 서로 연결할 때 자라나요. #연구"
  },
  "node-2": {
    "text": "메멕스는 생각을 따라간 경로를 남겨요."
  },
  "node-3": {
    "text": "제텔카스텐은 각 아이디어에 변하지 않는 주소를 부여해요."
  },
  "node-4": {
    "text": "내 작업에 맞는 디지털 메모 상자는 어떤 모습일까?"
  },
  "note-2": {
    "title": "더 살펴보고 싶은 질문"
  },
  "node-5": {
    "text": "답변이 나온 맥락까지 함께 보존하려면 어떻게 해야 할까? #질문"
  },
  "task-1": {
    "text": "연상 경로에 대해 읽어 보기"
  },
  "task-2": {
    "text": "캔버스에서 두 아이디어 연결하기"
  },
  "edge-1": {
    "label": "이어지는 생각"
  }
};

function translateSeed(value) {
  if (Array.isArray(value)) return value.map(translateSeed);
  if (!value || typeof value !== 'object') return value;
  return { ...Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translateSeed(item)])), ...translations[value.id] };
}

export const initialState = { ...translateSeed(englishSeedState), localeVersion: 1 };

function mergeUnchangedDefaults(current, original, translated) {
  if (typeof original === 'string') return current === original ? translated : current;
  if (Array.isArray(current) && Array.isArray(original)) {
    return current.map((item, index) => {
      const position = item?.id ? original.findIndex(seed => seed.id === item.id) : index;
      if (position < 0 || position >= original.length) return item;
      return mergeUnchangedDefaults(item, original[position], translated[position]);
    });
  }
  if (current && original && typeof current === 'object' && typeof original === 'object' && !Array.isArray(current)) {
    return Object.fromEntries(Object.entries(current).map(([key, value]) => [
      key, Object.hasOwn(original, key) ? mergeUnchangedDefaults(value, original[key], translated[key]) : value,
    ]));
  }
  return current;
}

export function localizeSavedState(state) {
  if (state.localeVersion >= 1) return state;
  return { ...mergeUnchangedDefaults(state, englishSeedState, initialState), localeVersion: 1 };
}
