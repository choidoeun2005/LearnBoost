import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkPages, embedTexts, retrieve, postJson, buildMessages } from './server/rag.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
await mkdir(dataDirectory, { recursive: true });
const config = {
  embeddingUrl: process.env.FURIOSA_EMBEDDING_URL || 'http://eval.nxt.furiosa.ai:37030/v1/embeddings',
  rerankUrl: process.env.FURIOSA_RERANK_URL || 'http://eval.nxt.furiosa.ai:37040/v1/rerank',
  embeddingModel: process.env.FURIOSA_EMBEDDING_MODEL || 'furiosa-ai/bge-m3',
  rerankModel: process.env.FURIOSA_RERANK_MODEL || 'furiosa-ai/bge-reranker-v2-m3',
  llmBase: (process.env.LLM_BASE_URL || 'https://endpoint.access.furiosa.dev/v1').replace(/\/$/, ''),
  llmModel: process.env.LLM_MODEL || 'furiosa-ai/EXAONE-4.0-32B-FP8',
  llmKey: process.env.LLM_API_KEY || '',
};
const app = express();
app.disable('x-powered-by');
app.use('/api', (request, response, next) => {
  const origin = request.get('origin');
  if (origin && new URL(origin).host !== request.get('host')) return response.status(403).json({ error: '다른 사이트에서 보낸 요청은 허용하지 않아요.' });
  response.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });
const indexing = new Set();

async function readDocuments() {
  try { return JSON.parse(await readFile(path.join(dataDirectory, 'documents.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

let mutationQueue = Promise.resolve();
function mutateDocuments(operation) {
  const next = mutationQueue.then(async () => {
    const documents = await readDocuments();
    const result = await operation(documents);
    await writeFile(path.join(dataDirectory, 'documents.tmp'), JSON.stringify(documents));
    await rename(path.join(dataDirectory, 'documents.tmp'), path.join(dataDirectory, 'documents.json'));
    return result;
  });
  mutationQueue = next.catch(() => {});
  return next;
}

function publicDocument(document) {
  const { chunks, ...metadata } = document;
  return { ...metadata, chunkCount: chunks.length, indexed: Boolean(chunks.length && chunks.every(chunk => chunk.embedding)), indexing: indexing.has(document.id) };
}

app.get('/api/config', (request, response) => response.json({ model: config.llmModel, llmHost: new URL(config.llmBase).host, apiKeyConfigured: Boolean(config.llmKey), embeddingModel: config.embeddingModel, rerankModel: config.rerankModel, furiosaAvailability: '2026년 10월 27일 ~ 12월 9일' }));
app.get('/api/health', async (request, response) => {
  if (!config.llmKey) return response.json({ available: false, model: config.llmModel, message: 'API 키가 설정되지 않았어요. .env의 LLM_API_KEY에 Furiosa API 키를 입력하고 서버를 다시 시작해 주세요.' });
  try {
    const result = await fetch(`${config.llmBase}/models`, { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${config.llmKey}` } });
    if (!result.ok) throw new Error(`HTTP ${result.status} 오류예요. .env의 API 키와 API 주소를 확인해 주세요.`);
    const models = await result.json();
    const available = models.data?.some(model => model.id === config.llmModel) || false;
    response.json({ available, model: config.llmModel, message: available ? 'Furiosa API에 연결됐어요. 답변을 생성할 수 있어요.' : `이 API에서 ${config.llmModel} 모델을 찾을 수 없어요. .env의 LLM_MODEL을 확인해 주세요.` });
  } catch (error) { response.json({ available: false, model: config.llmModel, message: `${new URL(config.llmBase).host}에 연결할 수 없어요. ${error.message}` }); }
});
app.get('/api/documents', async (request, response) => response.json((await readDocuments()).map(publicDocument)));
app.post('/api/documents', upload.single('file'), async (request, response) => {
  const file = request.file;
  if (!file || !/\.(pdf|txt|md)$/i.test(file.originalname)) return response.status(400).json({ error: 'PDF, TXT, Markdown 파일을 업로드해 주세요 (최대 20 MB).' });
  const extension = path.extname(file.originalname).toLowerCase();
  let pages;
  if (extension === '.pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({ data: new Uint8Array(file.buffer), useSystemFonts: true, isEvalSupported: false });
    try {
      const document = await loadingTask.promise;
      if (document.numPages > 300) return response.status(400).json({ error: '300쪽 이하의 문서를 업로드해 주세요.' });
      pages = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push({ page: pageNumber, text: content.items.map(item => item.str || '').join(' ') });
      }
    } finally { await loadingTask.destroy(); }
  } else { pages = [{ page: 1, text: file.buffer.toString('utf8') }]; }
  const chunks = chunkPages(pages);
  if (!chunks.length) return response.status(400).json({ error: '읽을 수 있는 텍스트가 없어요. 스캔한 PDF는 먼저 문자 인식(OCR)이 필요해요.' });
  if (chunks.length > 1500) return response.status(400).json({ error: '문서가 너무 커요. 작은 파일로 나누어 업로드해 주세요.' });
  const document = { id: randomUUID(), name: path.basename(file.originalname), extension, size: file.size, pages: pages.length, createdAt: new Date().toISOString(), chunks };
  await writeFile(path.join(dataDirectory, `${document.id}${extension}`), file.buffer);
  await mutateDocuments(documents => documents.push(document));
  response.status(201).json(publicDocument(document));
});
app.post('/api/documents/:id/index', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  if (indexing.has(document.id)) return response.status(409).json({ error: '이미 이 문서의 검색 준비를 진행 중이에요.' });
  indexing.add(document.id);
  try {
    const vectors = await embedTexts(document.chunks.map(chunk => chunk.text), config);
    document.chunks = document.chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] }));
    await mutateDocuments(documents => {
      const position = documents.findIndex(item => item.id === document.id);
      if (position < 0) throw new Error('검색 준비 중에 문서가 삭제됐어요.');
      documents[position] = document;
    });
    response.json({ ...publicDocument(document), indexing: false });
  } finally { indexing.delete(document.id); }
});
app.get('/api/documents/:id/file', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  response.set('Content-Type', document.extension === '.pdf' ? 'application/pdf' : 'text/plain; charset=utf-8');
  response.set('X-Content-Type-Options', 'nosniff');
  response.sendFile(path.join(dataDirectory, `${document.id}${document.extension}`));
});
app.get('/api/documents/:id/text', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  response.json(document.chunks.map(({ text, page }) => ({ text, page })));
});
app.delete('/api/documents/:id', async (request, response) => {
  if (indexing.has(request.params.id)) return response.status(409).json({ error: '검색 준비가 끝난 뒤 삭제해 주세요.' });
  const document = await mutateDocuments(documents => {
    const position = documents.findIndex(item => item.id === request.params.id);
    return position < 0 ? null : documents.splice(position, 1)[0];
  });
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  await unlink(path.join(dataDirectory, `${document.id}${document.extension}`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  response.json({ ok: true });
});
app.post('/api/chat', async (request, response) => {
  if (!request.body || typeof request.body !== 'object') return response.status(400).json({ error: '대화 요청 형식이 올바르지 않아요.' });
  const { messages, documentIds = [], context = '', searchOnly = false } = request.body;
  if (!Array.isArray(messages) || !messages.length || messages.length > 100 || messages.some(message => !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 30000) || messages.at(-1).role !== 'user' || !Array.isArray(documentIds) || documentIds.some(id => typeof id !== 'string') || typeof context !== 'string' || context.length > 30000 || typeof searchOnly !== 'boolean') return response.status(400).json({ error: '대화 요청 형식이 올바르지 않아요.' });
  if (!searchOnly && !config.llmKey) return response.status(503).json({ error: 'API 키가 설정되지 않았어요. .env의 LLM_API_KEY에 Furiosa API 키를 입력하고 서버를 다시 시작해 주세요.' });
  const abort = new AbortController();
  response.on('close', () => { if (!response.writableEnded) abort.abort(); });
  const documents = (await readDocuments()).filter(document => documentIds.includes(document.id));
  if (documents.length !== new Set(documentIds).size || documents.some(document => !publicDocument(document).indexed)) return response.status(400).json({ error: '선택한 모든 문서의 검색 준비를 마친 뒤 질문해 주세요.' });
  const sources = await retrieve(messages.at(-1).content, documents, config, abort.signal);
  if (searchOnly) return response.json({ sources });
  const result = await postJson(`${config.llmBase}/chat/completions`, { model: config.llmModel, messages: buildMessages(messages, sources, context), stream: false, temperature: 0.5, max_tokens: 2048 }, { key: config.llmKey, signal: abort.signal, timeout: 180000 });
  const content = result.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('모델이 빈 답변을 반환했어요. 다시 시도해 주세요.');
  response.json({ content, sources, model: config.llmModel, truncated: result.choices[0].finish_reason === 'length' });
});
app.use('/api', (request, response) => response.status(404).json({ error: '요청한 API 경로를 찾을 수 없어요.' }));
app.use(express.static(path.join(root, 'public'), { index: false }));
for (const route of ['/', '/product', '/product/branching', '/pricing', '/science', '/impressum', '/datenschutz']) app.get(route, (request, response) => response.sendFile(path.join(root, 'public', 'site', route, 'index.html')));
app.get(['/auth/signup', '/auth/login', '/billing'], (request, response) => response.redirect('/app'));
if (process.argv.includes('--production')) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('/app', (request, response) => response.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  const status = error instanceof multer.MulterError || error instanceof SyntaxError ? 400 : 502;
  response.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? '파일은 최대 20 MB까지 업로드할 수 있어요.' : error.message || '요청에 실패했어요.' });
});
const port = Number(process.env.PORT || 3000);
app.listen(port, '127.0.0.1', () => console.log(`SideQuestly local: http://127.0.0.1:${port}\nWorkspace: http://127.0.0.1:${port}/app`));
