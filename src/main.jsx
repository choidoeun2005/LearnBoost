import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { AssistantMarkdown } from './markdown.js';
import 'katex/dist/katex.min.css';
import { PanelLeft, Home, CalendarDays, Search, Zap, Brain, Folder, FileText, Library, Plus, ChevronDown, ChevronRight, ArrowUp, CornerUpLeft, X, Settings, Sun, Moon, Download, Upload, Trash2, Check, GitBranch, MessageSquare, NotebookPen, Network, LoaderCircle, Pin, Hash, Monitor, GripVertical, Clock, ArrowLeft, Square, ExternalLink } from 'lucide-react';
import { uid, dayKey, loadState, api, downloadJson } from './store';
import './styles.css';

const WorkspaceContext = createContext(null);
const useWorkspace = () => useContext(WorkspaceContext);
const viewLabels = { Workspaces: '작업 공간', Journal: '일지', Notes: '노트', Documents: '문서', Tasks: '할 일', Canvas: '캔버스', Memory: '기억', Chat: '대화', Note: '노트', Document: '문서', All: '전체', 'To do': '할 일', Done: '완료' };
const icons = { Workspaces: Folder, Journal: CalendarDays, Notes: NotebookPen, Documents: FileText, Tasks: Check, Canvas: Network, Memory: Brain };

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
  const [toast, setToast] = useState('');
  const [documents, setDocuments] = useState([]);
  const [config, setConfig] = useState({ model: 'furiosa-ai/EXAONE-4.0-32B-FP8' });
  const [reader, setReader] = useState(null);
  const [noteId, setNoteId] = useState('note-1');
  const [theme, setTheme] = useState(() => localStorage.getItem('sidequestly-theme') || 'light');
  const workspace = state.workspaces.find(item => item.id === state.workspaceId) || state.workspaces[0];
  const update = updater => setState(previous => typeof updater === 'function' ? updater(previous) : { ...previous, ...updater });
  const notify = message => setToast(message);
  const refreshDocuments = () => api('/documents').then(result => {
    setDocuments(result);
    const availableIds = new Set(result.map(document => document.id));
    update(previous => ({ ...previous, chats: previous.chats.map(chat => ({ ...chat, documentIds: (chat.documentIds || []).filter(id => availableIds.has(id)) })) }));
  }).catch(error => notify(error.message));
  useEffect(() => {
    try { localStorage.setItem('sidequestly-workspace', JSON.stringify(state)); }
    catch { notify('저장 공간이 부족해요. 설정에서 작업 공간을 내보내 백업해 주세요.'); }
  }, [state]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sidequestly-theme', theme);
  }, [theme]);
  useEffect(() => { refreshDocuments(); api('/config').then(setConfig).catch(error => notify(error.message)); }, []);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 7000); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    const keydown = event => {
      if ((event.metaKey || event.ctrlKey) && ['k', 'p'].includes(event.key.toLowerCase())) {
        event.preventDefault(); setModal(event.key.toLowerCase() === 'k' ? 'search' : 'quick');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

  function openChat(chatId) { update({ activeChatId: chatId, branchId: null }); setReader(null); setView('Chat'); }
  function createChat(prompt = '') {
    const chat = { id: uid(), workspaceId: workspace.id, title: prompt ? prompt.slice(0, 55) : '새 대화', date: dayKey(), messages: [], documentIds: [], draft: prompt };
    update(previous => ({ ...previous, chats: [...previous.chats, chat], activeChatId: chat.id, branchId: null }));
    setView('Chat'); setReader(null);
  }
  function branch(chat, message, selection) {
    const chatId = uid();
    const position = chat.messages.findIndex(item => item.id === message.id);
    const inherited = [...(chat.inherited || []), ...chat.messages.slice(0, position + 1)].map(({ role, content }) => ({ role, content }));
    const child = { id: chatId, workspaceId: workspace.id, title: selection.slice(0, 55), date: dayKey(), parentId: chat.id, sourceMessageId: message.id, selection, inherited, messages: [], documentIds: chat.documentIds || [] };
    update(previous => ({ ...previous, chats: [...previous.chats, child], activeChatId: chat.id, branchId: chatId }));
    setView('Chat'); setReader(null);
  }
  function addNote(title = '제목 없는 노트', content = '') {
    const note = { id: uid(), workspaceId: workspace.id, title, date: dayKey(), nodes: [{ id: uid(), text: content, depth: 0 }] };
    update(previous => ({ ...previous, notes: [...previous.notes, note] }));
    setNoteId(note.id); return note;
  }
  function capture(content) { addNote(content.slice(0, 50), content); notify('노트와 오늘의 일지에 저장했어요.'); }
  const context = { state, update, workspace, view, setView, notify, documents, refreshDocuments, config, openChat, createChat, branch, capture, addNote, noteId, setNoteId, setModal, setReader };
  const workspaceChats = state.chats.filter(chat => chat.workspaceId === workspace.id);
  const activeChat = state.chats.find(chat => chat.id === state.activeChatId && chat.workspaceId === workspace.id);
  const branchChat = state.chats.find(chat => chat.id === state.branchId && chat.workspaceId === workspace.id);

  return <WorkspaceContext.Provider value={context}><div className={`app-shell ${sidebar ? '' : 'sidebar-hidden'}`}>
    <header className="app-topbar"><div className="global-tools"><IconButton icon={PanelLeft} label="사이드바 열기·닫기" onClick={() => setSidebar(!sidebar)}/><a className="icon-button" href="/" title="홈" aria-label="홈"><Home size={20}/></a><IconButton icon={CalendarDays} label="일지" onClick={() => setView('Journal')}/><IconButton icon={Search} label="검색 · ⌘K" onClick={() => setModal('search')}/><IconButton icon={Zap} label="빠른 기록 · ⌘P" onClick={() => setModal('quick')}/><IconButton icon={Brain} label="기억" onClick={() => setView('Memory')}/></div><button className="breadcrumb workspace-crumb" onClick={() => setView('Workspaces')}><Folder size={18}/>{workspace.name}</button><ChevronRight size={15} className="muted"/><span className="breadcrumb current-crumb">{view === 'Chat' ? activeChat?.title || '새 대화' : viewLabels[view]}</span><span className="local-label"><span/>로컬 작업 공간</span></header>
    {sidebar && <aside className="sidebar"><div className="sidebar-main"><nav>{['Workspaces', 'Journal', 'Notes', 'Documents', 'Tasks', 'Canvas'].map(label => { const Icon = icons[label]; return <button key={viewLabels[label]} className={`nav-item ${view === label ? 'active' : ''}`} onClick={() => { setView(label); setReader(null); }}><Icon size={19} strokeWidth={1.7}/>{viewLabels[label]}{label === 'Tasks' && <span className="count">{state.tasks.filter(task => !task.done && task.workspaceId === workspace.id).length}</span>}</button>; })}</nav><div className="sidebar-section"><span>고정한 대화</span></div>{workspaceChats.filter(chat => chat.pinned).length ? workspaceChats.filter(chat => chat.pinned).map(chat => <button key={chat.id} className="recent-item" onClick={() => openChat(chat.id)}><Pin size={13}/>{chat.title}</button>) : <p className="sidebar-hint">아직 고정한 대화가 없어요</p>}<div className="sidebar-section"><span>최근 대화</span><IconButton icon={Plus} label="새 대화" onClick={() => createChat()}/></div>{workspaceChats.toReversed().slice(0, 8).map(chat => <button key={chat.id} className={`recent-item ${chat.id === state.activeChatId && view === 'Chat' ? 'selected' : ''}`} onClick={() => openChat(chat.id)}>{chat.parentId && <GitBranch size={13}/>}<span>{chat.title}</span></button>)}<div className="sidebar-section"><span>작업 공간</span><IconButton icon={Plus} label="새 작업 공간" onClick={() => setModal('workspace')}/></div>{state.workspaces.map(item => <button key={item.id} className={`nav-item ${item.id === workspace.id ? 'active' : ''}`} onClick={() => { update({ workspaceId: item.id, branchId: null }); setView('Workspaces'); }}><Folder size={19}/><span>{item.name}</span><ChevronRight size={16}/></button>)}</div><div className="sidebar-footer"><button className="profile" onClick={() => setModal('settings')}><span className="avatar">L</span><strong>내 작업 공간</strong></button><IconButton icon={theme === 'dark' ? Sun : Moon} label="테마 변경" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}/><IconButton icon={Settings} label="설정" onClick={() => setModal('settings')}/></div><div className="sidebar-caption">생각을 잇는 공간</div></aside>}
    <main className={`workspace-content ${view === 'Chat' ? 'chat-layout' : ''}`}>
      {view === 'Chat' ? <>{activeChat ? <ChatPane key={activeChat.id} chat={activeChat}/> : <div className="empty-page"><h1>궁금한 것부터 시작해 보세요.</h1><button className="primary-button" onClick={() => createChat()}>대화 시작하기</button></div>}{branchChat && !reader && <ChatPane key={branchChat.id} chat={branchChat} side/>}</> : <WorkspacePage/>}
      {reader && <DocumentReader key={`${reader.id}-${reader.page}`} reader={reader} onClose={() => setReader(null)}/>}
    </main>
    <aside className="right-rail">{[['Journal', CalendarDays], ['Tasks', Check], ['Notes', NotebookPen], ['Memory', Brain], ['Canvas', Network], ['Chat', MessageSquare]].map(([label, Icon]) => <IconButton key={viewLabels[label]} icon={Icon} label={viewLabels[label]} className={view === label ? 'active' : ''} onClick={() => setView(label)}/>)}</aside>
    {modal && <AppModal modal={modal} onClose={() => setModal(null)}/>}
    {toast && <div className="toast" role="status">{toast}<IconButton icon={X} label="알림 닫기" onClick={() => setToast('')}/></div>}
  </div></WorkspaceContext.Provider>;
}

function ChatPane({ chat, side = false }) {
  const { state, update, config, documents, workspace, setView, setReader, setModal, branch, capture, notify, openChat } = useWorkspace();
  const [input, setInput] = useState(chat.draft || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [searchOnly, setSearchOnly] = useState(false);
  const abort = useRef(null);
  const bottom = useRef(null);
  useEffect(() => { if (!chat.example) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [chat.messages.length, busy]);
  useEffect(() => () => abort.current?.abort(), []);
  const modifyChat = patch => update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, ...patch } : item) }));
  const related = state.chats.filter(item => item.parentId === chat.id);

  async function submit(event) {
    event.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const userMessage = { id: uid(), role: 'user', content: question };
    const messages = [...chat.messages, userMessage];
    modifyChat({ messages, draft: '', title: chat.messages.length ? chat.title : question.slice(0, 55) });
    setInput(''); setBusy(true); setError('');
    abort.current = new AbortController();
    try {
      const context = [workspace.instructions || '', ...state.memories.filter(memory => memory.workspaceId === workspace.id).map(memory => memory.content)].join('\n\n');
      const result = await api('/chat', { method: 'POST', signal: abort.current.signal, body: JSON.stringify({ messages: [...(chat.inherited || []), ...(chat.selection ? [{ role: 'user', content: `다음 구절을 자세히 설명해 주세요: ${chat.selection}` }] : []), ...messages].map(({ role, content }) => ({ role, content })), documentIds: chat.documentIds || [], context, searchOnly }) });
      const answer = { id: uid(), role: 'assistant', content: searchOnly ? (result.sources.length ? '선택한 문서에서 찾은 구절이에요. AI 답변을 생성하지 않고 검색 결과만 보여 드려요.' : '검색 준비가 된 문서를 선택해 주세요. 문서를 업로드하고 검색 준비를 마친 뒤 대화에 첨부할 수 있어요.') : result.content, sources: result.sources, model: searchOnly ? 'Furiosa 문서 검색' : result.model };
      update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, messages: [...item.messages, answer] } : item) }));
      if (result.truncated) notify('답변 길이 제한에 도달했어요. “이어서 설명해 줘”라고 요청하면 계속할 수 있어요.');
    } catch (failure) {
      update(previous => ({ ...previous, chats: previous.chats.map(item => item.id === chat.id ? { ...item, messages: item.messages.filter(message => message.id !== userMessage.id) } : item) }));
      setInput(question);
      setError(failure.name === 'AbortError' ? '답변 생성을 중지했어요. 질문을 다시 보낼 수 있어요.' : failure.message);
    } finally { setBusy(false); abort.current = null; }
  }
  function saveMemory(content) {
    update(previous => ({ ...previous, memories: [...previous.memories, { id: uid(), workspaceId: workspace.id, content, date: dayKey(), chatId: chat.id }] }));
    notify('작업 공간의 기억에 저장했어요.');
  }
  return <section className={`chat-pane ${side ? 'side-pane' : ''}`} aria-label={side ? '이어진 대화' : '기본 대화'}>
    <div className="pane-heading"><MessageSquare size={18}/><span>{chat.title}</span><div className="pane-actions"><IconButton icon={Pin} label={chat.pinned ? '대화 고정 해제' : '대화 고정'} className={chat.pinned ? 'active' : ''} onClick={() => modifyChat({ pinned: !chat.pinned })}/><IconButton icon={GitBranch} label="이어진 대화 보기" onClick={() => setShowBranches(!showBranches)}/>{side && <IconButton icon={X} label="이어진 대화 닫기" onClick={() => update({ branchId: null })}/>}</div></div>
    {showBranches && <div className="branch-list"><strong>이어진 대화</strong>{chat.parentId && <button onClick={() => openChat(chat.parentId)}><CornerUpLeft size={14}/>원래 대화</button>}{related.map(item => <button key={item.id} onClick={() => update({ branchId: item.id })}><GitBranch size={14}/>{item.title}</button>)}{!related.length && <p>답변을 선택하면 새 대화로 이어갈 수 있어요.</p>}</div>}
    <div className="messages">
      {chat.example && <span className="example-label">예시 대화 · 아래에서 직접 질문해 보세요</span>}
      {chat.selection && <button className="branch-origin" title={chat.selection} onClick={() => openChat(chat.parentId)}><CornerUpLeft size={14}/>대화 시작 구절: <span>“{chat.selection}”</span></button>}
      {!chat.messages.length && <div className="chat-empty"><div className="empty-emblem"><GitBranch size={35} strokeWidth={1.2}/></div><h1>{chat.parentId ? '새로운 생각으로 이어가 보세요.' : '무엇이 궁금한가요?'}</h1><p>{chat.parentId ? '원래 대화의 맥락을 유지하면서 이 구절을 더 깊이 살펴보세요.' : '질문하고, 생각을 이어가며, 나만의 지식으로 만들어 보세요.'}</p>{!chat.parentId && <div className="suggestions">{['새로운 개념을 쉽게 설명해 줘', '노트의 내용에서 연결점을 찾는 방법을 알려 줘', '첨부한 문서를 바탕으로 질문에 답해 줘'].map(text => <button key={text} onClick={() => setInput(text)}>{text}<ArrowUp size={14}/></button>)}</div>}</div>}
      {chat.messages.map(message => <article key={message.id} className={`message ${message.role}`} onMouseUp={() => {
        const selected = window.getSelection()?.toString().trim();
        if (message.role === 'assistant' && selected) setSelection({ message, text: selected });
      }}>
        {message.role === 'user' ? <p>{message.content}</p> : <><div className="markdown"><AssistantMarkdown>{message.content}</AssistantMarkdown></div><div className="message-actions"><button onClick={() => branch(chat, message, message.content)}><GitBranch size={14}/>대화 이어가기</button><button onClick={() => capture(message.content)}><NotebookPen size={14}/>노트에 저장</button><button onClick={() => saveMemory(message.content)}><Brain size={14}/>기억하기</button></div>{related.filter(item => item.sourceMessageId === message.id).map(item => <button className="branch-marker" key={item.id} title={item.selection} onClick={() => update({ branchId: item.id })}><GitBranch size={15}/><span>{item.title}</span></button>)}{message.sources?.length > 0 && <div className="sources"><span>출처</span>{message.sources.map((source, index) => <button key={`${source.documentId}-${index}`} onClick={() => setReader({ id: source.documentId, page: source.page })}><FileText size={14}/>[{index + 1}] {source.name} · {source.page}쪽</button>)}</div>}</>}
      </article>)}
      {busy && <div className="thinking"><LoaderCircle size={16} className="spin"/>{searchOnly ? '문서에서 찾고 있어요…' : '답변을 생성하고 있어요…'}</div>}<div ref={bottom}/>
    </div>
    {selection && <div className="selection-toolbar"><span>“{selection.text.slice(0, 48)}”</span><button onClick={() => { branch(chat, selection.message, selection.text); setSelection(null); window.getSelection()?.removeAllRanges(); }}><GitBranch size={15}/>대화 이어가기</button><button onClick={() => { capture(selection.text); setSelection(null); }}><NotebookPen size={15}/>노트</button><button onClick={() => { saveMemory(selection.text); setSelection(null); }}><Brain size={15}/></button><IconButton icon={X} label="선택 도구 닫기" onClick={() => setSelection(null)}/></div>}
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => setModal('settings')}>연결 설정</button></div>}
    <div className="composer-wrap">{showDocuments && <div className="attachment-picker"><strong>대화에 참고할 문서</strong>{documents.length ? documents.map(document => <label key={document.id}><input type="checkbox" disabled={!document.indexed || busy} checked={(chat.documentIds || []).includes(document.id)} onChange={event => modifyChat({ documentIds: event.target.checked ? [...(chat.documentIds || []), document.id] : chat.documentIds.filter(id => id !== document.id) })}/><span>{document.name}</span><small>{document.indexed ? '준비 완료' : '검색 준비 필요'}</small></label>) : <p>아직 문서가 없어요.</p>}<button className="text-button" onClick={() => setView('Documents')}>문서 관리 <ChevronRight size={14}/></button><label className="search-only"><input type="checkbox" checked={searchOnly} onChange={event => setSearchOnly(event.target.checked)}/>문서 검색만 하기 (답변 생성 없이)</label></div>}
      <form className="composer" onSubmit={submit}><textarea aria-label={side ? '이어진 대화에서 질문하기' : '무엇이든 물어보세요'} placeholder="무엇이든 물어보세요" value={input} onChange={event => setInput(event.target.value)} disabled={busy} rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(event); } }}/><div className="composer-bottom"><IconButton icon={Plus} label="문서 첨부" onClick={() => setShowDocuments(!showDocuments)} type="button"/><button className="document-count" type="button" onClick={() => setShowDocuments(!showDocuments)}><FileText size={15}/>{chat.documentIds?.length || 0}</button><button className="model-button" type="button" onClick={() => setModal('settings')}><span className="model-ring"/>{searchOnly ? '문서 검색' : config.model}<ChevronDown size={12}/></button>{busy ? <IconButton icon={Square} label="답변 생성 중지" type="button" onClick={() => abort.current?.abort()}/> : <button className="send-button" type="submit" aria-label={side ? '이어진 대화에 보내기' : '메시지 보내기'} disabled={!input.trim()}><ArrowUp size={21}/></button>}</div></form>
    </div>
  </section>;
}

function WorkspacePage() {
  const { state, workspace, view, setView, createChat, openChat, addNote, setNoteId, setModal } = useWorkspace();
  if (view === 'Notes') return <NotesPage/>;
  if (view === 'Journal') return <JournalPage/>;
  if (view === 'Documents') return <DocumentsPage/>;
  if (view === 'Tasks') return <TasksPage/>;
  if (view === 'Canvas') return <CanvasPage/>;
  if (view === 'Memory') return <MemoryPage/>;
  return <div className="page workspace-home"><div className="page-eyebrow"><Folder size={17}/>내 작업 공간</div><div className="page-title"><h1>{workspace.name}</h1><IconButton icon={Settings} label="작업 공간 설정" onClick={() => setModal('workspace-settings')}/></div><p className="page-subtitle">질문을 모으고, 생각을 연결하고, 나만의 지식을 쌓는 공간이에요.</p><div className="quick-actions"><button onClick={() => createChat()}><MessageSquare size={22}/><strong>대화 시작하기</strong><span>새로운 질문으로 시작해요</span></button><button onClick={() => { addNote(); setView('Notes'); }}><NotebookPen size={22}/><strong>노트 쓰기</strong><span>떠오른 생각을 기록해요</span></button><button onClick={() => setView('Documents')}><FileText size={22}/><strong>문서 읽기</strong><span>자료를 모아 함께 살펴봐요</span></button></div><h3 className="section-title">최근 대화</h3>{state.chats.filter(chat => chat.workspaceId === workspace.id).toReversed().map(chat => <button key={chat.id} className="list-row" onClick={() => openChat(chat.id)}>{chat.parentId ? <GitBranch size={19}/> : <MessageSquare size={19}/>}<span>{chat.title}</span><small>{chat.date}</small><ChevronRight size={16}/></button>)}<h3 className="section-title">내 노트</h3><div className="note-grid">{state.notes.filter(note => note.workspaceId === workspace.id).map(note => <button key={note.id} className="note-card" onClick={() => { setNoteId(note.id); setView('Notes'); }}><NotebookPen size={19}/><h3>{note.title}</h3><p>{note.nodes[0]?.text}</p><small>{note.date}</small></button>)}</div></div>;
}

function NotesPage() {
  const { state, update, workspace, noteId, setNoteId, addNote, createChat, notify } = useWorkspace();
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
  let hiddenDepth = null;
  const focusedIndex = focusedNode ? note?.nodes.findIndex(node => node.id === focusedNode) : -1;
  let focusedEnd = note?.nodes.length;
  if (focusedIndex >= 0) { const next = note.nodes.findIndex((node, index) => index > focusedIndex && node.depth <= note.nodes[focusedIndex].depth); if (next >= 0) focusedEnd = next; }
  return <div className="notes-layout"><aside className="notes-list"><div className="list-heading"><h3>노트</h3><IconButton icon={Plus} label="새 노트" onClick={() => addNote()}/></div>{notes.map(item => <button key={item.id} className={item.id === note?.id ? 'active' : ''} onClick={() => setNoteId(item.id)}><NotebookPen size={16}/>{item.title}</button>)}</aside><div className="note-editor">{note ? <><div className="note-meta"><span>{note.date} · 이 기기에 저장됨</span><IconButton icon={Download} label="노트 내보내기" onClick={() => downloadJson(note, `${note.title}.json`)}/></div><input className="note-title" aria-label="노트 제목" value={note.title} onChange={event => modify({ title: event.target.value })}/>{focusedNode && <button className="text-button" onClick={() => setFocusedNode(null)}><ArrowLeft size={14}/>전체 노트로 돌아가기</button>}<div className="outline">{note.nodes.map((node, index) => {
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
  const { state, update, workspace } = useWorkspace();
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('All');
  const tasks = state.tasks.filter(task => task.workspaceId === workspace.id && (filter === 'All' || (filter === 'Done' ? task.done : !task.done)));
  return <div className="page"><div className="page-title"><h1>할 일</h1><span className="pill">{tasks.filter(task => !task.done).length}개 남음</span></div><p className="page-subtitle">작은 실천으로 생각을 한 걸음 더 나아가게 해 보세요.</p><form className="inline-form" onSubmit={event => { event.preventDefault(); if (!input.trim()) return; update(previous => ({ ...previous, tasks: [...previous.tasks, { id: uid(), workspaceId: workspace.id, text: input.trim(), due: dayKey(), done: false }] })); setInput(''); }}><Plus size={19}/><input aria-label="새 할 일" placeholder="할 일을 적어 주세요…" value={input} onChange={event => setInput(event.target.value)}/><button className="primary-button" disabled={!input.trim()}>할 일 추가</button></form><div className="tabs">{['All', 'To do', 'Done'].map(label => <button key={viewLabels[label]} className={filter === label ? 'active' : ''} onClick={() => setFilter(label)}>{viewLabels[label]}</button>)}</div>{tasks.map(task => <div className={`task-row task-item ${task.done ? 'done' : ''}`} key={task.id}><input type="checkbox" aria-label={`완료 표시: ${task.text}`} checked={task.done} onChange={() => update(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, done: !item.done } : item) }))}/><span>{task.text}</span><input type="date" aria-label={`마감일: ${task.text}`} value={task.due} onChange={event => update(previous => ({ ...previous, tasks: previous.tasks.map(item => item.id === task.id ? { ...item, due: event.target.value } : item) }))}/><IconButton icon={Trash2} label={`삭제: ${task.text}`} onClick={() => update(previous => ({ ...previous, tasks: previous.tasks.filter(item => item.id !== task.id) }))}/></div>)}{!tasks.length && <div className="empty-page"><Check size={30}/><h2>잠시 여유를 가져도 좋아요.</h2><p>이 목록에는 할 일이 없어요.</p></div>}</div>;
}

function DocumentsPage() {
  const { documents, refreshDocuments, notify, setReader } = useWorkspace();
  const [busy, setBusy] = useState('');
  const input = useRef(null);
  async function upload(file) {
    if (!file || busy) return;
    setBusy('upload');
    try { const body = new FormData(); body.append('file', file); await api('/documents', { method: 'POST', body }); await refreshDocuments(); notify('문서를 이 컴퓨터에 저장했어요. 검색 준비를 마치면 Furiosa로 검색할 수 있어요.'); }
    catch (error) { notify(error.message); } finally { setBusy(''); if (input.current) input.current.value = ''; }
  }
  async function indexDocument(document) {
    setBusy(document.id);
    try { await api(`/documents/${document.id}/index`, { method: 'POST' }); await refreshDocuments(); notify('문서 검색 준비가 끝났어요. 대화에 첨부하고 질문해 보세요.'); }
    catch (error) { notify(error.message); } finally { setBusy(''); }
  }
  return <div className="page documents-page"><div className="page-title"><h1>문서</h1><button className="primary-button" onClick={() => input.current?.click()} disabled={Boolean(busy)}><Upload size={16}/>문서 업로드</button></div><p className="page-subtitle">자료를 읽고 연결하며 더 깊이 있는 질문을 해 보세요.</p><input ref={input} type="file" accept=".pdf,.txt,.md" hidden onChange={event => upload(event.target.files[0])}/><button className="upload-area" disabled={Boolean(busy)} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); upload(event.dataTransfer.files[0]); }}>{busy === 'upload' ? <LoaderCircle className="spin" size={30}/> : <Upload size={30} strokeWidth={1.3}/>}<strong>파일을 끌어다 놓거나 눌러서 선택하세요</strong><span>PDF, Markdown, 텍스트 · 최대 20 MB</span></button><p className="document-notice">파일은 이 컴퓨터에 저장돼요. “Furiosa로 검색 준비”를 누르면 추출한 텍스트가 강의용 Furiosa 서버로 전송돼요. 대화할 때는 검색된 구절을 답변 생성 API에 보내요.</p><div className="document-list">{documents.map(document => <div className="document-row" key={document.id}><div className="file-icon"><FileText size={24}/></div><button className="document-name" onClick={() => setReader({ id: document.id, page: 1 })}><strong>{document.name}</strong><small>{document.pages}쪽 · {Math.ceil(document.size / 1024)} KB · {document.chunkCount}개 문단</small></button><span className={`status-pill ${document.indexed ? 'ready' : ''}`}>{document.indexed ? '대화에 사용 가능' : '로컬 파일'}</span><button className="subtle-button" disabled={Boolean(busy) || document.indexing} onClick={() => indexDocument(document)}>{busy === document.id ? <LoaderCircle size={15} className="spin"/> : <Zap size={15}/>} {document.indexed ? '검색 준비 다시 하기' : 'Furiosa로 검색 준비'}</button><IconButton icon={Trash2} label={`삭제: ${document.name}`} disabled={Boolean(busy)} onClick={async () => { if (!window.confirm(`“${document.name}” 파일을 로컬 저장소에서 삭제할까요?`)) return; try { await api(`/documents/${document.id}`, { method: 'DELETE' }); await refreshDocuments(); } catch (error) { notify(error.message); } }}/></div>)}</div></div>;
}

function DocumentReader({ reader, onClose }) {
  const { documents, capture, createChat } = useWorkspace();
  const document = documents.find(item => item.id === reader.id);
  const [mode, setMode] = useState('text');
  const [chunks, setChunks] = useState([]);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState('');
  const root = useRef(null);
  useEffect(() => { let cancelled = false; api(`/documents/${reader.id}/text`).then(result => { if (!cancelled) setChunks(result); }).catch(failure => { if (!cancelled) setError(failure.message); }); return () => { cancelled = true; }; }, [reader.id]);
  useEffect(() => { root.current?.querySelector(`[data-page="${reader.page}"]`)?.scrollIntoView({ block: 'start' }); }, [chunks, reader.page]);
  return <aside className="document-reader"><div className="pane-heading"><FileText size={18}/><span>{document?.name || '참고 문서'}</span><IconButton icon={X} label="문서 닫기" onClick={onClose}/></div><div className="reader-tools"><button className={mode === 'text' ? 'active' : ''} onClick={() => setMode('text')}>텍스트 보기</button>{document?.extension === '.pdf' && <button className={mode === 'pdf' ? 'active' : ''} onClick={() => setMode('pdf')}>원본 PDF</button>}<a href={`/api/documents/${reader.id}/file`} target="_blank" rel="noreferrer" aria-label="원본 문서 열기"><ExternalLink size={16}/></a></div>{mode === 'pdf' ? <iframe title={document?.name || 'PDF'} src={`/api/documents/${reader.id}/file#page=${reader.page}`}/> : <div ref={root} className="reader-text" onMouseUp={() => setSelection(window.getSelection()?.toString().trim() || '')}>{error && <p role="alert">{error}</p>}{chunks.map((chunk, index) => <section key={index} data-page={chunk.page}><span>{chunk.page}쪽</span><p>{chunk.text}</p></section>)}</div>}{selection && <div className="reader-selection"><button onClick={() => capture(selection)}><NotebookPen size={15}/>노트에 저장</button><button onClick={() => createChat(`${document?.name}의 다음 구절을 이해하기 쉽게 설명해 주세요:\n${selection}`)}><MessageSquare size={15}/>선택한 구절 질문하기</button></div>}</aside>;
}

function CanvasPage() {
  const { state, update, workspace, setView, setNoteId, notify } = useWorkspace();
  const [linkFrom, setLinkFrom] = useState(null);
  const [selectedNote, setSelectedNote] = useState('');
  const drag = useRef(null);
  const board = useRef(null);
  const cards = state.cards.filter(card => card.workspaceId === workspace.id);
  const notes = state.notes.filter(note => note.workspaceId === workspace.id);
  function startDrag(event, card) {
    if (event.target.closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: card.id, clientX: event.clientX, clientY: event.clientY, x: card.x, y: card.y };
  }
  return <div className="canvas-page"><div className="canvas-toolbar"><div><h2>캔버스</h2><span>노트를 연결하며 생각을 정리해 보세요.</span></div><select aria-label="캔버스에 추가할 노트" value={selectedNote} onChange={event => setSelectedNote(event.target.value)}><option value="">노트를 선택하세요…</option>{notes.map(note => <option key={note.id} value={note.id}>{note.title}</option>)}</select><button className="subtle-button" disabled={!selectedNote} onClick={() => { update(previous => ({ ...previous, cards: [...previous.cards, { id: uid(), workspaceId: workspace.id, noteId: selectedNote, x: 100 + cards.length % 4 * 50, y: 100 + cards.length % 4 * 60 }] })); setSelectedNote(''); }}><Plus size={16}/>카드 추가</button></div>{linkFrom && <div className="canvas-hint">다른 카드의 “연결”을 눌러 주세요.<button onClick={() => setLinkFrom(null)}>취소</button></div>}<div className="canvas-scroll" ref={board}><div className="canvas-board"><svg className="canvas-edges" width="1800" height="1200"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--green)"/></marker></defs>{state.edges.filter(edge => edge.workspaceId === workspace.id).map(edge => { const from = cards.find(card => card.id === edge.from); const to = cards.find(card => card.id === edge.to); if (!from || !to) return null; const startX = from.x + 260; const startY = from.y + 90; const endX = to.x; const endY = to.y + 90; return <g key={edge.id}><path d={`M${startX},${startY} C${startX + 100},${startY} ${endX - 100},${endY} ${endX},${endY}`} markerEnd="url(#arrow)"/><text x={(startX + endX) / 2} y={(startY + endY) / 2 - 10} onClick={() => { const label = window.prompt('연결 이름', edge.label); if (label !== null) update(previous => ({ ...previous, edges: previous.edges.map(item => item.id === edge.id ? { ...item, label } : item) })); }}>{edge.label}</text></g>; })}</svg>{cards.map(card => { const note = state.notes.find(item => item.id === card.noteId); return <article key={card.id} className={`canvas-card ${linkFrom === card.id ? 'linking' : ''}`} style={{ left: card.x, top: card.y }} onPointerDown={event => startDrag(event, card)} onPointerMove={event => { if (drag.current?.id !== card.id) return; const current = drag.current; update(previous => ({ ...previous, cards: previous.cards.map(item => item.id === card.id ? { ...item, x: Math.max(0, Math.min(1500, current.x + event.clientX - current.clientX)), y: Math.max(0, Math.min(980, current.y + event.clientY - current.clientY)) } : item) })); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}><div className="canvas-card-heading"><NotebookPen size={15}/><span>노트</span><GripVertical size={15}/></div><h3>{note?.title || '삭제된 노트'}</h3><p>{note?.nodes.map(node => node.text).join(' ').slice(0, 180)}</p><div className="canvas-card-actions"><button onClick={() => { setNoteId(note?.id); setView('Notes'); }}>노트 열기</button><button onClick={() => { if (!linkFrom) { setLinkFrom(card.id); return; } if (linkFrom === card.id) return; if (state.edges.some(edge => edge.from === linkFrom && edge.to === card.id)) { notify('이미 연결된 카드예요.'); setLinkFrom(null); return; } update(previous => ({ ...previous, edges: [...previous.edges, { id: uid(), workspaceId: workspace.id, from: linkFrom, to: card.id, label: '연결됨' }] })); setLinkFrom(null); }}><GitBranch size={13}/>연결</button><IconButton icon={X} label="캔버스에서 카드 제거" onClick={() => update(previous => ({ ...previous, cards: previous.cards.filter(item => item.id !== card.id), edges: previous.edges.filter(edge => edge.from !== card.id && edge.to !== card.id) }))}/></div></article>; })}</div></div><div className="canvas-footer"><Network size={15}/>카드 {cards.length}개 · 끌어서 배치 · 연결 이름을 누르면 수정할 수 있어요</div></div>;
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
      <h3>{config.model}</h3>
      <p>{config.llmHost || 'endpoint.access.furiosa.dev'}의 Furiosa API로 답변을 생성해요. 질문, 대화 기록, 참고 문서의 구절이 이 서비스로 전송돼요.</p>
      <button className="subtle-button" disabled={checking} onClick={async () => {
        setChecking(true);
        try { setHealth(await api('/health')); }
        catch (error) { setHealth({ available: false, message: error.message }); }
        finally { setChecking(false); }
      }}>{checking ? <LoaderCircle size={15} className="spin"/> : <Zap size={15}/>}연결 확인</button>
      {health && <p className={health.available ? 'success-text' : 'error-text'} role="status">{health.message}</p>}
      <details><summary>API 설정</summary><p>서버는 <code>.env</code>에서 <code>LLM_BASE_URL</code>, <code>LLM_MODEL</code>, <code>LLM_API_KEY</code>를 읽어요. 값을 변경하면 앱 서버를 다시 시작해 주세요. API 키는 서버에서만 사용해요.</p></details>
    </div>
    <div className="settings-section"><div className="page-eyebrow"><Search size={17}/>문서 검색</div><h3>Furiosa RNGD</h3><p>{config.embeddingModel} · {config.rerankModel}</p><p className="muted">강의용 검색 서버 이용 기간: {config.furiosaAvailability}. 문서 검색으로 참고 자료를 찾고, EXAONE이 답변을 생성해요.</p></div>
    <div className="settings-section"><h3>작업 공간 백업</h3><p>대화, 노트, 할 일, 캔버스 배치는 이 브라우저에 저장돼요. 업로드한 파일과 검색 데이터는 서버의 data 폴더에 저장돼요.</p><button className="subtle-button" onClick={() => downloadJson(state, `sidequestly-workspace-${dayKey()}.json`)}><Download size={16}/>작업 공간 내보내기 (JSON)</button></div>
    <div className="settings-note">로컬에서 사용하는 작업 공간이에요. SideQuestly 계정이나 구독 없이 이용할 수 있어요.</div>
  </Modal>;
}

createRoot(document.getElementById('root')).render(<App/>);
