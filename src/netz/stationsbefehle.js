// ZWECK: Befehls-Schema der vier Posten der Gefechtszentrale (R23, E5) — die Koop-Grundlage: jeder Posten schickt nur
//        reine, serialisierbare Daten { station, art, ... }; später gehen genau diese Objekte (JSON) über das Netz zum
//        Host, der sie prüft und in die Simulation (src/sim/zentrale.js) gibt.
// LIEFERT: STATIONEN (Namen + Anzeige) · BEFEHLE (Schema je Station und Art) · FAHRTSTUFEN · ALARMSTUFEN · BEREICHE ·
//          ANWEISUNGEN · ENERGIE_SUMME · HOEHE_MAX · ANSAGE_MAX · pruefeBefehl(b) → { ok, befehl (bereinigte Kopie) | grund }
// FESTLEGUNGEN (Winkel, alles rad):
//   navigator kurs { peilung, hoehe } = WELTKURS. peilung: 0 = Welt +Z (Startrichtung des Schiffs), im Uhrzeigersinn auf
//            dem Lageschirm (Draufsicht, oben = +Z, rechts = −X): π/2 = Welt −X. Formel: peilung = atan2(−dx, dz).
//            hoehe = Steigwinkel gegen die Welt-XZ-Ebene (+ = nach oben, Welt +Y), |hoehe| ≤ HOEHE_MAX.
//            WARUM Welt und nicht Schiffsrahmen: ein Kurs muss stehen bleiben, während das Schiff dreht (sonst „jagt“ der
//            Autopilot seinem eigenen Bug hinterher) — und zwei Spieler sehen denselben Kurs, egal wann sie ihn lesen.
//   navigator fahrt { stufe } (ganze Zahl −1..3, FAHRTSTUFEN) · kursAus {} · stopp {}
//   waffen    feuer { frei: bool } · modus { modus: 'sperrfeuer'|'zielfeuer' } · munition { munition: 'auto'|'flak'|'panzer' }
//             zielVorgabe { zielId: ganze Zahl > 0 | null }
//   technik   trupp { nr: 1..3, bereich: BEREICHE-id | null } · energie { antrieb, waffen, reparatur } (ganze Zahlen ≥ 0,
//             Summe genau ENERGIE_SUMME — WARUM fest: Energie ist knapp, mehr für A heißt weniger für B)
//   kapitaen  alarm { stufe: 'gruen'|'gelb'|'rot' } · ansage { text (1..ANSAGE_MAX Zeichen, ohne Steuerzeichen) }
//             anweisung { code: ANWEISUNGEN-Schlüssel } (Schnellbefehl an die Posten, Kapitän hat Befehlsgewalt)
//   Optional in jedem Befehl: takt (ganze Zahl ≥ 0, Schrittnummer für das Netz — heute nur mitgeführt), von (Spieler-
//   Kennung, Zeichenkette ≤ 24) — WARUM schon jetzt erlaubt: der Host soll Befehle später ohne Schemawechsel annehmen.
// REGEL: kein DOM, kein Zufall; Prüfung weist alles ab, was nicht exakt passt (unbekannte Felder, falsche Typen, NaN).
//        Die bereinigte Kopie enthält NUR die bekannten Felder — WARUM Kopie: der Absender darf sein Objekt danach
//        weiterverwenden, und ein Netz-Befehl trägt keine fremden Felder in die Simulation.

export const STATIONEN = {
  navigator: 'Navigator',
  waffen: 'Waffen & Sensorik',
  technik: 'Crew & Mechanik',
  kapitaen: 'Kapitän',
};

/** Fahrtstufen: Hebel-Sollwert (vor hebelMax). WARUM ganze Stufen: eindeutig per Zuruf/Netz, keine Zitterwerte. */
export const FAHRTSTUFEN = [
  { stufe: -1, name: 'Zurück', hebel: -0.25 },
  { stufe: 0, name: 'Halt', hebel: 0 },
  { stufe: 1, name: 'Langsam', hebel: 0.33 },
  { stufe: 2, name: 'Halbe', hebel: 0.66 },
  { stufe: 3, name: 'Volle', hebel: 1 },
];

export const ALARMSTUFEN = ['gruen', 'gelb', 'rot'];

/** Schadensbereiche (Reihenfolge = Anzeige im Schiffsschema, Bug zuerst). */
export const BEREICHE = [
  { id: 'bug', name: 'Bug / Sensorik' },
  { id: 'mitte', name: 'Mittschiffs / Reaktor' },
  { id: 'heck', name: 'Heck / Steuerung' },
  { id: 'antrieb', name: 'Antrieb' },
  { id: 'waffenOben', name: 'Batterie oben' },
  { id: 'waffenUnten', name: 'Batterie unten' },
];
const BEREICH_IDS = new Set(BEREICHE.map((b) => b.id));

/** Schnellbefehle des Kapitäns (Code → Text im Protokoll; die Wirkung steht in zentrale.js). */
export const ANWEISUNGEN = {
  gefechtsstationen: 'Alle Mann auf Gefechtsstation',
  feuerHalt: 'Feuer einstellen',
  feuerFrei: 'Feuer frei',
  schadenskontrolle: 'Schadenskontrolle: Trupps an die schwersten Schäden',
  energieWaffen: 'Energie auf die Waffen',
  energieAntrieb: 'Energie auf den Antrieb',
  energieAusgleich: 'Energie ausgleichen',
  kursHalten: 'Navigator: Ruder frei, Autopilot aus',
  volleFahrt: 'Navigator: Volle Fahrt voraus',
};

export const ENERGIE_SUMME = 100;
export const HOEHE_MAX = 1.05;  // rad ≈ 60° — WARUM: steiler wird die Rollrichtung (Welt-oben) unbestimmt
export const ANSAGE_MAX = 80;   // Zeichen — passt in eine Zeile des Protokolls
export const TRUPPS = 3;

const ganz = (x) => Number.isInteger(x);
const zahl = (x) => typeof x === 'number' && Number.isFinite(x);
const STEUERZEICHEN = /[\u0000-\u001f\u007f]/;

/**
 * Schema: je Station → Art → { felder: { name: prüfer(wert) → bool }, pflicht?: true (Standard) }.
 * Ein Prüfer bekommt den Wert und den ganzen Befehl (für Summenprüfungen).
 */
export const BEFEHLE = {
  navigator: {
    kurs: { peilung: zahl, hoehe: (h) => zahl(h) && Math.abs(h) <= HOEHE_MAX },
    fahrt: { stufe: (s) => ganz(s) && s >= -1 && s <= 3 },
    kursAus: {},
    stopp: {},
  },
  waffen: {
    feuer: { frei: (f) => typeof f === 'boolean' },
    modus: { modus: (m) => m === 'sperrfeuer' || m === 'zielfeuer' },
    munition: { munition: (m) => m === 'auto' || m === 'flak' || m === 'panzer' },
    zielVorgabe: { zielId: (z) => z === null || (ganz(z) && z > 0) },
  },
  technik: {
    trupp: { nr: (n) => ganz(n) && n >= 1 && n <= TRUPPS, bereich: (b) => b === null || BEREICH_IDS.has(b) },
    energie: {
      antrieb: (x) => ganz(x) && x >= 0,
      waffen: (x) => ganz(x) && x >= 0,
      reparatur: (x, b) => ganz(x) && x >= 0 && b.antrieb + b.waffen + x === ENERGIE_SUMME,
    },
  },
  kapitaen: {
    alarm: { stufe: (s) => ALARMSTUFEN.includes(s) },
    ansage: { text: (t) => typeof t === 'string' && t.trim().length > 0 && t.length <= ANSAGE_MAX && !STEUERZEICHEN.test(t) },
    anweisung: { code: (c) => typeof c === 'string' && Object.hasOwn(ANWEISUNGEN, c) },
  },
};

const RAHMEN = new Set(['station', 'art', 'takt', 'von']);

/**
 * Prüft einen Stationsbefehl. → { ok: true, befehl } (bereinigte Kopie) oder { ok: false, grund } (deutscher Kurztext).
 * WARUM so streng (auch unbekannte Felder): über das Netz kommt alles Mögliche; was hier durchgeht, rechnet der Host.
 */
export function pruefeBefehl(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, grund: 'kein Befehlsobjekt' };
  const st = BEFEHLE[b.station];
  if (!st || !Object.hasOwn(BEFEHLE, b.station)) return { ok: false, grund: 'unbekannte Station „' + b.station + '“' };
  const schema = Object.hasOwn(st, b.art) ? st[b.art] : null;
  if (!schema) return { ok: false, grund: 'Station ' + b.station + ' kennt den Befehl „' + b.art + '“ nicht' };
  if (b.takt !== undefined && !(ganz(b.takt) && b.takt >= 0)) return { ok: false, grund: 'takt ungültig' };
  if (b.von !== undefined && !(typeof b.von === 'string' && b.von.length <= 24)) return { ok: false, grund: 'von ungültig' };
  for (const k of Object.keys(b)) if (!RAHMEN.has(k) && !Object.hasOwn(schema, k)) return { ok: false, grund: 'unbekanntes Feld „' + k + '“' };
  const aus = { station: b.station, art: b.art };
  for (const [feld, pruefer] of Object.entries(schema)) {
    if (!Object.hasOwn(b, feld)) return { ok: false, grund: 'Feld „' + feld + '“ fehlt' };
    if (!pruefer(b[feld], b)) return { ok: false, grund: 'Feld „' + feld + '“ ungültig: ' + JSON.stringify(b[feld]) };
    aus[feld] = b[feld];
  }
  if (b.takt !== undefined) aus.takt = b.takt;
  if (b.von !== undefined) aus.von = b.von;
  return { ok: true, befehl: aus };
}
