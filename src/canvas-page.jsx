import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, GitBranch, GripVertical, Network, NotebookPen, Plus, Search, X } from 'lucide-react';
import { dayKey, uid } from './store.js';
import { openStudyReport } from './study-report.js';
import './canvas-page.css';

const boardWidth = 1800;
const boardHeight = 1200;
const cardWidth = 260;
const cardHeight = 190;
const cardMaxX = boardWidth - cardWidth - 20;
const cardMaxY = boardHeight - cardHeight - 20;
const clamp = (value, max) => Math.max(0, Math.min(value, max));

function nextCardPosition(cards, requested) {
  const preferred = { x: clamp(requested.x, cardMaxX), y: clamp(requested.y, cardMaxY) };
  const free = ({ x, y }) => cards.every(card => Math.abs(x - card.x) >= cardWidth + 12 || Math.abs(y - card.y) >= cardHeight + 12);
  if (free(preferred)) return preferred;

  const slots = [];
  for (let y = 24; y <= cardMaxY; y += cardHeight + 30) {
    for (let x = 24; x <= cardMaxX; x += cardWidth + 30) {
      const position = { x, y };
      if (free(position)) slots.push(position);
    }
  }
  const distance = position => Math.hypot(position.x - preferred.x, position.y - preferred.y);
  return slots.sort((left, right) => distance(left) - distance(right))[0] || preferred;
}

function CanvasNotePicker({ Dialog, notes, cardCounts, onClose, onSelect }) {
  const [query, setQuery] = useState('');
  const filter = query.trim().normalize('NFKC').toLowerCase();
  const matching = notes.filter(note => `${note.title}\n${note.nodes.map(node => node.text).join('\n')}`.normalize('NFKC').toLowerCase().includes(filter));
  const sections = [
    ['아직 배치하지 않은 노트', matching.filter(note => !cardCounts.has(note.id))],
    ['캔버스에 배치한 노트', matching.filter(note => cardCounts.has(note.id))],
  ];

  return <Dialog title="캔버스에 노트 추가" onClose={onClose}>
    <label className="search-input canvas-note-search"><Search size={17}/><input autoFocus aria-label="추가할 노트 검색" placeholder="제목이나 내용을 검색하세요" value={query} onChange={event => setQuery(event.target.value)}/></label>
    <div className="canvas-note-picker">
      {!matching.length && <p className="muted">{notes.length ? '검색 결과가 없어요.' : '이 작업 공간에 아직 노트가 없어요.'}</p>}
      {sections.filter(([, items]) => items.length).map(([heading, items]) => <section key={heading}>
        <h3>{heading}</h3>
        {items.map(note => {
          const preview = note.nodes.find(node => node.text.trim())?.text;
          return <button type="button" className="canvas-note-choice" key={note.id} onClick={() => onSelect(note)}>
            <NotebookPen size={16}/><span><strong>{note.title || '제목 없는 노트'}</strong>{preview && <small>{preview}</small>}</span>
            {cardCounts.has(note.id) && <small className="canvas-note-count">{cardCounts.get(note.id)}개 배치</small>}<Plus size={16}/>
          </button>;
        })}
      </section>)}
    </div>
  </Dialog>;
}

function NewCanvasNote({ Dialog, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  return <Dialog title="캔버스에서 새 노트" onClose={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (title.trim()) onCreate(title.trim(), body.trim()); }}>
      <label className="form-label">제목<input autoFocus required maxLength={180} value={title} onChange={event => setTitle(event.target.value)} placeholder="노트 제목"/></label>
      <label className="form-label">내용<textarea rows={4} value={body} onChange={event => setBody(event.target.value)} placeholder="떠오른 생각을 적어 보세요"/></label>
      <div className="modal-footer"><button className="primary-button" disabled={!title.trim()}>만들고 배치하기</button></div>
    </form>
  </Dialog>;
}

function CanvasContextMenu({ menu, onClose, onCreate, onPick, onOpenNote, onDuplicate }) {
  const ref = useRef(null);
  useEffect(() => {
    const firstItem = ref.current?.querySelector('button');
    firstItem?.focus({ preventScroll: true });
    function dismiss(event) {
      if (!ref.current?.contains(event.target)) onClose();
    }
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', onClose);
    };
  }, [menu]);

  function handleKeys(event) {
    if (event.key === 'Escape' || event.key === 'Tab') { onClose(); return; }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...ref.current.querySelectorAll('button')];
    const index = items.indexOf(document.activeElement);
    const next = { ArrowUp: (index - 1 + items.length) % items.length, ArrowDown: (index + 1) % items.length, Home: 0, End: items.length - 1 };
    items[next[event.key]]?.focus();
  }

  return <div ref={ref} role="menu" aria-label="캔버스 메뉴" className="canvas-context-menu" style={{ left: `min(${menu.clientX}px, calc(100vw - 226px))`, top: `min(${menu.clientY}px, calc(100dvh - ${menu.note ? 172 : 94}px))` }} onKeyDown={handleKeys}>
    <button role="menuitem" onClick={onCreate}><NotebookPen size={16}/>새 노트 만들기</button>
    <button role="menuitem" onClick={onPick}><Plus size={16}/>기존 노트 추가</button>
    {menu.note && <>
      <button role="menuitem" onClick={onDuplicate}><Plus size={16}/>이 노트 한 번 더 배치</button>
      <button role="menuitem" onClick={onOpenNote}><ArrowUpRight size={16}/>노트 열기</button>
    </>}
  </div>;
}

export function CanvasWorkspace({ state, update, workspace, onOpenNote, notify, Dialog, IconButton }) {
  const [linkFrom, setLinkFrom] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(null);
  const [highlight, setHighlight] = useState(null);
  const drag = useRef(null);
  const board = useRef(null);
  const cards = state.cards.filter(card => card.workspaceId === workspace.id);
  const notes = state.notes.filter(note => note.workspaceId === workspace.id);
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const notesById = new Map(notes.map(note => [note.id, note]));
  const cardCounts = new Map();
  for (const card of cards) cardCounts.set(card.noteId, (cardCounts.get(card.noteId) || 0) + 1);

  useEffect(() => {
    if (highlight) board.current?.querySelector(`[data-card-id="${highlight}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [highlight]);

  function positionOnScreen() {
    const { scrollLeft, scrollTop } = board.current;
    return { x: scrollLeft + 30, y: scrollTop + 30 };
  }

  function openDialog(kind, position = positionOnScreen()) {
    setMenu(null);
    setDialog({ kind, position });
  }

  function placeNote(note, position, create = false) {
    const cardId = uid();
    update(previous => {
      const existing = previous.cards.filter(card => card.workspaceId === workspace.id);
      if (!create && !previous.notes.some(item => item.id === note.id && item.workspaceId === workspace.id)) return previous;
      const card = { id: cardId, workspaceId: workspace.id, noteId: note.id, ...nextCardPosition(existing, position) };
      return { ...previous, notes: create ? [...previous.notes, note] : previous.notes, cards: [...previous.cards, card] };
    });
    setDialog(null);
    setMenu(null);
    setHighlight(cardId);
  }

  function makeNote(title, text) {
    const note = { id: uid(), workspaceId: workspace.id, title, date: dayKey(), nodes: [{ id: uid(), text, depth: 0 }] };
    placeNote(note, dialog.position, true);
  }

  function showMenu(event) {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const card = cardsById.get(event.target.closest('[data-card-id]')?.dataset.cardId);
    const { scrollLeft, scrollTop } = event.currentTarget;
    setMenu({ clientX: event.clientX, clientY: event.clientY, position: { x: event.clientX - bounds.left + scrollLeft, y: event.clientY - bounds.top + scrollTop }, note: notesById.get(card?.noteId) });
  }

  function startDrag(event, card) {
    if (event.button !== 0 || event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: card.id, clientX: event.clientX, clientY: event.clientY, x: card.x, y: card.y };
  }

  function moveCard(event, card) {
    if (drag.current?.id !== card.id) return;
    const current = drag.current;
    const x = clamp(current.x + event.clientX - current.clientX, cardMaxX);
    const y = clamp(current.y + event.clientY - current.clientY, cardMaxY);
    update(previous => ({ ...previous, cards: previous.cards.map(item => item.id === card.id ? { ...item, x, y } : item) }));
  }

  function linkCard(card) {
    if (!linkFrom) { setLinkFrom(card.id); return; }
    if (linkFrom === card.id) return;
    if (state.edges.some(edge => edge.from === linkFrom && edge.to === card.id)) notify('이미 연결된 카드예요.');
    else update(previous => ({ ...previous, edges: [...previous.edges, { id: uid(), workspaceId: workspace.id, from: linkFrom, to: card.id, label: '연결됨' }] }));
    setLinkFrom(null);
  }

  function removeCard(card) {
    if (linkFrom === card.id) setLinkFrom(null);
    update(previous => ({ ...previous, cards: previous.cards.filter(item => item.id !== card.id), edges: previous.edges.filter(edge => edge.from !== card.id && edge.to !== card.id) }));
  }

  function renameEdge(edge) {
    const label = window.prompt('연결 이름', edge.label);
    if (label !== null) update(previous => ({ ...previous, edges: previous.edges.map(item => item.id === edge.id ? { ...item, label } : item) }));
  }

  return <div className="canvas-page">
    <div className="canvas-toolbar">
      <div className="canvas-toolbar-title"><h2>캔버스</h2><span>빈 곳을 우클릭하면 그 자리에 노트를 놓을 수 있어요.</span></div>
      <button className="subtle-button" onClick={() => openDialog('new')}><NotebookPen size={16}/>새 노트</button>
      <button className="subtle-button" onClick={() => openDialog('pick')}><Plus size={16}/>노트 추가</button>
      <button className="subtle-button" onClick={() => openStudyReport(state, workspace, notify)}><Download size={16}/>학습 PDF</button>
    </div>
    {linkFrom && <div className="canvas-hint">다른 카드의 ‘연결’을 눌러 주세요.<button onClick={() => setLinkFrom(null)}>취소</button></div>}
    <div className="canvas-scroll" ref={board} onContextMenu={showMenu} onScroll={() => { if (menu) setMenu(null); }}>
      <div className="canvas-board">
        <svg className="canvas-edges" width={boardWidth} height={boardHeight}>
          <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--green)"/></marker></defs>
          {state.edges.filter(edge => edge.workspaceId === workspace.id).map(edge => {
            const from = cardsById.get(edge.from);
            const to = cardsById.get(edge.to);
            if (!from || !to) return null;
            const startX = from.x + cardWidth;
            const startY = from.y + 90;
            const endX = to.x;
            const endY = to.y + 90;
            return <g key={edge.id}>
              <path d={`M${startX},${startY} C${startX + 100},${startY} ${endX - 100},${endY} ${endX},${endY}`} markerEnd="url(#arrow)"/>
              <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 10} onClick={() => renameEdge(edge)}>{edge.label}</text>
            </g>;
          })}
        </svg>
        {cards.map(card => {
          const note = notesById.get(card.noteId);
          return <article key={card.id} data-card-id={card.id} className={`canvas-card ${linkFrom === card.id ? 'linking' : ''}`} style={{ left: card.x, top: card.y }} onPointerDown={event => startDrag(event, card)} onPointerMove={event => moveCard(event, card)} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
            <div className="canvas-card-heading"><NotebookPen size={15}/><span>노트</span><GripVertical size={15}/></div>
            <h3>{note?.title || '삭제된 노트'}</h3>
            <p>{note?.nodes.map(node => node.text).join(' ').slice(0, 180)}</p>
            <div className="canvas-card-actions">
              <button disabled={!note} onClick={() => onOpenNote(note)}>노트 열기</button>
              <button onClick={() => linkCard(card)}><GitBranch size={13}/>연결</button>
              <IconButton icon={X} label="캔버스에서 카드 제거" onClick={() => removeCard(card)}/>
            </div>
          </article>;
        })}
      </div>
    </div>
    <div className="canvas-footer"><Network size={15}/>카드 {cards.length}개 <span>연결 이름을 누르면 수정할 수 있어요.</span></div>
    {menu && <CanvasContextMenu menu={menu} onClose={() => setMenu(null)} onCreate={() => openDialog('new', menu.position)} onPick={() => openDialog('pick', menu.position)} onDuplicate={() => placeNote(menu.note, menu.position)} onOpenNote={() => { setMenu(null); onOpenNote(menu.note); }}/>}
    {dialog?.kind === 'pick' && <CanvasNotePicker Dialog={Dialog} notes={notes} cardCounts={cardCounts} onClose={() => setDialog(null)} onSelect={note => placeNote(note, dialog.position)}/>}
    {dialog?.kind === 'new' && <NewCanvasNote Dialog={Dialog} onClose={() => setDialog(null)} onCreate={makeNote}/>}
  </div>;
}
