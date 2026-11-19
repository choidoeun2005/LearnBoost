import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantMarkdown } from './markdown.js';
import { CanvasWorkspace } from './canvas-page.jsx';
import { openStudyReport } from './study-report.js';
import { ConceptsPage } from './concepts-page.jsx';
import { applyConceptSuggestions, learningProfile, understandingLevels, workspaceConcepts } from './concepts.js';
import { ModelPicker } from './model-picker.jsx';
import { ContextMenu } from './context-menu.jsx';
import { removeWorkspace } from './workspace-actions.js';
import './learning.css';
import { PdfSplitHandle, PdfViewer } from './pdf-viewer.jsx';
import { citationColor, citationPassage, citedSources, evidenceRange, evidenceTextMap } from './pdf-evidence.js';
import 'katex/dist/katex.min.css';
import { PanelLeft, Home, CalendarDays, Search, Zap, Brain, Folder, FileText, Library, Plus, ChevronDown, ChevronRight, ArrowUp, CornerUpLeft, X, Settings, Sun, Moon, Download, Upload, Trash2, Check, GitBranch, MessageSquare, NotebookPen, Network, LoaderCircle, Pin, Hash, Monitor, Clock, ArrowLeft, Square, ExternalLink } from 'lucide-react';
import { uid, dayKey, loadState, api, downloadJson, themeStorageKey, workspaceStorageKey } from './store';
import './styles.css';

const WorkspaceContext = createContext(null);
const useWorkspace = () => useContext(WorkspaceContext);
const viewLabels = { Workspaces: '작업 공간', Journal: '일지', Notes: '노트', Documents: '문서', Tasks: '할 일', Canvas: '캔버스', Concepts: '개념 정리', Memory: '기억', Chat: '대화', Note: '노트', Document: '문서', All: '전체', 'To do': '할 일', Done: '완료' };
const visionModel = 'furiosa-ai/Qwen3-VL-32B-Instruct';
const icons = { Workspaces: Folder, Journal: CalendarDays, Notes: NotebookPen, Documents: FileText, Tasks: Check, Canvas: Network, Concepts: Brain, Memory: Brain };

function IconButton({ icon: Icon, label, className = '', ...props }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}><Icon size={19} strokeWidth={1.7}/></button>;
}

function Modal({ title, children, onClose, wide = false }) {
  const container = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    container.current?.querySelector('input, textarea, button')?.focus();
    const keydown = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = [...container.current.querySelectorAll('button:not([disabled]),input,textarea,select,a[href]')];
        const first = elements[0];
        const last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={container} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><IconButton icon={X} label="창 닫기" onClick={onClose}/></div>{children}</section></div>;
}

function App() {
  const [state, setState] = useState(loadState);
  const [view, setView] = useState('Chat');
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 580);
  const [modal, setModal] = useState(null);
  const [itemMenu, setItemMenu] = useState(null);
  const [toast, setToast] = useState(null);
  const [conceptId, setConceptId] = useState(null);
  const [conceptDraft, setConceptDraft] = useState(null);
  const previousConcepts = useRef(state.concepts || []);
  const [documents, setDocuments] = useState([]);
  const documentRequest = useRef(0);
  const [config, setConfig] = useState({ model: '', models: [] });
  const [reader, setReader] = useState(null);
  const [pdfWidth, setPdfWidth] = useState(() => {
    const saved = Number(localStorage.getItem('learnboost-pdf-width'));
    return saved >= 30 && saved <= 70 ? saved : 44;
  });
  useEffect(() => { localStorage.setItem('learnboost-pdf-width', String(pdfWidth)); }, [pdfWidth]);
  const [noteId, setNoteId] = useState('note-1');
  const [theme, setTheme] = useState(() => localStorage.getItem(themeStorageKey) || localStorage.getItem('sidequestly-theme') || 'light');
  const workspace = state.workspaces.find(item => item.id === state.workspaceId) || state.workspaces[0];
  const update = updater => setState(previous => typeof updater === 'function' ? updater(previous) : { ...previous, ...updater });
  const notify = (message, action) => setToast({ message, action });

  function showContextMenu(event, items) {
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget;
    const rect = trigger.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    setItemMenu({ items, trigger, x: keyboard ? rect.left : event.clientX, y: keyboard ? rect.bottom : event.clientY });
  }

  function openWorkspace(item) {
    update({ workspaceId: item.id, branchId: null });
    setReader(null);
    setView('Workspaces');
  }

  function workspaceMenu(event, item) {
    showContextMenu(event, [
      { label: '작업 공간 열기', icon: Folder, action: () => openWorkspace(item) },
      { label: '이름 및 설정 편집', icon: Settings, action: () => { openWorkspace(item); setModal('workspace-settings'); } },
      { label: '학습 PDF', icon: FileText, action: () => openStudyReport(state, item, notify) },
      { label: '작업 공간 삭제', icon: Trash2, danger: true, disabled: state.workspaces.length === 1, action: () => {
        if (!window.confirm(`“${item.name}” 작업 공간과 대화, 필기, 노트, 할 일, 캔버스, 기억, 개념을 삭제할까요? 공용 문서 목록의 파일은 유지됩니다.`)) return;
        update(previous => removeWorkspace(previous, item.id));
        if (item.id === workspace.id) {
          setReader(null); setView('Workspaces'); setConceptDraft(null); setConceptId(null); setNoteId(null);
        }
        notify('작업 공간을 삭제했어요.');
      } },
    ]);
  }

  function chatMenu(event, chat) {
    showContextMenu(event, [
      { label: '대화 열기', icon: MessageSquare, action: () => openChat(chat.id) },
      { label: chat.pinned ? '고정 해제' : '대화 고정', icon: Pin, action: () => update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, pinned: !item.pinned } : item) })) },
    ]);
  }

  function openConcept(id, workspaceId = workspace.id) {
    if (workspaceId !== workspace.id) update({ workspaceId, branchId: null });
    setConceptId(id); setConceptDraft(null); setReader(null); setView('Concepts');
  }

  function draftConcept(name) {
    openConcept(null);
    setConceptDraft({ workspaceId: workspace.id, name: name.trim().slice(0, 80) });
  }

  function reviewConcepts(workspaceId, snapshot, question, answer) {
    void api('/concepts/suggest', { method: 'POST', body: JSON.stringify({
      learningProfile: learningProfile(snapshot), question: question.slice(0, 4000), answer: answer.slice(0, 6000),
    }) }).then(suggestions => {
      if (!suggestions.additions.length && !suggestions.updates.length) return;
      const revision = uid();
      update(previous => applyConceptSuggestions(previous, workspaceId, snapshot, suggestions, revision));
    }).catch(() => {});
  }

  useEffect(() => {
    const concepts = state.concepts || [];
    const previous = new Map(previousConcepts.current.map(concept => [concept.id, concept.level]));
    previousConcepts.current = concepts;
    const changes = concepts.filter(concept => concept.updatedBy === 'ai' && previous.has(concept.id) && previous.get(concept.id) !== concept.level);
    if (changes.length) {
      const concept = changes[0];
      const message = changes.length === 1 ? `AI가 ${concept.name} 이해도를 ${concept.level}단계(${understandingLevels[concept.level - 1]})로 조정했어요.` : `AI가 개념 ${changes.length}개의 이해도를 조정했어요.`;
      notify(message, { label: '이해도 수정', open: () => openConcept(concept.id, concept.workspaceId) });
    }
  }, [state.concepts]);
  async function refreshDocuments({ quiet = false } = {}) {
    const request = ++documentRequest.current;
    try {
      const result = await api('/documents');
      if (request !== documentRequest.current) return;
      setDocuments(result);
      const availableIds = new Set(result.map(document => document.id));
      update(previous => {
        const chats = previous.chats.map(chat => {
          const documentIds = (chat.documentIds || []).filter(id => availableIds.has(id));
          const documentQuote = availableIds.has(chat.documentQuote?.documentId) ? chat.documentQuote : undefined;
          if (documentIds.length === (chat.documentIds || []).length && documentQuote === chat.documentQuote) return chat;
          return { ...chat, documentIds, documentQuote };
        });
        return chats.every((chat, index) => chat === previous.chats[index]) ? previous : { ...previous, chats };
      });
    } catch (error) {
      if (!quiet && request === documentRequest.current) notify(error.message);
    }
  }
  const indexingDocuments = documents.some(document => document.indexing);
  useEffect(() => {
    try { localStorage.setItem(workspaceStorageKey, JSON.stringify(state)); }
    catch { notify('저장 공간이 부족해요. 설정에서 작업 공간을 내보내 백업해 주세요.'); }
  }, [state]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);
  useEffect(() => { refreshDocuments(); api('/config').then(setConfig).catch(error => notify(error.message)); }, []);
  useEffect(() => {
    if (!indexingDocuments) return;
    let active = true;
    let timer;
    async function refreshIndexStatus() {
      await refreshDocuments({ quiet: true });
      if (active) timer = setTimeout(refreshIndexStatus, 1200);
    }
    timer = setTimeout(refreshIndexStatus, 1200);
    return () => { active = false; clearTimeout(timer); };
  }, [indexingDocuments]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 7000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    const keydown = event => {
      if ((event.metaKey || event.ctrlKey) && ['k', 'p'].includes(event.key.toLowerCase())) {
        event.preventDefault(); setModal(event.key.toLowerCase() === 'k' ? 'search' : 'quick');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  function openChat(chatId, location = null) { update({ activeChatId: chatId, branchId: null }); setReader(location); setView('Chat'); }
  function createChat(prompt = '', location = null, quote = null) {
    const chat = {
      id: uid(), workspaceId: workspace.id, title: location?.name || prompt.slice(0, 55) || '새 대화',
      date: dayKey(), messages: [], documentIds: location?.indexed ? [location.id] : [],
      ...(quote ? { documentQuote: quote } : {}), ...(quote?.region ? { model: visionModel } : {}), draft: prompt,
    };
    update(previous => ({ ...previous, chats: [...previous.chats, chat], activeChatId: chat.id, branchId: null }));
    setView('Chat');
    setReader(location ? { id: location.id, page: quote?.page || location.page || 1, text: quote?.text, region: quote?.region, showChat: true } : null);
  }
  function branch(chat, message, selection) {
    const chatId = uid();
    const position = chat.messages.findIndex(item => item.id === message.id);
    const inherited = [...(chat.inherited || []), ...chat.messages.slice(0, position + 1)].map(({ role, content }) => ({ role, content }));
    const branchAnchor = chat.documentQuote || chat.branchAnchor || message.sources?.find((source, index) => message.content.includes(`[${index + 1}]`));
    const child = { id: chatId, workspaceId: workspace.id, title: selection.slice(0, 55), date: dayKey(), parentId: chat.id, sourceMessageId: message.id, selection, inherited, messages: [], documentIds: chat.documentIds || [], documentQuote: chat.documentQuote, documentOnly: chat.documentOnly, model: chat.model, branchAnchor };
    update(previous => ({ ...previous, chats: [...previous.chats, child], activeChatId: previous.branchId === chat.id ? previous.activeChatId : chat.id, branchId: chatId }));
    setView('Chat');
  }
  function addNote(title = '제목 없는 노트', content = '') {
    const note = { id: uid(), workspaceId: workspace.id, title, date: dayKey(), nodes: [{ id: uid(), text: content, depth: 0 }] };
    update(previous => ({ ...previous, notes: [...previous.notes, note] }));
    setNoteId(note.id); return note;
  }
  function capture(content) { addNote(content.slice(0, 50), content); notify('노트와 오늘의 일지에 저장했어요.'); }
  const context = { state, update, workspace, view, setView, notify, documents, refreshDocuments, config, openChat, createChat, branch, capture, addNote, noteId, setNoteId, setModal, setReader, conceptId, conceptDraft, setConceptId, setConceptDraft, draftConcept, reviewConcepts, showContextMenu, chatMenu, workspaceMenu };
  const workspaceChats = state.chats.filter(chat => chat.workspaceId === workspace.id);
  const activeChat = state.chats.find(chat => chat.id === state.activeChatId && chat.workspaceId === workspace.id);
  const branchChat = state.chats.find(chat => chat.id === state.branchId && chat.workspaceId === workspace.id);

  return <WorkspaceContext.Provider value={context}><div className={`app-shell ${sidebar ? '' : 'sidebar-hidden'}`}>
    <header className="app-topbar"><div className="global-tools"><IconButton icon={PanelLeft} label="사이드바 전환" onClick={() => setSidebar(!sidebar)}/><a className="icon-button" href="/" title="홈" aria-label="홈"><Home size={20}/></a><IconButton icon={CalendarDays} label="일지" onClick={() => setView('Journal')}/><IconButton icon={Search} label="검색 (Ctrl+K 또는 ⌘K)" onClick={() => setModal('search')}/><IconButton icon={Zap} label="빠른 기록 (Ctrl+P 또는 ⌘P)" onClick={() => setModal('quick')}/><IconButton icon={Brain} label="기억" onClick={() => setView('Memory')}/></div><button className="breadcrumb workspace-crumb" onContextMenu={event => workspaceMenu(event, workspace)} onClick={() => setView('Workspaces')}><Folder size={18}/>{workspace.name}</button><ChevronRight size={15} className="muted"/><span className="breadcrumb current-crumb">{view === 'Chat' ? activeChat?.title || '새 대화' : viewLabels[view]}</span><span className="local-label"><span/>로컬 작업 공간</span></header>
    {sidebar && <aside className="sidebar"><div className="sidebar-main"><nav>{['Workspaces', 'Journal', 'Notes', 'Documents', 'Tasks', 'Canvas', 'Concepts'].map(label => { const Icon = icons[label]; return <button key={viewLabels[label]} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => { setView(label); setReader(null); }}><Icon size={19} strokeWidth={1.7}/>{viewLabels[label]}{label === 'Tasks' && <span className="count">{state.tasks.filter(task => !task.done && task.workspaceId === workspace.id).length}</span>}</button>; })}</nav><div className="sidebar-section"><span>고정한 대화</span></div>{workspaceChats.filter(chat => chat.pinned).length ? workspaceChats.filter(chat => chat.pinned).map(chat => <button key={chat.id} className="recent-item" onContextMenu={event => chatMenu(event, chat)} onClick={() => openChat(chat.id)}><Pin size={13}/>{chat.title}</button>) : <p className="sidebar-hint">아직 고정한 대화가 없어요</p>}<div className="sidebar-section"><span>최근 대화</span><IconButton icon={Plus} label="새 대화" onClick={() => createChat()}/></div>{workspaceChats.toReversed().slice(0, 8).map(chat => <button key={chat.id} className={`recent-item ${chat.id === state.activeChatId && view === 'Chat' ? 'selected' : ''}`} onContextMenu={event => chatMenu(event, chat)} onClick={() => openChat(chat.id)}>{chat.parentId && <GitBranch size={13}/>}<span>{chat.title}</span></button>)}<div className="sidebar-section"><span>작업 공간</span><IconButton icon={Plus} label="새 작업 공간" onClick={() => setModal('workspace')}/></div>{state.workspaces.map(item => <button key={item.id} className={`nav-item ${item.id === workspace.id ? 'active' : ''}`} onContextMenu={event => workspaceMenu(event, item)} onClick={() => openWorkspace(item)}><Folder size={19}/><span>{item.name}</span><ChevronRight size={16}/></button>)}</div><div className="sidebar-footer"><button className="profile" onClick={() => setModal('settings')}><span className="avatar">L</span><strong>LearnBoost</strong></button><IconButton icon={theme === 'dark' ? Sun : Moon} label="테마 변경" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}/><IconButton icon={Settings} label="설정" onClick={() => setModal('settings')}/></div><div className="sidebar-caption">생각을 잇는 공간</div></aside>}
    <main className={`workspace-content ${view === 'Chat' ? 'chat-layout' : ''} ${reader ? 'has-reader' : ''} ${reader?.showChat ? 'reader-question-open' : ''}`} style={reader ? { '--reader-width': `${pdfWidth}%` } : undefined}>
      {view === 'Chat' ? <div className={`chat-dock ${reader ? 'reader-open' : ''}`}>
        {activeChat ? <ChatPane key={activeChat.id} chat={activeChat} jumpTo={reader?.messageId} covered={Boolean(reader && branchChat)}/> : <div className="empty-page"><h1>궁금한 것부터 시작해 보세요.</h1><button className="primary-button" onClick={() => createChat()}>대화 시작하기</button></div>}
        {branchChat && <ChatPane key={branchChat.id} chat={branchChat} side/>}
      </div> : <WorkspacePage/>}
      {reader && <DocumentReader key={reader.id} reader={reader} onClose={() => setReader(null)}/>}
      {reader && view === 'Chat' && <PdfSplitHandle value={pdfWidth} onChange={setPdfWidth}/>}
      {reader?.showChat && <button className="subtle-button reader-return-button" onClick={() => setReader({ ...reader, showChat: false })}><FileText size={14}/>문서 보기</button>}
    </main>
    <aside className="right-rail">{[['Journal', CalendarDays], ['Tasks', Check], ['Notes', NotebookPen], ['Memory', Brain], ['Canvas', Network], ['Chat', MessageSquare]].map(([label, Icon]) => <IconButton key={viewLabels[label]} icon={Icon} label={viewLabels[label]} className={view === label ? 'active' : ''} onClick={() => setView(label)}/>)}</aside>
    {modal && <AppModal modal={modal} onClose={() => setModal(null)}/>}
    {toast && <div className="toast"><span role="status">{toast.message}</span>{toast.action && <button type="button" className="toast-action" onClick={() => { toast.action.open(); setToast(null); }}>{toast.action.label}</button>}<IconButton icon={X} label="알림 닫기" onClick={() => setToast(null)}/></div>}
    {itemMenu && <ContextMenu menu={itemMenu} close={() => setItemMenu(null)}/>}
  </div></WorkspaceContext.Provider>;
}

function AnswerProgress({ steps, busy = false }) {
  if (!busy && !steps?.length) return null;
  return <details className="answer-progress" open={busy || undefined}>
    <summary>{busy ? <span className="answer-progress-live" role="status"><LoaderCircle size={14} className="spin"/>{steps.at(-1) || '질문을 보내고 있어요'}</span> : '답변 준비 과정'}</summary>
    {steps.length > 0 && <ol>{steps.map(step => <li key={step}>{step}</li>)}</ol>}
  </details>;
}

function openSource(onOpen, source, message) {
  const number = (message?.sources?.indexOf(source) ?? -1) + 1;
  const isCited = number && citedSources(message).some(item => item.number === number);
  onOpen({
    id: source.documentId, page: source.page, region: source.region, jump: uid(),
    ...(isCited ? { citation: { messageId: message.id, number } } : { text: source.kind === 'selection' ? source.text.slice(0, 110) : '' }),
  });
}

function DocumentQuoteButton({ quote, onOpen }) {
  const { documentId, name, page, endPage, text, region } = quote;
  return <button type="button" className="composer-quote" title={text} onClick={() => onOpen({ id: documentId, page, text, region, jump: uid() })}>
    <FileText size={14}/>
    <span>{name} {endPage > page ? `${page}–${endPage}` : page}쪽 {region ? '선택 영역' : `“${text}”`}</span>
  </button>;
}

function AnswerSources({ message, onOpen }) {
  const { documents, update } = useWorkspace();
  const numbered = (message.sources || []).map((source, index) => ({ source, number: index + 1 }));
  const cited = citedSources(message);
  const visible = message.model === 'Furiosa 문서 검색' || !message.progress ? numbered : cited;
  if (!visible.length) return null;

  function toggleNote(number) {
    update(previous => ({ ...previous, chats: previous.chats.map(chat => chat.messages.some(item => item.id === message.id) ? {
      ...chat, messages: chat.messages.map(item => {
        if (item.id !== message.id) return item;
        const pdfNotes = { ...item.pdfNotes };
        if (pdfNotes[number]) delete pdfNotes[number];
        else pdfNotes[number] = { memo: '' };
        return { ...item, pdfNotes };
      }),
    } : chat) }));
  }

  return <div className="sources"><span>{message.model === 'Furiosa 문서 검색' ? '검색 결과' : '출처'}</span>{visible.map(({ source, number }) => <div className="answer-source-row" key={number}>
    <button type="button" className="answer-source-link" onClick={() => openSource(onOpen, source, message)}><FileText size={14}/><span>[{number}] {source.name}, {source.endPage > source.page ? `${source.page}–${source.endPage}` : source.page}쪽</span></button>
    {cited.some(item => item.number === number) && documents.some(document => document.id === source.documentId && document.extension === '.pdf') && <button type="button" className="answer-source-note" aria-pressed={Boolean(message.pdfNotes?.[number])} aria-label={`출처 ${number} ${message.pdfNotes?.[number] ? 'PDF 필기 해제' : 'PDF에 필기'}`} title={message.pdfNotes?.[number] ? 'PDF 필기 해제' : 'PDF에 필기'} onClick={() => toggleNote(number)}><NotebookPen size={14}/><span>{message.pdfNotes?.[number] ? '필기함' : '필기'}</span></button>}
  </div>)}</div>;
}

function ChatPane({ chat, side = false, jumpTo, covered = false }) {
  const { state, update, config, documents, workspace, setView, setReader, setModal, branch, capture, notify, openChat, draftConcept, reviewConcepts } = useWorkspace();
  const [input, setInput] = useState(chat.draft || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [searchOnly, setSearchOnly] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [progress, setProgress] = useState([]);
  const abort = useRef(null);
  const messageList = useRef(null);
  const followAnswer = useRef(!chat.example);
  useEffect(() => {
    const list = messageList.current;
    if (list && followAnswer.current) list.scrollTo({ top: list.scrollHeight, behavior: 'instant' });
  }, [chat.messages.length, busy, streamText, progress]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const updateSelection = () => {
      const selected = window.getSelection();
      if (!selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
      const range = selected.getRangeAt(0);
      const article = node => (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest('.message.assistant');
      const start = article(range.startContainer);
      const message = start && start === article(range.endContainer) && messageList.current?.contains(start) && chat.messages.find(item => item.id === start.dataset.messageId);
      const text = message && selected.toString().trim();
      setSelection(text ? { message, text } : null);
    };
    document.addEventListener('selectionchange', updateSelection);
    return () => document.removeEventListener('selectionchange', updateSelection);
  }, [chat.messages]);
  useEffect(() => {
    if (jumpTo) messageList.current?.querySelector(`[data-message-id="${CSS.escape(jumpTo)}"]`)?.scrollIntoView({ block: 'center' });
  }, [jumpTo]);
  const modifyChat = patch => update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, ...patch } : item) }));
  const related = state.chats.filter(item => item.parentId === chat.id);
  const imageModel = chat.documentQuote?.region ? 'furiosa-ai/Qwen3-VL-32B-Instruct' : undefined;
  const model = imageModel || (config.models?.some(item => item.id === chat.model) ? chat.model : config.model);
  const advertisedModels = config.models?.length ? config.models : config.model ? [{ id: config.model, label: config.model }] : [];
  const models = imageModel ? advertisedModels.filter(item => item.id === imageModel) : advertisedModels;

  function actOnSelection(action) {
    action(selection);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  async function submit(event) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy || abort.current) return;
    const userMessage = { id: uid(), role: 'user', content: question, documentQuote: chat.documentQuote };
    const messages = [...chat.messages, userMessage];
    followAnswer.current = true;
    modifyChat({ messages, draft: '', title: chat.messages.length ? chat.title : question.slice(0, 55) });
    setInput(''); setBusy(true); setError(''); setStreamText(''); setProgress([]);
    abort.current = new AbortController();
    try {
      const context = [workspace.instructions || '', ...state.memories.filter(memory => memory.workspaceId === workspace.id).map(memory => memory.content)].join('\n\n');
      const concepts = workspaceConcepts(state, workspace.id);
      const progressSteps = [];
      const result = await api('/chat', {
        method: 'POST',
        signal: abort.current.signal,
        body: JSON.stringify({
          messages: [...(chat.inherited || []), ...(chat.selection ? [{ role: 'user', content: `다음 구절을 자세히 설명해 주세요: ${chat.selection}` }] : []), ...messages].map(({ role, content }) => ({ role, content })).slice(-100),
          documentIds: chat.documentIds || [],
          documentQuote: chat.documentQuote,
          context,
          searchOnly,
          documentOnly: Boolean(chat.documentOnly),
          learningProfile: learningProfile(concepts),
          model: model || undefined,
          stream: !searchOnly,
        }),
        onEvent(event) {
          if (event.type === 'progress' && event.message && !progressSteps.includes(event.message)) {
            progressSteps.push(event.message);
            setProgress([...progressSteps]);
          }
          if (event.type === 'delta') setStreamText(text => text + event.content);
        },
      });
      const answer = { id: uid(), role: 'assistant', content: searchOnly ? (result.sources.length ? '선택한 문서에서 찾은 구절이에요.' : '검색 준비가 된 문서를 대화에 첨부해 주세요.') : result.content, sources: result.sources, model: searchOnly ? 'Furiosa 문서 검색' : result.model, progress: progressSteps };
      update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, messages: [...item.messages, answer] } : item) }));
      if (!searchOnly) reviewConcepts(workspace.id, concepts, question, answer.content);
      if (result.truncated) notify('답변 길이 제한에 도달했어요. “이어서 설명해 줘”라고 요청하면 계속할 수 있어요.');
    } catch (failure) {
      update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, messages: item.messages.filter(message => message.id !== userMessage.id) } : item) }));
      setInput(question);
      setError(failure.name === 'AbortError' ? '답변 생성을 중지했어요. 질문을 다시 보낼 수 있어요.' : failure.message);
    } finally { setBusy(false); setStreamText(''); setProgress([]); abort.current = null; }
  }
  function saveMemory(content) {
    update(previous => ({ ...previous, memories: [...previous.memories, { id: uid(), workspaceId: workspace.id, content, date: dayKey(), chatId: chat.id }] }));
    notify('작업 공간의 기억에 저장했어요.');
  }
  return <section className={`chat-pane ${side ? 'side-pane' : ''}`} inert={covered || undefined} aria-label={side ? '이어진 대화' : '기본 대화'}>
    <div className="pane-heading"><MessageSquare size={18}/><span>{chat.title}</span><div className="pane-actions"><IconButton icon={Pin} label={chat.pinned ? '대화 고정 해제' : '대화 고정'} className={chat.pinned ? 'active' : ''} onClick={() => modifyChat({ pinned: !chat.pinned })}/><IconButton icon={GitBranch} label="이어진 대화 보기" onClick={() => setShowBranches(!showBranches)}/>{side && <IconButton icon={X} label="이어진 대화 닫기" onClick={() => update({ branchId: null })}/>}</div></div>
    {showBranches && <div className="branch-list"><strong>이어진 대화</strong>{chat.parentId && <button onClick={() => openChat(chat.parentId)}><CornerUpLeft size={14}/>원래 대화</button>}{related.map(item => <button key={item.id} onClick={() => update({ branchId: item.id })}><GitBranch size={14}/>{item.title}</button>)}{!related.length && <p>답변을 선택하면 새 대화로 이어갈 수 있어요.</p>}</div>}
    <div ref={messageList} className="messages" onScroll={event => {
      const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
      followAnswer.current = scrollHeight - scrollTop - clientHeight < 80;
    }}>
      {chat.example && <span className="example-label">예시 대화</span>}
      {chat.selection && <button className="branch-origin" title={chat.selection} onClick={() => openChat(chat.parentId)}><CornerUpLeft size={14}/>시작 구절 <span>“{chat.selection}”</span></button>}
      {!chat.messages.length && <div className="chat-empty"><div className="empty-emblem"><GitBranch size={35} strokeWidth={1.2}/></div><h1>{chat.parentId ? '새로운 생각으로 이어가 보세요.' : '무엇이 궁금한가요?'}</h1><p>{chat.parentId ? '원래 대화의 맥락을 유지하면서 이 구절을 더 깊이 살펴보세요.' : '질문하고, 생각을 이어가며, 나만의 지식으로 만들어 보세요.'}</p>{!chat.parentId && <div className="suggestions">{['새로운 개념을 쉽게 설명해 줘', '노트의 내용에서 연결점을 찾는 방법을 알려 줘', '첨부한 문서를 바탕으로 질문에 답해 줘'].map(text => <button key={text} onClick={() => setInput(text)}>{text}<ArrowUp size={14}/></button>)}</div>}</div>}
      {chat.messages.map(message => <article key={message.id} data-message-id={message.id} className={`message ${message.role}`}>
        {message.role === 'user' ? <>{message.documentQuote && <DocumentQuoteButton quote={message.documentQuote} onOpen={setReader}/>}<p>{message.content}</p></> : <><AnswerProgress steps={message.progress}/><div className="markdown"><AssistantMarkdown sources={message.sources} onSource={source => openSource(setReader, source, message)}>{message.content}</AssistantMarkdown></div><div className="message-actions"><button onClick={() => branch(chat, message, message.content)}><GitBranch size={14}/>대화 이어가기</button><button onClick={() => capture(message.content)}><NotebookPen size={14}/>노트에 저장</button><button onClick={() => saveMemory(message.content)}><Brain size={14}/>기억하기</button></div>{related.filter(item => item.sourceMessageId === message.id).map(item => <button className="branch-marker" key={item.id} title={item.selection} onClick={() => update({ branchId: item.id })}><GitBranch size={15}/><span>{item.title}</span></button>)}<AnswerSources message={message} onOpen={setReader}/></>}
      </article>)}
      {busy && <article className="message assistant"><AnswerProgress steps={searchOnly ? ['문서에서 찾고 있어요'] : progress} busy/>{streamText && <div className="markdown"><AssistantMarkdown>{streamText}</AssistantMarkdown></div>}</article>}
    </div>
    {selection && <div className="selection-toolbar" onMouseDown={event => event.preventDefault()}><span>“{selection.text.slice(0, 48)}”</span><button onClick={() => actOnSelection(item => branch(chat, item.message, item.text))}><GitBranch size={15}/>대화 이어가기</button><button onClick={() => actOnSelection(item => capture(item.text))}><NotebookPen size={15}/>노트</button><button onClick={() => actOnSelection(item => draftConcept(item.text))}><Brain size={15}/>개념 추가</button><IconButton icon={Brain} label="기억하기" onClick={() => actOnSelection(item => saveMemory(item.text))}/><IconButton icon={X} label="선택 도구 닫기" onClick={() => actOnSelection(() => {})}/></div>}
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => setModal('settings')}>연결 설정</button></div>}
    {chat.documentQuote && <div className="composer-quote-row">
      <DocumentQuoteButton quote={chat.documentQuote} onOpen={setReader}/>
      <IconButton icon={X} label="질문에서 인용 빼기" disabled={busy} onClick={() => modifyChat({ documentQuote: undefined })}/>
    </div>}
    <div className="composer-wrap">{showDocuments && <div className="attachment-picker"><strong>대화에 참고할 문서</strong>{documents.length ? documents.map(document => <label key={document.id}><input type="checkbox" disabled={busy || (!document.indexed && !chat.documentIds?.includes(document.id))} checked={(chat.documentIds || []).includes(document.id)} onChange={event => modifyChat({ documentIds: event.target.checked ? [...(chat.documentIds || []), document.id] : chat.documentIds.filter(id => id !== document.id) })}/><span>{document.name}</span><small>{document.indexed ? '준비 완료' : '검색 준비 필요'}</small></label>) : <p>아직 문서가 없어요.</p>}<button className="text-button" onClick={() => setView('Documents')}>문서 관리 <ChevronRight size={14}/></button><label className="search-only"><input type="checkbox" checked={searchOnly} onChange={event => setSearchOnly(event.target.checked)}/>문서 검색만 하기</label><label><input type="checkbox" disabled={searchOnly || busy || (!chat.documentOnly && !(chat.documentIds?.length || chat.documentQuote))} checked={Boolean(chat.documentOnly)} onChange={event => modifyChat({ documentOnly: event.target.checked })}/>문서 내용으로만 답하기</label></div>}
      <form className="composer" onSubmit={submit}><textarea aria-label={side ? '이어진 대화에서 질문하기' : '무엇이든 물어보세요'} placeholder="무엇이든 물어보세요" value={input} onChange={event => setInput(event.target.value)} disabled={busy} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(event); } }}/><div className="composer-bottom"><IconButton icon={Plus} label="문서 첨부" onClick={() => setShowDocuments(!showDocuments)} type="button"/><button className="document-count" type="button" onClick={() => setShowDocuments(!showDocuments)}><FileText size={15}/>{chat.documentIds?.length || 0}</button><ModelPicker models={models} value={model} disabled={busy} imageOnly={Boolean(imageModel)} searchOnly={searchOnly} onChange={id => modifyChat({ model: id })}/>{busy ? <IconButton icon={Square} label="답변 생성 중지" type="button" onClick={() => abort.current?.abort()}/> : <button className="send-button" type="submit" aria-label={side ? '이어진 대화에 보내기' : '메시지 보내기'} disabled={!input.trim()}><ArrowUp size={21}/></button>}</div></form>
    </div>
  </section>;
}

function WorkspacePage() {
  const { state, workspace, view, setView, createChat, openChat, addNote, setNoteId, setModal, update, conceptId, conceptDraft, setConceptId, setConceptDraft, notify, chatMenu } = useWorkspace();
  if (view === 'Notes') return <NotesPage/>;
  if (view === 'Journal') return <JournalPage/>;
  if (view === 'Documents') return <DocumentsPage/>;
  if (view === 'Tasks') return <TasksPage/>;
  if (view === 'Canvas') return <CanvasPage/>;
  if (view === 'Concepts') return <ConceptsPage key={workspace.id} state={state} workspace={workspace} update={update} selectedId={conceptId} onSelect={setConceptId} draft={conceptDraft?.workspaceId === workspace.id ? conceptDraft.name : null} onDraft={setConceptDraft} notify={notify}/>;
  if (view === 'Memory') return <MemoryPage/>;
  return <div className="page workspace-home"><div className="page-eyebrow"><Folder size={17}/>내 작업 공간</div><div className="page-title"><h1>{workspace.name}</h1><IconButton icon={Settings} label="작업 공간 설정" onClick={() => setModal('workspace-settings')}/></div><p className="page-subtitle">질문을 모으고, 생각을 연결하고, 나만의 지식을 쌓는 공간이에요.</p><div className="quick-actions"><button onClick={() => createChat()}><MessageSquare size={22}/><strong>대화 시작하기</strong><span>새로운 질문으로 시작해요</span></button><button onClick={() => { addNote(); setView('Notes'); }}><NotebookPen size={22}/><strong>노트 쓰기</strong><span>떠오른 생각을 기록해요</span></button><button onClick={() => setView('Documents')}><FileText size={22}/><strong>문서 읽기</strong><span>자료를 모아 함께 살펴봐요</span></button></div><h3 className="section-title">최근 대화</h3>{state.chats.filter(chat => chat.workspaceId === workspace.id).toReversed().map(chat => <button key={chat.id} className="list-row" onContextMenu={event => chatMenu(event, chat)} onClick={() => openChat(chat.id)}>{chat.parentId ? <GitBranch size={19}/> : <MessageSquare size={19}/>}<span>{chat.title}</span><small>{chat.date}</small><ChevronRight size={16}/></button>)}<h3 className="section-title">내 노트</h3><div className="note-grid">{state.notes.filter(note => note.workspaceId === workspace.id).map(note => <button key={note.id} className="note-card" onClick={() => { setNoteId(note.id); setView('Notes'); }}><NotebookPen size={19}/><h3>{note.title}</h3><p>{note.nodes[0]?.text}</p><small>{note.date}</small></button>)}</div></div>;
}

function NotesPage() {
  const { state, update, workspace, noteId, setNoteId, addNote, createChat, notify, showContextMenu } = useWorkspace();
  const [focusedNode, setFocusedNode] = useState(null);
  const notes = state.notes.filter(note => note.workspaceId === workspace.id);
  const note = notes.find(item => item.id === noteId) || notes[0];
  useEffect(() => setFocusedNode(null), [note?.id]);
  const modify = patch => update(previous => ({ ...previous, notes: previous.notes.map(item => item.id === note.id ? { ...item, ...patch } : item) }));
  function addBullet(index) {
    const node = { id: uid(), text: '', depth: note.nodes[index]?.depth || 0 };
    const nodes = [...note.nodes]; nodes.splice(index + 1, 0, node); modify({ nodes });
    setTimeout(() => document.getElementById(`node-${node.id}`)?.focus(), 0);
  }
  function removeNote(item) {
    if (!window.confirm(`“${item.title}” 노트를 삭제할까요? 캔버스에 배치한 카드와 그 연결도 삭제돼요.`)) return;
    update(previous => {
      const removed = new Set(previous.cards.filter(card => card.noteId === item.id).map(card => card.id));
      return {
        ...previous,
        notes: previous.notes.filter(entry => entry.id !== item.id),
        cards: previous.cards.filter(card => !removed.has(card.id)),
        edges: previous.edges.filter(edge => !removed.has(edge.from) && !removed.has(edge.to)),
      };
    });
    if (noteId === item.id) setNoteId(null);
  }
  let hiddenDepth = null;
  const focusedIndex = focusedNode ? note?.nodes.findIndex(node => node.id === focusedNode) : -1;
  let focusedEnd = note?.nodes.length;
  if (focusedIndex >= 0) { const next = note.nodes.findIndex((node, index) => index > focusedIndex && node.depth <= note.nodes[focusedIndex].depth); if (next >= 0) focusedEnd = next; }
  return <div className="notes-layout"><aside className="notes-list"><div className="list-heading"><h3>노트</h3><IconButton icon={Plus} label="새 노트" onClick={() => addNote()}/></div>{notes.map(item => <button key={item.id} className={item.id === note?.id ? 'active' : ''} onClick={() => setNoteId(item.id)} onContextMenu={event => showContextMenu(event, [
    { label: '노트 열기', icon: NotebookPen, action: () => setNoteId(item.id) },
    { label: '노트 내보내기', icon: Download, action: () => downloadJson(item, `${item.title}.json`) },
    { label: '노트 삭제', icon: Trash2, danger: true, action: () => removeNote(item) },
  ])}><NotebookPen size={16}/>{item.title}</button>)}</aside><div className="note-editor">{note ? <><div className="note-meta"><span>{note.date} · 이 기기에 저장됨</span><IconButton icon={Download} label="노트 내보내기" onClick={() => downloadJson(note, `${note.title}.json`)}/></div><input className="note-title" aria-label="노트 제목" value={note.title} onChange={event => modify({ title: event.target.value })}/>{focusedNode && <button className="text-button" onClick={() => setFocusedNode(null)}><ArrowLeft size={14}/>전체 노트로 돌아가기</button>}<div className="outline">{note.nodes.map((node, index) => {
    if (focusedIndex >= 0 && (index < focusedIndex || index >= focusedEnd)) return null;
    if (hiddenDepth !== null && node.depth > hiddenDepth) return null;
    hiddenDepth = node.collapsed ? node.depth : null;
    const hasChildren = note.nodes[index + 1]?.depth > node.depth;
    return <div className="outline-node" key={node.id} style={{ marginLeft: `${Math.max(0, node.depth - (focusedIndex >= 0 ? note.nodes[focusedIndex].depth : 0)) * 26}px` }}><button className="bullet" title={hasChildren ? '접기·펼치기' : '이 항목만 보기'} onClick={() => hasChildren ? modify({ nodes: note.nodes.map(item => item.id === node.id ? { ...item, collapsed: !item.collapsed } : item) }) : setFocusedNode(node.id)}>{hasChildren ? (node.collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>) : '•'}</button><textarea id={`node-${node.id}`} aria-label={`노트 항목 ${index + 1}`} value={node.text} rows={Math.max(1, Math.ceil(node.text.length / 75))} placeholder="생각을 적어 보세요…" onChange={event => modify({ nodes: note.nodes.map(item => item.id === node.id ? { ...item, text: event.target.value } : item) })} onKeyDown={event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); addBullet(index); }
      if (event.key === 'Tab') { event.preventDefault(); modify({ nodes: note.nodes.map(item => item.id === node.id ? { ...item, depth: Math.max(0, Math.min((note.nodes[index - 1]?.depth ?? -1) + 1, item.depth + (event.shiftKey ? -1 : 1))) } : item) }); }
      if (event.key === 'Backspace' && !node.text && note.nodes.length > 1) { event.preventDefault(); modify({ nodes: note.nodes.filter(item => item.id !== node.id) }); }
    }}/><div className="node-actions"><IconButton icon={MessageSquare} label="이 항목을 AI에게 질문하기" onClick={() => createChat(`다음 아이디어를 함께 살펴봐 주세요: ${node.text}`)}/><IconButton icon={Check} label="할 일로 추가" onClick={() => { update(previous => ({ ...previous, tasks: [...previous.tasks, { id: uid(), workspaceId: workspace.id, text: node.text, due: dayKey(), done: false }] })); notify('오늘의 할 일에 추가했어요.'); }}/></div></div>;
  })}</div><button className="text-button add-bullet" onClick={() => addBullet(note.nodes.length - 1)}><Plus size={16}/>항목 추가</button><div className="editor-help">Enter: 항목 추가 · Tab: 들여쓰기 · Shift + Tab: 내어쓰기</div><h4 className="section-title">노트에서 생각 이어가기</h4><button className="subtle-button" onClick={() => createChat(`다음 노트에 대해 함께 이야기해 주세요. 제목: "${note.title}"\n${note.nodes.map(node => node.text).join('\n')}`)}><MessageSquare size={16}/>이 노트로 대화 시작하기</button></> : <div className="empty-page"><NotebookPen size={32}/><h2>간직하고 싶은 생각을 적어 보세요.</h2><button className="primary-button" onClick={() => addNote()}>첫 노트 만들기</button></div>}</div></div>;
}

function JournalPage() {
  const { state, workspace, update, addNote, setNoteId, setView, openChat, setModal } = useWorkspace();
  const [dayCount, setDayCount] = useState(7);
  return <div className="page journal-page"><div className="page-title"><h1>일지</h1><button className="subtle-button" onClick={() => setModal('quick')}><Plus size={16}/>오늘 기록하기</button></div><p className="page-subtitle">하루의 기록과 그날 떠오른 생각을 모아 보세요.</p>{Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - index); const key = dayKey(date);
    const notes = state.notes.filter(note => note.date === key && note.workspaceId === workspace.id);
    const chats = state.chats.filter(chat => chat.date === key && chat.workspaceId === workspace.id);
    const tasks = state.tasks.filter(task => task.due === key && task.workspaceId === workspace.id);
    return <section className="journal-day" key={key}><span className="page-eyebrow">{index === 0 ? '오늘' : index === 1 ? '어제' : date.toLocaleDateString('ko-KR', { weekday: 'long' })}</span><h2>{date.toLocaleDateString('ko-KR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>{tasks.length > 0 && <div className="journal-tasks"><div className="task-progress"><span style={{ width: `${tasks.filter(task => task.done).length / tasks.length * 100}%` }}/></div><small>{tasks.length}개 중 {tasks.filter(task => task.done).length}개 완료</small>{tasks.map(task => <label className={`task-row ${task.done ? 'done' : ''}`} key={task.id}><input type="checkbox" checked={task.done} onChange={() => update(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, done: !item.done } : item) }))}/><span>{task.text}</span></label>)}</div>}{notes.map(note => <button className="journal-note" key={note.id} onClick={() => { setNoteId(note.id); setView('Notes'); }}><span>•</span><div><strong>{note.title}</strong><p>{note.nodes[0]?.text}</p></div></button>)}{!notes.length && !tasks.length && <button className="journal-placeholder" onClick={() => { const note = addNote('일지 노트'); update(previous => ({ ...previous, notes: previous.notes.map(item => item.id === note.id ? { ...item, date: key } : item) })); setView('Notes'); }}>• 어떤 생각이 떠오르나요?</button>}<div className="journal-links">{chats.map(chat => <button key={chat.id} onClick={() => openChat(chat.id)}><MessageSquare size={13}/>{chat.title}</button>)}</div></section>;
  })}<button className="subtle-button" onClick={() => setDayCount(dayCount + 7)}><Clock size={16}/>이전 기록 더 보기</button></div>;
}

function TasksPage() {
  const { state, update, workspace, showContextMenu } = useWorkspace();
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('All');
  const tasks = state.tasks.filter(task => task.workspaceId === workspace.id && (filter === 'All' || (filter === 'Done' ? task.done : !task.done)));
  function toggleTask(task) {
    update(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, done: !item.done } : item) }));
  }
  function removeTask(task) {
    if (!window.confirm(`“${task.text}” 할 일을 삭제할까요?`)) return;
    update(previous => ({ ...previous, tasks: previous.tasks.filter(item => item.id !== task.id) }));
  }
  return <div className="page"><div className="page-title"><h1>할 일</h1><span className="pill">{tasks.filter(task => !task.done).length}개 남음</span></div><p className="page-subtitle">작은 실천으로 생각을 한 걸음 더 나아가게 해 보세요.</p><form className="inline-form" onSubmit={event => { event.preventDefault(); if (!input.trim()) return; update(previous => ({ ...previous, tasks: [...previous.tasks, { id: uid(), workspaceId: workspace.id, text: input.trim(), due: dayKey(), done: false }] })); setInput(''); }}><Plus size={19}/><input aria-label="새 할 일" placeholder="할 일을 적어 주세요…" value={input} onChange={event => setInput(event.target.value)}/><button className="primary-button" disabled={!input.trim()}>할 일 추가</button></form><div className="tabs">{['All', 'To do', 'Done'].map(label => <button key={viewLabels[label]} className={filter === label ? 'active' : ''} onClick={() => setFilter(label)}>{viewLabels[label]}</button>)}</div>{tasks.map(task => <div className={`task-row task-item ${task.done ? 'done' : ''}`} key={task.id} onContextMenu={event => showContextMenu(event, [
    { label: task.done ? '완료 취소' : '완료 표시', icon: Check, action: () => toggleTask(task) },
    { label: '할 일 삭제', icon: Trash2, danger: true, action: () => removeTask(task) },
  ])}><input type="checkbox" aria-label={`완료 표시: ${task.text}`} checked={task.done} onChange={() => toggleTask(task)}/><span>{task.text}</span><input type="date" aria-label={`마감일: ${task.text}`} value={task.due} onChange={event => update(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, due: event.target.value } : item) }))}/><IconButton icon={Trash2} label={`삭제: ${task.text}`} onClick={() => removeTask(task)}/></div>)}{!tasks.length && <div className="empty-page"><Check size={30}/><h2>잠시 여유를 가져도 좋아요.</h2><p>이 목록에는 할 일이 없어요.</p></div>}</div>;
}

function DocumentsPage() {
  const { documents, refreshDocuments, notify, setReader, showContextMenu } = useWorkspace();
  const [busy, setBusy] = useState('');
  const input = useRef(null);
  async function upload(file) {
    if (!file || busy) return;
    setBusy('upload');
    try {
      const body = new FormData();
      body.append('file', file);
      await api('/documents', { method: 'POST', body });
      await refreshDocuments();
    }
    catch (error) { notify(error.message); } finally { setBusy(''); if (input.current) input.current.value = ''; }
  }
  async function indexDocument(document) {
    setBusy(document.id);
    try { await api(`/documents/${document.id}/index`, { method: 'POST' }); await refreshDocuments(); notify('문서 검색 준비가 끝났어요. 대화에 첨부하고 질문해 보세요.'); }
    catch (error) { await refreshDocuments(); notify(error.message); } finally { setBusy(''); }
  }
  async function removeDocument(document) {
    if (!window.confirm(`“${document.name}” 파일을 로컬 저장소에서 삭제할까요?`)) return;
    try { await api(`/documents/${document.id}`, { method: 'DELETE' }); await refreshDocuments(); } catch (error) { notify(error.message); }
  }
  return <div className="page documents-page">
    <div className="page-title"><h1>문서</h1><button className="primary-button" onClick={() => input.current?.click()} disabled={Boolean(busy)}><Upload size={16}/>문서 업로드</button></div>
    <input ref={input} type="file" accept=".pdf,.txt,.md" hidden onChange={event => upload(event.target.files[0])}/>
    <button className="upload-area" disabled={Boolean(busy)} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); upload(event.dataTransfer.files[0]); }}>
      {busy === 'upload' ? <LoaderCircle className="spin" size={30}/> : <Upload size={30} strokeWidth={1.3}/>}
      <strong>{busy === 'upload' ? '문서의 텍스트를 읽는 중이에요' : '파일을 끌어다 놓거나 눌러서 선택하세요'}</strong>
      <span>PDF, Markdown, 텍스트. 최대 50 MB</span>
    </button>
    <p className="document-notice">원본 파일은 이 컴퓨터에 저장돼요. 파일을 올리면 검색에 사용할 텍스트를 Furiosa에 자동으로 보내요. 질문할 때는 관련 구절이나 선택한 영역을 보내요.</p>
    <div className="document-list">{documents.map(document => {
      const preparing = document.indexing || busy === document.id;
      const failed = document.indexStatus === 'failed';
      const status = preparing ? document.indexStatus === 'queued' ? '검색 준비 대기' : '검색 준비 중' : failed ? '검색 준비 실패' : document.indexed ? '검색 가능' : '로컬 파일';
      const open = () => setReader({ id: document.id, page: 1 });
      return <div className="document-row" key={document.id} onContextMenu={event => showContextMenu(event, [
        { label: '문서 열기', icon: FileText, action: open },
        ...(!document.indexed || failed ? [{ label: failed ? '검색 준비 다시 시도' : '검색 준비', icon: Zap, action: () => indexDocument(document), disabled: Boolean(busy) || preparing }] : []),
        { label: '문서 삭제', icon: Trash2, danger: true, action: () => removeDocument(document), disabled: Boolean(busy) || preparing },
      ])}>
        <div className="file-icon"><FileText size={24}/></div>
        <button className="document-name" onClick={open}><strong>{document.name}</strong><small>{document.pages}쪽, {Math.ceil(document.size / 1024)} KB</small></button>
        <span className={`document-index-status ${failed ? 'error-text' : document.indexed ? 'success-text' : 'muted'}`} role="status">
          {preparing && <LoaderCircle size={13} className="spin"/>}{status}
        </span>
        {!preparing && (failed || !document.indexed) && <button className="subtle-button" disabled={Boolean(busy)} onClick={() => indexDocument(document)}>
          <Zap size={15}/>{failed ? '다시 시도' : '검색 준비'}
        </button>}
        <IconButton icon={Trash2} label={`${document.name} 삭제`} disabled={Boolean(busy) || document.indexing} onClick={() => removeDocument(document)}/>
      </div>;
    })}</div>
  </div>;
}

function highlightedReaderText(text, highlights) {
  if (!highlights.length) return text;
  const mapped = evidenceTextMap(text);
  const matches = highlights.flatMap(mark => {
    const match = evidenceRange(mapped.normalized, mark.text);
    return match ? [{ ...mark, start: mapped.starts[match[0]], end: mapped.ends[match[1] - 1] }] : [];
  }).sort((left, right) => left.start - right.start);
  let offset = 0;
  const content = [];
  for (const match of matches) {
    if (match.end <= offset) continue;
    const start = Math.max(offset, match.start);
    content.push(text.slice(offset, start), <mark key={match.id} data-highlight={match.id} style={{ '--highlight': match.color }}>{text.slice(start, match.end)}</mark>);
    offset = match.end;
  }
  return [...content, text.slice(offset)];
}

function DocumentReader({ reader, onClose }) {
  const { state, update, workspace, view, documents, config, capture, createChat, openChat, setReader, notify } = useWorkspace();
  const doc = documents.find(item => item.id === reader.id);
  const isPdf = doc?.extension === '.pdf';
  const [mode, setMode] = useState('original');
  const [chunks, setChunks] = useState([]);
  const [selectedText, setSelectedText] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [expandedNote, setExpandedNote] = useState(null);
  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef(null);
  const fileUrl = `/api/documents/${reader.id}/file`;
  const original = isPdf && mode === 'original';
  const page = reader.page || 1;
  const chats = state.chats.filter(chat => chat.workspaceId === workspace.id);
  const currentAnswer = reader.citation
    ? chats.flatMap(chat => chat.messages).find(answer => answer.id === reader.citation.messageId)
    : [state.branchId, state.activeChatId].flatMap(id => chats.find(chat => chat.id === id)?.messages.toReversed() || [])
      .find(answer => answer.role === 'assistant' && citedSources(answer).some(({ source }) => source.documentId === reader.id));
  const citations = currentAnswer ? citedSources(currentAnswer).filter(({ source }) => source.documentId === reader.id) : [];
  const citationMarks = citations.flatMap(({ source, number }) => source.page === page ? [{
    id: `citation-${number}`, text: citationPassage(currentAnswer, source, number), region: source.region, color: citationColor(number),
  }] : []);
  const target = reader.citation ? `citation-${reader.citation.number}` : 'selection';
  const highlights = reader.text || (reader.region && !reader.citation)
    ? [...citationMarks, { id: 'selection', text: reader.text, region: reader.region, color: citationColor(1) }]
    : citationMarks;
  const annotations = chats.flatMap(chat => chat.messages.flatMap((answer, index) => {
    const question = chat.messages[index - 1];
    if (!answer.pdfNotes || answer.role !== 'assistant' || question?.role !== 'user') return [];
    return citedSources(answer).flatMap(({ source, number }) => source.documentId === reader.id && answer.pdfNotes[number] ? [{
      id: `${answer.id}-${number}`, chatId: chat.id, question, answer, number,
      reference: { ...source, text: citationPassage(answer, source, number) }, memo: answer.pdfNotes[number].memo,
    }] : []);
  })).sort((left, right) => left.reference.page - right.reference.page);
  const noteGroups = Map.groupBy(annotations, ({ reference }) => {
    const position = reference.region
      ? ['x', 'y', 'width', 'height'].map(key => Math.round(reference.region[key] * 1000)).join(',')
      : reference.text.normalize('NFC').replace(/\s+/g, ' ').trim();
    return `${reference.page}:${position}`;
  });
  useEffect(() => {
    if (reader.region) setMode('original');
  }, [reader.jump, reader.region]);
  useEffect(() => {
    if (!doc || original) return;
    const controller = new AbortController();
    api(`/documents/${reader.id}/text`, { signal: controller.signal }).then(result => setChunks(result))
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [reader.id, doc?.id, original]);
  useEffect(() => {
    if (original) return;
    const root = scrollRef.current;
    const mark = root?.querySelector(`[data-highlight="${target}"]`);
    (mark || root?.querySelector('[data-active-page="true"]'))?.scrollIntoView({ block: 'start' });
  }, [chunks, reader.jump, page, target, original]);
  useEffect(() => {
    setSelectedText(null);
    setSelectedRegion(null);
    setDrawing(false);
    const onSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) { setSelectedText(null); return; }
      const root = scrollRef.current;
      if (!root?.contains(selection.anchorNode) || !root.contains(selection.focusNode)) { setSelectedText(null); return; }
      const range = selection.getRangeAt(0);
      const pageOf = node => Number((node.nodeType === 1 ? node : node.parentElement)?.closest('[data-page]')?.dataset.page) || page;
      const text = selection.toString().trim().normalize('NFC').slice(0, 6000);
      setSelectedText(text ? { text, page: pageOf(range.startContainer), endPage: pageOf(range.endContainer) } : null);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [page, original]);

  function startQuestion(quote = null) {
    if (!doc) return;
    createChat('', { ...doc, page }, quote && { documentId: doc.id, name: doc.name, ...quote });
    window.getSelection()?.removeAllRanges();
    setSelectedText(null);
    setSelectedRegion(null);
    requestAnimationFrame(() => document.querySelector('.chat-pane .composer textarea')?.focus());
  }

  function toggleNoteGroup(key, annotation) {
    setShowNotes(true);
    setExpandedNote(expandedNote === key ? null : key);
    if (expandedNote !== key) openSource(setReader, annotation.answer.sources[annotation.number - 1], annotation.answer);
  }

  function editMemo(annotation, memo) {
    update(previous => ({ ...previous, chats: previous.chats.map(chat => chat.id === annotation.chatId ? {
      ...chat, messages: chat.messages.map(message => message.id === annotation.answer.id && message.pdfNotes?.[annotation.number] ? {
        ...message, pdfNotes: { ...message.pdfNotes, [annotation.number]: { memo } },
      } : message),
    } : chat) }));
  }

  async function exportAnnotations() {
    setExporting(true);
    try {
      const response = await fetch(`/api/documents/${reader.id}/annotated-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: annotations.map(({ reference, question, answer, memo }) => ({ page: reference.page, region: reference.region, excerpt: reference.text, question: question.content, answer: memo.trim() || answer.content })) }),
      });
      if (!response.ok) throw new Error((await response.json()).error || '필기 PDF를 만들 수 없어요.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${doc.name.replace(/\.pdf$/i, '')}-필기.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      notify(failure.message);
    } finally {
      setExporting(false);
    }
  }

  return <aside className="document-reader" aria-label="문서 뷰어">
    <div className="pane-heading"><FileText size={18}/><span title={doc?.name}>{doc?.name || '참고 문서'}</span><IconButton icon={X} label="문서 닫기" onClick={onClose}/></div>
    <div className="reader-tools">
      {isPdf && <><button className={original ? 'active' : ''} onClick={() => setMode('original')}>원본 PDF</button><button className={!original ? 'active' : ''} onClick={() => setMode('text')}>텍스트</button></>}
      {original && config.models?.some(model => model.id === visionModel) && <button type="button" className={drawing ? 'active' : ''} aria-pressed={drawing} onClick={() => {
        window.getSelection()?.removeAllRanges();
        setSelectedRegion(null);
        setDrawing(!drawing);
      }}>{drawing ? '영역 선택 취소' : '표 또는 그림 선택'}</button>}
      {annotations.length > 0 && <button className={showNotes ? 'active' : ''} aria-expanded={showNotes} onClick={() => setShowNotes(!showNotes)}>필기 {annotations.length}</button>}
      {isPdf && annotations.length > 0 && <button type="button" disabled={exporting} onClick={exportAnnotations}>{exporting ? 'PDF 만드는 중…' : '필기 PDF 받기'}</button>}
      <span className="reader-tools-spacer"/>
      {view === 'Chat' && <button className="reader-back-to-chat" onClick={() => setReader({ ...reader, showChat: true })}>대화 보기</button>}
      {view !== 'Chat' && doc?.indexed && <button onClick={() => startQuestion()}>문서에 질문</button>}
      {doc && <><a className="reader-link" href={fileUrl} download={doc.name} aria-label="원본 내려받기" title="원본 내려받기"><Download size={15}/></a><a className="reader-link" href={isPdf ? `${fileUrl}#page=${page}` : fileUrl} target="_blank" rel="noreferrer" aria-label="원본 문서 열기" title="원본 문서 열기"><ExternalLink size={15}/></a></>}
    </div>
    {citations.length > 0 && <div className="reader-citations" aria-label="대화 출처">
      <strong>출처</strong>
      {citations.map(({ source, number }) => <button type="button" key={number} className="reader-citation" aria-current={reader.citation?.number === number && source.page === page ? 'location' : undefined}
        style={{ '--highlight': citationColor(number) }} title={source.region ? `${source.page}쪽 선택 영역` : citationPassage(currentAnswer, source, number) || `${source.page}쪽 원문`} onClick={() => openSource(setReader, source, currentAnswer)}>
        <span>[{number}]</span> {source.page}쪽
      </button>)}
    </div>}
    {showNotes && annotations.length > 0 && <div className="reader-notes">
      <ul>{[...noteGroups].map(([key, group]) => <li key={key}>
        <button type="button" className={key === expandedNote ? 'active' : ''} aria-expanded={key === expandedNote} onClick={() => toggleNoteGroup(key, group[0])}>
          <span>{group[0].reference.page}쪽</span><span>{group[0].question.content}</span>{group.length > 1 && <small>{group.length}개</small>}<ChevronDown size={14} className="reader-note-arrow"/>
        </button>
        {expandedNote === key && group.map(item => <article key={item.id} className="reader-note">
          {group.length > 1 && <strong>{item.question.content}</strong>}
          {item.reference.text && <blockquote>{item.reference.text}</blockquote>}
          <label>내 필기<textarea value={item.memo} onChange={event => editMemo(item, event.target.value)} maxLength={1500} rows={2} placeholder="이해한 내용을 짧게 적어 보세요."/></label>
          <button type="button" className="text-button" onClick={() => openChat(item.chatId, { id: reader.id, page: item.reference.page, jump: uid(), citation: { messageId: item.answer.id, number: item.number }, showChat: true, messageId: item.answer.id })}><MessageSquare size={14}/>대화에서 보기</button>
        </article>)}
      </li>)}</ul>
    </div>}
    {!doc ? <p className="reader-status">이 문서를 열 수 없어요.</p> : original
      ? <PdfViewer fileUrl={fileUrl} page={page} pageCount={doc.pages} setPage={number => setReader({ id: reader.id, page: number, citation: reader.citation })} highlights={highlights} target={target} jump={reader.jump} region={selectedRegion} drawing={drawing} anchors={[...noteGroups].filter(([, group]) => group[0].reference.page === page).map(([key, group]) => ({
        id: group[0].id, reference: group[0].reference, count: group.length, label: `필기 ${group.length}개, ${group[0].question.content}`, open: () => toggleNoteGroup(key, group[0]),
      }))} onRegion={region => {
        setSelectedRegion(region);
        setDrawing(false);
      }} scrollRef={scrollRef}/>
      : <div ref={scrollRef} className="reader-text">
        {error && <p role="alert">{error}</p>}
        {!chunks.length && !error && <p className="reader-status"><LoaderCircle className="spin" size={16}/>텍스트를 불러오는 중이에요.</p>}
        {chunks.map((chunk, index) => {
          return <section key={index} data-page={chunk.page} data-active-page={chunk.page === page}><span>{chunk.page}쪽</span><p>{chunk.page === page ? highlightedReaderText(chunk.text, highlights) : chunk.text}</p></section>;
        })}
      </div>}
    {drawing && <p className="reader-region-tip" role="status">질문할 표나 그림을 드래그해 선택하세요.</p>}
    {selectedRegion && <div className="reader-quote-toolbar">
      <span className="reader-quote-preview">{page}쪽 선택 영역</span>
      <button className="primary-button" onClick={() => startQuestion({ text: '선택한 영역', page, endPage: page, region: selectedRegion })}><MessageSquare size={15}/>이 영역 질문하기</button>
      <IconButton icon={X} label="선택 영역 닫기" onClick={() => setSelectedRegion(null)}/>
    </div>}
    {selectedText && !selectedRegion && <div className="reader-quote-toolbar" onMouseDown={event => event.preventDefault()}>
      <span className="reader-quote-preview">{selectedText.page}쪽 “{selectedText.text}”</span>
      <button className="primary-button" onClick={() => startQuestion(selectedText)}><MessageSquare size={15}/>이 부분 질문하기</button>
      <button className="subtle-button" onClick={() => capture(selectedText.text)}><NotebookPen size={15}/>노트에 저장</button>
      <IconButton icon={X} label="선택 구절 닫기" onClick={() => { window.getSelection()?.removeAllRanges(); setSelectedText(null); }}/>
    </div>}
  </aside>;
}

function CanvasPage() {
  const { state, update, workspace, setView, setNoteId, notify } = useWorkspace();
  return <CanvasWorkspace key={workspace.id} state={state} update={update} workspace={workspace} Dialog={Modal} IconButton={IconButton} notify={notify} onOpenNote={note => {
    setNoteId(note.id);
    setView('Notes');
  }}/>;
}

function MemoryPage() {
  const { state, update, workspace, openChat } = useWorkspace();
  const memories = state.memories.filter(memory => memory.workspaceId === workspace.id);
  return <div className="page"><div className="page-eyebrow"><Brain size={18}/>기억</div><h1>기억하고 싶은 내용을 모아 보세요.</h1><p className="page-subtitle">직접 선택해 저장한 구절을 다음 대화에 참고해요. 자동으로 기억에 추가하지 않아요.</p>{memories.length ? memories.map(memory => <article key={memory.id} className="memory-card"><textarea aria-label="저장한 기억" value={memory.content} rows={4} onChange={event => update(previous => ({ ...previous, memories: previous.memories.map(item => item.id === memory.id ? { ...item, content: event.target.value } : item) }))}/><footer><small>{memory.date}</small><button className="text-button" onClick={() => openChat(memory.chatId)}><MessageSquare size={14}/>원래 대화</button><IconButton icon={Trash2} label="기억 삭제" onClick={() => update(previous => ({ ...previous, memories: previous.memories.filter(item => item.id !== memory.id) }))}/></footer></article>) : <div className="empty-page"><Brain size={36} strokeWidth={1.3}/><h2>오래 간직할 생각을 위한 공간이에요.</h2><p>대화에서 기억하고 싶은 답변의 “기억하기”를 눌러 보세요.</p></div>}</div>;
}

function AppModal({ modal, onClose }) {
  const { state, update, workspace, config, createChat, addNote, setView, setNoteId, openChat, documents, setReader, notify } = useWorkspace();
  const [value, setValue] = useState(modal === 'workspace-settings' ? workspace.name : '');
  const [instructions, setInstructions] = useState(workspace.instructions || '');
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  if (modal === 'search') {
    const query = value.trim().toLowerCase();
    const results = [
      ...state.chats.filter(chat => chat.workspaceId === workspace.id).map(chat => ({ id: chat.id, title: chat.title, type: 'Chat', text: chat.messages.map(message => message.content).join(' '), action: () => openChat(chat.id) })),
      ...state.notes.filter(note => note.workspaceId === workspace.id).map(note => ({ id: note.id, title: note.title, type: 'Note', text: note.nodes.map(node => node.text).join(' '), action: () => { setNoteId(note.id); setView('Notes'); } })),
      ...documents.map(document => ({ id: document.id, title: document.name, type: 'Document', text: '', action: () => setReader({ id: document.id, page: 1 }) })),
    ].filter(item => !query || `${item.title} ${item.text}`.toLowerCase().includes(query));
    return <Modal title="생각 찾기" onClose={onClose}><div className="search-input"><Search size={19}/><input autoFocus aria-label="작업 공간 검색" placeholder="노트, 대화, 문서를 검색하세요…" value={value} onChange={event => setValue(event.target.value)}/><kbd>⌘K</kbd></div><div className="search-results">{results.slice(0, 30).map(result => <button key={result.id} onClick={() => { result.action(); onClose(); }}><span className="pill">{viewLabels[result.type]}</span><span>{result.title}</span><ChevronRight size={16}/></button>)}{!results.length && <p>검색 결과가 없어요.</p>}</div></Modal>;
  }
  if (modal === 'quick') return <Modal title="빠른 기록" onClose={onClose}><p className="muted">떠오른 생각을 오늘의 일지에 기록해 보세요.</p><textarea className="quick-input" autoFocus aria-label="빠른 노트" placeholder="어떤 생각이 떠오르나요?" value={value} onChange={event => setValue(event.target.value)} rows={6}/><div className="modal-footer"><kbd>⌘P</kbd><button className="primary-button" disabled={!value.trim()} onClick={() => { addNote(value.split('\n')[0].slice(0, 60), value); notify('오늘의 일지에 추가했어요.'); onClose(); }}>오늘 기록하기</button></div></Modal>;
  if (modal === 'workspace' || modal === 'workspace-settings') return <Modal title={modal === 'workspace' ? '새 작업 공간' : '작업 공간 설정'} onClose={onClose}><form onSubmit={event => { event.preventDefault(); if (!value.trim()) return; if (modal === 'workspace') { const item = { id: uid(), name: value.trim(), instructions }; update(previous => ({ ...previous, workspaces: [...previous.workspaces, item], workspaceId: item.id, branchId: null })); setView('Workspaces'); } else update(previous => ({ ...previous, workspaces: previous.workspaces.map(item => item.id === workspace.id ? { ...item, name: value.trim(), instructions } : item) })); onClose(); }}><label className="form-label">이름<input autoFocus required value={value} onChange={event => setValue(event.target.value)} placeholder="주제나 프로젝트 이름을 입력하세요…"/></label><label className="form-label">대화에 참고할 배경<textarea value={instructions} onChange={event => setInstructions(event.target.value)} rows={4} placeholder="AI가 이 작업 공간에 대해 알아야 할 내용을 적어 주세요."/></label><div className="modal-footer"><button className="primary-button" disabled={!value.trim()}>{modal === 'workspace' ? '작업 공간 만들기' : '변경 사항 저장'}</button></div></form></Modal>;
  return <Modal title="내 작업 공간 설정" onClose={onClose} wide>
    <div className="settings-section">
      <div className="page-eyebrow"><Monitor size={17}/>답변 생성 모델</div>
      <h3>{config.models?.find(item => item.id === config.model)?.label || config.model || 'Furiosa'}</h3>
      <p>{config.llmHost || 'endpoint.access.furiosa.dev'}의 Furiosa API로 답변을 생성해요. 질문, 대화 기록, 참고 문서의 구절이 이 서비스로 전송돼요.</p>
      <button className="subtle-button" disabled={checking} onClick={async () => {
        setChecking(true);
        try { setHealth(await api('/health')); }
        catch (error) { setHealth({ available: false, message: error.message }); }
        finally { setChecking(false); }
      }}>{checking ? <LoaderCircle size={15} className="spin"/> : <Zap size={15}/>}연결 확인</button>
      {health && <p className={health.available ? 'success-text' : 'error-text'} role="status">{health.message}</p>}
      {config.models?.length > 0 && <ul className="settings-models">{config.models.map(item => <li key={item.id}><strong>{item.label}</strong>{item.description && <span>{item.description}</span>}</li>)}</ul>}
      <details><summary>API 설정</summary><p>서버는 <code>.env</code>에서 <code>LLM_BASE_URL</code>, <code>LLM_MODEL</code>, <code>LLM_API_KEY</code>를 읽어요. 값을 변경하면 앱 서버를 다시 시작해 주세요. API 키는 서버에서만 사용해요.</p></details>
    </div>
    <div className="settings-section"><div className="page-eyebrow"><Search size={17}/>문서 검색</div><h3>Furiosa RNGD</h3><p>{config.embeddingModel}<br/>{config.rerankModel}</p><p>파일을 올리면 검색에 사용할 텍스트를 Furiosa에 자동으로 보내요.</p></div>
    <div className="settings-section"><h3>작업 공간 백업</h3><p>대화, 노트, 할 일, 캔버스 배치는 이 브라우저에 저장돼요. 업로드한 파일과 검색 데이터는 서버의 data 폴더에 저장돼요.</p><div className="settings-export-actions"><button className="subtle-button" onClick={() => openStudyReport(state, workspace, notify)}><FileText size={16}/>학습 PDF</button><button className="subtle-button" onClick={() => downloadJson(state, `learnboost-workspace-${dayKey()}.json`)}><Download size={16}/>작업 공간 내보내기 (JSON)</button></div></div>
  </Modal>;
}

createRoot(document.getElementById('root')).render(<App/>);
