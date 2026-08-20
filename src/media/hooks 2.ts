// FLM — Hook media: rendering progressivo. Ritorna SUBITO il fallback generato
// (stemma/avatar dai colori CSV), poi lo sostituisce con l'immagine reale
// quando la rete risponde. Mai spazi vuoti, mai spinner sulle immagini.

import { useEffect, useState } from 'react';
import { logoCompetizione, logoSquadra, voltoGiocatore } from './cache';
import { avatarGiocatore, stemmaCompetizione, stemmaSquadra } from './stemmi';

export interface ColoriSquadra {
  primario: string;
  secondario: string;
}

function useMedia(fallback: string, richiesta: (() => Promise<string>) | null, dipendenze: unknown[]): string {
  const [src, setSrc] = useState(fallback);
  useEffect(() => {
    setSrc(fallback);
    if (!richiesta) return undefined;
    let vivo = true;
    void richiesta().then((url) => {
      if (vivo && url) setSrc(url);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dipendenze);
  return src;
}

/** Logo squadra reale (rete) → stemma generato dai colori sociali (fallback). */
export function useLogoSquadra(nome: string, nazione?: string, colori?: ColoriSquadra): string {
  return useMedia(stemmaSquadra(nome, colori), () => logoSquadra(nome, nazione), [nome, nazione, colori?.primario, colori?.secondario]);
}

/** Volto reale (rete) → avatar monogramma colori squadra (fallback). */
export function useVoltoGiocatore(nome: string, nomeSquadra?: string, colori?: ColoriSquadra): string {
  return useMedia(avatarGiocatore(nome, colori), () => voltoGiocatore(nome, nomeSquadra), [nome, nomeSquadra, colori?.primario]);
}

/** Logo competizione reale (rete) → coccarda generata (fallback). */
export function useLogoCompetizione(nome: string, nazione?: string): string {
  return useMedia(stemmaCompetizione(nome), () => logoCompetizione(nome, nazione), [nome, nazione]);
}
