import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, Maximize, Minus, Plus } from 'lucide-react';
import { repairPdfText } from './pdf-text.js';
import { evidenceRange, evidenceTextMap } from './pdf-evidence.js';
import './pdf-viewer.css';

function textRuns(layer) {
  let position = 0;
  return layer.textDivs.filter(span => span.isConnected).map(span => {
    const map = evidenceTextMap(span.textContent);
    const start = position;
    position += map.normalized.length;
    return { span, map, start, end: position };
  });
}

function passageBoxes(runs, text, passage, sheet) {
  const match = evidenceRange(text, passage);
  if (!match) return [];
  return runs.flatMap(({ span, map, start, end }) => {
    if (end <= match[0] || start >= match[1] || span.firstChild?.nodeType !== Node.TEXT_NODE || !map.normalized) return [];
    const range = document.createRange();
    range.setStart(span.firstChild, map.starts[Math.max(match[0] - start, 0)]);
    range.setEnd(span.firstChild, map.ends[Math.min(match[1], end) - start - 1]);
    return [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({
      left: rect.left - sheet.left, top: rect.top - sheet.top, width: rect.width, height: rect.height,
    }));
  });
}

function regionBetween(start, end) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
}

function pointerPosition(event) {
  const box = event.currentTarget.getBoundingClientRect();
  const clamp = value => Math.min(1, Math.max(0, value));
  return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
}

function PdfRegion({ drawing, region, onRegion }) {
  const start = useRef(null);
  const [draft, setDraft] = useState(null);
  const active = draft || region;
  return <>
    {active && <div className="pdf-marked-region" aria-hidden="true" style={{
      left: `${active.x * 100}%`, top: `${active.y * 100}%`, width: `${active.width * 100}%`, height: `${active.height * 100}%`,
    }}/>}
    {drawing && <div className="pdf-region-picker" aria-label="PDF에서 영역 선택" onPointerDown={event => {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = pointerPosition(event);
    }} onPointerMove={event => {
      if (start.current) setDraft(regionBetween(start.current, pointerPosition(event)));
    }} onPointerUp={event => {
      if (!start.current) return;
      const next = regionBetween(start.current, pointerPosition(event));
      start.current = null;
      setDraft(null);
      if (next.width >= 0.01 && next.height >= 0.01) onRegion(next);
    }} onPointerCancel={() => { start.current = null; setDraft(null); }}/>}
  </>;
}

function PdfPage({ pdf, PageTextLayer, pageNumber, width, zoom, highlights, target, jump, region, drawing, onRegion, anchors, scrollRef, onError }) {
  const canvas = useRef(null);
  const textRoot = useRef(null);
  const jumped = useRef(null);
  const [runs, setRuns] = useState(null);
  const [size, setSize] = useState(null);
  const [marks, setMarks] = useState([]);
  const [markers, setMarkers] = useState([]);
  useEffect(() => {
    if (!width) return;
    let active = true;
    let renderTask;
    let textLayer;
    setRuns(null);
    setSize(null);
    textRoot.current.replaceChildren();
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (!active) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.max(1, width) / natural.width * zoom;
      const viewport = page.getViewport({ scale });
      const density = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(viewport.width, viewport.height));
      canvas.current.width = Math.ceil(viewport.width * density);
      canvas.current.height = Math.ceil(viewport.height * density);
      setSize({ width: viewport.width, height: viewport.height, '--total-scale-factor': viewport.scale * viewport.userUnit });
      renderTask = page.render({ canvas: canvas.current, viewport, transform: [density, 0, 0, density, 0, 0] });
      const [, rawContent] = await Promise.all([renderTask.promise, page.getTextContent()]);
      if (!active) return;
      const content = repairPdfText(rawContent, pdf.fingerprints[0]);
      textLayer = new PageTextLayer({ textContentSource: content, container: textRoot.current, viewport });
      await textLayer.render();
      if (active) setRuns(textRuns(textLayer));
    })().catch(error => { if (active) onError(error); });
    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, PageTextLayer, pageNumber, width, zoom, onError]);

  useEffect(() => {
    if (!runs) { setMarks([]); setMarkers([]); return; }
    const sheet = textRoot.current.getBoundingClientRect();
    const text = runs.map(run => run.map.normalized).join('');
    const referenceBoxes = reference => reference.region ? [{
      left: reference.region.x * sheet.width, top: reference.region.y * sheet.height,
      width: reference.region.width * sheet.width, height: reference.region.height * sheet.height,
    }] : passageBoxes(runs, text, reference.text, sheet);
    const nextMarks = highlights.flatMap(mark => referenceBoxes(mark).map((box, index) => ({ ...mark, box, index })));
    setMarks(nextMarks);
    const items = anchors.flatMap(anchor => {
      const box = referenceBoxes(anchor.reference)[0];
      return box ? [{ ...anchor, top: box.top }] : [];
    }).sort((a, b) => a.top - b.top);
    let nextTop = 3;
    setMarkers(items.map(item => {
      const top = Math.max(nextTop, item.top);
      nextTop = top + 25;
      return { ...item, top };
    }).filter(item => item.top + 23 <= sheet.height));
    if (jump && jumped.current !== jump && scrollRef.current) {
      jumped.current = jump;
      const scroll = scrollRef.current;
      const activeBox = nextMarks.find(mark => mark.id === target)?.box;
      const top = activeBox ? scroll.scrollTop + sheet.top - scroll.getBoundingClientRect().top + activeBox.top - scroll.clientHeight * 0.35 : 0;
      scroll.scrollTo({ top, behavior: 'instant' });
    }
  }, [runs, highlights, anchors, jump, target, scrollRef]);

  return <div className="pdf-sheet" style={size || undefined} aria-label={`${pageNumber}쪽 본문`} aria-busy={!runs}>
    <canvas ref={canvas} aria-hidden="true"/>
    <div className="pdf-highlights" aria-hidden="true">{marks.map(mark => <div key={`${mark.id}:${mark.index}`} data-highlight={mark.id} className={`pdf-highlight ${mark.region ? 'region' : ''}`} style={{ ...mark.box, '--highlight': mark.color }}/>)}</div>
    <div ref={textRoot} className="textLayer"/>
    {runs && <PdfRegion region={region} drawing={drawing} onRegion={onRegion}/>}
    {runs && !drawing && markers.map(item => <button key={item.id} type="button" className="pdf-note-marker" title={item.label} aria-label={item.label} style={{ top: item.top }} onClick={item.open}>{item.count}</button>)}
  </div>;
}

export function PdfViewer({ fileUrl, page, pageCount, setPage, highlights, target, jump, region, drawing, onRegion, anchors, scrollRef }) {
  const [pdf, setPdf] = useState(null);
  const [PageTextLayer, setPageTextLayer] = useState(null);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageInput, setPageInput] = useState(String(page));
  useEffect(() => {
    let active = true;
    let task;
    Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([pdfjs, worker]) => {
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const assetUrl = new URL('/pdf-assets/', window.location.origin);
      task = pdfjs.getDocument({
        url: fileUrl,
        cMapUrl: new URL('cmaps/', assetUrl).href,
        standardFontDataUrl: new URL('standard_fonts/', assetUrl).href,
        wasmUrl: new URL('wasm/', assetUrl).href,
        iccUrl: new URL('iccs/', assetUrl).href,
        isEvalSupported: false,
      });
      return task.promise.then(document => {
        if (!active) return;
        setPageTextLayer(() => pdfjs.TextLayer);
        setPdf(document);
      });
    }).catch(failure => { if (active) setError(failure); });
    return () => {
      active = false;
      task?.destroy().catch(() => {});
    };
  }, [fileUrl]);
  useEffect(() => {
    let timer;
    let measured = false;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width);
      clearTimeout(timer);
      if (measured && next > 0) timer = setTimeout(() => setWidth(next), 100);
      else if (next > 0) { setWidth(next); measured = true; }
    });
    if (scrollRef.current) observer.observe(scrollRef.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [scrollRef]);
  useEffect(() => {
    setPageInput(String(page));
    scrollRef.current?.scrollTo(0, 0);
  }, [page, scrollRef]);

  const total = pdf?.numPages || pageCount || 1;
  function changePage(value) {
    const next = Math.max(1, Math.min(total, Math.trunc(Number(value))));
    if (value.trim() && Number.isFinite(next)) setPage(next);
    setPageInput(String(value.trim() && Number.isFinite(next) ? next : page));
  }
  return <>
    <div className="pdf-controls">
      <div className="pdf-control-group">
        <button type="button" aria-label="이전 쪽" title="이전 쪽" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16}/></button>
        <form onSubmit={event => { event.preventDefault(); changePage(pageInput); }}>
          <input aria-label="이동할 페이지" inputMode="numeric" value={pageInput} onChange={event => setPageInput(event.target.value)} onBlur={() => changePage(pageInput)}/>
        </form>
        <span aria-label={`전체 ${total}쪽`}>/ {total}</span>
        <button type="button" aria-label="다음 쪽" title="다음 쪽" disabled={page >= total} onClick={() => setPage(page + 1)}><ChevronRight size={16}/></button>
      </div>
      <div className="pdf-control-group">
        <button type="button" aria-label="축소" title="축소" disabled={zoom <= 0.75} onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}><Minus size={15}/></button>
        <span aria-label="너비 맞춤 기준 확대율">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="확대" title="확대" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.25))}><Plus size={15}/></button>
        <button type="button" aria-label="너비에 맞추기" title="너비에 맞추기" onClick={() => setZoom(1)}><Maximize size={14}/></button>
      </div>
    </div>
    <div ref={scrollRef} className="pdf-scroll">
      {error ? <p className="reader-status" role="alert">PDF를 열 수 없어요. 위에서 텍스트로 보거나 원본을 열어 주세요.</p>
        : pdf && PageTextLayer ? <PdfPage key={page} pdf={pdf} PageTextLayer={PageTextLayer} pageNumber={page} width={width} zoom={zoom} highlights={highlights} target={target} jump={jump} region={region} drawing={drawing} onRegion={onRegion} anchors={anchors} scrollRef={scrollRef} onError={setError}/>
          : <p className="reader-status" role="status"><LoaderCircle className="spin" size={16}/>PDF를 불러오는 중이에요.</p>}
    </div>
  </>;
}

export function PdfSplitHandle({ value, onChange }) {
  const pointer = useRef(null);
  const setWidth = next => onChange(Math.max(30, Math.min(70, Math.round(next))));
  return <div className="pdf-split-handle" role="separator" aria-label="PDF와 대화 너비 조절" aria-orientation="vertical"
    aria-valuemin={30} aria-valuemax={70} aria-valuenow={value} tabIndex={0}
    title="드래그하거나 방향키로 너비 조절"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = { x: event.clientX, value, total: event.currentTarget.parentElement.clientWidth };
    }}
    onPointerMove={event => {
      if (pointer.current?.total) setWidth(pointer.current.value + 100 * (event.clientX - pointer.current.x) / pointer.current.total);
    }}
    onLostPointerCapture={() => { pointer.current = null; }}
    onDoubleClick={() => setWidth(44)}
    onKeyDown={event => {
      const values = { ArrowLeft: value - 4, ArrowRight: value + 4, Home: 30, End: 70 };
      if (values[event.key] === undefined) return;
      event.preventDefault();
      setWidth(values[event.key]);
    }}/>
}
