// FLM — Partecipanti reali dei playoff di qualificazione 2026/27 (input sostituzione FL26).
//
// FONTE (verifica web, agosto 2026): en.wikipedia.org/wiki/2026–27_UEFA_Champions_League,
// .../2026–27_UEFA_Europa_League, .../2026–27_UEFA_Conference_League (sezioni Play-off round).
// Decisione utente: solo l'ULTIMO turno di qualificazione per le tre coppe;
// i club reali assenti da FL26 vengono sostituiti con club FL26 giocabili
// (nazione prima, forza poi — vedi engine/competizioni/sostituzione.ts).

export interface ClubPlayoffReale {
  nome: string;
  /** Nazione UEFA (chiave COEFFICIENTI_ASSOCIAZIONE_2026_27 quando possibile) */
  nazione: string;
}

export interface PlayoffReali {
  champions: { ch: ClubPlayoffReale[]; lp: ClubPlayoffReale[] };
  europa: { cp: ClubPlayoffReale[]; mp: ClubPlayoffReale[] };
  conference: { ch: ClubPlayoffReale[]; mp: ClubPlayoffReale[] };
}

/** Accoppiamenti reali del playoff UCL 2026/27 (CH e LP). */
export const PLAYOFF_UCL_2026_27: { ch: ClubPlayoffReale[]; lp: ClubPlayoffReale[] } = {
  ch: [
    { nome: 'Levski Sofia', nazione: 'Bulgaria' },
    { nome: 'AEK Athens', nazione: 'Grecia' },
    { nome: 'Celtic', nazione: 'Scozia' },
    { nome: 'LASK', nazione: 'Austria' },
    { nome: 'Dinamo Zagreb', nazione: 'Croazia' },
    { nome: 'Viking', nazione: 'Norvegia' },
    { nome: 'Slovan Bratislava', nazione: 'Slovacchia' },
    { nome: 'Celje', nazione: 'Slovenia' },
    { nome: "Hapoel Be'er Sheva", nazione: 'Israele' },
    { nome: 'Sabah', nazione: 'Azerbaijan' },
  ],
  lp: [
    { nome: 'Fenerbahçe', nazione: 'Turchia' },
    { nome: 'Lyon', nazione: 'Francia' },
    { nome: 'NEC', nazione: 'Paesi Bassi' },
    { nome: 'Bodø/Glimt', nazione: 'Norvegia' },
  ],
};

/** Accoppiamenti reali del playoff UEL 2026/27. */
export const PLAYOFF_UEL_2026_27: { cp: ClubPlayoffReale[]; mp: ClubPlayoffReale[] } = {
  // I perdenti del Q3 Champions Path UCL entrano qui; le coppie reali sono tra
  // vincitrici Q3 e perdenti CH Q3. Per il motore semplificato usiamo i nomi
  // delle squadre in corsa (vincitrici Q3 MP + perdenti CH Q3).
  cp: [
    { nome: 'Lech Poznań', nazione: 'Polonia' },
    { nome: 'KÍ', nazione: 'Fær Øer' },
    { nome: 'Thun', nazione: 'Svizzera' },
  ],
  mp: [
    { nome: 'Trabzonspor', nazione: 'Turchia' },
    { nome: 'Ferencváros', nazione: 'Ungheria' },
    { nome: 'Universitatea Craiova', nazione: 'Romania' },
    { nome: 'Ararat-Armenia', nazione: 'Armenia' },
    { nome: 'Sint-Truiden', nazione: 'Belgio' },
    { nome: 'Omonia', nazione: 'Cipro' },
    { nome: 'Red Star Belgrade', nazione: 'Serbia' },
    { nome: 'Viktoria Plzeň', nazione: 'Repubblica Ceca' },
    { nome: 'Egnatia', nazione: 'Albania' },
    { nome: 'Lillestrøm', nazione: 'Norvegia' },
    { nome: 'Jagiellonia Białystok', nazione: 'Polonia' },
    { nome: 'Iberia 1999', nazione: 'Georgia' },
    { nome: 'Mjällby AIF', nazione: 'Svezia' },
    { nome: 'Red Bull Salzburg', nazione: 'Austria' },
    { nome: 'Kairat', nazione: 'Kazakistan' },
    { nome: 'Anderlecht', nazione: 'Belgio' },
    { nome: 'Beşiktaş', nazione: 'Turchia' },
    { nome: 'Kauno Žalgiris', nazione: 'Lituania' },
    { nome: 'Benfica', nazione: 'Portogallo' },
    { nome: 'AGF', nazione: 'Danimarca' },
    { nome: 'OFI', nazione: 'Grecia' },
    { nome: 'CSKA Sofia', nazione: 'Bulgaria' },
  ],
};

/** Accoppiamenti reali del playoff UECL 2026/27. */
export const PLAYOFF_UECL_2026_27: { ch: ClubPlayoffReale[]; mp: ClubPlayoffReale[] } = {
  ch: [
    { nome: 'Víkingur Reykjavík', nazione: 'Islanda' },
    { nome: 'Borac Banja Luka', nazione: 'Bosnia' },
    { nome: 'Shamrock Rovers', nazione: 'Irlanda' },
    { nome: 'KuPS', nazione: 'Finlandia' },
    { nome: 'Drita', nazione: 'Kosovo' },
    { nome: "Inter Club d'Escaldes", nazione: 'Andorra' },
    { nome: 'Riga', nazione: 'Lettonia' },
    { nome: 'Lincoln Red Imps', nazione: 'Gibilterra' },
    { nome: 'Larne', nazione: 'Irlanda del Nord' },
  ],
  mp: [
    { nome: 'Motherwell', nazione: 'Scozia' },
    { nome: 'SC Freiburg', nazione: 'Germania' },
    { nome: 'Górnik Zabrze', nazione: 'Polonia' },
    { nome: 'Monaco', nazione: 'Francia' },
    { nome: 'Inter Turku', nazione: 'Finlandia' },
    { nome: 'Copenhagen', nazione: 'Danimarca' },
    { nome: 'Heart of Midlothian', nazione: 'Scozia' },
    { nome: 'Rapid Wien', nazione: 'Austria' },
    { nome: 'Tromsø', nazione: 'Norvegia' },
    { nome: 'Brighton & Hove Albion', nazione: 'Inghilterra' },
    { nome: 'Hajduk Split', nazione: 'Croazia' },
    { nome: 'Raków Częstochowa', nazione: 'Polonia' },
    { nome: 'Panathinaikos', nazione: 'Grecia' },
    { nome: 'Hradec Králové', nazione: 'Repubblica Ceca' },
    { nome: 'Gent', nazione: 'Belgio' },
    { nome: 'Hibernian', nazione: 'Scozia' },
    { nome: 'PAOK', nazione: 'Grecia' },
    { nome: 'Brann', nazione: 'Norvegia' },
    { nome: 'Atalanta', nazione: 'Italia' },
    { nome: 'Hapoel Tel Aviv', nazione: 'Israele' },
    { nome: 'Midtjylland', nazione: 'Danimarca' },
    { nome: 'Rijeka', nazione: 'Croazia' },
    { nome: 'Rangers', nazione: 'Scozia' },
    { nome: 'Jablonec', nazione: 'Repubblica Ceca' },
    { nome: 'Nordsjælland', nazione: 'Danimarca' },
    { nome: 'St. Gallen', nazione: 'Svizzera' },
    { nome: 'Dinamo City', nazione: 'Albania' },
    { nome: 'Pafos', nazione: 'Cipro' },
    { nome: 'Sion', nazione: 'Svizzera' },
    { nome: 'Ajax', nazione: 'Paesi Bassi' },
    { nome: 'Braga', nazione: 'Portogallo' },
    { nome: 'Austria Wien', nazione: 'Austria' },
    { nome: 'Twente', nazione: 'Paesi Bassi' },
    { nome: 'Qarabağ', nazione: 'Azerbaijan' },
    { nome: 'Getafe', nazione: 'Spagna' },
    { nome: 'Partizan', nazione: 'Serbia' },
    { nome: 'Lugano', nazione: 'Svizzera' },
    { nome: 'Maccabi Tel Aviv', nazione: 'Israele' },
  ],
};
