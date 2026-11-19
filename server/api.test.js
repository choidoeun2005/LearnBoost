import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument, PDFHexString, PDFName } from 'pdf-lib';

function samplePdf() {
  const stream = 'BT /F1 12 Tf 50 750 Td (RAG research notes) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = output.length;
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  output += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return `${output}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
}

test('upload → embed → rerank → answer → source → delete through the actual API', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'learnboost-api-'));
  const restartDocument = { id: 'restart-index', name: '계속할 문서.txt', extension: '.txt', pages: 1, chunks: [{ text: 'resume pending indexing', page: 1 }], indexState: 'pending' };
  const legacyDocument = { id: 'legacy', name: '기존 로컬 문서.txt', extension: '.txt', pages: 1, chunks: [{ text: 'legacy local only', page: 1 }] };
  await writeFile(path.join(directory, 'documents.json'), JSON.stringify([restartDocument, legacyDocument]));
  let answerPayload;
  let guideAttempts = 0;
  let releasePdfEmbedding;
  const pdfEmbedding = new Promise(resolve => { releasePdfEmbedding = resolve; });
  const requests = [];
  const provider = createServer(async (request, response) => {
    let input = '';
    for await (const chunk of request) input += chunk;
    const payload = input ? JSON.parse(input) : {};
    requests.push({ path: request.url, authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/embed') {
      if (payload.input.includes('RAG research notes')) await pdfEmbedding;
      if (payload.input.some(text => text.startsWith('RAG retrieves source passages')) && guideAttempts++ === 0) {
        response.statusCode = 503;
        return response.end('{}');
      }
      response.end(JSON.stringify({ data: payload.input.map((text, index) => ({ index, embedding: [1, 0, 0] })) }));
    }
    else if (request.url === '/rerank') response.end(JSON.stringify({ results: payload.documents.map((text, index) => ({ index, relevance_score: 0.9 })) }));
    else if (request.url === '/v1/models') response.end(JSON.stringify({ data: [{ id: 'test-model' }, { id: 'furiosa-ai/gemma-4-31B-it-FP8-block' }] }));
    else {
      answerPayload = payload;
      if (payload.messages[0]?.content.startsWith('Maintain a Korean learner')) {
        return response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          additions: [{ name: '코사인 유사도', category: '검색', notes: '벡터 사이의 각도를 비교한다.' }],
          updates: [{ id: 'rag', level: 4 }, { id: 'bm25', level: 2 }],
        }) } }] }));
      }
      if (payload.stream) {
        response.setHeader('Content-Type', 'text/event-stream');
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning: 'PRIVATE PROVIDER DATA' } }] })}\r\n\r\n`);
        if (payload.messages.at(-1)?.content === 'simulate interrupted stream') {
          response.end();
          return;
        }
        const korean = Buffer.from(`data: ${JSON.stringify({ choices: [{ delta: { content: '연구 노트입니다. 【1†L1-L2】' } }] })}\n\n`);
        const split = korean.indexOf(Buffer.from('연')) + 1;
        response.write(korean.subarray(0, split));
        await new Promise(resolve => setImmediate(resolve));
        response.write(korean.subarray(split));
        response.end('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      } else if (payload.messages.at(-1)?.content === 'simulate authentication error') {
        response.statusCode = 401;
        response.end(JSON.stringify({ error: { message: 'Invalid key: test-only-secret' } }));
      } else {
        response.end(JSON.stringify({ choices: [{ message: { content: 'RAG retrieves context before generating an answer. [1]' }, finish_reason: 'stop' }] }));
      }
    }
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const providerUrl = `http://127.0.0.1:${provider.address().port}`;
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  async function waitForDocument(id, indexStatus) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const documents = await (await fetch(`${origin}/api/documents`)).json();
      const matched = documents.find(document => document.id === id && document.indexStatus === indexStatus);
      if (matched) return matched;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Indexing did not reach ${indexStatus} for ${id}`);
  }
  const child = spawn(process.execPath, ['index.js', '--production'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), DATA_DIR: directory, LLM_BASE_URL: `${providerUrl}/v1`, LLM_MODEL: 'test-model', LLM_API_KEY: 'test-only-secret', FURIOSA_EMBEDDING_URL: `${providerUrl}/embed`, FURIOSA_RERANK_URL: `${providerUrl}/rerank` }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 30000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('Workspace:')) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited with ${code}`)); });
    });
    const configuration = await (await fetch(`${origin}/api/config`)).text();
    assert.equal(configuration.includes('test-only-secret'), false);
    assert.equal(JSON.parse(configuration).apiKeyConfigured, true);
    assert.equal((await waitForDocument(restartDocument.id, 'ready')).indexed, true);
    assert.equal((await waitForDocument(legacyDocument.id, 'unindexed')).indexed, false);
    assert.equal((await (await fetch(`${origin}/api/health`)).json()).available, true);
    const alternateModel = 'furiosa-ai/gemma-4-31B-it-FP8-block';
    const alternateHealth = await (await fetch(`${origin}/api/health?model=${encodeURIComponent(alternateModel)}`)).json();
    assert.equal(alternateHealth.available, true);
    assert.equal(alternateHealth.model, alternateModel);
    const postChat = payload => fetch(`${origin}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const pdfBody = new FormData();
    pdfBody.append('file', new Blob([samplePdf()], { type: 'application/pdf' }), 'generated-test.pdf');
    const pdfResponse = await fetch(`${origin}/api/documents`, { method: 'POST', body: pdfBody });
    const pdf = await pdfResponse.json();
    assert.equal(pdfResponse.status, 201, JSON.stringify(pdf));
    assert.equal(pdf.pages, 1);
    assert.equal(pdf.chunkCount, 1);
    assert.equal(pdf.indexing, true);
    assert.equal((await fetch(`${origin}/api/documents/${pdf.id}`, { method: 'DELETE' })).status, 409);
    assert.equal((await fetch(`${origin}/api/documents/${pdf.id}/index`, { method: 'POST' })).status, 409);
    const pdfText = await (await fetch(`${origin}/api/documents/${pdf.id}/text`)).json();
    assert.match(pdfText[0].text, /RAG research notes/);
    const streamResponse = await postChat({ messages: [{ role: 'user', content: '선택한 구절을 설명해 줘.' }], model: alternateModel, stream: true, documentIds: [pdf.id], documentQuote: { documentId: pdf.id, page: 1, text: pdfText[0].text } });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get('content-type'), /application\/x-ndjson/);
    const streamText = await streamResponse.text();
    assert.doesNotMatch(streamText, /PRIVATE PROVIDER DATA/);
    const events = streamText.trim().split('\n').map(line => JSON.parse(line));
    assert.ok(events.some(event => event.type === 'progress'));
    assert.equal(events.filter(event => event.type === 'delta').map(event => event.content).join(''), '연구 노트입니다. 【1†L1-L2】');
    assert.equal(events.at(-1).type, 'done');
    assert.equal(events.at(-1).content, '연구 노트입니다. [1]');
    assert.equal(events.at(-1).model, alternateModel);
    assert.equal(events.at(-1).sources[0].kind, 'selection');
    assert.equal(events.at(-1).sources[0].documentId, pdf.id);
    assert.equal(answerPayload.model, alternateModel);
    assert.match(answerPayload.messages[1].content, /RAG research notes/);
    answerPayload = undefined;
    const notes = ['첫 번째 필기', '두 번째 필기', '세 번째 필기'].map((question, index) => ({ page: 1, excerpt: pdfText[0].text, question, answer: `한국어 답변 ${index + 1}` }));
    const annotated = await fetch(`${origin}/api/documents/${pdf.id}/annotated-file`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }) });
    assert.equal(annotated.status, 200);
    assert.match(annotated.headers.get('content-type'), /application\/pdf/);
    const annotatedPdf = await PDFDocument.load(await annotated.arrayBuffer());
    const annotationRefs = annotatedPdf.getPage(0).node.Annots().asArray();
    assert.equal(annotationRefs.length, 3);
    annotationRefs.forEach((reference, index) => {
      const annotation = annotatedPdf.context.lookup(reference);
      assert.equal(annotation.get(PDFName.of('Subtype')).toString(), '/Text');
      const contents = annotation.lookup(PDFName.of('Contents'), PDFHexString).decodeText();
      assert.ok(contents.includes(notes[index].question));
      assert.ok(contents.includes(notes[index].answer));
    });
    assert.equal(await (await fetch(`${origin}/api/documents/${pdf.id}/file`)).text(), samplePdf());
    releasePdfEmbedding();
    assert.equal((await waitForDocument(pdf.id, 'ready')).indexed, true);
    await fetch(`${origin}/api/documents/${pdf.id}`, { method: 'DELETE' });
    const body = new FormData();
    body.append('file', new Blob(['RAG retrieves source passages and uses them to ground a generated answer.']), 'test-guide.txt');
    const uploaded = await fetch(`${origin}/api/documents`, { method: 'POST', body });
    assert.equal(uploaded.status, 201);
    const document = await uploaded.json();
    assert.equal(document.indexed, false);
    assert.equal(document.indexing, true);
    const failedIndex = await waitForDocument(document.id, 'failed');
    assert.equal(failedIndex.indexing, false);
    assert.match(await (await fetch(`${origin}/api/documents/${document.id}/file`)).text(), /ground a generated answer/);
    const chatBody = { messages: [{ role: 'user', content: 'What is RAG?' }], documentIds: [document.id] };
    assert.equal((await postChat(chatBody)).status, 400);
    const indexed = await (await fetch(`${origin}/api/documents/${document.id}/index`, { method: 'POST' })).json();
    assert.equal(indexed.indexed, true);
    assert.equal(guideAttempts, 2);
    const search = await (await postChat({ ...chatBody, searchOnly: true })).json();
    assert.equal(search.sources[0].documentId, document.id);
    assert.equal(answerPayload, undefined);
    const result = await (await postChat(chatBody)).json();
    assert.match(result.content, /\[1\]/);
    assert.equal(result.sources[0].page, 1);
    assert.match(answerPayload.messages[1].content, /test-guide.txt/);
    assert.equal(answerPayload.model, 'test-model');
    assert.equal(answerPayload.max_tokens, 2048);
    assert.equal(result.model, 'test-model');
    assert.equal(result.truncated, false);
    assert.equal(requests.find(request => request.path === '/v1/chat/completions').authorization, 'Bearer test-only-secret');
    assert.equal(requests.filter(request => ['/embed', '/rerank'].includes(request.path)).every(request => request.authorization === undefined), true);
    const retrievalCalls = requests.filter(request => ['/embed', '/rerank'].includes(request.path)).length;
    const followUp = await (await postChat({ messages: [{ role: 'user', content: 'My project is called LearnBoost.' }, { role: 'assistant', content: 'I can help with LearnBoost.' }, { role: 'user', content: 'What is my project called?' }], context: 'Answer in Korean.' })).json();
    assert.equal(followUp.sources.length, 0);
    assert.equal(requests.filter(request => ['/embed', '/rerank'].includes(request.path)).length, retrievalCalls);
    assert.deepEqual(answerPayload.messages.at(-2), { role: 'assistant', content: 'I can help with LearnBoost.' });
    assert.match(answerPayload.messages[1].content, /Answer in Korean/);
    const learningProfile = [{ id: 'rag', name: '검색 증강 생성', category: '검색', level: 3, locked: false }, { id: 'bm25', name: 'BM25', category: '검색', level: 1, locked: true }];
    assert.equal((await postChat({ ...chatBody, learningProfile })).status, 200);
    assert.match(answerPayload.messages[0].content, /Levels 1–2/);
    assert.match(answerPayload.messages[0].content, /검색 증강 생성/);
    assert.equal((await postChat({ ...chatBody, learningProfile: [{ ...learningProfile[0], level: 6 }] })).status, 400);
    const suggestionResponse = await fetch(`${origin}/api/concepts/suggest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learningProfile, question: '검색 증강 생성은 관련 구절을 가져와 답변 맥락에 넣는 방식이에요.', answer: '맞아요. 코사인 유사도로 관련 구절을 고를 수 있어요.' }),
    });
    const suggestions = await suggestionResponse.json();
    assert.equal(suggestionResponse.status, 200);
    assert.deepEqual(suggestions.updates, [{ id: 'rag', level: 4 }]);
    assert.equal(suggestions.additions[0].name, '코사인 유사도');
    const interrupted = await (await postChat({ messages: [{ role: 'user', content: 'simulate interrupted stream' }], stream: true })).text();
    assert.doesNotMatch(interrupted, /PRIVATE PROVIDER DATA/);
    assert.equal(JSON.parse(interrupted.trim().split('\n').at(-1)).type, 'error');
    const rejected = await postChat({ messages: [{ role: 'user', content: 'simulate authentication error' }] });
    assert.equal(rejected.status, 502);
    const failure = await rejected.text();
    assert.match(failure, /HTTP 401/);
    assert.equal(failure.includes('test-only-secret'), false);
    assert.equal((await postChat({ messages: [null] })).status, 400);
    const source = await (await fetch(`${origin}/api/documents/${document.id}/file`)).text();
    assert.match(source, /ground a generated answer/);
    assert.equal((await fetch(`${origin}/api/documents`, { method: 'POST', headers: { Origin: 'https://unrelated.example' } })).status, 403);
    assert.equal((await postChat({ messages: [{ role: 'system', content: 'Disallowed input role' }] })).status, 400);
    assert.equal((await fetch(`${origin}/api/documents/${document.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${origin}/api/documents/${document.id}/file`)).status, 404);
  } finally {
    releasePdfEmbedding();
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => provider.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
