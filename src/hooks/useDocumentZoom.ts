import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const clamp = (value: number) => Math.min(300, Math.max(25, value));
type Anchor = { x: number; y: number; paperX: number; paperY: number };

/** Zoom the paper, never the application or document's typographic settings. */
export function useDocumentZoom(enabled: boolean, paperWidth: number, blocked: boolean) {
  const viewport = useRef<HTMLDivElement>(null);
  const [percent, setPercent] = useState(100);
  const [fitted, setFitted] = useState(false);
  const target = useRef(100);
  const anchor = useRef<Anchor | null>(null);
  const change = useCallback((value: number, point?: { x: number; y: number }) => {
    if (!Number.isFinite(value)) return;
    const next = Math.round(clamp(value) * 100) / 100;
    if (next === target.current) return;
    const view = viewport.current;
    const sheet = view?.querySelector<HTMLElement>('.document-sheet');
    if (view && sheet) {
      const bounds = view.getBoundingClientRect();
      const paper = sheet.getBoundingClientRect();
      const x = point?.x ?? bounds.left + view.clientWidth / 2;
      const y = point?.y ?? bounds.top + view.clientHeight / 2;
      anchor.current = {
        x: x - bounds.left,
        y: y - bounds.top,
        paperX: (x - paper.left) / paper.width,
        paperY: (y - paper.top) / paper.height,
      };
    }
    target.current = next;
    setPercent(next);
  }, []);
  const zoom = useCallback(
    (value: number, point?: { x: number; y: number }) => {
      setFitted(false);
      change(value, point);
    },
    [change],
  );
  const fit = useCallback(() => {
    const view = viewport.current;
    if (view) change(((view.clientWidth - 48) / paperWidth) * 100);
    setFitted(true);
  }, [change, paperWidth]);

  // CSS zoom participates in layout and preserves editing hit testing. Correct the
  // native scroll offset before paint so the same paper point stays under the pinch.
  useLayoutEffect(() => {
    const view = viewport.current;
    const sheet = view?.querySelector<HTMLElement>('.document-sheet');
    const a = anchor.current;
    if (view && sheet && a) {
      const bounds = view.getBoundingClientRect(),
        paper = sheet.getBoundingClientRect();
      view.scrollLeft += paper.left - bounds.left + a.paperX * paper.width - a.x;
      view.scrollTop += paper.top - bounds.top + a.paperY * paper.height - a.y;
    }
    anchor.current = null;
  }, [percent]);

  useEffect(() => {
    const view = viewport.current;
    if (!view || !enabled || blocked) return;
    const wheel = (event: WheelEvent) => {
      // Chromium delivers precision-trackpad pinch as Ctrl+wheel. Plain wheel,
      // horizontal pan and momentum remain entirely native, including nested tables.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const pixels =
        event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? view.clientHeight : 1);
      zoom(target.current * Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.005), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    const key = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      if (!['+', '=', '-', '0'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      zoom(event.key === '0' ? 100 : target.current + (event.key === '-' ? -10 : 10));
    };
    view.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key, true);
    return () => {
      view.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key, true);
    };
  }, [enabled, blocked, zoom]);
  useEffect(() => {
    const view = viewport.current;
    if (!view || !enabled || !fitted) return;
    const observer = new ResizeObserver(fit);
    observer.observe(view);
    fit();
    return () => observer.disconnect();
  }, [enabled, fitted, fit]);
  return { viewport, percent, zoom, fit, fitted };
}
