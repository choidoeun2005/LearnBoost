import React, { useEffect, useState } from 'react';
import { BookOpen, Lock, LockOpen, Plus, Search, Trash2 } from 'lucide-react';
import { conceptNameKey, understandingLevels, workspaceConcepts } from './concepts.js';
import { uid } from './store.js';

export function ConceptsPage({ state, workspace, update, selectedId, onSelect, draft, onDraft, notify }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [creating, setCreating] = useState(draft !== null);
  const [name, setName] = useState(draft || '');
  const concepts = workspaceConcepts(state, workspace.id);
  const categories = [...new Set(concepts.map(concept => concept.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const activeCategory = categories.includes(category) ? category : '';
  const normalizedQuery = conceptNameKey(query);
  const visible = concepts.filter(concept => (!activeCategory || concept.category === activeCategory) && conceptNameKey(`${concept.name} ${concept.category} ${concept.notes}`).includes(normalizedQuery))
    .sort((a, b) => a.category.localeCompare(b.category, 'ko') || a.name.localeCompare(b.name, 'ko'));
  const selected = concepts.find(concept => concept.id === selectedId) || visible[0];

  useEffect(() => {
    if (draft !== null) { setName(draft); setCreating(true); }
  }, [draft]);

  function edit(patch) {
    const revision = uid();
    update(previous => ({ ...previous, concepts: (previous.concepts || []).map(concept => concept.id === selected.id ? { ...concept, ...patch, revision, updatedBy: 'user' } : concept) }));
  }

  function create(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    const existing = concepts.find(concept => conceptNameKey(concept.name) === conceptNameKey(cleanName));
    const id = existing?.id || uid();
    if (!existing) {
      const entry = { id, workspaceId: workspace.id, name: cleanName, category: '', level: 3, notes: '', locked: false, revision: id, updatedBy: 'user' };
      update(previous => workspaceConcepts(previous, workspace.id).some(concept => conceptNameKey(concept.name) === conceptNameKey(cleanName)) ? previous : { ...previous, concepts: [...(previous.concepts || []), entry] });
    } else notify('이미 정리한 개념을 열었어요.');
    setCategory(''); setQuery(''); setCreating(false); setName(''); onDraft(null); onSelect(id);
  }

  function remove() {
    if (!window.confirm(`“${selected.name}” 개념을 삭제할까요? 이해도와 개념 노트도 함께 지워집니다.`)) return;
    update(previous => ({ ...previous, concepts: previous.concepts.filter(concept => concept.id !== selected.id) }));
    onSelect(null);
  }

  function rename(input) {
    const nextName = input.value.trim();
    if (nextName === selected.name) return;
    if (!nextName || concepts.some(concept => concept.id !== selected.id && conceptNameKey(concept.name) === conceptNameKey(nextName))) {
      input.value = selected.name;
      notify('다른 개념과 겹치지 않는 이름을 입력해 주세요.');
    } else edit({ name: nextName });
  }

  return <div className="page concepts-page">
    <div className="page-title"><h1>개념 정리</h1><button className="primary-button" onClick={() => { setCreating(true); setName(''); onDraft(null); }}><Plus size={16}/>개념 추가</button></div>
    <p className="page-subtitle">개념마다 이해도와 노트를 기록하세요. 이 작업 공간의 대화에서 설명 깊이를 조절하는 데 쓰여요.</p>
    {creating && <form className="concept-add" onSubmit={create}>
      <label>개념 이름<input autoFocus maxLength={80} required placeholder="예: 이진 탐색" value={name} onChange={event => setName(event.target.value)}/></label>
      <button type="button" className="subtle-button" onClick={() => { setCreating(false); onDraft(null); }}>취소</button><button className="primary-button" disabled={!name.trim()}>추가</button>
    </form>}
    <div className="concept-layout">
      <section className="concept-browser" aria-label="개념 목록">
        <div className="concept-filters"><label className="concept-search"><Search size={15}/><input aria-label="개념 검색" placeholder="개념 검색" value={query} onChange={event => setQuery(event.target.value)}/></label><select aria-label="분류 필터" value={activeCategory} onChange={event => setCategory(event.target.value)}><option value="">모든 분류</option>{categories.map(item => <option key={item}>{item}</option>)}</select></div>
        <div className="concept-entries">{visible.map(concept => <button key={concept.id} type="button" className="concept-entry" aria-current={selected?.id === concept.id ? 'true' : undefined} onClick={() => onSelect(concept.id)}>
          <span><strong>{concept.name}</strong><small>{concept.category || '미분류'}</small></span><span className="concept-entry-level">{concept.locked && <Lock size={12}/>} {concept.level}/5</span>
        </button>)}{!visible.length && <p className="muted">{concepts.length ? '검색 결과가 없어요.' : '아직 정리한 개념이 없어요.'}</p>}</div>
      </section>
      {selected ? <section key={selected.id} className="concept-detail" aria-label={selected.name}>
        <div className="concept-detail-heading"><BookOpen size={22}/><h2>{selected.name}</h2><button className="icon-button danger" type="button" aria-label="개념 삭제" title="개념 삭제" onClick={remove}><Trash2 size={16}/></button></div>
        <label className="form-label">이름<input maxLength={80} defaultValue={selected.name} onBlur={event => rename(event.currentTarget)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur(); }}/></label>
        <label className="form-label">분류<input list="concept-categories" maxLength={60} value={selected.category} placeholder="예: 알고리즘" onChange={event => edit({ category: event.target.value })}/><datalist id="concept-categories">{categories.map(item => <option key={item} value={item}/>)}</datalist></label>
        <fieldset className="concept-understanding"><legend>이해도</legend><div>{understandingLevels.map((label, index) => <button type="button" key={label} aria-pressed={selected.level === index + 1} onClick={() => edit({ level: index + 1 })}><strong>{index + 1}</strong><span>{label}</span></button>)}</div></fieldset>
        <label className="concept-lock"><input type="checkbox" checked={selected.locked} onChange={event => edit({ locked: event.target.checked })}/>{selected.locked ? <Lock size={15}/> : <LockOpen size={15}/>} AI 이해도 변경 잠금</label>
        <label className="form-label">개념 노트<textarea rows={8} value={selected.notes} maxLength={12000} placeholder="스스로 설명해 본 내용이나 헷갈렸던 지점을 기록하세요." onChange={event => edit({ notes: event.target.value })}/></label>
      </section> : <div className="concept-detail concept-empty"><BookOpen size={26}/><p>대화에서 접한 개념을 이곳에서 복습할 수 있어요.</p></div>}
    </div>
  </div>;
}
