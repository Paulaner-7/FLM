// Test rapido: genera attributi per ogni posizione e verifica overall target
const mod = await import('/Users/vittorio/Desktop/FLM/src/engine/attributi.ts');
const { generaAttributi, overallDaAttributi, applicaDeltaOverall } = mod;
const { prng } = await import('/Users/vittorio/Desktop/FLM/src/engine/random.ts');

const posizioni = ['GK','CB','LB','RB','DMF','CMF','LMF','RMF','AMF','LWF','RWF','SS','CF'];
let ok = true;
for (let pos = 0; pos <= 12; pos++) {
  for (const target of [55, 62, 68]) {
    for (let i = 0; i < 20; i++) {
      const rand = prng((pos * 1000 + target * 100 + i) >>> 0);
      const a = generaAttributi({ pos, eta: 16 + (i % 3), overallTarget: target, rand, creatoDaFlm: true });
      const calc = overallDaAttributi(a, pos);
      const diff = Math.abs(calc - target);
      if (diff > 2) { ok = false; console.log(`POS ${posizioni[pos]} target ${target} -> ${calc} (diff ${diff})`); }
    }
  }
}
console.log(ok ? 'TUTTI GLI OVERALL ENTRO ±2' : 'CI SONO SCARTI > 2');

// Test crescita: applica delta e verifica coerenza
const rand = prng(1234);
const a = generaAttributi({ pos: 12, eta: 17, overallTarget: 63, rand, creatoDaFlm: true });
for (const delta of [3, -2, 6]) {
  const b = applicaDeltaOverall(a, 12, delta, prng(99));
  console.log(`delta ${delta}: overall ${overallDaAttributi(a,12)} -> ${overallDaAttributi(b,12)}`);
}
// Verifica range skill e valori enum
let problemi = 0;
for (let i = 0; i < 500; i++) {
  const r = prng(i * 7);
  const p = generaAttributi({ pos: i % 13, eta: 16 + (i % 3), overallTarget: 60, rand: r, creatoDaFlm: true });
  if (p.PlayingStyle < 0 || p.PlayingStyle > 21) problemi++;
  if (p.Form < 1 || p.Form > 8) problemi++;
  if (p.CornerKicks < 1 || p.CornerKicks > 10) problemi++;
  if (p.FreeKicks < 1 || p.FreeKicks > 20) problemi++;
  if (p.PenaltyKick < 1 || p.PenaltyKick > 7) problemi++;
  if (p.Height < 150 || p.Height > 210) problemi++;
  if (p.Value2 !== 0) problemi++;
  if (p.POS !== (i % 13)) problemi++;
  if (p.GK !== (i % 13 === 0 ? 2 : 0)) problemi++;
}
console.log(problemi === 0 ? 'ENUM E VALORI OK' : `PROBLEMI: ${problemi}`);
