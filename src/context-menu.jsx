import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export function ContextMenu({ menu, close }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const element = ref.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    (element.querySelector('button:not(:disabled)') || element).focus({ preventScroll: true });
  }, [menu]);
  useEffect(() => {
    const outside = event => { if (!ref.current?.contains(event.target)) close(); };
    const dismiss = () => close();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [close]);

  return createPortal(<div ref={ref} role="menu" aria-label="항목 작업" tabIndex={-1} className="item-context-menu" onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      menu.trigger.focus({ preventScroll: true }); close(); return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }}>{menu.items.map(({ label, icon: Icon, action, danger, disabled }) => <button key={label} type="button" role="menuitem" disabled={disabled} className={danger ? 'danger' : undefined} onClick={() => {
    close(); menu.trigger.focus({ preventScroll: true }); action();
  }}>{Icon && <Icon size={15}/>}<span>{label}</span></button>)}</div>, document.body);
}
