// FLM — Componenti media con fallback garantito.
// <img> carica l'URL remoto (cache HTTP del browser); su errore/offline
// torna al generato. Le immagini remote non passano da IndexedDB perché
// l'host non espone CORS al fetch: in Dexie si persiste solo il mapping (D6).

import { useState, type ReactElement } from 'react';
import { useLogoCompetizione, useLogoSquadra, useVoltoGiocatore, type ColoriSquadra } from './hooks';
import { avatarGiocatore, stemmaCompetizione, stemmaSquadra } from './stemmi';

interface ImmagineProps {
  className?: string;
}

function ImmagineConFallback({ src, fallback, alt, className }: ImmagineProps & { src: string; fallback: string; alt: string }): ReactElement {
  const [errore, setErrore] = useState(false);
  const effettivo = errore ? fallback : src;
  return (
    <img
      className={className}
      src={effettivo}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => {
        if (!errore) setErrore(true);
      }}
    />
  );
}

export function LogoSquadra({ nome, nazione, colori, className }: ImmagineProps & { nome: string; nazione?: string; colori?: ColoriSquadra }): ReactElement {
  const src = useLogoSquadra(nome, nazione, colori);
  return <ImmagineConFallback src={src} fallback={stemmaSquadra(nome, colori)} alt={`Stemma ${nome}`} className={className} />;
}

export function AvatarGiocatore({ nome, nomeSquadra, colori, className }: ImmagineProps & { nome: string; nomeSquadra?: string; colori?: ColoriSquadra }): ReactElement {
  const src = useVoltoGiocatore(nome, nomeSquadra, colori);
  return <ImmagineConFallback src={src} fallback={avatarGiocatore(nome, colori)} alt={`Volto ${nome}`} className={className} />;
}

export function LogoCompetizione({ nome, nazione, className }: ImmagineProps & { nome: string; nazione?: string }): ReactElement {
  const src = useLogoCompetizione(nome, nazione);
  return <ImmagineConFallback src={src} fallback={stemmaCompetizione(nome)} alt={`Logo ${nome}`} className={className} />;
}
