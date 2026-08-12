// FLM — Report leggibile delle modifiche da applicare a PES Editor (PRD 7.4).
// Fallback manuale: se l'import CSV dell'editor non funziona, il report permette
// di applicare le modifiche a mano, con tutti i valori necessari in chiaro.

import type { Giocatore, Squadra } from '../types/entities';

export type TipoModifica = 'creazione' | 'aggiornamento' | 'assegnazione';

export interface ModificaGiocatore {
  giocatore: Giocatore;
  squadra: Squadra;
  tipo: TipoModifica;
}

export function generaRiepilogoModifiche(
  modifiche: ModificaGiocatore[],
  contesto: { stagione: string },
): string {
  const righe: string[] = [];
  righe.push(`# FLM — Modifiche da applicare a PES Editor (stagione ${contesto.stagione})`);
  righe.push('');
  righe.push('Questo file elenca le modifiche alla rosa decise nella carriera FLM.');
  righe.push("Se l'import automatico CSV non funziona, puoi applicarle a mano nell'editor:");
  righe.push('');
  righe.push('1. Fai un backup del tuo EDIT file prima di toccare qualsiasi cosa.');
  righe.push('2. Per ogni giocatore da creare: sezione Giocatori → Aggiungi → inserisci i valori sotto.');
  righe.push('3. Per ogni assegnazione: sposta il giocatore nella squadra indicata.');
  righe.push('4. Salva l\'EDIT file e avvia FL26: la rosa deve coincidere con questa lista.');
  righe.push('');
  righe.push(`## ${modifiche.length} modifiche`);
  righe.push('');
  righe.push('| Tipo | Giocatore | PES ID | Squadra | Ruolo | Età | Overall | Valore |');
  righe.push('|---|---|---|---|---|---|---|---|');
  for (const m of modifiche) {
    righe.push(
      [
        m.tipo,
        m.giocatore.nome,
        m.giocatore.pesId ?? 'da assegnare',
        m.squadra.nome,
        m.giocatore.ruolo,
        m.giocatore.eta,
        m.giocatore.overall,
        m.giocatore.valoreMercato.toLocaleString('it-IT'),
      ].join(' | '),
    );
  }
  righe.push('');
  righe.push('Nota: gli ID PES devono essere univoci nella mappatura (PRD 7.2).');
  righe.push('Per i giocatori creati ex novo, in M4 FLM assegnerà automaticamente ID nel range libero (PRD 7.4).');
  return righe.join('\n');
}
