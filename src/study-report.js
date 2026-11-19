import { understandingLevels, workspaceConcepts } from './concepts.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const reportStyles = `
  @page { size: A4; margin: 15mm; }
  @page overview { size: A4 landscape; margin: 12mm; }
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #ebf1ee; color: #253930; font: 10.5pt/1.65 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', system-ui, sans-serif; word-break: keep-all; overflow-wrap: anywhere; }
  h1, h2, h3, h4 { line-height: 1.35; margin: 0 0 .55em; }
  h2 { margin-top: 1em; font-size: 18pt; }
  h3 { font-size: 13pt; }
  h4 { font-size: 11pt; }
  p { margin: 0; }
  a { color: #25664e; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px; background: white; position: sticky; top: 0; border-bottom: 1px solid #cedbd3; }
  .toolbar button { flex-shrink: 0; border: 0; padding: 9px 13px; border-radius: 7px; background: #235d48; color: white; font: inherit; cursor: pointer; }
  .overview, .report-details { max-width: 1040px; margin: 20px auto; padding: 27px 35px; background: white; border-radius: 12px; }
  .overview h1 { margin: 8px 0 5px; font-size: 25pt; }
  .report-label, .report-counts, .concept-meta, .empty { color: #51675c; }
  .report-label { font-size: 10pt; font-weight: 600; }
  .board { width: 100%; height: min(60vw, 146mm); border: 1px solid #cedbd3; border-radius: 9px; }
  .board text { font-family: inherit; }
  .contents { display: flex; flex-wrap: wrap; gap: 5px 15px; margin: 10px 0 0; }
  .concept-group, .report-notes, .relations { margin: 0 0 22px; }
  .concept-entry, .note-entry { margin: 0 0 14px; padding: 10px 0; border-top: 1px solid #cedbd3; }
  .concept-meta { font-size: 9pt; margin-bottom: 6px; }
  .note-body { white-space: pre-wrap; }
  li { padding-left: 3px; margin: 4px 0; }
  @media print {
    body { background: white; }
    .toolbar { display: none; }
    .overview, .report-details { max-width: none; margin: 0; padding: 0; border-radius: 0; }
    .overview { page: overview; }
    .report-details { break-before: page; }
    .board { height: 143mm; }
    h2, h3, h4, .concept-meta { break-after: avoid; }
    .concept-entry, .note-entry { orphans: 3; widows: 3; }
    svg, .contents { break-inside: avoid; }
  }
  @media screen and (max-width: 640px) {
    .toolbar { position: static; }
    .overview, .report-details { padding: 15px; margin: 10px; }
  }
`;

function cardLabel(title) {
  const rows = [''];
  let rowWidth = 0;
  for (const character of title.replace(/\s+/g, ' ')) {
    const width = /[\u2e80-\uffff]/u.test(character) ? 18 : 10;
    if (rowWidth + width > 222) {
      if (rows.length === 2) { rows[1] = `${rows[1].trimEnd()}…`; break; }
      rows.push('');
      rowWidth = 0;
    }
    rows[rows.length - 1] += character;
    rowWidth += width;
  }
  return rows.map(escapeHtml);
}

function renderBoard(cards, edges) {
  if (!cards.length) return '<p class="empty">캔버스에 배치한 카드가 없습니다.</p>';
  const nodeWidth = 260;
  const nodeHeight = 88;
  const margin = 95;
  const minX = Math.min(...cards.map(card => card.x)) - margin;
  const minY = Math.min(...cards.map(card => card.y)) - margin;
  const width = Math.max(...cards.map(card => card.x)) + nodeWidth + margin - minX;
  const height = Math.max(...cards.map(card => card.y)) + nodeHeight + margin - minY;

  const lines = edges.map(({ from, to, label }) => {
    const forward = from.x <= to.x;
    const x1 = from.x + (forward ? nodeWidth : 0);
    const x2 = to.x + (forward ? 0 : nodeWidth);
    const y1 = from.y + nodeHeight / 2;
    const y2 = to.y + nodeHeight / 2;
    const distance = forward ? 82 : -82;
    const edgeLabel = [...label].length > 24 ? `${[...label].slice(0, 24).join('')}…` : label;
    return `<path d="M${x1},${y1} C${x1 + distance},${y1} ${x2 - distance},${y2} ${x2},${y2}" fill="none" stroke="#4e7968" stroke-width="2.8" marker-end="url(#study-arrow)"/>
      ${edgeLabel ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 9}" stroke="white" stroke-width="4" paint-order="stroke" text-anchor="middle" fill="#315444" font-size="17">${escapeHtml(edgeLabel)}</text>` : ''}`;
  }).join('');

  const nodes = cards.map(({ x, y, note, number }) => `<a href="#study-note-${number}">
    <title>${escapeHtml(note.title)}</title>
    <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="#edf6f0" stroke="#57816e" stroke-width="2"/>
    <text x="${x + 14}" y="${y + 23}" fill="#4c6b5d" font-size="14">노트 ${number}</text>
    <text x="${x + 14}" y="${y + 50}" fill="#253930" font-size="20" font-weight="600">${cardLabel(note.title || '제목 없는 노트').map((line, index) => `<tspan x="${x + 14}" dy="${index * 24}">${line}</tspan>`).join('')}</text>
  </a>`).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" class="board" viewBox="${minX} ${minY} ${width} ${height}" role="img" aria-label="캔버스 노트 연결도">
    <defs><marker id="study-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#4e7968"/></marker></defs>
    ${lines}${nodes}
  </svg>`;
}

function renderConcepts(concepts) {
  const byCategory = Map.groupBy(concepts, concept => concept.category?.trim() || '미분류');
  return [...byCategory.entries()].sort(([left], [right]) => left.localeCompare(right, 'ko')).map(([category, items]) => `<section class="concept-group">
    <h3>${escapeHtml(category)}</h3>
    ${items.map(concept => `<article class="concept-entry">
      <h4>${escapeHtml(concept.name)}</h4>
      <p class="concept-meta">${understandingLevels[concept.level - 1] ? `이해도 ${concept.level}/5 (${understandingLevels[concept.level - 1]})` : '이해도 기록 전'}${concept.locked ? '　자동 조정 잠금' : ''}</p>
      ${concept.notes?.trim() ? `<p class="note-body">${escapeHtml(concept.notes)}</p>` : ''}
    </article>`).join('')}
  </section>`).join('');
}

export function buildStudyReport(state, workspace, date = new Date()) {
  const notes = state.notes.filter(note => note.workspaceId === workspace.id);
  const concepts = workspaceConcepts(state, workspace.id);
  const noteIndex = new Map(notes.map((note, index) => [note.id, { note, number: index + 1 }]));
  const cards = state.cards.filter(card => card.workspaceId === workspace.id && noteIndex.has(card.noteId) && Number.isFinite(card.x) && Number.isFinite(card.y)).map(card => ({ ...card, ...noteIndex.get(card.noteId) }));
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const edges = state.edges.filter(edge => edge.workspaceId === workspace.id && cardsById.has(edge.from) && cardsById.has(edge.to)).map(edge => ({ from: cardsById.get(edge.from), to: cardsById.get(edge.to), label: edge.label || '' }));
  const noteLink = card => `<a href="#study-note-${card.number}">${escapeHtml(card.note.title || '제목 없는 노트')}</a>`;
  const stamp = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long' }).format(date);

  return `<!doctype html>
  <html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(workspace.name)} - LearnBoost 학습 정리</title><style>${reportStyles}</style></head>
  <body>
    <header class="toolbar"><p>인쇄 창의 대상에서 ‘PDF로 저장’을 선택하세요.</p><button id="print-study-report" type="button">인쇄 및 PDF 저장</button></header>
    <section class="overview">
      <p class="report-label">LearnBoost 학습 정리</p>
      <h1>${escapeHtml(workspace.name)}</h1>
      <p class="report-counts">${escapeHtml(stamp)}　개념 ${concepts.length}개　노트 ${notes.length}개</p>
      <h2>캔버스 개념도</h2>
      ${renderBoard(cards, edges)}
      <nav class="contents" aria-label="학습 정리 목차"><a href="#study-concepts">개념별 상세 내용</a>${edges.length ? '<a href="#study-relations">캔버스 연결 목록</a>' : ''}<a href="#study-notes">작업 공간 노트</a></nav>
    </section>
    <main class="report-details">
      <section id="study-concepts"><h2>개념별 상세 내용</h2>${renderConcepts(concepts) || '<p class="empty">정리한 개념이 없습니다.</p>'}</section>
      ${edges.length ? `<section class="relations" id="study-relations"><h2>캔버스 연결 목록</h2><ul>${edges.map(edge => `<li>${noteLink(edge.from)} → ${noteLink(edge.to)}${edge.label ? ` (${escapeHtml(edge.label)})` : ''}</li>`).join('')}</ul></section>` : ''}
      <section class="report-notes" id="study-notes"><h2>작업 공간 노트</h2>${notes.length ? notes.map((note, index) => `<article class="note-entry" id="study-note-${index + 1}">
        <h3>${index + 1}. ${escapeHtml(note.title || '제목 없는 노트')}</h3>
        ${note.nodes.some(node => node.text.trim()) ? `<ul>${note.nodes.filter(node => node.text.trim()).map(node => `<li class="note-body" style="margin-inline-start:${Math.min(7, Math.max(0, Number(node.depth) || 0)) * 13}px">${escapeHtml(node.text)}</li>`).join('')}</ul>` : ''}
      </article>`).join('') : '<p class="empty">작성한 노트가 없습니다.</p>'}</section>
    </main>
  </body></html>`;
}

export function openStudyReport(state, workspace, notify) {
  const preview = window.open('', '_blank');
  if (!preview) { notify('학습 PDF 미리보기를 열 수 없어요. 브라우저의 팝업 설정을 확인해 주세요.'); return; }
  preview.opener = null;
  preview.document.open();
  preview.document.write(buildStudyReport(state, workspace));
  preview.document.close();
  preview.document.getElementById('print-study-report').addEventListener('click', () => preview.print());
}
