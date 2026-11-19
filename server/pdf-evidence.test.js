import assert from 'node:assert/strict';
import test from 'node:test';
import { citationPassage, citedSources, evidenceRange, evidenceTextMap } from '../src/pdf-evidence.js';

test('multiple citations over a broad page select the relevant individual passages', () => {
  const source = { page: 7, text: '문제 정의. 설명이 긴 대화에 흩어지고 원문 위치가 남지 않는다. 같은 내용을 다시 찾고 다시 정리하는 시간이 든다. 다른 주제의 참고 문구도 이 페이지에 나타난다.' };
  const message = {
    content: '설명이 긴 대화에 흩어지고 원문 위치가 남지 않습니다 [1]. 같은 내용을 다시 찾고 다시 정리하는 시간이 듭니다 [2].',
    sources: [source, source, { page: 8, text: '인용하지 않은 검색 결과' }],
  };
  assert.deepEqual(citedSources(message).map(item => item.number), [1, 2]);
  assert.equal(citationPassage(message, source, 1), '설명이 긴 대화에 흩어지고 원문 위치가 남지 않는다.');
  assert.equal(citationPassage(message, source, 2), '같은 내용을 다시 찾고 다시 정리하는 시간이 든다.');
});

test('normalized evidence offsets map back to the original PDF text without expanding to a full span', () => {
  const text = '앞부분 ﬃ 연결  핵심 뒤쪽';
  const mapped = evidenceTextMap(text);
  const [from, to] = evidenceRange(mapped.normalized, 'ffi 연결 핵심');
  assert.equal(text.slice(mapped.starts[from], mapped.ends[to - 1]), 'ﬃ 연결  핵심');
});
