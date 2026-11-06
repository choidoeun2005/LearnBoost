import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
  let answerPayload;
  const requests = [];
  const provider = createServer(async (request, response) => {
    let input = '';
    for await (const chunk of request) input += chunk;
    const payload = input ? JSON.parse(input) : {};
    requests.push({ path: request.url, authorization: request.headers.authorization });
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/embed') response.end(JSON.stringify({ data: payload.input.map((text, index) => ({ index, embedding: [1, 0, 0] })) }));
    else if (request.url === '/rerank') response.end(JSON.stringify({ results: payload.documents.map((text, index) => ({ index, relevance_score: 0.9 })) }));
    else if (request.url === '/v1/models') response.end(JSON.stringify({ data: [{ id: 'test-model' }] }));
    else {
      answerPayload = payload;
      if (payload.messages.at(-1)?.content === 'simulate authentication error') {
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
  const child = spawn(process.execPath, ['index.js', '--production'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port), DATA_DIR: directory, LLM_BASE_URL: `${providerUrl}/v1`, LLM_MODEL: 'test-model', LLM_API_KEY: 'test-only-secret', FURIOSA_EMBEDDING_URL: `${providerUrl}/embed`, FURIOSA_RERANK_URL: `${providerUrl}/rerank` }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 10000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('Workspace:')) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited with ${code}`)); });
    });
    const configuration = await (await fetch(`${origin}/api/config`)).text();
    assert.equal(configuration.includes('test-only-secret'), false);
    assert.equal(JSON.parse(configuration).apiKeyConfigured, true);
    assert.equal((await (await fetch(`${origin}/api/health`)).json()).available, true);
    const pdfBody = new FormData();
    pdfBody.append('file', new Blob([samplePdf()], { type: 'application/pdf' }), 'generated-test.pdf');
    const pdfResponse = await fetch(`${origin}/api/documents`, { method: 'POST', body: pdfBody });
    const pdf = await pdfResponse.json();
    assert.equal(pdfResponse.status, 201, JSON.stringify(pdf));
    assert.equal(pdf.pages, 1);
    const pdfText = await (await fetch(`${origin}/api/documents/${pdf.id}/text`)).json();
    assert.match(pdfText[0].text, /RAG research notes/);
    await fetch(`${origin}/api/documents/${pdf.id}`, { method: 'DELETE' });
    const body = new FormData();
    body.append('file', new Blob(['RAG retrieves source passages and uses them to ground a generated answer.']), 'test-guide.txt');
    const uploaded = await fetch(`${origin}/api/documents`, { method: 'POST', body });
    assert.equal(uploaded.status, 201);
    const document = await uploaded.json();
    assert.equal(document.indexed, false);
    const chatBody = { messages: [{ role: 'user', content: 'What is RAG?' }], documentIds: [document.id] };
    const postChat = payload => fetch(`${origin}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal((await postChat(chatBody)).status, 400);
    const indexed = await (await fetch(`${origin}/api/documents/${document.id}/index`, { method: 'POST' })).json();
    assert.equal(indexed.indexed, true);
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
    child.kill('SIGTERM');
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    await new Promise(resolve => provider.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
