import { profiloProspetto, profiloRigenerato, ritiroDeciso, deltaCrescitaAnnuale, nazionalitaRegen } from '/Users/vittorio/Desktop/FLM/src/engine/vivaio.ts';
import { prng } from '/Users/vittorio/Desktop/FLM/src/engine/random.ts';

const club = { id: 'c1', pesId: 900, nome: 'Test FC', nazione: 'Italia', reputazione: 85, rating: 1700 } as never;
const clubPiccolo = { id: 'c2', pesId: 901, nome: 'Piccola', nazione: 'Italia', reputazione: 40, rating: 1450 } as never;

// Prospetti: overall range per reputazione
for (const c of [club, clubPiccolo]) {
  const vals = [];
  for (let i = 0; i < 200; i++) vals.push(profiloProspetto({ carrieraId: 'car', stagione: '2026/27', club: c as never, indice: i }).overall);
  console.log(`rep=${c.reputazione}: overall min ${Math.min(...vals)} max ${Math.max(...vals)} media ${Math.round(vals.reduce((a,b)=>a+b,0)/vals.length)}`);
}

// Gemme/flop: distribuzione potenziale
let gemme = 0, flop = 0;
for (let i = 0; i < 2000; i++) {
  const p = profiloProspetto({ carrieraId: 'car', stagione: '2026/27', club: clubPiccolo as never, indice: i });
  if (p.potenziale >= 85) gemme++;
  if (p.potenziale <= 74) flop++;
}
console.log(`gemme: ${gemme}/2000 (${gemme/20}%), flop: ${flop}/2000 (${flop/20}%)`);

// Rigenerati: nazionalità pesata
const naz = {};
for (let i = 0; i < 2000; i++) {
  const n = nazionalitaRegen(prng(i * 31));
  naz[n] = (naz[n] ?? 0) + 1;
}
const top5 = ['Brasile','Argentina','Francia','Spagna','Italia'];
let top5tot = 0; for (const n of top5) top5tot += naz[n] ?? 0;
console.log(`regen top5: ${top5tot/20}%`);

// Ritiri: distribuzione per età
for (const eta of [32, 33, 34, 35, 36, 37, 38, 40]) {
  let sì = 0;
  for (let i = 0; i < 2000; i++) if (ritiroDeciso({ eta, forma: 50, rand: prng(i * 7 + eta) })) sì++;
  console.log(`ritiro ${eta}a forma 50: ${(sì/20).toFixed(1)}%`);
}

// Crescita: giovane con minuti pieni, potenziale alto
let tot = 0; let svolte = 0; let crolli = 0;
for (let i = 0; i < 2000; i++) {
  const d = deltaCrescitaAnnuale({ eta: 17, minuti: 2000, overall: 60, potenziale: 88, soffittoReale: 85, formaMedia: 65, rand: prng(i * 13) });
  tot += d; if (d >= 5) svolte++; if (d <= 1) crolli++;
}
console.log(`crescita 17enne pieno minuti: media ${(tot/2000).toFixed(2)}/anno, svolte ${svolte/20}%, stagnazioni ${crolli/20}%`);
let totV = 0;
for (let i = 0; i < 2000; i++) {
  totV += deltaCrescitaAnnuale({ eta: 17, minuti: 0, overall: 60, potenziale: 88, soffittoReale: 85, formaMedia: 50, rand: prng(i * 17) });
}
console.log(`crescita 17enne 0 minuti: media ${(totV/2000).toFixed(2)}/anno`);
// Declino 34enne forma bassa
let totD = 0;
for (let i = 0; i < 2000; i++) {
  totD += deltaCrescitaAnnuale({ eta: 34, minuti: 1500, overall: 78, potenziale: 80, soffittoReale: 80, formaMedia: 35, rand: prng(i * 19) });
}
console.log(`declino 34enne forma 35: media ${(totD/2000).toFixed(2)}/anno`);
