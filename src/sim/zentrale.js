// ZWECK: Gefechtszentrale des Schiffs (R23, E5; Nutzer: „ein CIC … mit mehreren Posten: Navigator, Waffen und
//        Sensortechnik, Crew/Mechanik-Station und Captain“) — die SIMULATION hinter den vier Posten: Schadensbereiche,
//        Reparaturtrupps, Energieverteilung, Alarmstufe, Autopilot (Navigator-Kurs), Waffen-Vorgaben, Ansage-Protokoll.
//        Die Oberfläche (src/cic/cic.js) zeigt nur an und schickt Befehle (src/netz/stationsbefehle.js).
// LIEFERT: ZENTRALE (alle Zahlen) · erstelleZentrale({ kugeln?, laenge?, bereiche? }) → { zustand, wirkung, befehl(b) →
//          { ok, grund? }, schritt(dt, lage) → wirkung, zuruecksetzen(), pruefsumme(), ansagen(n, aus) }
//   lage = { schiffZ (schiff.z: pos, vel, rot, dreh, hebel, hp, zerstoert), treffer [{ pos (WELT), schaden }],
//            tuerme (flak.tuerme; je Turm lafette.{x,y,z,oben}), ziele (angreifer.ziele, WELT), welle (angreifer.welle),
//            werte (welt.werte: drehMax, drehBeschl — fehlt → Bollwerk-Werte) } — alle Felder optional
//   ordneZu(lx, ly, lz, tuerme) → { bereich, turm } (Schiffs-Lokalpunkt → Bereich; für Tests/Anzeige) · rumpf { zMin, zMax }
//   wirkung (EIN festes Objekt, jeder Schritt überschreibt es):
//     steuer   null (Ruder frei) | { lenkt, faehrt, gieren, nicken, rollen, hebel, stopp } — Teilbefehl für schiff.js:
//              lenkt → gieren/nicken/rollen ersetzen die Spielereingabe, faehrt → hebel (Hebel-RATE wie W/S) ersetzt sie,
//              stopp (einmalig) → Hebel sofort 0. Autopilot = P-D-Regler über z.dreh auf den Navigator-Weltkurs.
//     hebelMax 0..1 (Antriebsschaden × Antriebsenergie) · nachbrennerFrei (bool) · drehFaktor 0..1 (Heckschaden, optional)
//     feuerFrei (Waffen-Freigabe UND Alarmstufe) · tuermeAus [Indizes in flak.tuerme] · turmGrund [je Turm 0 ok,
//     1 Batterie beschädigt, 2 keine Energie/Besatzung] · reparatur (HP/s an den Rumpf) · sensorReichweite (m, Bugschaden)
//   zustand = { takt, alarm, energie {antrieb, waffen, reparatur}, waffen {frei, modus, munition, zielVorgabe},
//              navigator {kursAktiv, peilung, hoehe, fahrtAktiv, stufe}, bereiche [{ id, name, punkte, max, zustand 0..1,
//              rumpfSchaden, treffer }], trupps [{ nr, bereich, weg, arbeit ('frei'|'unterwegs'|'repariert'|'bereit') }],
//              ansagen { liste (Ring, ANSAGE_PLAETZE feste Objekte { nr, takt, station, text }), anzahl },
//              abgewiesen (Zähler), angenommen (Zähler) }
// REIHENFOLGE: befehl() stellt nur in die Warteschlange (fester Vorrat) — schritt() führt sie ZU BEGINN des nächsten
//        Schritts aus. WARUM: Koop — Befehle wirken auf einer Schrittgrenze, Host und Gäste rechnen dieselbe Folge.
// REGEL: Simulation — kein DOM, kein Math.random, fester Schritt; keine neuen Objekte im Schritt (Ansage-Texte sind
//        Zeichenketten bei seltenen Ereignissen, sonst nichts). Ohne Befehle, ohne Treffer, Alarm Rot = keine Wirkung
//        auf das Gefecht (steuer null, hebelMax 1, alle Türme an, feuerFrei = Waffen-Freigabe) — WARUM: Einbau ändert
//        nichts, solange niemand die Zentrale bedient.
import { pruefeBefehl, BEREICHE, FAHRTSTUFEN, ANWEISUNGEN, TRUPPS } from '../netz/stationsbefehle.js';
import { zuSchiff } from './ki/schiffsrahmen.js';

const SEITEN = ['waffenOben', 'waffenUnten']; // fest (keine neuen Objekte im Schritt, Prüfer R23)
export const ZENTRALE = {
  // ---------- Bereiche ----------
  bereichMax: 300,        // Punkte je Bereich. WARUM 300: Treffer = 15 Schaden (Autokanone); 20 Treffer in einen
                          // Bereich (≈ 1 Minute Beschuss aus einer Richtung, Messung Gefecht R14: −21 %/min ≈ 70 Treffer
                          // verteilt) legen ihn lahm — spürbar, aber nicht nach einem Anflug
  trefferFaktor: 1,       // Bereichs-Punkte je Schadenspunkt
  // Längsbänder als Anteil u = (z − zMin)/(zMax − zMin) der Rumpflänge (0 Heck … 1 Bug). WARUM Anteile: gilt für jede
  // Form; Bollwerk (z −125…133): Bug z > 61, Mitte > −17, Heck > −84, darunter Antrieb (Triebwerksblock)
  band: { bug: 0.72, mitte: 0.42, heck: 0.16 },
  turmRadius: 16,         // m: Treffer so nah an einem Turm → zählt für dessen Batterie (oben/unten) und den Turm selbst
  batterieSchwelle: 0.6,  // Batterie-Zustand darunter → Türme fallen anteilig aus (bei 0 alle), meistgetroffene zuerst
  // ---------- Wirkungen ----------
  antriebRest: 0.3,       // hebelMax bei Antrieb 0 % (Notfahrt — WARUM nicht 0: das Schiff soll nie ganz liegen bleiben)
  hebelMin: 0.1,
  nachbrenner: { versorgung: 0.95, antrieb: 0.5 }, // nötige Antriebsversorgung bzw. Antriebs-Zustand für den Nachbrenner
  drehRest: 0.4,          // Drehfaktor bei Heck 0 %
  sensor: 3400, sensorRest: 0.35, // m Reichweite des Lageschirms, Anteil bei Bug 0 %
  reaktorRest: 0.5,       // Energie-Gesamtfaktor bei Mittschiffs 0 % (Reaktor beschädigt → weniger für alles)
  // Alle Rumpfbereiche (Bug, Mitte, Heck, Antrieb) wirken erst UNTER dieser Schwelle, dann linear bis zum Rest bei 0 %
  // (Batterien: batterieSchwelle). WARUM: sonst schalteten schon 4 Streifschüsse mittschiffs (−20 %) 2 Türme ab
  // (Messung Test 7), und jeder erste Treffer am Antrieb verstellte den Hebel — leichte Schäden verkraftet das Schiff.
  wirkSchwelle: 0.6,
  // ---------- Energie (Summe ENERGIE_SUMME) ----------
  // WARUM diese Bezugswerte: damit liefert die Standardverteilung genau die alte Wirkung (hebelMax 1, alle Türme,
  // Reparatur ×1); mehr als der Bezug bringt beim Antrieb nichts über 1, bei der Reparatur schnelleres Arbeiten.
  energieStandard: { antrieb: 35, waffen: 40, reparatur: 25 },
  energieWaffen: { antrieb: 25, waffen: 55, reparatur: 20 },
  energieAntrieb: { antrieb: 55, waffen: 25, reparatur: 20 },
  // ---------- Trupps ----------
  truppBereich: 3,        // Punkte/s je Trupp am Bereich (300 → 100 s für einen ganz zerstörten Bereich)
  truppRumpf: 2.5,        // HP/s je Trupp an den Rumpf — nur bis zum Rumpfschaden DIESES Bereichs (kein Endlos-Heilen).
                          // WARUM 2,5: 3 Trupps × 2,5 × 0,75 (Rot) ≈ 340 HP/min gegen ≈ 1050 HP/min Beschuss (R14) —
                          // Reparatur verlängert das Gefecht, gewinnt es aber nicht allein
  // ---------- Alarmstufen ----------
  // grün = Marschfahrt (Waffen gesichert, Trupps schnell und frei), gelb = Bereitschaft (¾ der Türme besetzt),
  // rot = Gefechtsstationen (alles besetzt, Schotts dicht → Trupps langsamer).
  alarm: {
    gruen: { waffenFrei: false, besetzung: 1, reparatur: 1.5, weg: 2 },
    gelb: { waffenFrei: true, besetzung: 0.75, reparatur: 1.0, weg: 4 },
    rot: { waffenFrei: true, besetzung: 1, reparatur: 0.75, weg: 6 },
  },
  alarmStart: 'rot',      // WARUM Rot: das Gefecht beginnt nach 3 s — so bleibt es ohne Zentrale-Bedienung wie bisher
  // ---------- Autopilot (P-D über z.dreh) ----------
  // rate = sign(e)·min(drehMax, kp·|e|, √(2·drehBeschl·brems·|e|)) → befehl = (rate + kd·(rate − ist)) / drehMax.
  // WARUM die Wurzel: bremst rechtzeitig mit der echten Drehbeschleunigung (kein Überschwingen bei 180°-Wenden);
  // WARUM kd: der Schiffsregler (drehRegler) hinkt nach — kd schiebt den Sollwert vor (Messung im Test).
  kp: 1.2, kd: 0.6, brems: 0.55,
  hebelK: 4,              // Hebel-Rate je Hebel-Fehler (1/s) — Fahrtstufe wird in ≈ 1 s eingesteuert
  // ---------- Ansagen / Warteschlange ----------
  ansagePlaetze: 16, warteschlange: 32,
  schadenStufen: [0.5, 0.15], // Bereichs-Zustand: darunter Meldung „beschädigt“ bzw. „ausgefallen“
};

const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
/** Wirkanteil eines Rumpfbereichs: 1 bis zur Schwelle, darunter linear auf 0. */
const wirk = (zustand) => Math.min(1, zustand / ZENTRALE.wirkSchwelle);
const ALARM_CODE = { gruen: 1, gelb: 2, rot: 3 };
const MODUS_CODE = { sperrfeuer: 1, zielfeuer: 2 };
const MUN_CODE = { auto: 1, flak: 2, panzer: 3 };

/** Rumpf-Längsausdehnung aus den Kollisionskugeln (Schiffs-Lokal) bzw. ± laenge/2. */
function rumpfLaenge(kugeln, laenge) {
  if (kugeln?.length) {
    let a = Infinity, b = -Infinity;
    for (const k of kugeln) { a = Math.min(a, k.z - k.r); b = Math.max(b, k.z + k.r); }
    return { zMin: a, zMax: b };
  }
  const L = laenge ?? 255;
  return { zMin: -L / 2, zMax: L / 2 };
}

export function erstelleZentrale({ kugeln = null, laenge = null, bereiche = null } = {}) {
  const Z = ZENTRALE;
  const band = { ...Z.band, ...(bereiche ?? {}) };
  const { zMin, zMax } = rumpfLaenge(kugeln, laenge);
  const spanne = Math.max(1, zMax - zMin);

  // ---------- Zustand (feste Objekte) ----------
  const zustand = {
    takt: 0, alarm: Z.alarmStart,
    energie: { ...Z.energieStandard },
    waffen: { frei: true, modus: 'sperrfeuer', munition: 'auto', zielVorgabe: null },
    navigator: { kursAktiv: false, peilung: 0, hoehe: 0, fahrtAktiv: false, stufe: 0 },
    bereiche: BEREICHE.map((b) => ({ id: b.id, name: b.name, punkte: Z.bereichMax, max: Z.bereichMax, zustand: 1, rumpfSchaden: 0, treffer: 0, stufe: 0 })),
    trupps: Array.from({ length: TRUPPS }, (_, i) => ({ nr: i + 1, bereich: null, weg: 0, arbeit: 'frei' })),
    ansagen: { liste: Array.from({ length: Z.ansagePlaetze }, () => ({ nr: 0, takt: 0, station: '', text: '' })), anzahl: 0 },
    abgewiesen: 0, angenommen: 0,
  };
  const bereichNach = Object.fromEntries(zustand.bereiche.map((b) => [b.id, b]));
  const steuer = { lenkt: false, faehrt: false, gieren: 0, nicken: 0, rollen: 0, hebel: 0, stopp: false };
  const wirkung = { steuer: null, hebelMax: 1, nachbrennerFrei: true, drehFaktor: 1, feuerFrei: true, tuermeAus: [], turmGrund: [],
    reparatur: 0, sensorReichweite: Z.sensor };
  const schlange = new Array(Z.warteschlange).fill(null);
  let inSchlange = 0, stoppOffen = false;
  // Türme: Batterie-Zuordnung (aus lafette.oben), Treffer-Last je Turm (für „meistgetroffen fällt zuerst aus“)
  let turmQuelle = null, turmLast = [], batterie = { waffenOben: [], waffenUnten: [] };
  const sortierer = (a, b) => (turmLast[b] - turmLast[a]) || (a - b);
  const tmpL = { x: 0, y: 0, z: 0 }, tmpD = { x: 0, y: 0, z: 0 };
  const OBEN = { x: 0, y: 1, z: 0 };

  function ansage(station, text) {
    const A = zustand.ansagen, e = A.liste[A.anzahl % A.liste.length];
    A.anzahl++; e.nr = A.anzahl; e.takt = zustand.takt; e.station = station; e.text = text;
  }
  /** Die n neuesten Ansagen (neueste zuerst) in aus (Array wird überschrieben). */
  function ansagen(n, aus = []) {
    const A = zustand.ansagen, m = Math.min(n, A.anzahl, A.liste.length);
    aus.length = m;
    for (let i = 0; i < m; i++) aus[i] = A.liste[(A.anzahl - 1 - i) % A.liste.length];
    return aus;
  }

  function zuruecksetzen() {
    zustand.takt = 0; zustand.alarm = Z.alarmStart;
    Object.assign(zustand.energie, Z.energieStandard);
    Object.assign(zustand.waffen, { frei: true, modus: 'sperrfeuer', munition: 'auto', zielVorgabe: null });
    Object.assign(zustand.navigator, { kursAktiv: false, peilung: 0, hoehe: 0, fahrtAktiv: false, stufe: 0 });
    for (const b of zustand.bereiche) { b.punkte = b.max; b.zustand = 1; b.rumpfSchaden = 0; b.treffer = 0; b.stufe = 0; }
    for (const t of zustand.trupps) { t.bereich = null; t.weg = 0; t.arbeit = 'frei'; }
    for (const e of zustand.ansagen.liste) { e.nr = 0; e.takt = 0; e.station = ''; e.text = ''; }
    zustand.ansagen.anzahl = 0; zustand.abgewiesen = 0; zustand.angenommen = 0;
    schlange.fill(null); inSchlange = 0; stoppOffen = false;
    turmQuelle = null; turmLast = []; batterie = { waffenOben: [], waffenUnten: [] };
    Object.assign(steuer, { lenkt: false, faehrt: false, gieren: 0, nicken: 0, rollen: 0, hebel: 0, stopp: false });
    Object.assign(wirkung, { steuer: null, hebelMax: 1, nachbrennerFrei: true, drehFaktor: 1, feuerFrei: true, reparatur: 0, sensorReichweite: Z.sensor });
    wirkung.tuermeAus.length = 0; wirkung.turmGrund.length = 0;
  }

  // ---------- Befehle ----------
  function befehl(b) {
    const p = pruefeBefehl(b);
    if (!p.ok) { zustand.abgewiesen++; return p; }
    if (inSchlange >= schlange.length) { zustand.abgewiesen++; return { ok: false, grund: 'Warteschlange voll' }; }
    schlange[inSchlange++] = p.befehl;
    zustand.angenommen++;
    return { ok: true };
  }

  function setzeTrupp(nr, bereich) {
    const t = zustand.trupps[nr - 1];
    if (t.bereich === bereich) return;
    t.bereich = bereich;
    t.weg = bereich ? Z.alarm[zustand.alarm].weg : 0;
    t.arbeit = bereich ? 'unterwegs' : 'frei';
  }

  function schadenskontrolle() {
    // WARUM Rang aus Zustand UND Rumpfschaden: ein heiler Bereich mit offenem Rumpfschaden lohnt den Trupp auch
    const rang = zustand.bereiche.map((b, i) => ({ i, w: (1 - b.zustand) + b.rumpfSchaden / b.max }));
    rang.sort((a, b) => (b.w - a.w) || (a.i - b.i));
    const beschaedigt = rang.filter((r) => r.w > 0);
    for (let k = 0; k < TRUPPS; k++) {
      const r = beschaedigt.length ? beschaedigt[k % beschaedigt.length] : null;
      setzeTrupp(k + 1, r ? zustand.bereiche[r.i].id : null);
    }
  }

  function fuehreAus(b) {
    const N = zustand.navigator, W = zustand.waffen;
    const kenn = b.station;
    switch (b.station + '.' + b.art) {
      case 'navigator.kurs': {
        // peilung auf [0, 2π) bringen — WARUM: Anzeige und Prüfsumme sehen denselben Wert, egal wie er kam
        const tau = 2 * Math.PI;
        N.peilung = ((b.peilung % tau) + tau) % tau; N.hoehe = b.hoehe; N.kursAktiv = true;
        break;
      }
      case 'navigator.fahrt': N.stufe = b.stufe; N.fahrtAktiv = true; break;
      case 'navigator.kursAus': N.kursAktiv = false; N.fahrtAktiv = false; break;
      case 'navigator.stopp': N.stufe = 0; N.fahrtAktiv = true; stoppOffen = true; break;
      case 'waffen.feuer': W.frei = b.frei; break;
      case 'waffen.modus': W.modus = b.modus; break;
      case 'waffen.munition': W.munition = b.munition; break;
      case 'waffen.zielVorgabe': W.zielVorgabe = b.zielId; break;
      case 'technik.trupp': setzeTrupp(b.nr, b.bereich); break;
      case 'technik.energie': zustand.energie.antrieb = b.antrieb; zustand.energie.waffen = b.waffen; zustand.energie.reparatur = b.reparatur; break;
      case 'kapitaen.alarm':
        if (zustand.alarm !== b.stufe) ansage(kenn, b.stufe === 'rot' ? 'ALARM ROT — Gefechtsstationen' : b.stufe === 'gelb' ? 'Alarm Gelb — Bereitschaft' : 'Alarm Grün — Waffen gesichert');
        zustand.alarm = b.stufe;
        break;
      case 'kapitaen.ansage': ansage(kenn, b.text.trim()); break;
      case 'kapitaen.anweisung': {
        ansage(kenn, ANWEISUNGEN[b.code]);
        const c = b.code;
        if (c === 'gefechtsstationen') { zustand.alarm = 'rot'; W.frei = true; }
        else if (c === 'feuerHalt') W.frei = false;
        else if (c === 'feuerFrei') W.frei = true;
        else if (c === 'schadenskontrolle') schadenskontrolle();
        else if (c === 'energieWaffen') Object.assign(zustand.energie, Z.energieWaffen);
        else if (c === 'energieAntrieb') Object.assign(zustand.energie, Z.energieAntrieb);
        else if (c === 'energieAusgleich') Object.assign(zustand.energie, Z.energieStandard);
        else if (c === 'kursHalten') { N.kursAktiv = false; N.fahrtAktiv = false; }
        else if (c === 'volleFahrt') { N.stufe = 3; N.fahrtAktiv = true; }
        break;
      }
    }
  }

  // ---------- Treffer → Bereich ----------
  // Wiederverwendetes Ergebnis — WARUM: keine neuen Objekte je Treffer
  const zuordnung = { bereich: '', turm: -1 };
  /** Schiffs-Lokalpunkt → Bereich (+ Turm-Index bei Turmnähe, sonst −1); schreibt in `zuordnung`. */
  function ordneZu(lx, ly, lz, tuerme) {
    // Turmnähe zuerst: Treffer an einer Lafette beschädigen die Batterie (oben/unten), nicht den Rumpfabschnitt
    let best = -1, bestD = Z.turmRadius * Z.turmRadius;
    for (let i = 0; i < (tuerme?.length ?? 0); i++) {
      const l = tuerme[i].lafette; if (!l) continue;
      const dx = lx - l.x, dy = ly - l.y, dz = lz - l.z, d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    zuordnung.turm = best;
    if (best >= 0) { zuordnung.bereich = tuerme[best].lafette.oben === false ? 'waffenUnten' : 'waffenOben'; return zuordnung; }
    const u = (lz - zMin) / spanne;
    zuordnung.bereich = u > band.bug ? 'bug' : u > band.mitte ? 'mitte' : u > band.heck ? 'heck' : 'antrieb';
    return zuordnung;
  }

  let reihe = [];
  function turmTabelle(tuerme) {
    if (turmQuelle === tuerme && turmLast.length === tuerme.length) return;
    turmQuelle = tuerme;
    turmLast = new Array(tuerme.length).fill(0);
    batterie = { waffenOben: [], waffenUnten: [] };
    tuerme.forEach((t, i) => batterie[t.lafette?.oben === false ? 'waffenUnten' : 'waffenOben'].push(i));
    // Besetzungs-Reihenfolge (Befund Prüfer R23, Kann 3): Hauptbatterie zuerst besetzt, Gatlings zuletzt — WARUM: sonst
    // fiele in Gelb bei einer Werft-Form mit schwerem Turm hinten in der Liste die Hauptbatterie aus
    reihe = [...tuerme.keys()].filter((i) => tuerme[i].typ === 'schwer').concat([...tuerme.keys()].filter((i) => tuerme[i].typ !== 'schwer'));
  }

  // ---------- Autopilot ----------
  function achse(fehler, ist, M, B) {
    const e = Math.abs(fehler);
    const rate = Math.sign(fehler) * Math.min(M, Z.kp * e, Math.sqrt(2 * B * Z.brems * e));
    return klemme((rate + Z.kd * (rate - ist)) / M, -1, 1);
  }

  function autopilot(dt, z, werte) {
    const N = zustand.navigator;
    steuer.lenkt = N.kursAktiv; steuer.faehrt = N.fahrtAktiv; steuer.stopp = false;
    steuer.gieren = steuer.nicken = steuer.rollen = steuer.hebel = 0;
    if (!N.kursAktiv && !N.fahrtAktiv) { stoppOffen = false; return null; }
    if (N.kursAktiv && z.rot) {
      const ch = Math.cos(N.hoehe);
      // Weltkurs → Richtung: peilung = atan2(−dx, dz) (Uhrzeigersinn auf dem Lageschirm, Festlegung stationsbefehle.js)
      tmpD.x = -Math.sin(N.peilung) * ch; tmpD.y = Math.sin(N.hoehe); tmpD.z = Math.cos(N.peilung) * ch;
      const d = zuSchiff(z, tmpD, tmpL);
      const fG = Math.atan2(d.x, d.z);                    // > 0: Ziel links (+X) → gieren +
      const fN = Math.atan2(d.y, Math.hypot(d.x, d.z));   // > 0: Ziel oben → nicken + (Nase hoch)
      const u = zuSchiff(z, OBEN, tmpD);
      const fR = Math.atan2(u.x, u.y);                    // > 0: Schiff nach rechts gerollt → links zurückrollen
      const M = werte?.drehMax ?? { nicken: 0.2, gieren: 0.18, rollen: 0.4 };
      const B = werte?.drehBeschl ?? { nicken: 0.18, gieren: 0.16, rollen: 0.6 };
      const dr = z.dreh ?? tmpD;
      // Vorzeichen schiff.js: dreh.y > 0 = Nase links; nicken +1 → dreh.x negativ; dreh.z > 0 = Rolle rechts
      steuer.gieren = achse(fG, dr.y, M.gieren, B.gieren);
      steuer.nicken = achse(fN, -dr.x, M.nicken, B.nicken);
      steuer.rollen = achse(-fR, dr.z, M.rollen, B.rollen);
    }
    if (N.fahrtAktiv) {
      const soll = Math.min(FAHRTSTUFEN[N.stufe + 1].hebel, wirkung.hebelMax);
      steuer.hebel = klemme((soll - (z.hebel ?? 0)) * Z.hebelK, -1, 1);
      if (stoppOffen) { steuer.stopp = true; stoppOffen = false; }
    }
    return steuer;
  }

  // ---------- Schritt ----------
  function schritt(dt, lage = {}) {
    zustand.takt++;
    // 1) Befehle der Warteschlange (Reihenfolge des Eingangs)
    for (let i = 0; i < inSchlange; i++) { fuehreAus(schlange[i]); schlange[i] = null; }
    inSchlange = 0;
    const z = lage.schiffZ, tuerme = lage.tuerme ?? [];
    const A = Z.alarm[zustand.alarm];
    if (tuerme.length) turmTabelle(tuerme);

    // 2) Treffer → Bereiche (Schiffs-Lokallage des Einschlags im Moment des Treffers)
    if (z && lage.treffer?.length) {
      for (const t of lage.treffer) {
        tmpD.x = t.pos.x - z.pos.x; tmpD.y = t.pos.y - z.pos.y; tmpD.z = t.pos.z - z.pos.z;
        const l = zuSchiff(z, tmpD, tmpL);
        const r = ordneZu(l.x, l.y, l.z, tuerme);
        const b = bereichNach[r.bereich];
        b.punkte = Math.max(0, b.punkte - t.schaden * Z.trefferFaktor);
        b.rumpfSchaden += t.schaden; b.treffer++;
        if (r.turm >= 0) turmLast[r.turm] += t.schaden;
      }
    }

    // 3) Energie (Reaktor mittschiffs skaliert alles)
    const E = zustand.energie, S = Z.energieStandard;
    const reaktor = Z.reaktorRest + (1 - Z.reaktorRest) * wirk(bereichNach.mitte.zustand);
    const vAntrieb = E.antrieb / S.antrieb * reaktor, vWaffen = E.waffen / S.waffen * reaktor, vRep = E.reparatur / S.reparatur * reaktor;

    // 4) Trupps: Weg, dann Reparatur von Bereich und Rumpfschaden dieses Bereichs
    let rumpfHp = 0;
    const lebt = !(z?.zerstoert);
    for (const t of zustand.trupps) {
      if (!t.bereich) { t.arbeit = 'frei'; continue; }
      if (t.weg > 0) {
        t.weg = Math.max(0, t.weg - dt);
        t.arbeit = 'unterwegs';
        if (t.weg === 0) ansage('technik', 'Trupp ' + t.nr + ' vor Ort: ' + bereichNach[t.bereich].name);
        continue;
      }
      const b = bereichNach[t.bereich], f = A.reparatur * vRep;
      if (!lebt || (b.punkte >= b.max && b.rumpfSchaden <= 0)) { t.arbeit = 'bereit'; continue; }
      t.arbeit = 'repariert';
      b.punkte = Math.min(b.max, b.punkte + Z.truppBereich * f * dt);
      const hp = Math.min(b.rumpfSchaden, Z.truppRumpf * f * dt);
      b.rumpfSchaden -= hp; rumpfHp += hp;
      if (b.punkte >= b.max && b.rumpfSchaden <= 1e-9) { b.rumpfSchaden = 0; ansage('technik', b.name + ' instand gesetzt'); }
    }
    wirkung.reparatur = dt > 0 ? rumpfHp / dt : 0;

    // 5) Zustände + Meldungen beim Über-/Unterschreiten der Schadensstufen
    for (const b of zustand.bereiche) {
      b.zustand = b.punkte / b.max;
      const st = b.zustand < Z.schadenStufen[1] ? 2 : b.zustand < Z.schadenStufen[0] ? 1 : 0;
      if (st > b.stufe) ansage('technik', st === 2 ? b.name + ' AUSGEFALLEN' : b.name + ' beschädigt (' + Math.round(b.zustand * 100) + ' %)');
      b.stufe = st;
    }

    // 6) Wirkungen
    const zA = bereichNach.antrieb.zustand;
    wirkung.hebelMax = klemme(Math.min(1, vAntrieb) * (Z.antriebRest + (1 - Z.antriebRest) * wirk(zA)), Z.hebelMin, 1);
    wirkung.nachbrennerFrei = vAntrieb >= Z.nachbrenner.versorgung && zA >= Z.nachbrenner.antrieb;
    wirkung.drehFaktor = Z.drehRest + (1 - Z.drehRest) * wirk(bereichNach.heck.zustand);
    wirkung.sensorReichweite = Z.sensor * (Z.sensorRest + (1 - Z.sensorRest) * wirk(bereichNach.bug.zustand));
    wirkung.feuerFrei = zustand.waffen.frei && A.waffenFrei;
    // Türme: erst Batterieschaden (meistgetroffene zuerst), dann Energie × Besatzung (von hinten in der Turmliste)
    const G = wirkung.turmGrund, aus = wirkung.tuermeAus;
    G.length = tuerme.length; G.fill(0); aus.length = 0;
    for (const seite of SEITEN) {
      const zb = bereichNach[seite].zustand, liste = batterie[seite];
      if (zb >= Z.batterieSchwelle || !liste.length) continue;
      const n = Math.ceil(liste.length * (Z.batterieSchwelle - zb) / Z.batterieSchwelle - 1e-9);
      liste.sort(sortierer);
      for (let k = 0; k < n && k < liste.length; k++) G[liste[k]] = 1;
    }
    let platz = Math.floor(Math.min(1, vWaffen) * A.besetzung * tuerme.length + 1e-9);
    for (const i of reihe) if (G[i] === 0) { if (platz > 0) platz--; else G[i] = 2; }
    for (let i = 0; i < tuerme.length; i++) if (G[i]) aus.push(i);

    // 7) Zielvorgabe verfällt, wenn das Ziel weg ist (abgeschossen / Platz neu belegt)
    if (zustand.waffen.zielVorgabe !== null && lage.ziele) {
      let da = false;
      for (const g of lage.ziele) if (g.aktiv && g.id === zustand.waffen.zielVorgabe) { da = true; break; }
      if (!da) { ansage('waffen', 'Ziel ' + zustand.waffen.zielVorgabe + ' erloschen — Vorgabe aufgehoben'); zustand.waffen.zielVorgabe = null; }
    }

    // 8) Autopilot (nach hebelMax — die Fahrtstufe respektiert den Antriebsschaden)
    wirkung.steuer = z ? autopilot(dt, z, lage.werte) : null;
    return wirkung;
  }

  /** Gleichlauf: alle Zahlen des Zustands, gewichtet (gleiche Befehlsfolge + gleiche Lage → gleiche Summe). */
  function pruefsumme() {
    const N = zustand.navigator, W = zustand.waffen, E = zustand.energie;
    let s = zustand.takt * 0.001 + ALARM_CODE[zustand.alarm] * 3 + E.antrieb * 1.1 + E.waffen * 1.3 + E.reparatur * 1.7;
    s += (W.frei ? 5 : 0) + MODUS_CODE[W.modus] * 7 + MUN_CODE[W.munition] * 11 + (W.zielVorgabe ?? 0) * 13;
    s += (N.kursAktiv ? 17 : 0) + N.peilung * 19 + N.hoehe * 23 + (N.fahrtAktiv ? 29 : 0) + N.stufe * 31;
    zustand.bereiche.forEach((b, i) => { s += b.punkte * (i + 1.5) + b.rumpfSchaden * (i + 2.5) + b.treffer * 0.37; });
    zustand.trupps.forEach((t, i) => { s += t.weg * (i + 3.1) + (t.bereich ? BEREICHE.findIndex((x) => x.id === t.bereich) + 1 : 0) * (i + 4.3); });
    s += zustand.ansagen.anzahl * 0.71 + wirkung.reparatur * 0.53 + wirkung.hebelMax * 41 + wirkung.tuermeAus.length * 43;
    if (wirkung.steuer) s += wirkung.steuer.gieren * 47 + wirkung.steuer.nicken * 53 + wirkung.steuer.rollen * 59 + wirkung.steuer.hebel * 61;
    return s;
  }

  return { zustand, wirkung, befehl, schritt, zuruecksetzen, pruefsumme, ansagen, ordneZu, rumpf: { zMin, zMax } };
}
