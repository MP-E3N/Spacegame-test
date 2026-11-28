// ZWECK: Gefechtszentrale als Vollbild-Ansicht (R23, Nutzer: „ein CIC … mit mehreren Posten: Navigator, Waffen und
//        Sensortechnik, Crew/Mechanik-Station und Captain, dazu soll zentral ein Lageplan sein“). Gefühl: gepanzerter
//        Gefechtsstand im Rumpf, gedämpftes Licht (Alarmstufe färbt den Raum), Röhrenschirme grün/bernstein,
//        Kippschalter-Pulte mit Nietenplatten. EIGENE Begriffe und Gestaltung (E-005).
//        Aufbau: Mitte = Lageschirm (lageschirm.js) + Kapitäns-Pult darüber + Bordbuch darunter; links Navigator und
//        Crew/Mechanik; rechts Waffen & Sensorik.
// LIEFERT: erstelleCic({ gefecht, zentrale, flakBefehl, sende, name? }) → { get aktiv, umschalten(), aktualisiere(dt),
//          lageschirm, wurzel }
//          sende(befehl) → { ok, grund? } | undefined — JEDE Eingabe geht nur hierüber (Befehle aus stationsbefehle.js);
//          die Projektleitung leitet sie an zentrale.befehl (und überträgt zustand.waffen in flakBefehl).
// TASTEN: aktiv → ein Lauscher in der CAPTURE-Phase auf window schluckt ALLE keydown außer Tab (Projektleitung schaltet
//        damit um) — WARUM alles: Flugsteuerung (eingabe.js), Flak-Tasten (gefecht.js), Menü-Esc (zurueck.js) und
//        Richtschütze lauschen auf window; ohne Schlucken flöge das Schiff beim Tippen einer Durchsage mit.
//        Esc schließt die Zentrale (im Eingabefeld: nur Feld verlassen). Tippen in Feldern geht weiter (kein
//        preventDefault). keyup bleibt durchgelassen; beim Öffnen meldet ein künstliches window-„blur“ an eingabe.js,
//        dass alle Tasten losgelassen sind (sonst liefe ein gehaltenes W weiter).
// REGEL: liest Sim-Zustand nur. DOM-Texte nur bei Änderung (setze/klasse mit Merkwert), DOM-Takt 10 Hz, Lageschirm ≤ 30 Hz,
//        Aufbau einmal beim Erstellen (feste Zeilen-/Zellen-Vorräte, keine Neuaufbauten pro Bild).
import './cic.css';
import { erstelleLageschirm, MASSSTAEBE } from './lageschirm.js';
import { zuWelt, zuSchiff } from '../sim/ki/schiffsrahmen.js';
import { BEREICHE, FAHRTSTUFEN, ANWEISUNGEN, HOEHE_MAX, ANSAGE_MAX, ENERGIE_SUMME, STATIONEN } from '../netz/stationsbefehle.js';
import { ZENTRALE } from '../sim/zentrale.js';

const GRAD = Math.PI / 180;
const VOR = Object.freeze({ x: 0, y: 0, z: 1 }), LINKS = Object.freeze({ x: 1, y: 0, z: 0 });
const TAKT_DOM = 0.1, TAKT_SCHIRM = 1 / 30;
const KONTAKT_ZEILEN = 10;
const ALARM_TEXT = { gruen: ['GRÜN', 'Marschfahrt · Waffen gesichert'], gelb: ['GELB', 'Bereitschaft · ¾ besetzt'], rot: ['ROT', 'Gefechtsstationen'] };
const ARBEIT_TEXT = { frei: 'frei', unterwegs: 'unterwegs', repariert: 'repariert', bereit: 'bereit' };

// ---------- kleine DOM-Helfer (nur beim Aufbau Objekte anlegen) ----------
function el(tag, cls, text, eltern) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  eltern?.append(e);
  return e;
}
/** Text nur bei Änderung schreiben. WARUM: textContent setzt sonst jedes Mal Layout in Gang. */
const setze = (e, t) => { if (e._t !== t) { e.textContent = t; e._t = t; } };
const klasse = (e, k, an) => { an = !!an; const m = '_k_' + k; if (e[m] !== an) { e.classList.toggle(k, an); e[m] = an; } };
function knopf(text, beiKlick, eltern, cls = '') {
  const b = el('button', 'cic-knopf ' + cls, text, eltern);
  b.type = 'button';
  b.addEventListener('click', beiKlick);
  return b;
}
function pult(titel, kennung, eltern, cls = '') {
  const w = el('section', 'cic-pult ' + cls, null, eltern);
  const kopf = el('header', 'cic-platte', null, w);
  el('span', 'cic-lampe', null, kopf);
  el('span', 'cic-titel', titel, kopf);
  el('span', 'cic-kennung', kennung, kopf);
  el('span', 'cic-hoerer', null, kopf).title = 'Sprechverbindung';
  return { wurzel: w, inhalt: el('div', 'cic-inhalt', null, w), kopf };
}
const grad3 = (rad) => String(Math.round(((rad / GRAD) % 360 + 360) % 360) % 360).padStart(3, '0');
const vz = (x) => (x >= 0 ? '+' : '−') + Math.abs(x);
const uhrzeit = (takt) => { const s = Math.floor(takt / 60); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

export function erstelleCic({ gefecht, zentrale, flakBefehl, sende, name = 'BT-12 BOLLWERK' }) {
  const Zs = zentrale.zustand, Wk = zentrale.wirkung;
  let aktiv = false, zeit = 0, uhrDom = 0, uhrSchirm = 0;
  let gewaehlterTrupp = 1, meldungRest = 0;

  // ---------- Senden mit Rückmeldung ----------
  function schicke(b) {
    const r = sende(b);
    if (r && r.ok === false) { setze(el_.status, 'ABGEWIESEN · ' + STATIONEN[b.station] + ': ' + r.grund); klasse(el_.status, 'warn', true); meldungRest = 4; }
    return r;
  }

  // ---------- Grundgerüst ----------
  const wurzel = el('div', 'cic', null, document.body);
  wurzel.id = 'cic';
  const el_ = {};
  const kopfleiste = el('div', 'cic-kopfleiste', null, wurzel);
  el('span', 'cic-marke', 'GEFECHTSZENTRALE', kopfleiste);
  el('span', 'cic-schiff', name, kopfleiste);
  el_.status = el('span', 'cic-status', '', kopfleiste);
  el_.uhr = el('span', 'cic-uhr', '00:00', kopfleiste);
  el('span', 'cic-hinweis', 'Tab Außenansicht · Esc schließen', kopfleiste);
  const links = el('div', 'cic-spalte cic-links', null, wurzel);
  const mitte = el('div', 'cic-mitte', null, wurzel);
  const rechts = el('div', 'cic-spalte cic-rechts', null, wurzel);

  // =====================================================================================
  // KAPITÄN (oben Mitte): Alarmschalter, Lagebild, Schnellbefehle
  // =====================================================================================
  const kap = pult('KAPITÄN', 'K-1', mitte, 'cic-kapitaen');
  const kapZeile = el('div', 'cic-zeile', null, kap.inhalt);
  const alarmFeld = el('div', 'cic-alarm', null, kapZeile);
  el_.alarm = {};
  for (const st of ['gruen', 'gelb', 'rot']) {
    const b = knopf('', () => schicke({ station: 'kapitaen', art: 'alarm', stufe: st }), alarmFeld, 'cic-alarmknopf ' + st);
    el('b', null, ALARM_TEXT[st][0], b); el('small', null, ALARM_TEXT[st][1], b);
    el_.alarm[st] = b;
  }
  const lage = el('div', 'cic-lagebild roehre bernstein', null, kapZeile);
  el_.lage = {};
  for (const [k, t] of [['welle', 'WELLE'], ['kontakte', 'KONTAKTE'], ['abschuesse', 'ABSCHÜSSE'], ['rumpf', 'RUMPF'], ['treffer', 'TREFFER']]) {
    const z = el('div', 'cic-wert', null, lage); el('span', null, t, z); el_.lage[k] = el('b', null, '–', z);
  }
  el_.nah = el('div', 'cic-nah', 'NAHBEREICH', lage);
  const schnell = el('div', 'cic-schnell', null, kap.inhalt);
  for (const code of Object.keys(ANWEISUNGEN)) {
    const kurz = { gefechtsstationen: 'GEFECHTSSTATIONEN', feuerHalt: 'FEUER HALT', feuerFrei: 'FEUER FREI', schadenskontrolle: 'SCHADENSKONTROLLE',
      energieWaffen: 'ENERGIE → WAFFEN', energieAntrieb: 'ENERGIE → ANTRIEB', energieAusgleich: 'ENERGIE AUSGLEICH', kursHalten: 'RUDER FREI', volleFahrt: 'VOLLE FAHRT' }[code] ?? code;
    knopf(kurz, () => schicke({ station: 'kapitaen', art: 'anweisung', code }), schnell, 'klein').title = ANWEISUNGEN[code];
  }

  // =====================================================================================
  // LAGESCHIRM (Mitte)
  // =====================================================================================
  const schirmRahmen = el('div', 'cic-schirmrahmen', null, mitte);
  const canvas = el('canvas', 'cic-lageschirm', null, schirmRahmen);
  el('div', 'cic-raster', null, schirmRahmen); // Zeilenraster der Röhre (CSS)
  const schirmLeiste = el('div', 'cic-schirmleiste', null, schirmRahmen);
  el_.massstab = MASSSTAEBE.map((m) => knopf((m / 1000).toFixed(1) + ' km', () => { schirm.massstab = m; zeichneJetzt(); }, schirmLeiste, 'klein'));
  const schirm = erstelleLageschirm({
    canvas, gefecht, zentrale,
    beiKlick: (k) => {
      if (k.art === 'kontakt') { auswahl = k.zielId; }
      else if (k.art === 'kurs') {
        const N = Zs.navigator;
        schicke({ station: 'navigator', art: 'kurs', peilung: k.peilung, hoehe: N.kursAktiv ? N.hoehe : 0 });
      }
      zeichneJetzt();
    },
  });
  let auswahl = null;
  function zeichneJetzt() { uhrSchirm = TAKT_SCHIRM; uhrDom = TAKT_DOM; }

  // Bordbuch (Kapitän): Ansage-Protokoll + Durchsage
  const buch = pult('BORDBUCH', 'K-2', mitte, 'cic-bordbuch');
  const buchListe = el('div', 'cic-buch roehre', null, buch.inhalt);
  el_.buch = Array.from({ length: 5 }, () => {
    const z = el('div', 'cic-buchzeile', null, buchListe);
    return { zeit: el('span', 'z', '', z), station: el('span', 's', '', z), text: el('span', 't', '', z) };
  });
  const durchsage = el('form', 'cic-durchsage', null, buch.inhalt);
  const feld = el('input', 'cic-feld', null, durchsage);
  feld.maxLength = ANSAGE_MAX; feld.placeholder = 'Durchsage an alle Posten …';
  knopf('DURCHSAGE', () => durchsage.requestSubmit(), durchsage, 'klein');
  durchsage.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = feld.value.trim();
    if (!t) return;
    const r = schicke({ station: 'kapitaen', art: 'ansage', text: t });
    if (!r || r.ok !== false) feld.value = '';
  });

  // =====================================================================================
  // NAVIGATOR (links oben)
  // =====================================================================================
  const nav = pult('NAVIGATOR', 'N-1', links, 'cic-navigator');
  const navRoehre = el('div', 'roehre gruen cic-tafel', null, nav.inhalt);
  el_.nav = {};
  for (const [k, t] of [['ruder', 'RUDER'], ['soll', 'KURS SOLL'], ['ist', 'BUG IST'], ['rolle', 'ROLLE'], ['fahrt', 'FAHRT'], ['tempo', 'TEMPO'], ['antrieb', 'ANTRIEB']]) {
    const z = el('div', 'cic-tafelzeile', null, navRoehre); el('span', null, t, z); el_.nav[k] = el('b', null, '–', z);
  }
  /** Ausgangskurs für ±-Tasten: der befohlene, sonst der jetzige Bug (WARUM: „+10“ heißt 10° vom aktuellen Kurs). */
  function basisKurs() {
    const N = Zs.navigator;
    if (N.kursAktiv) return { p: N.peilung, h: N.hoehe };
    const b = bugIst();
    return { p: Math.atan2(-b.x, b.z), h: Math.max(-HOEHE_MAX, Math.min(HOEHE_MAX, Math.asin(Math.max(-1, Math.min(1, b.y))))) };
  }
  const kursNach = (p, h) => schicke({ station: 'navigator', art: 'kurs', peilung: ((p % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), hoehe: Math.max(-HOEHE_MAX, Math.min(HOEHE_MAX, h)) });
  const peilReihe = el('div', 'cic-reihe', null, nav.inhalt); el('label', null, 'PEILUNG', peilReihe);
  for (const d of [-45, -10, -1, 1, 10, 45]) knopf(vz(d), () => { const b = basisKurs(); kursNach(b.p + d * GRAD, b.h); }, peilReihe, 'klein');
  const hoeheReihe = el('div', 'cic-reihe', null, nav.inhalt); el('label', null, 'HÖHE', hoeheReihe);
  for (const d of [-10, -5, 0, 5, 10]) knopf(d === 0 ? 'EBEN' : vz(d), () => { const b = basisKurs(); kursNach(b.p, d === 0 ? 0 : b.h + d * GRAD); }, hoeheReihe, 'klein');
  const navReihe = el('div', 'cic-reihe', null, nav.inhalt);
  knopf('KURS HALTEN', () => { const b = basisKurs(); kursNach(b.p, b.h); }, navReihe).title = 'Autopilot hält den jetzigen Kurs';
  el_.kursWahl = knopf('AM SCHIRM', () => { schirm.setzeKursWahl(!schirm.kursWahl); zeichneJetzt(); }, navReihe);
  el_.kursWahl.title = 'Dann einen Punkt auf dem Lageschirm anklicken';
  knopf('RUDER FREI', () => schicke({ station: 'navigator', art: 'kursAus' }), navReihe, 'rot').title = 'Autopilot und Fahrtvorgabe aus — Steuer wieder von Hand';
  const fahrtReihe = el('div', 'cic-reihe', null, nav.inhalt); el('label', null, 'FAHRT', fahrtReihe);
  el_.fahrt = FAHRTSTUFEN.map((f) => knopf(f.name.toUpperCase(), () => schicke({ station: 'navigator', art: 'fahrt', stufe: f.stufe }), fahrtReihe, 'klein'));
  knopf('STOPP', () => schicke({ station: 'navigator', art: 'stopp' }), fahrtReihe, 'klein rot');

  // =====================================================================================
  // CREW / MECHANIK (links unten)
  // =====================================================================================
  const tech = pult('CREW & MECHANIK', 'M-1', links, 'cic-technik');
  const schema = el('div', 'cic-schema', null, tech.inhalt);
  el_.bereich = {};
  for (const b of BEREICHE) {
    const c = el('div', 'cic-bereich ' + b.id, null, schema);
    c.addEventListener('click', () => schicke({ station: 'technik', art: 'trupp', nr: gewaehlterTrupp, bereich: b.id }));
    c.title = 'Gewählten Trupp hierher schicken';
    const fuell = el('div', 'fuell', null, c);
    el_.bereich[b.id] = { zelle: c, fuell, name: el('span', 'n', b.name.toUpperCase(), c), wert: el('b', 'w', '100 %', c), info: el('span', 'i', '', c), trupps: el('span', 'tr', '', c) };
  }
  const truppReihe = el('div', 'cic-trupps', null, tech.inhalt);
  el_.trupp = Zs.trupps.map((t) => {
    const b = knopf('', () => { gewaehlterTrupp = t.nr; uhrDom = TAKT_DOM; }, truppReihe, 'cic-trupp');
    return { knopf: b, name: el('b', null, 'TRUPP ' + t.nr, b), ort: el('span', null, '–', b), arbeit: el('small', null, '', b) };
  });
  knopf('ABZIEHEN', () => schicke({ station: 'technik', art: 'trupp', nr: gewaehlterTrupp, bereich: null }), truppReihe, 'klein');
  el_.rumpf = el('div', 'cic-rumpfzeile roehre bernstein', '', tech.inhalt);
  const energie = el('div', 'cic-energie', null, tech.inhalt);
  el_.energie = {};
  let ziehtEnergie = false;
  for (const [k, t] of [['antrieb', 'ANTRIEB'], ['waffen', 'WAFFEN'], ['reparatur', 'REPARATUR']]) {
    const z = el('div', 'cic-regler', null, energie);
    el('label', null, t, z);
    const r = el('input', null, null, z); r.type = 'range'; r.min = 0; r.max = ENERGIE_SUMME; r.step = 1;
    const w = el('b', null, '–', z);
    r.addEventListener('pointerdown', () => { ziehtEnergie = true; });
    r.addEventListener('pointerup', () => { ziehtEnergie = false; });
    r.addEventListener('input', () => schicke({ station: 'technik', art: 'energie', ...verteile(Zs.energie, k, +r.value) }));
    el_.energie[k] = { regler: r, wert: w };
  }
  const preset = el('div', 'cic-reihe', null, energie);
  for (const [t, p] of [['AUSGLEICH', ZENTRALE.energieStandard], ['WAFFEN', ZENTRALE.energieWaffen], ['ANTRIEB', ZENTRALE.energieAntrieb]]) {
    knopf(t, () => schicke({ station: 'technik', art: 'energie', ...p }), preset, 'klein');
  }

  // =====================================================================================
  // WAFFEN & SENSORIK (rechts)
  // =====================================================================================
  const waf = pult('WAFFEN & SENSORIK', 'W-1', rechts, 'cic-waffen');
  const liste = el('div', 'roehre gruen cic-kontakte', null, waf.inhalt);
  const kopfZ = el('div', 'cic-kontakt kopf', null, liste);
  for (const t of ['KEN', 'ART', 'ABST', 'PEIL', 'HÖHE', 'ZUST']) el('span', null, t, kopfZ);
  el_.kontakte = Array.from({ length: KONTAKT_ZEILEN }, () => {
    const z = el('div', 'cic-kontakt', null, liste);
    const zelle = ['ken', 'art', 'abst', 'peil', 'hoehe'].map((k) => el('span', k, '', z));
    const hp = el('span', 'hp', null, z), balken = el('i', null, null, hp);
    const zeile = { z, zelle, balken, id: null };
    z.addEventListener('click', () => { if (zeile.id !== null) { auswahl = zeile.id; schirm.auswahl = zeile.id; zeichneJetzt(); } });
    return zeile;
  });
  el_.sensor = el('div', 'cic-sensorzeile', '', liste);
  el_.wahl = el('div', 'cic-wahl roehre bernstein', 'KEINE AUSWAHL — Kontakt anklicken', waf.inhalt);
  const zielReihe = el('div', 'cic-reihe', null, waf.inhalt);
  knopf('ZIEL VORGEBEN', () => { if (auswahl !== null) schicke({ station: 'waffen', art: 'zielVorgabe', zielId: auswahl }); }, zielReihe);
  knopf('VORGABE AUFHEBEN', () => schicke({ station: 'waffen', art: 'zielVorgabe', zielId: null }), zielReihe);
  const feuerReihe = el('div', 'cic-reihe', null, waf.inhalt); el('label', null, 'FREIGABE', feuerReihe);
  el_.frei = knopf('FEUER FREI', () => schicke({ station: 'waffen', art: 'feuer', frei: true }), feuerReihe);
  el_.halt = knopf('FEUER HALT', () => schicke({ station: 'waffen', art: 'feuer', frei: false }), feuerReihe, 'rot');
  const modusReihe = el('div', 'cic-reihe', null, waf.inhalt); el('label', null, 'FLAK', modusReihe);
  el_.modus = {};
  for (const [m, t] of [['sperrfeuer', 'SPERRFEUER'], ['zielfeuer', 'ZIELFEUER']]) el_.modus[m] = knopf(t, () => schicke({ station: 'waffen', art: 'modus', modus: m }), modusReihe);
  const munReihe = el('div', 'cic-reihe', null, waf.inhalt); el('label', null, 'HAUPTBATT.', munReihe);
  el_.mun = {};
  for (const [m, t] of [['auto', 'AUTO'], ['flak', 'FLAK-GR.'], ['panzer', 'PANZER-GR.']]) el_.mun[m] = knopf(t, () => schicke({ station: 'waffen', art: 'munition', munition: m }), munReihe, 'klein');
  el_.freigabe = el('div', 'cic-freigabe', '', waf.inhalt);
  el('div', 'cic-zwischentitel', 'TÜRME', waf.inhalt);
  const turmFeld = el('div', 'cic-tuerme', null, waf.inhalt);
  const tuerme = gefecht.flak.tuerme;
  el_.turm = tuerme.map((t) => {
    const schwer = (t.typ ?? t.lafette?.typ) === 'schwer';
    const c = el('div', 'cic-turm' + (schwer ? ' schwer' : ''), null, turmFeld);
    el('b', null, (schwer ? 'S' : 'T') + String(t.id).padStart(2, '0'), c);
    const s = el('span', null, '', c);
    c.title = (schwer ? 'Schwerer Turm' : 'Flak-Turm') + ' ' + t.id + (t.lafette?.oben === false ? ' · unten' : ' · oben');
    return { c, s, schuesse: 0, feuerRest: 0 };
  });
  const legende = el('div', 'cic-legende', null, waf.inhalt);
  for (const [k, t] of [['feuert', 'feuert'], ['gerichtet', 'gerichtet'], ['schwenkt', 'schwenkt'], ['aus', 'aus'], ['manuell', 'Hand'], ['gesichert', 'gesichert']]) {
    const s = el('span', 'cic-turm mini ' + k, null, legende); el('b', null, t, s);
  }

  // ---------- Hilfen ----------
  /** Energie neu verteilen: der gezogene Regler bekommt wert, die anderen beiden teilen sich den Rest im alten Verhältnis. */
  function verteile(e, k, wert) {
    const andere = ['antrieb', 'waffen', 'reparatur'].filter((x) => x !== k);
    const rest = ENERGIE_SUMME - wert, summe = e[andere[0]] + e[andere[1]];
    const a = summe > 0 ? Math.round(rest * e[andere[0]] / summe) : Math.round(rest / 2);
    return { [k]: wert, [andere[0]]: a, [andere[1]]: rest - a };
  }

  // Kontakt-Vorrat (fest, sortiert nach Abstand)
  const kontakte = gefecht.angreifer.ziele.map(() => ({ g: null, d: 0, dy: 0, peil: 0 }));
  const nachAbstand = (a, b) => a.d - b.d;
  const relTmp = { x: 0, y: 0, z: 0 }, relLok = { x: 0, y: 0, z: 0 }, bugTmp = { x: 0, y: 0, z: 0 };
  const bugIst = () => zuWelt(gefecht.schiff.z, VOR, bugTmp);

  // =====================================================================================
  // DOM-Aktualisierung (10 Hz)
  // =====================================================================================
  function aktualisiereDom(dt) {
    const z = gefecht.schiff.z, N = Zs.navigator, W = Zs.waffen, A = gefecht.angreifer;
    setze(el_.uhr, uhrzeit(Zs.takt));
    if (meldungRest > 0 && (meldungRest -= dt) <= 0) { setze(el_.status, ''); klasse(el_.status, 'warn', false); }
    // Raumlicht nach Alarmstufe
    for (const st of ['gruen', 'gelb', 'rot']) { klasse(wurzel, 'alarm-' + st, Zs.alarm === st); klasse(el_.alarm[st], 'an', Zs.alarm === st); }

    // ----- Kapitän: Lagebild -----
    const w = A.welle;
    setze(el_.lage.welle, w.pause > 0 ? (w.nr ? (w.nr + 1) + ' in ' + Math.ceil(w.pause) + ' s' : 'Anflug ' + Math.ceil(w.pause) + ' s') : String(w.nr));
    let n = 0;
    for (const g of A.ziele) if (g.aktiv) n++;
    setze(el_.lage.kontakte, String(n));
    setze(el_.lage.abschuesse, String(gefecht.zaehler.abschuesse));
    const hpMax = gefecht.welt.werte.hpMax, rumpf = Math.round(z.hp / hpMax * 100);
    setze(el_.lage.rumpf, z.zerstoert ? 'WRACK' : rumpf + ' %');
    klasse(el_.lage.rumpf, 'warn', rumpf < 35);
    setze(el_.lage.treffer, String(gefecht.zaehler.trefferAmSchiff));
    klasse(el_.nah, 'an', !!gefecht.ki.lage?.nahbereich);
    // Bordbuch
    const neu = zentrale.ansagen(5, bordbuchTmp);
    for (let i = 0; i < el_.buch.length; i++) {
      const a = neu[i], r = el_.buch[i];
      setze(r.zeit, a ? uhrzeit(a.takt) : ''); setze(r.station, a ? (STATIONEN[a.station] ?? a.station).toUpperCase() : ''); setze(r.text, a ? a.text : '');
      klasse(r.text, 'warn', !!a && /AUSGEFALLEN|ALARM ROT/.test(a.text));
    }

    // ----- Navigator -----
    const b = bugIst(), peilIst = Math.atan2(-b.x, b.z), hIst = Math.asin(Math.max(-1, Math.min(1, b.y)));
    setze(el_.nav.ruder, N.kursAktiv ? 'AUTOPILOT' : N.fahrtAktiv ? 'HAND · Fahrt vorgegeben' : 'HAND');
    klasse(el_.nav.ruder, 'an', N.kursAktiv);
    setze(el_.nav.soll, N.kursAktiv ? grad3(N.peilung) + '°  ' + vz(Math.round(N.hoehe / GRAD)) + '°' : '— (Ruder frei)');
    setze(el_.nav.ist, grad3(peilIst) + '°  ' + vz(Math.round(hIst / GRAD)) + '°');
    // Rolle: Backbord-Achse (+X) hebt sich bei Rolle nach rechts → seite.y > 0 = rechts gerollt
    const seite = zuWelt(z, LINKS, relTmp);
    setze(el_.nav.rolle, vz(Math.round(Math.asin(Math.max(-1, Math.min(1, seite.y))) / GRAD)) + '°' + (Math.abs(seite.y) > 0.02 ? (seite.y > 0 ? ' rechts' : ' links') : ''));
    const stufe = FAHRTSTUFEN[N.stufe + 1];
    setze(el_.nav.fahrt, (N.fahrtAktiv ? stufe.name.toUpperCase() : 'Hand') + ' · Hebel ' + Math.round(z.hebel * 100) + ' %' + (Wk.hebelMax < 1 ? ' (max ' + Math.round(Wk.hebelMax * 100) + ' %)' : ''));
    setze(el_.nav.tempo, Math.round(Math.hypot(z.vel.x, z.vel.y, z.vel.z)) + ' m/s');
    setze(el_.nav.antrieb, (Wk.nachbrennerFrei ? 'Nachbrenner frei' : 'Nachbrenner GESPERRT') + (Wk.drehFaktor < 0.99 ? ' · Ruder ' + Math.round(Wk.drehFaktor * 100) + ' %' : ''));
    klasse(el_.nav.antrieb, 'warn', !Wk.nachbrennerFrei);
    el_.fahrt.forEach((k, i) => klasse(k, 'an', N.fahrtAktiv && N.stufe === FAHRTSTUFEN[i].stufe));
    klasse(el_.kursWahl, 'an', schirm.kursWahl);
    el_.massstab.forEach((k, i) => klasse(k, 'an', schirm.massstab === MASSSTAEBE[i]));

    // ----- Crew/Mechanik -----
    for (const ber of Zs.bereiche) {
      const e = el_.bereich[ber.id], p = Math.round(ber.zustand * 100);
      setze(e.wert, p + ' %');
      if (e._p !== p) { e.fuell.style.width = p + '%'; e._p = p; }
      klasse(e.zelle, 'beschaedigt', ber.stufe === 1); klasse(e.zelle, 'ausgefallen', ber.stufe === 2);
      let info = '';
      if (ber.id === 'antrieb') info = 'Fahrt max ' + Math.round(Wk.hebelMax * 100) + ' %';
      else if (ber.id === 'bug') info = 'Sensor ' + (Wk.sensorReichweite / 1000).toFixed(1) + ' km';
      else if (ber.id === 'heck') info = 'Ruder ' + Math.round(Wk.drehFaktor * 100) + ' %';
      else if (ber.id === 'mitte') info = ber.rumpfSchaden > 0 ? 'Leck ' + Math.round(ber.rumpfSchaden) + ' HP' : 'Reaktor';
      else { let aus = 0; for (let i = 0; i < Wk.turmGrund.length; i++) if (Wk.turmGrund[i] === 1 && ((tuerme[i].lafette?.oben === false) === (ber.id === 'waffenUnten'))) aus++; info = aus ? aus + ' Türme aus' : 'einsatzbereit'; }
      setze(e.info, info);
      let tr = '';
      for (const t of Zs.trupps) if (t.bereich === ber.id) tr += (tr ? ' ' : '') + 'T' + t.nr + (t.arbeit === 'unterwegs' ? '…' : '');
      setze(e.trupps, tr);
    }
    Zs.trupps.forEach((t, i) => {
      const e = el_.trupp[i];
      setze(e.ort, t.bereich ? BEREICHE.find((x) => x.id === t.bereich).name : 'in Bereitschaft');
      setze(e.arbeit, t.arbeit === 'unterwegs' ? 'unterwegs ' + Math.ceil(t.weg) + ' s' : ARBEIT_TEXT[t.arbeit]);
      klasse(e.knopf, 'an', gewaehlterTrupp === t.nr); klasse(e.knopf, 'arbeitet', t.arbeit === 'repariert');
    });
    let offen = 0; for (const ber of Zs.bereiche) offen += ber.rumpfSchaden;
    setze(el_.rumpf, 'RUMPF ' + (z.zerstoert ? 'WRACK' : rumpf + ' %') + ' · offen ' + Math.round(offen) + ' HP · Reparatur ' + (Wk.reparatur > 0 ? '+' + Wk.reparatur.toFixed(1) + ' HP/s' : '—'));
    for (const k of ['antrieb', 'waffen', 'reparatur']) {
      const e = el_.energie[k];
      setze(e.wert, Zs.energie[k] + ' %');
      // WARUM nicht beim Ziehen: sonst springt der Regler unter der Maus auf den (einen Schritt älteren) Zustand zurück
      if (!ziehtEnergie && +e.regler.value !== Zs.energie[k]) e.regler.value = Zs.energie[k];
    }

    // ----- Waffen & Sensorik -----
    const rs = Wk.sensorReichweite;
    let m = 0;
    for (const g of A.ziele) {
      if (!g.aktiv) continue;
      relTmp.x = g.pos.x - z.pos.x; relTmp.y = g.pos.y - z.pos.y; relTmp.z = g.pos.z - z.pos.z;
      const d = Math.hypot(relTmp.x, relTmp.y, relTmp.z);
      if (d > rs) continue;
      const l = zuSchiff(z, relTmp, relLok), k = kontakte[m++];
      // Peilung RELATIV zum Bug (Uhrzeigersinn = nach Steuerbord, −X), Höhe über/unter dem Schiff in Welt-Y
      k.g = g; k.d = d; k.dy = relTmp.y; k.peil = Math.atan2(-l.x, l.z);
    }
    for (let i = m; i < kontakte.length; i++) { kontakte[i].g = null; kontakte[i].d = Infinity; }
    kontakte.sort(nachAbstand);
    for (let i = 0; i < el_.kontakte.length; i++) {
      const r = el_.kontakte[i], k = kontakte[i], g = k?.g;
      r.id = g ? g.id : null;
      klasse(r.z, 'leer', !g);
      if (!g) { for (const c of r.zelle) setze(c, ''); if (r._hp !== -1) { r.balken.style.width = '0'; r._hp = -1; } continue; }
      const panzer = g.art === 'panzer' || (g.panzer ?? 0) >= 0.5;
      setze(r.zelle[0], String(g.id).padStart(2, '0'));
      setze(r.zelle[1], panzer ? 'PANZ' : 'BOOT');
      setze(r.zelle[2], String(Math.round(k.d / 10) * 10));
      setze(r.zelle[3], grad3(k.peil));
      setze(r.zelle[4], vz(Math.round(k.dy / 10) * 10));
      const hp = Math.round(Math.max(0, g.hp) / (g.hpMax || 1) * 100);
      if (r._hp !== hp) { r.balken.style.width = hp + '%'; r._hp = hp; }
      klasse(r.z, 'panzer', panzer); klasse(r.z, 'wahl', g.id === auswahl); klasse(r.z, 'vorgabe', g.id === W.zielVorgabe);
      klasse(r.z, 'nah', k.d < 600);
    }
    setze(el_.sensor, m + ' Kontakte in ' + (rs / 1000).toFixed(1) + ' km' + (m > el_.kontakte.length ? ' (' + el_.kontakte.length + ' gezeigt)' : '') + (rs < ZENTRALE.sensor - 1 ? ' · BUGSENSOR BESCHÄDIGT' : ''));
    // Auswahl
    if (auswahl !== null && !A.ziele.some((g) => g.aktiv && g.id === auswahl)) { auswahl = null; schirm.auswahl = null; }
    schirm.auswahl = auswahl;
    if (auswahl === null) setze(el_.wahl, W.zielVorgabe !== null ? 'VORGABE ' + String(W.zielVorgabe).padStart(2, '0') + ' · keine Auswahl' : 'KEINE AUSWAHL — Kontakt anklicken');
    else {
      const k = kontakte.find((x) => x.g?.id === auswahl);
      setze(el_.wahl, 'AUSWAHL ' + String(auswahl).padStart(2, '0') + (k ? ' · ' + (k.g.art === 'panzer' ? 'Panzerboot' : 'Kanonenboot') + ' · ' + Math.round(k.d) + ' m · Peilung ' + grad3(k.peil) : '') +
        (W.zielVorgabe === auswahl ? ' · VORGEGEBEN' : ''));
    }
    klasse(el_.frei, 'an', W.frei); klasse(el_.halt, 'an', !W.frei);
    for (const k of Object.keys(el_.modus)) klasse(el_.modus[k], 'an', W.modus === k);
    for (const k of Object.keys(el_.mun)) klasse(el_.mun[k], 'an', W.munition === k);
    setze(el_.freigabe, Wk.feuerFrei ? 'WAFFEN FREI · ' + (W.modus === 'sperrfeuer' ? 'Sperrfeuer' : 'Zielfeuer') : !W.frei ? 'FEUER HALT (Waffen-Posten)' : 'GESICHERT — Alarm ' + ALARM_TEXT[Zs.alarm][0]);
    klasse(el_.freigabe, 'warn', !Wk.feuerFrei);
    // Türme
    const manuell = flakBefehl?.manuell ?? -1;
    for (let i = 0; i < tuerme.length; i++) {
      const t = tuerme[i], e = el_.turm[i];
      if (t.schuesse !== e.schuesse) { e.schuesse = t.schuesse; e.feuerRest = 0.3; } else e.feuerRest -= dt;
      const grund = Wk.turmGrund[i] ?? 0;
      const zst = i === manuell ? 'manuell' : grund ? 'aus' : !Wk.feuerFrei ? 'gesichert' : e.feuerRest > 0 ? 'feuert' : t.ausgerichtet && t.imBereich ? 'gerichtet' : 'schwenkt';
      if (e._z !== zst) { if (e._z) e.c.classList.remove(e._z); e.c.classList.add(zst); e._z = zst; }
      const mun = t.munition ? (t.munition === 'panzer' ? 'PZ' : 'FL') : '';
      setze(e.s, grund === 1 ? 'SCHADEN' : grund === 2 ? 'O.BES.' : zst === 'manuell' ? 'HAND' : mun);
    }
  }
  const bordbuchTmp = [];

  // ---------- Tasten (siehe Kopf) ----------
  addEventListener('keydown', (e) => {
    if (!aktiv || e.code === 'Tab') return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (e.target instanceof HTMLInputElement) e.target.blur(); else umschalten();
    }
    e.stopImmediatePropagation();
  }, true);

  function umschalten() {
    aktiv = !aktiv;
    klasse(wurzel, 'an', aktiv);
    if (aktiv) {
      dispatchEvent(new Event('blur')); // eingabe.js: alle Tasten gelten als losgelassen
      zeichneJetzt();
    } else {
      schirm.setzeKursWahl(false);
      // WARUM blur: sonst bleibt ein Knopf fokussiert und die Leertaste „klickt“ ihn in der Außenansicht
      if (wurzel.contains(document.activeElement)) document.activeElement.blur();
    }
    return aktiv;
  }

  function aktualisiere(dt) {
    zeit += dt;
    schirm.spurTakt(dt);
    if (!aktiv) return;
    if ((uhrSchirm += dt) >= TAKT_SCHIRM) { uhrSchirm = 0; schirm.zeichne(zeit); }
    if ((uhrDom += dt) >= TAKT_DOM) { const d = uhrDom; uhrDom = 0; aktualisiereDom(d); }
  }

  return { get aktiv() { return aktiv; }, umschalten, aktualisiere, lageschirm: schirm, wurzel };
}
