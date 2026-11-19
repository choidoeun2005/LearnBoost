import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdfPages } from '../server/documents.js';

export const benchmarkDir = fileURLToPath(new URL('../data/benchmark/', import.meta.url));
export const datasetRevision = '35db50ff8739d78b11ee68b6f4ef04a95862a504';
export const pdfRevision = '10eebed0e834794d8742fcc902678a9873db2f81';
const dataset = 'allganize/RAG-Evaluation-Dataset-KO';
const pdfDataset = 'datalama/RAG-Evaluation-Dataset-KO';

async function fetchDataset(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response;
}

async function download(repo, revision, { path: name, size }) {
  const file = path.join(benchmarkDir, name);
  if ((await stat(file).catch(() => null))?.size === size) return;
  const url = `https://huggingface.co/datasets/${repo}/resolve/${revision}/${name}`;
  const temporary = `${file}.part`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchDataset(url);
      await pipeline(response.body, createWriteStream(temporary));
      if ((await stat(temporary)).size !== size) throw new Error('다운로드 크기가 목록과 다릅니다.');
      await rename(temporary, file);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

export async function mapConcurrent(values, concurrency, operation) {
  let offset = 0;
  const results = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (offset < values.length) {
      const index = offset++;
      results[index] = await operation(values[index], index);
    }
  }));
  return results;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let cursor = 0; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === '"') {
      if (quoted && text[cursor + 1] === '"') {
        field += '"';
        cursor += 1;
      } else quoted = !quoted;
    } else if (!quoted && (character === ',' || character === '\n')) {
      row.push(field.replace(/\r$/, ''));
      field = '';
      if (character === '\n') {
        rows.push(row);
        row = [];
      }
    } else field += character;
  }
  if (row.length || field) rows.push([...row, field.replace(/\r$/, '')]);
  const columns = rows.shift();
  if (quoted || !columns || rows.some(values => values.length !== columns.length)) throw new Error('평가 CSV 구조를 읽을 수 없습니다.');
  return rows.map(values => Object.fromEntries(columns.map((column, index) => [column.replace(/^\uFEFF/, ''), values[index]])));
}

function tarFiles(bytes) {
  const members = new Map();
  for (let start = 0; start + 512 <= bytes.length;) {
    const name = bytes.toString('utf8', start, start + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = Number.parseInt(bytes.toString('ascii', start + 124, start + 136).replace(/\0.*$/, '').trim(), 8);
    const end = start + 512 + size;
    if (!Number.isSafeInteger(size) || size < 0 || end > bytes.length) throw new Error('PDF TAR 구조를 읽을 수 없습니다.');
    if (/^\d+\.(json|pdf)$/.test(name)) members.set(name, bytes.subarray(start + 512, end));
    start += 512 + Math.ceil(size / 512) * 512;
  }
  return members;
}

async function extractArchive(entry) {
  const members = tarFiles(await readFile(path.join(benchmarkDir, entry.path)));
  const metadata = [...members].filter(([name]) => name.endsWith('.json')).map(([name, bytes]) => ({ name, ...JSON.parse(bytes) }));
  const document = metadata[0];
  if (!document || metadata.some(item => item.pid !== document.pid || item.file_name !== document.file_name)) throw new Error(`${entry.path}: 문서 메타데이터가 일치하지 않습니다.`);
  const pages = [];
  const errors = [];
  for (const page of metadata) {
    try {
      const extracted = await extractPdfPages(members.get(page.name.replace(/\.json$/, '.pdf')));
      if (extracted.length !== 1) throw new Error('페이지 단위 PDF가 필요합니다.');
      pages.push({ page: page.page_number, text: extracted[0].text });
    } catch (error) {
      errors.push({ page: page.page_number, error: error.message });
    }
  }
  return { id: document.pid, name: document.file_name.normalize('NFC'), domain: document.domain, pageCount: document.pages, pages: pages.toSorted((left, right) => left.page - right.page), errors };
}

async function listDataset(repo, revision, filter) {
  const entries = await fetchDataset(`https://huggingface.co/api/datasets/${repo}/tree/${revision}`).then(response => response.json());
  const matches = entries.filter(entry => entry.type === 'file' && filter(entry.path));
  if (!matches.length) throw new Error(`${repo}: 다운로드 목록이 비어 있습니다.`);
  return matches;
}

async function prepare() {
  await mkdir(benchmarkDir, { recursive: true });
  const csvFiles = await listDataset(dataset, datasetRevision, name => ['rag_evaluation_result.csv', 'documents.csv'].includes(name));
  const archives = await listDataset(pdfDataset, pdfRevision, name => /^allganize-test-\d+\.tar$/.test(name));
  await mapConcurrent(csvFiles, 2, entry => download(dataset, datasetRevision, entry));
  console.log(`Allganize 질문과 문서 목록 저장 완료. PDF 묶음 ${archives.length}개를 확인합니다.`);
  const documents = await mapConcurrent(archives, 4, async entry => {
    await download(pdfDataset, pdfRevision, entry);
    const document = await extractArchive(entry);
    console.log(`${entry.path}: ${document.pages.length}쪽 추출, ${document.errors.length}쪽 실패`);
    return document;
  });
  const filename = path.join(benchmarkDir, 'pdf-pages.json');
  await writeFile(`${filename}.tmp`, JSON.stringify({ pdfRevision, documents }));
  await rename(`${filename}.tmp`, filename);
  console.log(`PDF ${documents.length}개, ${documents.reduce((sum, item) => sum + item.pages.length, 0)}쪽. ${filename}`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await prepare();
