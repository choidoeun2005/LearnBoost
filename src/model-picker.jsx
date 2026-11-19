import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu } from 'lucide-react';

export function ModelPicker({ models, value, disabled, imageOnly, searchOnly, onChange }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const id = useId();
  const current = models.find(item => item.id === value);

  useEffect(() => {
    if (!open) return;
    (list.current?.querySelector('[aria-checked="true"]') || list.current?.querySelector('button'))?.focus();
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  if (searchOnly || imageOnly || !models.length) return <span className="model-pill model-pill-static"><Cpu size={14}/>{searchOnly ? '문서 검색' : imageOnly ? 'Qwen3 VL 32B' : '모델 연결 중'}</span>;

  return <div ref={root} className="model-picker" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = [...list.current.querySelectorAll('button')];
    const index = options.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }}>
    <button ref={trigger} type="button" className="model-pill" aria-label={`답변 생성 모델, ${current?.label || '선택'}`} aria-haspopup="dialog" aria-expanded={open && !disabled} aria-controls={open && !disabled ? id : undefined} disabled={disabled} onClick={() => setOpen(!open)}><Cpu size={14}/><span>{current?.label || '모델 선택'}</span><ChevronDown size={14}/></button>
    {open && !disabled && <div className="model-popover" id={id} role="dialog" aria-label="답변 생성 모델">
      <div className="model-popover-heading">답변 생성 모델</div>
      <div role="radiogroup" aria-label="Furiosa 모델" ref={list}>{models.map(item => <button key={item.id} type="button" role="radio" aria-checked={value === item.id} className="model-option" onClick={() => { onChange(item.id); close(); }}>
        <span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{value === item.id && <Check size={16}/>}
      </button>)}</div>
    </div>}
  </div>;
}
