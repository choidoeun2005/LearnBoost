import 'dotenv/config';
import { personalizeMessages, suggestConcepts, validLearningProfile } from './server/concepts.js';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdfPages, maxDocumentMb, pdfAssetFolders, pdfAssetRoot, renderPdfRegion, uploadFilename } from './server/documents.js';
import { chunkPages, embedTexts, retrieve, buildMessages } from './server/rag.js';
import { createFuriosaConfig, completeChat } from './server/furiosa.js';
import { validPdfNotes, withPdfNotes } from './server/pdf-notes.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
await mkdir(dataDirectory, { recursive: true });
const config = createFuriosaConfig();
const app = express();
app.disable('x-powered-by');
app.use('/api', (request, response, next) => {
  const origin = request.get('origin');
  if (origin && new URL(origin).host !== request.get('host')) return response.status(403).json({ error: '다른 사이트에서 보낸 요청은 허용하지 않아요.' });
  response.set('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxDocumentMb * 1024 * 1024, files: 1 } });
const indexing = new Map();

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
  const { chunks, indexState, ...metadata } = document;
  const embeddingModel = document.embeddingModel || 'furiosa-ai/bge-m3';
  const dimensions = chunks[0]?.embedding?.length;
  const indexed = embeddingModel === config.embeddingModel && Boolean(dimensions) && chunks.every(chunk => Array.isArray(chunk.embedding) && chunk.embedding.length === dimensions);
  const status = indexing.get(document.id) || (indexState === 'failed' ? 'failed' : indexed ? 'ready' : 'unindexed');
  return { ...metadata, chunkCount: chunks.length, indexed, indexing: indexing.has(document.id), indexStatus: status };
}

let indexingQueue = Promise.resolve();
function queueIndexing(document) {
  if (indexing.has(document.id)) return null;
  indexing.set(document.id, 'queued');
  const updateDocument = update => mutateDocuments(documents => {
    const position = documents.findIndex(item => item.id === document.id);
    if (position < 0) throw new Error('검색 준비 중에 문서가 삭제됐어요.');
    const updated = update(documents[position]);
    documents[position] = updated;
    return updated;
  });
  const job = indexingQueue.then(async () => {
    indexing.set(document.id, 'indexing');
    try {
      if (document.indexState !== 'pending') await updateDocument(current => ({ ...current, indexState: 'pending' }));
      const vectors = await embedTexts(document.chunks.map(chunk => chunk.text), config);
      if (!vectors.every(vector => vector.length === vectors[0].length)) throw new Error('문서 검색 서버의 임베딩 크기가 서로 달라요. 다시 시도해 주세요.');
      return await updateDocument(current => ({
        ...current,
        chunks: current.chunks.map((chunk, index) => ({ ...chunk, embedding: vectors[index] })),
        embeddingModel: config.embeddingModel,
        indexState: 'ready',
      }));
    } catch (error) {
      await updateDocument(current => ({ ...current, indexState: 'failed' }));
      throw error;
    } finally {
      indexing.delete(document.id);
    }
  });
  indexingQueue = job.then(() => {}, () => {});
  return job;
}

const isChatModel = id => config.models.some(model => model.id === id);
app.get('/api/config', (request, response) => response.json({ model: config.llmModel, models: config.models, llmHost: new URL(config.llmBase).host, apiKeyConfigured: Boolean(config.llmKey), embeddingModel: config.embeddingModel, rerankModel: config.rerankModel }));
app.get('/api/health', async (request, response) => {
  const model = request.query.model || config.llmModel;
  if (!isChatModel(model)) return response.status(400).json({ error: '지원하는 답변 모델을 선택해 주세요.' });
  if (!config.llmKey) return response.json({ available: false, model, message: 'API 키가 설정되지 않았어요. .env의 LLM_API_KEY에 Furiosa API 키를 입력하고 서버를 다시 시작해 주세요.' });
  try {
    const result = await fetch(`${config.llmBase}/models`, { signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${config.llmKey}` } });
    if (!result.ok) throw new Error(`HTTP ${result.status} 오류예요. .env의 API 키와 API 주소를 확인해 주세요.`);
    const catalog = await result.json().catch(() => null);
    if (!Array.isArray(catalog?.data)) throw new Error('모델 목록을 읽을 수 없어요.');
    const offered = new Set(catalog.data.map(item => item?.id));
    const models = [...config.models.map(item => item.id), config.embeddingModel, config.rerankModel].map(id => ({ id, available: offered.has(id) }));
    const available = offered.has(model);
    response.json({ available, model, models, message: available ? 'Furiosa API에 연결됐어요. 답변을 생성할 수 있어요.' : `이 API에서 ${model} 모델을 찾을 수 없어요.` });
  } catch (error) { response.json({ available: false, model, message: `${new URL(config.llmBase).host}에 연결할 수 없어요. ${error.message}` }); }
});
app.get('/api/documents', async (request, response) => response.json((await readDocuments()).map(publicDocument)));
app.post('/api/documents', upload.single('file'), async (request, response) => {
  const file = request.file;
  const name = file ? uploadFilename(file.originalname) : '';
  const extension = path.extname(name).toLowerCase();
  if (!['.pdf', '.txt', '.md'].includes(extension)) return response.status(400).json({ error: `PDF, TXT, Markdown 파일을 업로드해 주세요. 최대 ${maxDocumentMb} MB까지 지원해요.` });
  const pages = extension === '.pdf' ? await extractPdfPages(file.buffer) : [{ page: 1, text: file.buffer.toString('utf8') }];
  const chunks = chunkPages(pages);
  if (!chunks.length) return response.status(400).json({ error: '읽을 수 있는 텍스트가 없어요. 스캔한 PDF는 먼저 문자 인식(OCR)이 필요해요.' });
  const document = { id: randomUUID(), name, extension, size: file.size, pages: pages.length, createdAt: new Date().toISOString(), chunks, indexState: 'pending' };
  await writeFile(path.join(dataDirectory, `${document.id}${extension}`), file.buffer);
  try {
    await mutateDocuments(documents => documents.push(document));
  } catch (error) {
    await unlink(path.join(dataDirectory, `${document.id}${extension}`)).catch(() => {});
    throw error;
  }
  queueIndexing(document);
  response.status(201).json(publicDocument(document));
});
app.post('/api/documents/:id/index', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  const job = queueIndexing(document);
  if (!job) return response.status(409).json({ error: '이미 이 문서의 검색 준비를 진행 중이에요.' });
  response.json(publicDocument(await job));
});
app.get('/api/documents/:id/file', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  response.set('Content-Type', document.extension === '.pdf' ? 'application/pdf' : 'text/plain; charset=utf-8');
  response.set('X-Content-Type-Options', 'nosniff');
  response.sendFile(path.join(dataDirectory, `${document.id}${document.extension}`));
});
app.post('/api/documents/:id/annotated-file', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  const notes = request.body?.notes;
  if (document.extension !== '.pdf' || !validPdfNotes(notes, document.pages)) return response.status(400).json({ error: 'PDF에 넣을 필기와 페이지를 확인해 주세요.' });
  const original = await readFile(path.join(dataDirectory, `${document.id}.pdf`));
  const exported = await withPdfNotes(original, notes);
  response.attachment(`${document.name.replace(/\.pdf$/i, '')}-필기.pdf`);
  response.send(Buffer.from(exported));
});
app.get('/api/documents/:id/text', async (request, response) => {
  const document = (await readDocuments()).find(item => item.id === request.params.id);
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  response.json(document.chunks.map(({ text, page }) => ({ text, page })));
});
app.delete('/api/documents/:id', async (request, response) => {
  if (indexing.has(request.params.id)) return response.status(409).json({ error: '검색 준비가 끝난 뒤 삭제해 주세요.' });
  const document = await mutateDocuments(documents => {
    if (indexing.has(request.params.id)) return false;
    const position = documents.findIndex(item => item.id === request.params.id);
    return position < 0 ? null : documents.splice(position, 1)[0];
  });
  if (document === false) return response.status(409).json({ error: '검색 준비가 끝난 뒤 삭제해 주세요.' });
  if (!document) return response.status(404).json({ error: '문서를 찾을 수 없어요.' });
  await unlink(path.join(dataDirectory, `${document.id}${document.extension}`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  response.json({ ok: true });
});
app.post('/api/concepts/suggest', async (request, response) => {
  const { learningProfile: profile = [], question, answer } = request.body || {};
  if (!validLearningProfile(profile) || typeof question !== 'string' || !question.trim() || question.length > 4000 || typeof answer !== 'string' || answer.length > 6000) return response.status(400).json({ error: '개념을 정리할 대화 내용을 확인해 주세요.' });
  if (!config.llmKey) return response.status(503).json({ error: 'Furiosa 연결을 확인해 주세요.' });
  const abort = new AbortController();
  response.on('close', () => { if (!response.writableEnded) abort.abort(); });
  try {
    const suggestions = await suggestConcepts({ config, profile, question, answer, signal: abort.signal });
    if (!abort.signal.aborted) response.json(suggestions);
  } catch (error) {
    if (!abort.signal.aborted) throw error;
  }
});

app.post('/api/chat', async (request, response) => {
  if (!request.body || typeof request.body !== 'object') return response.status(400).json({ error: '대화 요청 형식이 올바르지 않아요.' });
  const { messages, documentIds = [], context = '', searchOnly = false, documentOnly = false, model = config.llmModel, stream = false, documentQuote, learningProfile = [] } = request.body;
  if (!Array.isArray(messages) || !messages.length || messages.length > 100 || messages.some(message => !message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > 30000) || messages.at(-1).role !== 'user' || !Array.isArray(documentIds) || documentIds.some(id => typeof id !== 'string') || typeof context !== 'string' || context.length > 30000 || typeof searchOnly !== 'boolean' || typeof documentOnly !== 'boolean' || typeof stream !== 'boolean') return response.status(400).json({ error: '대화 요청 형식이 올바르지 않아요.' });
  if (!validLearningProfile(learningProfile)) return response.status(400).json({ error: '개념 이해도 정보를 읽을 수 없어요.' });
  if (!isChatModel(model)) return response.status(400).json({ error: '지원하는 답변 모델을 선택해 주세요.' });
  if (!searchOnly && !config.llmKey) return response.status(503).json({ error: 'API 키가 설정되지 않았어요. .env의 LLM_API_KEY에 Furiosa API 키를 입력하고 서버를 다시 시작해 주세요.' });
  const abort = new AbortController();
  response.on('close', () => { if (!response.writableEnded) abort.abort(); });
  const library = await readDocuments();
  let selectedSource;
  if (documentQuote !== undefined) {
    const quotedDocument = library.find(document => document.id === documentQuote?.documentId);
    const { page, endPage = page, text, region } = documentQuote || {};
    if (!quotedDocument || !Number.isInteger(page) || !Number.isInteger(endPage) || page < 1 || endPage < page || endPage > quotedDocument.pages || typeof text !== 'string' || !text.trim() || text.length > 30000) return response.status(400).json({ error: '선택한 구절 정보를 읽을 수 없어요. 문서에서 구절을 다시 선택해 주세요.' });
    selectedSource = { documentId: quotedDocument.id, name: quotedDocument.name, page, endPage, text: text.trim(), kind: 'selection' };
    if (region !== undefined) {
      const { x, y, width, height } = region || {};
      if (quotedDocument.extension !== '.pdf' || page !== endPage || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1.000001 || y + height > 1.000001) return response.status(400).json({ error: 'PDF에서 질문할 영역을 다시 선택해 주세요.' });
      if (!searchOnly && model !== 'furiosa-ai/Qwen3-VL-32B-Instruct') return response.status(400).json({ error: 'PDF 영역을 질문하려면 Qwen3 VL 32B를 선택해 주세요.' });
      selectedSource.region = { x, y, width, height };
    }
  }
  const documents = library.filter(document => documentIds.includes(document.id));
  const indexedDocuments = documents.filter(document => publicDocument(document).indexed);
  if (documents.length !== new Set(documentIds).size || documents.some(document => document.id !== selectedSource?.documentId && !publicDocument(document).indexed)) return response.status(400).json({ error: '선택한 문서의 검색 준비를 마친 뒤 질문해 주세요.' });

  const streaming = stream && !searchOnly;
  const emit = streaming ? event => { if (!abort.signal.aborted) response.write(`${JSON.stringify(event)}\n`); } : undefined;
  if (response.destroyed || abort.signal.aborted) return;
  if (streaming) {
    response.set('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.set('X-Accel-Buffering', 'no');
    response.flushHeaders();
  }
  try {
    if (indexedDocuments.length) emit?.({ type: 'progress', message: '문서에서 질문과 관련된 내용을 찾고 있어요.' });
    const retrieved = await retrieve(messages.at(-1).content, indexedDocuments, config, abort.signal);
    if (abort.signal.aborted) return;
    const sources = selectedSource ? [selectedSource, ...retrieved] : retrieved;
    if (searchOnly) return response.json({ sources });
    const providerMessages = personalizeMessages(buildMessages(messages, sources, context, { documentOnly }), learningProfile);
    if (selectedSource?.region) {
      emit?.({ type: 'progress', message: 'PDF에서 선택한 영역을 이미지로 준비하고 있어요.' });
      const original = await readFile(path.join(dataDirectory, `${selectedSource.documentId}.pdf`));
      const imageUrl = await renderPdfRegion(original, selectedSource.page, selectedSource.region, abort.signal);
      const question = providerMessages.at(-1);
      question.content = [
        { type: 'text', text: `${question.content}\n\n첨부한 이미지는 참고 자료 [1]에서 선택한 PDF 영역입니다. 이미지 내용을 설명할 때 [1]을 인용해 주세요.` },
        { type: 'image_url', image_url: { url: imageUrl } },
      ];
    }
    const submitted = selectedSource?.region ? '선택한 PDF 영역과 질문' : sources.length ? '찾은 문서 구절과 질문' : '질문과 대화 내용';
    emit?.({ type: 'progress', message: `${submitted}을 모델에 전달하고 있어요.` });
    const result = await completeChat({ config, model, messages: providerMessages, signal: abort.signal, emit, sourceCount: sources.length });
    if (abort.signal.aborted) return;
    const payload = { ...result, sources, model };
    if (!streaming) return response.json(payload);
    emit({ type: 'done', ...payload });
  } catch (error) {
    if (abort.signal.aborted) return;
    if (!streaming) throw error;
    emit({ type: 'error', error: error.message || '답변을 가져오는 중에 문제가 생겼어요.' });
  } finally {
    if (streaming && !abort.signal.aborted) response.end();
  }
});
app.use('/api', (request, response) => response.status(404).json({ error: '요청한 API 경로를 찾을 수 없어요.' }));
for (const folder of pdfAssetFolders) app.use(`/pdf-assets/${folder}`, express.static(path.join(pdfAssetRoot, folder)));
app.use(express.static(path.join(root, 'public'), { index: false }));
app.get('/', (request, response) => response.sendFile(path.join(root, 'public', 'learnboost.html')));
for (const [route, section] of Object.entries({ '/product': 'features', '/product/branching': 'branching', '/pricing': 'features', '/science': 'search', '/impressum': 'search', '/datenschutz': 'search' })) {
  app.get(route, (request, response) => response.redirect(`/#${section}`));
}
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
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: '요청에 올바른 JSON을 보내 주세요.' });
  if (error.type === 'entity.too.large') return response.status(413).json({ error: '요청이 너무 커요. 첨부한 텍스트나 필기의 양을 줄여 주세요.' });
  const status = error instanceof multer.MulterError || error instanceof SyntaxError ? 400 : 502;
  response.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? `파일은 최대 ${maxDocumentMb} MB까지 업로드할 수 있어요.` : error.message || '요청에 실패했어요.' });
});
const port = Number(process.env.PORT || 3000);
const pendingDocuments = (await readDocuments()).filter(document => document.indexState === 'pending');
app.listen(port, '127.0.0.1', error => {
  if (error) throw error;
  for (const document of pendingDocuments) queueIndexing(document);
  console.log(`LearnBoost: http://127.0.0.1:${port}\nWorkspace: http://127.0.0.1:${port}/app`);
});
