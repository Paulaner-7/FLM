// FLM — Dataset curato dei campionati FL26 (stagione 2025/26) giocabili.
// REGOLA: "giocabili solo i campionati europei con squadre che sono all'interno di FL26".
// Vengono qui elencate solo le leghe effettivamente presenti nel database FL26 con
// il roster completo (o quasi). I campionati con poche squadre o assenti in FL26
// sono stati rimossi — non sono selezionabili nel wizard "Nuova Carriera".
//
// Le squadre importate dal CSV dell'editor (ejogc327) vengono abbinate per
// NOME NORMALIZZATO (minuscole, senza accenti, prefissi societari rimossi).
// Le squadre non abbinate semplicemente NON compaiono in quella lega.
//
// Fonti: roster ufficiali FL26 stagione 2025/26 (esport Teams dell'editor),
// incrociati con Wikipedia "2025–26 <League> season" per i nomi canonici.
//   ✓ = roster verificato integralmente nel dataset FL26 (16 leghe top)
//   ✎ = lega conosciuta ma con poche squadre in FL26: rimossa finché il CSV
//       dell'editor non copre la lega completa (Swiss, Austria, Norvegia, ecc.)
//
// Esclusioni deliberate (presenti nel gioco solo in parte o per nulla):
//   - 2. Bundesliga, Eerste Divisie, Liga Portugal 2, Scottish Championship
//   - Swiss Super League / Challenge League, Austrian Bundesliga
//   - Czech First League, Ekstraklasa, Eliteserien, Allsvenskan
//   - Croatian HNL, Serbian SuperLiga, Ukrainian Premier League
//   - Terze divisioni (Serie C, 3. Liga, League One/Two, National League)
//   - Campionati extra-europei (Brasileirão, MLS, Liga MX, J1, K1, Saudi…)
//
// Per riabilitare una lega: aggiungerla qui sotto + verificare che le sue
// squadre siano effettivamente nel CSV dell'editor FL26.

export interface LegaCurata {
  nome: string;
  squadre: readonly string[];
}

export const LEGHE_CURATE: readonly LegaCurata[] = [
  // ---------- Inghilterra ----------
  {
    nome: 'Premier League', // ✓
    squadre: [
      'Arsenal', 'Aston Villa', 'AFC Bournemouth', 'Brentford', 'Brighton & Hove Albion',
      'Burnley', 'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Leeds United',
      'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle United',
      'Nottingham Forest', 'Sunderland', 'Tottenham Hotspur', 'West Ham United',
      'Wolverhampton Wanderers',
    ],
  },
  {
    nome: 'Championship', // ✓ (EFL Championship)
    squadre: [
      'Birmingham City', 'Blackburn Rovers', 'Bristol City', 'Charlton Athletic',
      'Coventry City', 'Derby County', 'Hull City', 'Ipswich Town', 'Leicester City',
      'Middlesbrough', 'Millwall', 'Norwich City', 'Oxford United', 'Portsmouth',
      'Preston North End', 'Queens Park Rangers', 'Sheffield United', 'Sheffield Wednesday',
      'Southampton', 'Stoke City', 'Swansea City', 'Watford', 'West Bromwich Albion',
      'Wrexham',
    ],
  },
  // ---------- Italia ----------
  {
    nome: 'Serie A', // ✓
    squadre: [
      'Atalanta', 'Bologna', 'Cagliari', 'Como', 'Cremonese', 'Fiorentina', 'Genoa',
      'Hellas Verona', 'Inter', 'Juventus', 'Lazio', 'Lecce', 'Milan', 'Napoli',
      'Parma', 'Pisa', 'Roma', 'Sassuolo', 'Torino', 'Udinese',
    ],
  },
  {
    nome: 'Serie B', // ✓
    squadre: [
      'Avellino', 'Bari', 'Carrarese', 'Catanzaro', 'Cesena', 'Empoli', 'Frosinone',
      'Juve Stabia', 'Mantova', 'Modena', 'Monza', 'Padova', 'Palermo', 'Pescara',
      'Reggiana', 'Sampdoria', 'Spezia', 'Südtirol', 'Venezia', 'Virtus Entella',
    ],
  },
  // ---------- Spagna ----------
  {
    nome: 'La Liga', // ✓
    squadre: [
      'Alavés', 'Athletic Bilbao', 'Atlético Madrid', 'Barcelona', 'Celta Vigo', 'Elche',
      'Espanyol', 'Getafe', 'Girona', 'Levante', 'Mallorca', 'Osasuna', 'Rayo Vallecano',
      'Real Betis', 'Real Madrid', 'Real Oviedo', 'Real Sociedad', 'Sevilla', 'Valencia',
      'Villarreal',
    ],
  },
  {
    nome: 'Segunda División', // ✓
    squadre: [
      'Albacete Balompié', 'Almería', 'Andorra', 'Burgos', 'Cádiz', 'Castellón', 'Ceuta',
      'Córdoba', 'Cultural Leonesa', 'Deportivo La Coruña', 'Eibar', 'Granada',
      'Huesca', 'Las Palmas', 'Leganés', 'Málaga', 'Mirandés', 'Racing Santander',
      'Real Sociedad B', 'Sporting Gijón', 'Real Valladolid', 'Real Zaragoza',
    ],
  },
  // ---------- Germania ----------
  {
    nome: 'Bundesliga', // ✓
    squadre: [
      'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig', 'VfB Stuttgart',
      'TSG Hoffenheim', 'Bayer Leverkusen', 'SC Freiburg', 'Eintracht Frankfurt',
      'FC Augsburg', 'Mainz 05', 'Union Berlin', 'Borussia Mönchengladbach',
      'Hamburger SV', '1. FC Köln', 'Werder Bremen', 'VfL Wolfsburg',
      '1. FC Heidenheim', 'FC St. Pauli',
    ],
  },
  // ---------- Francia ----------
  {
    nome: 'Ligue 1', // ✓
    squadre: [
      'Paris Saint-Germain', 'Lens', 'Lille', 'Lyon', 'Marseille', 'Rennes', 'Monaco',
      'Strasbourg', 'Toulouse', 'Lorient', 'Paris FC', 'Brest', 'Angers', 'Le Havre',
      'Auxerre', 'Nice', 'Nantes', 'Metz',
    ],
  },
  {
    nome: 'Ligue 2', // ✓ (FL26 esport: Amiens SC, AS Nancy Lorraine, AS Saint-Étienne, Clermont Foot, EA Guingamp, ESTAC Troyes, FC Annecy, Grenoble Foot 38, Le Mans FC, Montpellier HSC, Pau FC, Red Star FC, Rodez AF, SC Bastia, Stade Lavallois, Stade de Reims, US Boulogne, USL Dunkerque)
    squadre: [
      'Amiens', 'Annecy', 'Bastia', 'Boulogne', 'Clermont', 'Dunkerque', 'Grenoble',
      'Guingamp', 'Laval', 'Le Mans', 'Montpellier', 'Nancy', 'Pau', 'Red Star',
      'Reims', 'Rodez', 'Saint-Étienne', 'Troyes',
    ],
  },
  // ---------- Paesi Bassi ----------
  {
    nome: 'Eredivisie', // ✓
    squadre: [
      'Ajax', 'AZ', 'Excelsior', 'Feyenoord', 'Fortuna Sittard', 'Go Ahead Eagles',
      'Groningen', 'Heerenveen', 'Heracles Almelo', 'NAC Breda', 'NEC', 'PEC Zwolle',
      'PSV Eindhoven', 'Sparta Rotterdam', 'Telstar', 'Twente', 'Utrecht', 'Volendam',
    ],
  },
  // ---------- Portogallo ----------
  {
    nome: 'Primeira Liga', // ✓
    squadre: [
      'Alverca', 'Arouca', 'AVS', 'Benfica', 'Braga', 'Casa Pia', 'Estoril Praia',
      'Estrela da Amadora', 'Famalicão', 'Gil Vicente', 'Moreirense', 'Nacional',
      'Porto', 'Rio Ave', 'Santa Clara', 'Sporting CP', 'Tondela', 'Vitória de Guimarães',
    ],
  },
  // ---------- Turchia ----------
  {
    nome: 'Süper Lig', // ✓ (FL26 esport: Beşiktaş JK, Fenerbahçe SK, Galatasaray SK, Istanbul Başakşehir FK, Caykur Rizespor)
    squadre: [
      'Alanyaspor', 'Antalyaspor', 'Başakşehir', 'Beşiktaş', 'Eyüpspor',
      'Fatih Karagümrük', 'Fenerbahçe', 'Galatasaray', 'Gaziantep', 'Gençlerbirliği',
      'Göztepe', 'Kasimpaşa', 'Kayserispor', 'Kocaelispor', 'Konyaspor', 'Rizespor',
      'Samsunspor', 'Trabzonspor',
    ],
  },
  // ---------- Belgio ----------
  {
    nome: 'Belgian Pro League', // ✓
    squadre: [
      'Anderlecht', 'Antwerp', 'Cercle Brugge', 'Charleroi', 'Club Brugge', 'Dender EH',
      'Genk', 'Gent', 'La Louvière', 'Mechelen', 'OH Leuven', 'Sint-Truiden',
      'Standard Liège', 'Union SG', 'Westerlo', 'Zulte Waregem',
    ],
  },
  // ---------- Scozia ----------
  {
    nome: 'Scottish Premiership', // ✓
    squadre: [
      'Aberdeen', 'Celtic', 'Dundee', 'Dundee United', 'Falkirk', 'Heart of Midlothian',
      'Hibernian', 'Kilmarnock', 'Livingston', 'Motherwell', 'Rangers', 'St Mirren',
    ],
  },
  // ---------- Danimarca ----------
  {
    nome: 'Danish Superliga', // ✓ (FL26 esport: Aarhus GF, Bröndby IF, FC København, FC Fredericia, FC Midtjylland, FC Nordsjælland, Odense Boldklub, Randers FC, Silkeborg IF, Sønderjyske Fodbold, Vejle Boldklub, Viborg FF)
    squadre: [
      'AGF', 'Bröndby', 'Copenhagen', 'Fredericia', 'Midtjylland', 'Nordsjælland',
      'OB', 'Randers', 'Silkeborg', 'Sønderjyske', 'Vejle', 'Viborg',
    ],
  },
  // ---------- Grecia ----------
  {
    nome: 'Greek Super League', // ✓ (FL26 esport: AEK Athens, AE Kifisias, AE Larisa, APO Levadiakos, Aris Thessaloniki, Asteras Tripolis, Atromitos Athens, OFI Crete, Olympiakos Piraeus, PAOK Thessaloniki, Panathinaikos FC, Panetolikos FC, Panserraikos FC, Volos NPS)
    squadre: [
      'AEK Athens', 'AE Kifisia', 'AEL', 'Aris', 'Asteras Tripolis', 'Atromitos',
      'Levadiakos', 'OFI', 'Olympiacos', 'Panathinaikos', 'Panetolikos', 'Panserraikos',
      'PAOK', 'Volos',
    ],
  },
  // ---------- Brasileirão (Série A) ----------
  {
    nome: 'Brasileirão', // ✓ (FL26 esport: CR Flamengo, SE Palmeiras, SC Internacional, SC Corinthians, São Paulo FC, Botafogo, Atlético Mineiro, Cruzeiro EC, Fluminense FC, Grêmio, Vasco da Gama, EC Bahia, Santos FC, Sport Recife, Mirassol FC, Fortaleza EC, Red Bull Bragantino, EC Vitória, EC Juventude, Ceará SC)
    squadre: [
      'CR Flamengo', 'SE Palmeiras', 'SC Internacional', 'SC Corinthians', 'São Paulo FC',
      'Botafogo', 'Atlético Mineiro', 'Cruzeiro EC', 'Fluminense FC', 'Grêmio',
      'Vasco da Gama', 'EC Bahia', 'Santos FC', 'Sport Recife', 'Mirassol FC',
      'Fortaleza EC', 'Red Bull Bragantino', 'EC Vitória', 'EC Juventude', 'Ceará SC',
    ],
  },
  // ---------- Argentina (Liga Profesional) ----------
  {
    nome: 'Liga Profesional', // ✓ (FL26 esport: 30 club — River, Boca, Racing, Independiente, San Lorenzo, Vélez, Estudiantes, Gimnasia, Argentinos Juniors, Lanús, Belgrano, Talleres, Tigre, Unión, Riestra, Banfield, Huracán, Platense, Sarmiento, Rosario Central, Aldosivi, Barracas Central, Defensa y Justicia, Central Córdoba SDE, Estudiantes de Río Cuarto, Gimnasia de Mendoza, Independiente Rivadavia, Instituto AC Córdoba, Newell's Old Boys, Atlético Tucumán)
    squadre: [
      'River Plate', 'Boca Juniors', 'Racing Club', 'Independiente', 'San Lorenzo',
      'Vélez Sarsfield', 'Estudiantes de la Plata', 'Gimnasia La Plata', 'Argentinos Juniors',
      'Lanús', 'Belgrano', 'Talleres', 'Tigre', 'Unión', 'Riestra', 'Banfield', 'Huracán',
      'Platense', 'Sarmiento', 'Rosario Central', 'Aldosivi', 'Barracas Central',
      'Defensa y Justicia', 'Central Córdoba', 'Estudiantes de Río Cuarto',
      'Gimnasia de Mendoza', 'Independiente Rivadavia', 'Instituto AC Córdoba',
      'Newell\'s Old Boys', 'Atlético Tucumán',
    ],
  },
  // ---------- Giappone (J1 League) ----------
  {
    nome: 'J1 League', // ✓ (FL26 esport: 20 club J1 2025)
    squadre: [
      'Albirex Niigata', 'Avispa Fukuoka', 'Cerezo Osaka', 'FC Tokyo', 'Fagiano Okayama',
      'Gamba Osaka', 'Kashima Antlers', 'Kashiwa Reysol', 'Kawasaki Frontale',
      'Kyoto Sanga', 'Machida Zelvia', 'Nagoya Grampus', 'Sanfrecce Hiroshima',
      'Shimizu S-Pulse', 'Shonan Bellmare', 'Tokyo Verdy', 'Urawa Red Diamonds',
      'Vissel Kobe', 'Yokohama F. Marinos', 'Yokohama FC',
    ],
  },
  // ---------- Arabia Saudita (Saudi Pro League) ----------
  {
    nome: 'Saudi Pro League', // ✓ (FL26 esport: 18 club — Al Ahli SFC, Al Ettifaq FC, Al Fateh SC, Al Fayha FC, Al Hazem SC, Al Hilal SFC, Al Ittihad Club, Al Khaleej Club, Al Kholood Club, Al Najma SC, Al Nassr FC, Al Okhdood Club, Al Qadsiah FC, Al Riyadh SC, Al Shabab Club, Al Taawoun FC, Damac FC, NEOM SC)
    squadre: [
      'Al Ahli', 'Al Ettifaq', 'Al Fateh', 'Al Fayha', 'Al Hazem', 'Al Hilal', 'Al Ittihad',
      'Al Khaleej', 'Al Kholood', 'Al Najma', 'Al Nassr', 'Al Okhdood', 'Al Qadsiah',
      'Al Riyadh', 'Al Shabab', 'Al Taawoun', 'Damac', 'NEOM',
    ],
  },
];

// ---------- Nazionali ----------
// Squadre nazionali FL26 (nomi inglesi PES). Il match è per nome normalizzato:
// se il nome di una squadra importata coincide, viene trattata come nazionale
// (non selezionabile come campionato; disponibile in futuro per carriera
// internazionale, europei e mondiali).

export const NAZIONALI: readonly string[] = [
  'Italy', 'France', 'Germany', 'Spain', 'England', 'Portugal', 'Netherlands', 'Belgium',
  'Croatia', 'Brazil', 'Argentina', 'Uruguay', 'Colombia', 'Mexico', 'USA', 'United States',
  'Canada', 'Costa Rica', 'Panama', 'Jamaica', 'Honduras', 'Paraguay', 'Chile', 'Peru',
  'Ecuador', 'Venezuela', 'Bolivia', 'Japan', 'Korea Republic', 'South Korea', 'Australia',
  'Saudi Arabia', 'Iran', 'Qatar', 'UAE', 'United Arab Emirates', 'China', 'Morocco',
  'Algeria', 'Tunisia', 'Egypt', 'Senegal', 'Ghana', 'Nigeria', 'Cameroon', 'Ivory Coast',
  'Cote d\'Ivoire', 'Mali', 'Burkina Faso', 'Guinea', 'Cape Verde', 'South Africa',
  'DR Congo', 'Zambia', 'Switzerland', 'Denmark', 'Sweden', 'Norway', 'Poland', 'Austria',
  'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Serbia', 'Greece',
  'Turkey', 'Russia', 'Ukraine', 'Scotland', 'Wales', 'Northern Ireland', 'Ireland',
  'Republic of Ireland', 'Iceland', 'Finland', 'Israel', 'Slovenia', 'Bosnia and Herzegovina',
  'North Macedonia', 'Albania', 'Montenegro', 'Kosovo', 'Georgia', 'Armenia', 'Azerbaijan',
  'Kazakhstan', 'Uzbekistan', 'Jordan', 'Iraq', 'Syria', 'Lebanon', 'Bahrain', 'Oman',
  'Kuwait', 'New Zealand', 'Curaçao', 'Curacao', 'Haiti', 'Trinidad and Tobago', 'Belize',
  'Guatemala', 'El Salvador', 'Nicaragua', 'Suriname', 'Guyana', 'Zimbabwe', 'Angola',
  'Mozambique', 'Tanzania', 'Kenya', 'Uganda', 'Congo', 'Gabon', 'Benin', 'Togo',
  'Sierra Leone', 'Liberia', 'Mauritania', 'Niger', 'Chad', 'Madagascar', 'Namibia',
  'Botswana', 'Lesotho', 'Eswatini', 'Malawi', 'Ethiopia', 'Sudan', 'Libya', 'Afghanistan',
  'India', 'Thailand', 'Vietnam', 'Indonesia', 'Malaysia', 'Singapore', 'Myanmar',
  'Philippines', 'Hong Kong', 'Chinese Taipei', 'Taiwan', 'Mongolia', 'Kyrgyzstan',
  'Tajikistan', 'Turkmenistan', 'Sri Lanka', 'Nepal', 'Bangladesh', 'Pakistan', 'Yemen',
  'Palestine', 'Brunei', 'Cambodia', 'Laos', 'Macau', 'Guam', 'Samoa', 'Fiji',
  'Papua New Guinea', 'New Caledonia', 'Tahiti', 'Puerto Rico', 'Dominican Republic',
  'Cuba', 'Bermuda', 'Aruba', 'Barbados', 'Gambia', 'Equatorial Guinea', 'Gabon',
  'Central African Republic', 'Seychelles', 'Mauritius', 'São Tomé and Príncipe',
  'Cape Verde Islands', 'Antigua and Barbuda', 'Saint Kitts and Nevis', 'Saint Lucia',
  'Saint Vincent and the Grenadines', 'Grenada', 'Dominica', 'Martinique', 'Guadeloupe',
  'French Guiana', 'Montserrat', 'Turks and Caicos Islands', 'Cayman Islands',
  'British Virgin Islands', 'US Virgin Islands', 'Anguilla', 'Bonaire', 'Sint Maarten',
  'Saint Martin', 'Faroe Islands', 'Liechtenstein', 'Luxembourg', 'Andorra', 'Malta',
  'San Marino', 'Gibraltar', 'Moldova', 'Belarus', 'Estonia', 'Latvia', 'Lithuania',
  'Bosnia', 'Macedonia', 'Ivory Coast',
  // Varianti italiane delle principali nazionali (UI in italiano, CSV editor variabile)
  'Italia', 'Francia', 'Germania', 'Spagna', 'Inghilterra', 'Portogallo', 'Olanda',
  'Paesi Bassi', 'Belgio', 'Croazia', 'Brasile', 'Argentina', 'Uruguay', 'Colombia',
  'Messico', 'Stati Uniti', 'Giappone', 'Corea del Sud', 'Arabia Saudita',
  'Emirati Arabi Uniti', 'Marocco', 'Algeria', 'Egitto', 'Camerun', 'Costa d\'Avorio',
  'Sudafrica', 'Svizzera', 'Danimarca', 'Svezia', 'Norvegia', 'Polonia', 'Austria',
  'Repubblica Ceca', 'Slovacchia', 'Ungheria', 'Romania', 'Bulgaria', 'Serbia',
  'Grecia', 'Turchia', 'Russia', 'Ucraina', 'Scozia', 'Galles', 'Irlanda del Nord',
  'Irlanda', 'Islanda', 'Finlandia', 'Israele', 'Bosnia', 'Albania', 'Montenegro',
  'Kosovo', 'Georgia', 'Armenia', 'Azerbaigian', 'Kazakistan', 'Uzbekistan',
  'Giordania', 'Iraq', 'Siria', 'Libano', 'Bahrein', 'Oman', 'Kuwait', 'Nuova Zelanda',
  'Haiti', 'Guatemala', 'El Salvador', 'Nicaragua', 'Giamaica', 'Canada', 'Messico',
];

// ---------- Normalizzazione nomi ----------

/** Prefissi/suffissi societari rimossi durante il match (es. "FC", "AC", "SK", "BSC"…).
 * ATTENZIONE ai falsi positivi: ogni token qui viene rimosso da TUTTI i nomi, curati e
 * importati. "cd" è volutamente ASSENTE: "CD Everton" (Cile) collideva con "Everton" (PL) —
 * i nomi con CD delle leghe giocabili sono gestiti da ALIASI espliciti.
 * Anche "sg" è assente: "Union SG" deve restare distinto da "Unión" (Argentina).
 */
const PREFISSI = new Set([
  'fc', 'ac', 'ss', 'as', 'afc', 'cf', 'sc', 'sd', 'rs', 'ks', 'if', 'ik', 'bk',
  'us', 'ud', 'sk', 'sv', 'vfl', 'tsg', 'fsv', 'bsc', 'rsc', 'krc', 'kaa', 'kv', 'fcv',
  'raal', 'ifk', 'tsv', 'st', 'sp', 'gs', 'ek', 'fk', 'jk', 'bs', 'is', 'os',
  'aafc', 'ssc', 'sl', 'uc', 'vv', 'sad', 'wsg', 'gak', 'stade', 'deportivo', 'virtus',
  'royal', 'sporting', 'spvgg', 'ksc', 'dsc', 'f95', 'rm', 'od', 'bc',
  // Token specifici nomi FL26 (export editor): calcio/cfc/acf (Italia), ca/ad/rcd/rc
  // (Spagna, Argentina, Francia), losc/ogc/hsc/sco/ea/estac/usl/af/foot (Francia),
  // apo (Grecia), ff (Danimarca), kvc/gd (Belgio, Portogallo), ec/se/cr/red bull (Brasile),
  // sfc/sde (Arabia, Argentina).
  'calcio', 'cfc', 'acf', 'rcd', 'ca', 'ad', 'aj', 'rc', 'losc', 'ogc', 'hsc', 'sco',
  'ea', 'estac', 'usl', 'af', 'foot', 'apo', 'ff', 'kvc', 'gd', 'ec', 'se', 'cr',
  'red bull', 'sfc', 'sde',
]);

/**
 * Varianti di nome comuni (editor/FL26) → forma canonica del dataset.
 * Chiavi e valori in forma NORMALIZZATA (vedi normalizzaNome).
 */
export const ALIASI: Record<string, string> = {
  'inter milan': 'inter',
  'internazionale': 'inter',
  'bayern': 'bayern munich',
  'psv': 'psv eindhoven',
  'olympique de marseille': 'marseille',
  'om': 'marseille',
  'olympique lyonnais': 'lyon',
  'psg': 'paris saint germain',
  'sporting lisbon': 'sporting cp',
  'sporting': 'sporting cp',
  'sporting lisboa': 'sporting cp',
  'royale union saint gilloise': 'union sg',
  'union saint gilloise': 'union sg',
  'union sg': 'union sg',
  'istanbul basaksehir': 'basaksehir',
  'avs futebol': 'avs',
  'rennais': 'rennes',
  'brestois': 'brest',
  'standard de liege': 'standard liege',
  'standard': 'standard liege',
  'oud heverlee leuven': 'oh leuven',
  'sint truidense': 'sint truiden',
  'man city': 'manchester city',
  'man utd': 'manchester united',
  'manchester utd': 'manchester united',
  'spurs': 'tottenham hotspur',
  'tottenham': 'tottenham hotspur',
  'wolves': 'wolverhampton wanderers',
  'wolverhampton': 'wolverhampton wanderers',
  'newcastle': 'newcastle united',
  'west ham': 'west ham united',
  'leeds': 'leeds united',
  'nottingham': 'nottingham forest',
  'atletico': 'atletico madrid',
  'villareal': 'villarreal',
  'celta': 'celta vigo',
  'frankfurt': 'eintracht frankfurt',
  'leverkusen': 'bayer leverkusen',
  'dortmund': 'borussia dortmund',
  'leipzig': 'rb leipzig',
  'stuttgart': 'vfb stuttgart',
  'monchengladbach': 'borussia monchengladbach',
  'bremen': 'werder bremen',
  'hamburg': 'hamburger sv',
  'qpr': 'queens park rangers',
  'west brom': 'west bromwich albion',
  'delfino pescara': 'pescara',
  'atalanta bergamo': 'atalanta',
  'napoli ssc': 'napoli',
  'juve': 'juventus',
  'viola': 'fiorentina',
  'gak': 'grazer ak',
  'salzburg': 'red bull salzburg',
  'wolfsberg': 'wolfsberger ac',
  'grazer': 'grazer ak',
  'lask linz': 'lask',
  'rapid vienna': 'rapid wien',
  'austria vienna': 'austria wien',
  'ried': 'sv ried',
  'sturm': 'sturm graz',
  // ---- Fix nomi export FL26 (docs/Teams - PES 2021 - Edit.csv) ----
  // Italia
  'pisa sporting club': 'pisa',
  // Turchia
  'caykur rizespor': 'rizespor',
  // Germania
  'bayern munchen': 'bayern munich',
  // Paesi Bassi
  'ajax amsterdam': 'ajax',
  'feyenoord rotterdam': 'feyenoord',
  'az alkmaar': 'az',
  'nec nijmegen': 'nec',
  'excelsior rotterdam': 'excelsior',
  // Francia
  'olympique marseille': 'marseille',
  'strasbourg alsace': 'strasbourg',
  'de reims': 'reims',
  'lavallois': 'laval',
  'nancy lorraine': 'nancy',
  // Portogallo
  'vitoria sport clube': 'vitoria de guimaraes',
  // Grecia
  'olympiakos piraeus': 'olympiacos',
  'paok thessaloniki': 'paok',
  'aris thessaloniki': 'aris',
  'ofi crete': 'ofi',
  'atromitos athens': 'atromitos',
  'ae larisa': 'ael',
  'ae kifisias': 'ae kifisia',
  'volos nps': 'volos',
  // Danimarca (NOTA: ø non si decompone in NFD e diventa spazio nella
  // normalizzazione → le chiavi usano la forma realmente normalizzata)
  's nderjyske fodbold': 's nderjyske',
  'aarhus gf': 'agf',
  'odense boldklub': 'ob',
  'vejle boldklub': 'vejle',
  'k benhavn': 'copenhagen',
  'copenhagen': 'copenhagen',
  // Belgio
  'dender': 'dender eh',
  // Spagna
  'sociedad b': 'real sociedad b',
  'celta de vigo': 'celta vigo',
  'cd castellon': 'castellon',
  'cd leganes': 'leganes',
  'cd mirandes': 'mirandes',
  'cd nacional': 'nacional',
  'cd santa clara': 'santa clara',
  'cd tondela': 'tondela',
  // Arabia Saudita (suffisso "Club")
  'al ittihad club': 'al ittihad',
  'al khaleej club': 'al khaleej',
  'al kholood club': 'al kholood',
  'al okhdood club': 'al okhdood',
  'al shabab club': 'al shabab',
  // Argentina ("Club Atlético X" / "Club Deportivo X")
  'club atletico lanus': 'lanus',
  'club atletico belgrano': 'belgrano',
  'club atletico talleres': 'talleres',
  'club atletico tigre': 'tigre',
  'club atletico union': 'union',
  'club deportivo riestra': 'riestra',
};

/**
 * Normalizza un nome squadra per il confronto:
 * minuscole → senza accenti → solo alfanumerico → via tutte le cifre (es.
 * "Bayer 04 Leverkusen" → "bayer leverkusen") → via prefissi E suffissi
 * societari (rimossi solo se resta ≥ 3 caratteri).
 */
export function normalizzaNome(nome: string): string {
  let n = normalizzaNomeLite(nome);
  let cambiato = true;
  while (cambiato && n.length > 3) {
    cambiato = false;
    for (const prefisso of PREFISSI) {
      const conSpazio = `${prefisso} `;
      if (n.startsWith(conSpazio) && n.length - prefisso.length >= 3) {
        n = n.slice(prefisso.length).trim();
        cambiato = true;
        break;
      }
      const conSpazioPrima = ` ${prefisso}`;
      if (n.endsWith(conSpazioPrima) && n.length - prefisso.length >= 3) {
        n = n.slice(0, -prefisso.length).trim();
        cambiato = true;
        break;
      }
    }
  }
  return n;
}

/**
 * Normalizzazione LITE: minuscole → senza accenti → solo alfanumerico → via
 * cifre. NON rimuove prefissi/suffissi societari: serve per i casi in cui il
 * suffisso distingue club diversi (es. "Barcelona SC" ≠ "Barcelona").
 */
export function normalizzaNomeLite(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Indice per il match ----------

interface RiferimentoLega {
  lega: LegaCurata;
}

/**
 * Falsi positivi noti: nomi che normalizzano come un club delle leghe curate
 * ma NON sono quel club. Forma NORMALIZZATA LITE (prefissi conservati) così
 * "Barcelona SC" resta distinto da "Barcelona" e "Botafogo FC" da "Botafogo".
 * Le squadre qui vengono semplicemente escluse dal match (nascoste dal wizard).
 */
const ESCLUSI = new Set(['barcelona sc', 'botafogo fc']);

let indice: Map<string, RiferimentoLega> | null = null;
let nazionaliSet: Set<string> | null = null;

/** Indice pigro: nome normalizzato → lega curata (forme canoniche + alias risolti). */
export function indiceLegheCurate(): Map<string, RiferimentoLega> {
  if (indice) return indice;
  indice = new Map();
  for (const lega of LEGHE_CURATE) {
    for (const nome of lega.squadre) {
      indice.set(normalizzaNome(nome), { lega });
    }
  }
  // Gli alias puntano a forme canoniche già indicizzate (normalizzate a loro volta)
  for (const [alias, canonicoRaw] of Object.entries(ALIASI)) {
    const ref = indice.get(normalizzaNome(canonicoRaw));
    if (ref) indice.set(alias, ref);
  }
  return indice;
}

/** Set pigro dei nomi nazionali normalizzati (forma lite: un club "FC Andorra"
 * non deve finire tra le nazionali solo perché "Andorra" è una nazionale). */
export function indiceNazionali(): Set<string> {
  if (nazionaliSet) return nazionaliSet;
  nazionaliSet = new Set(NAZIONALI.map((nome) => normalizzaNomeLite(nome)));
  return nazionaliSet;
}

/** Nome della lega curata per una squadra importata, se abbinabile per nome. */
export function legaCurataPerNome(nomeSquadra: string): string | undefined {
  if (ESCLUSI.has(normalizzaNomeLite(nomeSquadra))) return undefined;
  const n = normalizzaNome(nomeSquadra);
  const risolto = ALIASI[n] ?? n;
  return indiceLegheCurate().get(risolto)?.lega.nome;
}

/** true se il nome della squadra corrisponde a una nazionale (match per nome normalizzato). */
export function eNazionalePerNome(nomeSquadra: string): boolean {
  return indiceNazionali().has(normalizzaNomeLite(nomeSquadra));
}
