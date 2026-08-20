// FLM — WorldNewsBoard: X-style journalist carousel + high-end zoom
// Fix: pixel-based translate, drag vs tap, portal overlay (no clip), no transition while dragging

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { MondoNotizia } from '../../types/entities';
import styles from './WorldNewsBoard.module.css';

const LABEL_CATEGORIA: Record<MondoNotizia['categoria'], string> = {
  performance: 'Performance',
  derby: 'Derby',
  infortunio: 'Infortunio',
  sorteggio: 'Sorteggio',
  mercato: 'Mercato',
  coppe: 'Coppe',
  altro: 'News',
};

function formattaNumero(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1).replace('.0', '')}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.0', '')}K`;
  return String(n);
}
function iniziali(nome: string): string {
  return nome.split(' ').filter(Boolean).map((p) => p[0]!.toUpperCase()).slice(0, 2).join('');
}

interface Props {
  notizie: MondoNotizia[];
  onSelezione?: (n: MondoNotizia) => void;
}

export default function WorldNewsBoard({ notizie, onSelezione }: Props): ReactElement {
  const [indice, setIndice] = useState(0);
  const [espansa, setEspansa] = useState<MondoNotizia | null>(null);
  const [animazioneIn, setAnimazioneIn] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vpW, setVpW] = useState(0);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef<number | null>(null);
  const lastDragRef = useRef(0);

  // misura viewport per translate pixel-precise
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = (): void => setVpW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    if (indice >= notizie.length) setIndice(Math.max(0, notizie.length - 1));
  }, [notizie.length, indice]);

  // lock scroll + anim in
  useEffect(() => {
    if (!espansa) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimazioneIn(true)));
    return () => {
      document.body.style.overflow = prev;
      cancelAnimationFrame(id);
      setAnimazioneIn(false);
    };
  }, [espansa]);

  useEffect(() => {
    if (!espansa) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setEspansa(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [espansa]);

  if (notizie.length === 0) {
    return (
      <div className={styles.boardVuoto}>
        <div className={styles.vuotoIcon}>◯</div>
        <strong>Nessuna news dal mondo</strong>
        <span>Le notizie dal resto del calcio appariranno qui dopo il prossimo referto.</span>
      </div>
    );
  }

  const totale = notizie.length;
  const vai = (dir: 1 | -1): void => {
    setIndice((i) => (i + dir + totale) % totale);
  };

  const apri = (n: MondoNotizia): void => {
    // non aprire se appena draggato
    if (Math.abs(lastDragRef.current) > 12) return;
    setEspansa(n);
    onSelezione?.(n);
  };

  // ---- drag handlers (pixel based, no capture che blocca click) ----
  const onPointerDown = (e: React.PointerEvent): void => {
    // solo tasto primario
    if (e.button !== 0) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    lastDragRef.current = 0;
    // cattura solo per seguire fuori dal viewport, ma rilascia su up
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {}
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!draggingRef.current || startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    lastDragRef.current = dx;
    setDragX(dx);
  };
  const endDrag = (e: React.PointerEvent): void => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {}
    const dx = lastDragRef.current;
    if (dx < -60) vai(1);
    else if (dx > 60) vai(-1);
    setDragX(0);
    startXRef.current = null;
    // ritarda azzeramento lastDrag per evitare click immediato post-drag
    setTimeout(() => {
      lastDragRef.current = 0;
    }, 180);
  };

  const translatePx = vpW ? -indice * vpW + dragX : -indice * 100;
  const trackStyle: React.CSSProperties =
    vpW > 0
      ? {
          transform: `translate3d(${translatePx}px,0,0)`,
          transition: draggingRef.current ? 'none' : 'transform 420ms cubic-bezier(0.2,0.8,0.2,1)',
        }
      : {
          transform: `translateX(calc(${-indice * 100}% + ${dragX}px))`,
          transition: draggingRef.current ? 'none' : undefined,
        };

  const overlay = espansa
    ? createPortal(
        <div
          className={`${styles.overlay} ${animazioneIn ? styles.overlayIn : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={espansa.titolo}
          onClick={() => setEspansa(null)}
        >
          <div className={`${styles.sheet} ${animazioneIn ? styles.sheetIn : ''}`} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.close} onClick={() => setEspansa(null)} aria-label="Chiudi">×</button>
            <div className={styles.sheetHeader}>
              <span className={styles.avatarLarge} aria-hidden>{iniziali(espansa.autoreNome)}</span>
              <span className={styles.meta}>
                <span className={styles.nome}>{espansa.autoreNome} <span className={styles.verified}>✓</span></span>
                <span className={styles.handle}>{espansa.autoreHandle} · {espansa.oreFa}h · {LABEL_CATEGORIA[espansa.categoria]}</span>
              </span>
              <span className={styles.pillLarge}>{LABEL_CATEGORIA[espansa.categoria]}</span>
            </div>
            <h2 className={styles.sheetTitolo}>{espansa.titolo}</h2>
            <div className={styles.sheetCorpo}>
              {espansa.corpo.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <div className={styles.sheetMeta}>
              <span>{espansa.squadra ? `Coinvolte: ${espansa.squadra}` : ''}{espansa.giocatore ? ` · ${espansa.giocatore}` : ''}</span>
            </div>
            <div className={styles.sheetFooter}>
              <span className={styles.stat}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg> {formattaNumero(espansa.commenti)}</span>
              <span className={styles.stat}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg> {formattaNumero(espansa.reposts)}</span>
              <span className={styles.stat}><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21s-6.7-4.35-9.2-7.2C1 11.9 1.7 8.1 4.4 6.4c1.5-.9 3.5-.9 5 0L12 8.2l2.6-1.8c1.5-.9 3.5-.9 5 0 2.7 1.7 3.4 5.5 1.6 7.4C18.7 16.65 12 21 12 21Z" /></svg> {formattaNumero(espansa.likes)}</span>
              <span className={styles.sheetOrigine}>{espansa.origine === 'llm' ? 'Narrata dal giornale' : 'Dal campo'}</span>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={styles.board}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        <div className={styles.track} style={trackStyle}>
          {notizie.map((n) => (
            <article key={n.id} className={styles.slide}>
              <button type="button" className={styles.card} onClick={() => apri(n)} aria-label={`Apri articolo: ${n.titolo}`}>
                <div className={styles.cardHeader}>
                  <span className={styles.avatar} aria-hidden>{iniziali(n.autoreNome)}</span>
                  <span className={styles.meta}>
                    <span className={styles.nome}>{n.autoreNome} <span className={styles.verified} title="Verificato">✓</span></span>
                    <span className={styles.handle}>{n.autoreHandle} · {n.oreFa}h</span>
                  </span>
                  <span className={styles.pill}>{LABEL_CATEGORIA[n.categoria] ?? n.categoria}</span>
                </div>
                <h3 className={styles.titolo}>{n.titolo}</h3>
                <p className={styles.estratto}>{n.estratto}</p>
                <div className={styles.fade} aria-hidden />
                <div className={styles.footer} aria-hidden>
                  <span className={styles.stat}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5Z" /></svg> {formattaNumero(n.commenti)}</span>
                  <span className={styles.stat}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg> {formattaNumero(n.reposts)}</span>
                  <span className={styles.stat}><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 21s-6.7-4.35-9.2-7.2C1 11.9 1.7 8.1 4.4 6.4c1.5-.9 3.5-.9 5 0L12 8.2l2.6-1.8c1.5-.9 3.5-.9 5 0 2.7 1.7 3.4 5.5 1.6 7.4C18.7 16.65 12 21 12 21Z" /></svg> {formattaNumero(n.likes)}</span>
                  <span className={styles.statShare} aria-hidden>⤴</span>
                </div>
                <span className={styles.openHint}>Tocca per aprire</span>
              </button>
            </article>
          ))}
        </div>
        {totale > 1 && (
          <>
            <button type="button" className={`${styles.nav} ${styles.navPrev}`} onClick={() => vai(-1)} aria-label="Notizia precedente">‹</button>
            <button type="button" className={`${styles.nav} ${styles.navNext}`} onClick={() => vai(1)} aria-label="Notizia successiva">›</button>
          </>
        )}
      </div>
      {totale > 1 && (
        <div className={styles.controls}>
          <div className={styles.dots} role="tablist" aria-label="Notizie dal mondo">
            {notizie.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === indice}
                aria-label={`Vai alla notizia ${i + 1}`}
                className={`${styles.dot} ${i === indice ? styles.dotActive : ''}`}
                onClick={() => setIndice(i)}
              />
            ))}
          </div>
          <span className={styles.counter}>{indice + 1} / {totale}</span>
        </div>
      )}
      {overlay}
    </div>
  );
}
