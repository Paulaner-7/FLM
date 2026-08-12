// FLM — Calibrazione distribuzione stagionale (PRD 6.1).
// Obiettivo: le stagioni estreme (campione 90+, gap 1ª-2ª > 10, ultima < 20)
// devono capitare con frequenze simili alla Serie A reale degli ultimi 10 anni
// (Wikipedia, pagine stagionali 2015/16-2024/25 consultate per questa feature):
//   campione: min 82, max 95, mediana ~91  → ≥90 in ~7/10 stagioni
//   gap 1ª-2ª: 1-19 punti, ≥10 in ~5/10, ≤4 in ~5/10
//   ultima: ~17-25 punti, ≤20 in ~5/10
// Leva testata: scostamento stagionale per squadra (seme deterministico da
// carriera+stagione+squadra): modella "quest'anno rendiamo più/meno dell'overall".
// Avvio: npm run calibra:sim

import { generaCalendario } from '../src/engine/calendario';
import { fattoreGol, risultatoAtteso } from '../src/engine/rating';

/** aggiornaRating con K parametrico (per calibrazione). */
function aggiornaRatingK(gc: number, gt: number, rc: number, rt: number, k: number): { ratingCasa: number; ratingTrasferta: number } {
  const we = risultatoAtteso(rc, rt);
  const w = gc > gt ? 1 : gc === gt ? 0.5 : 0;
  const g = fattoreGol(gc - gt);
  return {
    ratingCasa: rc + Math.round(k * g * (w - we)),
    ratingTrasferta: rt + Math.round(k * g * ((1 - w) - (1 - we))),
  };
}
import { hashString, poisson, prng } from '../src/engine/random';

const N_SQUADRE = 20;
const GIORNATE = 38;
const STAGIONI = 300;

/** Overall realistici Serie A (cima separata, coda lunga in fondo): */
const OVERALL: number[] = [86, 85, 83, 82, 81, 80, 79, 78, 77, 76, 75.5, 75, 74.5, 74, 73.5, 73, 72.5, 72, 71.5, 71];
const overall = (i: number): number => OVERALL[i] ?? 71;

interface Parametri {
  nome: string;
  /** scostamento stagionale massimo per squadra (0 = disattivo) */
  shake: number;
  /** peso Elo dell'aggiornamento (30 = "altri tornei", 20 = amichevoli, eloratings) */
  k: number;
  /** frazione della deriva Elo intra-stagione che conta per la sim (1 = tutta, 0.5 = metà) */
  reversion: number;
  /** cap del bonus forma */
  capForma: number;
}

function lambda(rc: number, rt: number): { casa: number; trasferta: number } {
  const scarto = (rc - rt) / 350;
  return {
    casa: Math.max(0.1, 1.28 + 0.175 + scarto),
    trasferta: Math.max(0.1, 1.28 - 0.175 - scarto),
  };
}

/** Scostamento stagionale deterministico: hash(carriera+stagione+squadra) → [−shake, +shake]. */
function scostamento(shake: number, squadraId: string, stagione: number): number {
  if (shake <= 0) return 0;
  const r = prng(hashString(`car-stag${stagione}-${squadraId}`));
  return Math.round((r() * 2 - 1) * shake);
}

interface Esito {
  campione: number[];
  gap: number[];
  ultima: number[];
  sprd: number[];
  golPartita: number;
}

function simulaStagione(p: Parametri, stagione: number): Esito {
  const ids = Array.from({ length: N_SQUADRE }, (_, i) => `s${i}`);
  const base = new Map<string, number>(
    ids.map((id, i) => [id, Math.round(1500 + (overall(i) - 60) * 20)]),
  );
  const ratings = new Map<string, number>(base);
  const shake = new Map<string, number>(
    ids.map((id) => [id, scostamento(p.shake, id, stagione)]),
  );
  const punti = new Map(ids.map((id) => [id, 0]));
  const streak = new Map(ids.map((id) => [id, 0]));
  let golTotali = 0;
  const partite = generaCalendario(ids, 'comp', 'car');

  const forma = (id: string): number =>
    Math.min(p.capForma, Math.max(-p.capForma, (streak.get(id) ?? 0) * 10));

  for (let giornata = 1; giornata <= GIORNATE; giornata++) {
    const risultati = partite
      .filter((x) => x.giornata === giornata)
      .map((x) => {
        const eff = (id: string): number =>
          (base.get(id) ?? 1500) + ((ratings.get(id) ?? 1500) - (base.get(id) ?? 1500)) * p.reversion;
        const rc = eff(x.casa) + forma(x.casa) + (shake.get(x.casa) ?? 0);
        const rt = eff(x.trasferta) + forma(x.trasferta) + (shake.get(x.trasferta) ?? 0);
        const l = lambda(rc, rt);
        // Seme per stagione: in una carriera reale gli ID partita cambiano a ogni
        // stagione (newId); qui il seme include la stagione per misurare la distribuzione.
        const rand = prng(hashString(`${x.id}#${stagione}`));
        return { x, gc: poisson(rand, l.casa), gt: poisson(rand, l.trasferta) };
      });
    for (const { x, gc, gt } of risultati) {
      punti.set(x.casa, (punti.get(x.casa) ?? 0) + (gc > gt ? 3 : gc === gt ? 1 : 0));
      punti.set(x.trasferta, (punti.get(x.trasferta) ?? 0) + (gt > gc ? 3 : gt === gc ? 1 : 0));
      golTotali += gc + gt;
      const nuovo = aggiornaRatingK(gc, gt, ratings.get(x.casa) ?? 1500, ratings.get(x.trasferta) ?? 1500, p.k);
      ratings.set(x.casa, nuovo.ratingCasa);
      ratings.set(x.trasferta, nuovo.ratingTrasferta);
      const s = (id: string, segno: number): void => {
        if (segno === 0) streak.set(id, 0);
        else streak.set(id, Math.max(-8, Math.min(8, (streak.get(id) ?? 0) + segno)));
      };
      s(x.casa, gc > gt ? 1 : gc === gt ? 0 : -1);
      s(x.trasferta, gt > gc ? 1 : gt === gc ? 0 : -1);
    }
  }

  const ordinati = [...punti.entries()].sort((a, b) => b[1] - a[1]);
  return {
    campione: [ordinati[0]?.[1] ?? 0],
    gap: [ordinati[0][1] - ordinati[1][1]],
    ultima: [ordinati[ordinati.length - 1]?.[1] ?? 0],
    sprd: [ordinati[0][1] - ordinati[ordinati.length - 1][1]],
    golPartita: golTotali / (GIORNATE * N_SQUADRE / 2),
  };
}

const media = (l: number[]): number => l.reduce((a, b) => a + b, 0) / l.length;
const pct = (l: number[], q: number): number => {
  const ord = [...l].sort((a, b) => a - b);
  return ord[Math.min(ord.length - 1, Math.floor(q * ord.length))] ?? 0;
};

function analizza(p: Parametri): void {
  const campione: number[] = [];
  const gap: number[] = [];
  const ultima: number[] = [];
  const sprd: number[] = [];
  const golPartita: number[] = [];
  for (let s = 0; s < STAGIONI; s++) {
    const r = simulaStagione(p, s);
    campione.push(...r.campione);
    gap.push(...r.gap);
    ultima.push(...r.ultima);
    sprd.push(...r.sprd);
    golPartita.push(r.golPartita);
  }
  const f90 = campione.filter((v) => v >= 90).length / campione.length * 100;
  const f94 = campione.filter((v) => v >= 94).length / campione.length * 100;
  const fGap10 = gap.filter((v) => v >= 10).length / gap.length * 100;
  const fGap4 = gap.filter((v) => v <= 4).length / gap.length * 100;
  const fUlt20 = ultima.filter((v) => v <= 20).length / ultima.length * 100;
  console.log(`\n=== ${p.nome} (${STAGIONI} stagioni) ===`);
  console.log(`campione: media ${media(campione).toFixed(0)} · p10 ${pct(campione, 0.1)} · p50 ${pct(campione, 0.5)} · p90 ${pct(campione, 0.9)} · max ${Math.max(...campione)}`);
  console.log(`gap 1ª-2ª: media ${media(gap).toFixed(0)} · p50 ${pct(gap, 0.5)} · max ${Math.max(...gap)}`);
  console.log(`ultima: media ${media(ultima).toFixed(0)} · p50 ${pct(ultima, 0.5)} · min ${Math.min(...ultima)}`);
  console.log(`spread: media ${media(sprd).toFixed(0)} · gol/partita ${media(golPartita).toFixed(2)}`);
  console.log(`frequenze: campione≥90 ${f90.toFixed(0)}% (reale 70%) · campione≥94 ${f94.toFixed(0)}% (reale 20%) · gap≥10 ${fGap10.toFixed(0)}% (reale 50%) · gap≤4 ${fGap4.toFixed(0)}% (reale 50%) · ultima≤20 ${fUlt20.toFixed(0)}% (reale ~50%)`);
}

console.log('Ancore reali ultimi 10 anni: campione 82-95 (mediana ~91, ≥90 nel 70%) · gap 1ª-2ª 1-19 (≥10 nel 50%) · ultima ~17-25');
/** CONFIG SPEDITO nell'engine (rules.ts/rating.ts/referto.ts): K20, rev 0.5, forma cap 50, shake ±40. */
analizza({ nome: 'SPEDITO K20 rev0.5 forma50 shake40', shake: 40, k: 20, reversion: 0.5, capForma: 50 });
analizza({ nome: 'K30 rev1 forma30 (precedente)', shake: 0, k: 30, reversion: 1, capForma: 30 });
analizza({ nome: 'K20 rev1 forma50 shake40 (senza reversion)', shake: 40, k: 20, reversion: 1, capForma: 50 });
