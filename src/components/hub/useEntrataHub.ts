// FLM — Entrata orchestrata hub (D9): un solo momento GSAP, pulito.
// Stagger breve dei blocchi marcati [data-hub-tile]; reduced-motion = salta.

import { useEffect, useRef } from 'react';
import gsap from 'gsap';

export function useEntrataHub(pronto: boolean): void {
  const fatto = useRef(false);
  useEffect(() => {
    if (!pronto || fatto.current) return;
    fatto.current = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const blocchi = document.querySelectorAll('[data-hub-tile]');
    if (blocchi.length === 0) return;
    const tween = gsap.fromTo(
      blocchi,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, duration: 0.4, ease: 'power2.out', stagger: 0.045, clearProps: 'transform,opacity,visibility' },
    );
    return () => {
      tween.kill();
    };
  }, [pronto]);
}
