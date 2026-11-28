// ZWECK: Angreifer-KI des Gefechtstests (R14, Nutzer: „ein Schiff fliegen und von gegnerischen Schiffen angegriffen
//        werden“): Kanonenboote fliegen in Rotten zu zweit Angriffsläufe auf das (vom Spieler gesteuerte) Schiff und
//        schießen mit einer Autokanone (sichtbare Geschosse) auf den Rumpf. Wellen 4 → 6 → 8, Neustart, Wellenpause.
//        Ablauf je Schiff (Zustandsautomat): sammeln (1800 m, Peilung im Schiffsrahmen, Rotte wartet aufeinander) →
//        anlauf (Schlangenlinie, Feuer 700 → 380 m) → abdrehen (nach außen, am Schiff vorbei) → ausholen bis 1500 m →
//        nächste Peilung 110° weiter (WARUM: Angriffe aus wechselnden Richtungen, die Türme müssen sich verteilen).
//        Lesbarkeit (Rolle KI): Rotten starten gemeinsam, Feuer nur mit der Nase zum Schiff, sichtbare Leuchtspur.
//        R23 (Nutzer: „die großen Batteriegeschütze mit zwei Munitionstypen … panzerbrechende Geschosse gegen Panzerung“):
//        zweiter Gegnertyp PANZERBOOT (art 'panzer', r 16, 900 HP, panzer 0,85, 110 m/s, schwere Kanone) — ab Welle 2
//        je Welle 1, ab Welle 3 je 2, ohne Neustart. Plätze: erst die Kanonenboote (0 … boote−1), dahinter die Panzerboote
//        (gerade Startnummer → zwei Panzerboote bilden eine eigene Rotte). Welle 1 bleibt bitgleich zum Stand R22.
//        Die Schadensdämpfung (Flak × (1 − panzer)) rechnet die WAFFE; hier stehen nur r / hp / panzer.
// LIEFERT: erstelleAngreifer({ startwert, abstand? }) (abstand: Felder aus ANGREIFER_ABSTAENDE, R21) → { ziele, geschosse, welle, statistik, schritt(dt, flakEreignisse, schiffZ,
//          kugeln) → { abschuesse[{ id, pos }], treffer[{ pos, schaden }] }, zuruecksetzen() } · ANGREIFER (Werte) · GEGNER_TYP
//          ziele[i] = { id, pos, vel, vorPos, r, hp, hpMax, aktiv, angriff, vorstoss (immer false), phase, art ('boot' |
//          'panzer'), panzer (0..1) } — WELT, feste Slots (R23: 10 = 8 Boote + 2 Panzerboote)
//          geschosse = Pool { max, anzahlAktiv, aktiv (Uint8), pos/vorPos/vel (Float64 ×3), alter (Takte), art (Uint8:
//          0 Autokanone, 1 schwere Kanone, R23 für die Grafik) } — WELT
//          welle = { nr, gleichzeitig (belegte Plätze = boote + panzer), boote, panzer, rest (Neustarts übrig),
//          pause (s bis zur nächsten Welle, 0 = läuft) }
//          statistik = { abschuesse, laeufe, schuesse, treffer, schaden }
//          schiffZ = { pos, vel, rot (Quaternion), zerstoert } (schiff.js) · kugeln = Rumpfkugeln Schiffs-Lokal (SCHIFFSDATEN)
// REGEL: Simulation — kein DOM, kein Math.random (eigener Zufall mit Startwert), fester Schritt, keine neuen Objekte im
//        Schritt. Flak-Ereignisse aus Schritt n wirken zu Beginn von Schritt n+1 (wie zieldrohnen.js). Der Schaden am
//        Schiff wird NUR gemeldet (treffer) — die Gefecht-Welt zieht ihn von schiff.z.hp ab (Entscheidung 3).
//        `vel` ist die echte Schrittgeschwindigkeit (pos − vorPos = vel·dt) — WARUM: Vorhalt der Turm-KI.
import { zufall } from '../zufall.js';
import { abfangen } from './turmziel.js';
import { zuWelt, zuSchiff } from './schiffsrahmen.js';

export const ANGREIFER = {
  // WARUM Wellen statt Dauerstrom: Atempause für den Spieler, Steigerung sichtbar. Ab Welle 3 bleibt es bei 8.
  wellen: [4, 6, 8],
  kontingent: 2,          // Schiffe je Platz und Welle (1 Neustart je Platz nach `neustart` s)
  neustart: 8, wellenPause: 15, erstePause: 3, // s
  // WARUM r 6 / 100 HP wie die Zieldrohnen: die Flak-Balance des Labors (T1) bleibt übertragbar
  r: 6, hpMax: 100,
  // m/s, m/s². WARUM 170: das Schiff schafft 60 (90 mit Nachbrenner) — die Boote holen es sicher ein, bleiben aber
  // im Flak-Feld lange sichtbar (1800 → 700 m ≈ 6,5 s)
  tempo: 170, tempoAb: 185, beschl: 60,
  start: 2600,            // m: Erscheinen (Schiffsabstand)
  sammeln: 1800, sammelNah: 250, sammelMax: 12, // m, m, s (Rotte wartet höchstens so lange auf den Partner)
  nickPeil: [0.45, -0.35], // rad: Sammelhöhe je Rotte (gerade Rotten von oben, ungerade von unten)
  peilSchritt: 1.9,       // rad: nächste Peilung (≈ 110°)
  feuerAb: 700, abdrehen: 380, ausholen: 1500, // m (Schiffsmitte)
  // WARUM 170 m: der Rumpf reicht ≤ 133 m weit (Bug-Kugel z 120, r 12,5) — kein Boot fliegt durch das Schiff
  mindest: 170,
  trenn: 60,              // m: weicher Abstand untereinander
  rumpfZiel: 90,          // m: Zielpunkt auf dem Rumpf längs (Schiff z ± 90), je Lauf neu
  schlange: { winkel: 0.18, omega: 2.1 }, // rad, rad/s: Schlangenlinie im Anlauf (erschwert den Vorhalt der Flak)
  ausweich: { nah: 80, dauer: 1.2, pause: 2.5, anteil: 0.6 }, // nahe Detonation → Haken quer
  waffe: {
    // WARUM 600 m/s: halb so schnell wie die Flak → Geschoss gut als eigene Leuchtspur zu sehen; Reichweite = feuerAb
    v: 600, rate: 4, streu: 0.5 * Math.PI / 180, leben: 1.4, schaden: 15,
    kegel: 0.26,          // rad: Feuer nur, wenn die Flugrichtung (relativ zum Schiff) so nah am Ziel liegt
    pool: 128,
  },
  // R23 Panzerboote je Welle (letzter Wert gilt weiter). WARUM erst ab Welle 2: Welle 1 lehrt die Kanonenboote, und der
  // Gefecht-Bezug (60 s, Welle 2 beginnt frühestens nach 61 s) bleibt bitgleich.
  panzerWellen: [0, 1, 2],
  panzer: {
    // WARUM r 16 / 900 HP / panzer 0,85: Gatling-Flak macht ×0,15 Schaden → 900 HP wirken wie 6000 HP gegen Flak (Messung
    // im Bericht: Gatlings allein > 60 s); eine Panzergranate (voller Schaden, Treffer über r) braucht ≈ 5–6 Treffer.
    r: 16, hpMax: 900, panzer: 0.85,
    // m/s, m/s². WARUM 110 (Boot 170): schwer und lesbar — der Spieler sieht es kommen und kann die Hauptbatterie umstellen
    tempo: 110, tempoAb: 120, beschl: 35,
    // WARUM 450 m/s, 1,2/s, 60 Schaden: „schwerere Kanone“ — je Treffer 4× Autokanone, Feuerrate 30 %, Schadensrate
    // ≈ 1,2× eines Boots (ein Panzerboot ist gefährlich, aber nicht die ganze Welle). leben 1,8 s → Reichweite 810 m ≥ feuerAb.
    waffe: { v: 450, rate: 1.2, streu: 0.6 * Math.PI / 180, leben: 1.8, schaden: 60, kegel: 0.22 },
  },
};

/** R23: Typentabelle für Grafik und CIC (Name, Größe, Härte; Werte aus ANGREIFER). */
export const GEGNER_TYP = Object.freeze({
  boot: Object.freeze({ name: 'Kanonenboot', kurz: 'KB', r: ANGREIFER.r, hpMax: ANGREIFER.hpMax, panzer: 0, tempo: ANGREIFER.tempo,
    waffe: 'Autokanone', munitionEmpfohlen: 'flak' }),
  panzer: Object.freeze({ name: 'Panzerboot', kurz: 'PB', r: ANGREIFER.panzer.r, hpMax: ANGREIFER.panzer.hpMax, panzer: ANGREIFER.panzer.panzer,
    tempo: ANGREIFER.panzer.tempo, waffe: 'Schwere Kanone', munitionEmpfohlen: 'panzer' }),
});

const L = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const welleWert = (liste, nr) => liste[Math.min(nr - 1, liste.length - 1)];
// WARUM die Summe je Welle (nicht Max Boote + Max Panzer): die Plätze müssen für jede Welle reichen (R23: 8 + 2 = 10)
const MAXS = Math.max(...ANGREIFER.wellen.map((b, k) => b + welleWert(ANGREIFER.panzerWellen, k + 1)),
  ...ANGREIFER.panzerWellen.map((p, k) => p + welleWert(ANGREIFER.wellen, k + 1)));
/** Grundzustand der Arbeitsfelder je Platz (Erzeugen UND zuruecksetzen — eine Stelle für beides, Lehre R10). */
const ST_GRUND = Object.freeze({ tot: 0, peil: 0, nick: 0, t: 0, cd: 0, weave: 0, zielZ: 0, bereit: false, weich: 0, weichPause: 0,
  wx: 0, wy: 0, wz: 0, ax: 0, ay: 0, az: 0 });

/** R21 (Form im Gefecht): diese Abstände (m, Schiffsmitte) darf der Aufrufer je Schiffsgröße setzen. */
export const ANGREIFER_ABSTAENDE = ['mindest', 'rumpfZiel', 'feuerAb', 'abdrehen', 'ausholen', 'sammeln', 'start'];

export function erstelleAngreifer({ startwert = 404, abstand = null } = {}) {
  // WARUM eine Kopie nur mit abstand: ohne Angabe bleibt alles bitgleich (dasselbe ANGREIFER-Objekt)
  let A = ANGREIFER;
  if (abstand) { A = { ...ANGREIFER }; for (const k of ANGREIFER_ABSTAENDE) if (Number.isFinite(abstand[k])) A[k] = abstand[k]; }
  const WF = A.waffe, P = A.panzer;
  // Werte je Art (0 Boot, 1 Panzerboot) — feste Tabellen, im Schritt nur gelesen
  const WAFFE = [WF, { ...WF, ...P.waffe }];
  const TEMPO = [A.tempo, P.tempo], TEMPO_AB = [A.tempoAb, P.tempoAb], BESCHL = [A.beschl, P.beschl];
  let rnd = zufall(startwert);
  const ziele = [], st = [], abschussVorrat = [];
  const artSlot = new Uint8Array(MAXS); // Art je Platz in der laufenden Welle (0 Boot, 1 Panzerboot)
  for (let i = 0; i < MAXS; i++) {
    ziele.push({ id: 0, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, vorPos: { x: 0, y: 0, z: 0 }, r: A.r, hp: 0,
      hpMax: A.hpMax, aktiv: false, angriff: false, vorstoss: false, phase: 'warten', art: 'boot', panzer: 0 });
    st.push({ ...ST_GRUND });
    abschussVorrat.push({ id: 0, pos: { x: 0, y: 0, z: 0 } });
  }
  const N = WF.pool;
  const geschosse = { max: N, anzahlAktiv: 0, verworfen: 0, aktiv: new Uint8Array(N), alter: new Uint16Array(N),
    art: new Uint8Array(N), pos: new Float64Array(N * 3), vorPos: new Float64Array(N * 3), vel: new Float64Array(N * 3) };
  const trefferVorrat = Array.from({ length: N }, () => ({ pos: { x: 0, y: 0, z: 0 }, schaden: 0 }));
  const abschuesse = [], treffer = [], ergebnis = { abschuesse, treffer };
  const welle = { nr: 0, gleichzeitig: 0, boote: 0, panzer: 0, rest: 0, pause: 0 };
  const statistik = { abschuesse: 0, laeufe: 0, schuesse: 0, treffer: 0, schaden: 0 };
  let naechsteId, zeiger;
  // Vorlagen (keine neuen Objekte im Schritt)
  const v1 = { x: 0, y: 0, z: 0 }, v2 = { x: 0, y: 0, z: 0 }, ab = { t: 0, x: 0, y: 0, z: 0 }, mP = { x: 0, y: 0, z: 0 };
  const tP = { x: 0, y: 0, z: 0 }, tV = { x: 0, y: 0, z: 0 };

  function zuruecksetzen() {
    rnd = zufall(startwert);
    naechsteId = 1; zeiger = 0;
    // WARUM alle Felder (Prüfer R21, Pflege R22): Neustart = frische Instanz. Lage/Tempo leerer Plätze gehen in die
    // Prüfsumme ein (5255,9 statt 5010,4); die Arbeitsfelder je Platz (st) setzen wir mit, damit kein Rest überlebt.
    for (let i = 0; i < MAXS; i++) {
      const z = ziele[i]; z.aktiv = false; z.angriff = false; z.vorstoss = false; z.hp = 0; z.hpMax = A.hpMax; z.r = A.r;
      z.phase = 'warten'; z.id = 0; z.art = 'boot'; z.panzer = 0;
      z.pos.x = z.pos.y = z.pos.z = 0; z.vel.x = z.vel.y = z.vel.z = 0; z.vorPos.x = z.vorPos.y = z.vorPos.z = 0;
      Object.assign(st[i], ST_GRUND);
      const a = abschussVorrat[i]; a.id = 0; a.pos.x = a.pos.y = a.pos.z = 0;
    }
    for (const t of trefferVorrat) { t.pos.x = t.pos.y = t.pos.z = 0; t.schaden = 0; }
    for (const v of [v1, v2, mP, tP, tV]) v.x = v.y = v.z = 0;
    ab.t = ab.x = ab.y = ab.z = 0;
    geschosse.aktiv.fill(0); geschosse.anzahlAktiv = 0; geschosse.verworfen = 0;
    geschosse.alter.fill(0); geschosse.art.fill(0); geschosse.pos.fill(0); geschosse.vorPos.fill(0); geschosse.vel.fill(0);
    artSlot.fill(0);
    welle.nr = 0; welle.gleichzeitig = 0; welle.boote = 0; welle.panzer = 0; welle.rest = 0; welle.pause = A.erstePause;
    for (const k in statistik) statistik[k] = 0;
    abschuesse.length = 0; treffer.length = 0;
  }

  /** Punkt im Schiffsrahmen (lx, ly, lz) → Welt nach aus. */
  function weltPunkt(schiffZ, lx, ly, lz, aus) {
    v1.x = lx; v1.y = ly; v1.z = lz; zuWelt(schiffZ, v1, aus);
    aus.x += schiffZ.pos.x; aus.y += schiffZ.pos.y; aus.z += schiffZ.pos.z;
    return aus;
  }

  function erscheine(i, schiffZ) {
    const z = ziele[i], s = st[i], p = st[i ^ 1], pz = ziele[i ^ 1];
    // Rotte: Partner aktiv → gleiche Peilung, sonst neue (Zufall mit Startwert). R23: nur Partner derselben Art
    if (pz && pz.aktiv && (i ^ 1) < welle.gleichzeitig && artSlot[i ^ 1] === artSlot[i]) { s.peil = p.peil; s.nick = p.nick; }
    else { s.peil = rnd() * 2 * Math.PI; s.nick = A.nickPeil[(i >> 1) & 1]; }
    const g = rnd() * 2 * Math.PI, n = -0.6 + rnd() * 1.4, c = Math.cos(n);
    weltPunkt(schiffZ, Math.sin(g) * c * A.start, Math.sin(n) * A.start, Math.cos(g) * c * A.start, z.pos);
    const dx = schiffZ.pos.x - z.pos.x, dy = schiffZ.pos.y - z.pos.y, dz = schiffZ.pos.z - z.pos.z, d = L(dx, dy, dz) || 1;
    const art = artSlot[i], tempo = TEMPO[art];
    z.vel.x = dx / d * tempo; z.vel.y = dy / d * tempo; z.vel.z = dz / d * tempo;
    z.vorPos.x = z.pos.x; z.vorPos.y = z.pos.y; z.vorPos.z = z.pos.z;
    // R23: Art-Werte bei jedem Erscheinen (der Platz kann in der nächsten Welle die Art wechseln)
    if (art) { z.art = 'panzer'; z.r = P.r; z.hpMax = P.hpMax; z.panzer = P.panzer; } else { z.art = 'boot'; z.r = A.r; z.hpMax = A.hpMax; z.panzer = 0; }
    z.id = naechsteId++; z.hp = z.hpMax; z.aktiv = true; z.angriff = false; z.phase = 'sammeln';
    s.tot = 0; s.t = 0; s.cd = 0; s.weave = rnd() * 2 * Math.PI; s.zielZ = (rnd() * 2 - 1) * A.rumpfZiel;
    s.bereit = false; s.weich = 0; s.weichPause = 0;
  }

  function starteWelle(schiffZ) {
    welle.nr++;
    welle.boote = welleWert(A.wellen, welle.nr);
    welle.panzer = welleWert(A.panzerWellen, welle.nr);
    welle.gleichzeitig = welle.boote + welle.panzer;
    for (let i = 0; i < MAXS; i++) artSlot[i] = i >= welle.boote && i < welle.gleichzeitig ? 1 : 0;
    // WARUM Neustarts nur für Boote: „je Welle 1 Panzerboot“ (R23) — ein abgeschossenes Panzerboot kommt nicht wieder
    welle.rest = welle.boote * (A.kontingent - 1);
    welle.pause = 0;
    for (let i = 0; i < welle.gleichzeitig; i++) erscheine(i, schiffZ);
  }

  function ausweichen(i, px, py, pz) {
    const s = st[i], z = ziele[i];
    if (s.weich > 0 || s.weichPause > 0) return;
    // Haken quer zur Flugrichtung, weg von der Detonation (Anteil der Wunschrichtung)
    const v = z.vel, vl = L(v.x, v.y, v.z) || 1;
    let ex = z.pos.x - px, ey = z.pos.y - py, ez = z.pos.z - pz;
    const k = (ex * v.x + ey * v.y + ez * v.z) / vl;
    ex -= k * v.x / vl; ey -= k * v.y / vl; ez -= k * v.z / vl;
    let el = L(ex, ey, ez);
    if (el < 1e-6) { ex = v.z; ey = 0; ez = -v.x; el = L(ex, ey, ez) || 1; }
    s.wx = ex / el; s.wy = ey / el; s.wz = ez / el; s.weich = A.ausweich.dauer;
  }

  function schiesse(i, schiffZ, tx, ty, tz) {
    const z = ziele[i], p = z.pos, v = z.vel, vs = schiffZ.vel, WF = WAFFE[artSlot[i]];
    // Abfangen im mitbewegten Rahmen des Schützen: Ziel relativ (vs − v), Geschoss v0 relativ, erbt das Bootstempo
    tP.x = tx; tP.y = ty; tP.z = tz; tV.x = vs.x - v.x; tV.y = vs.y - v.y; tV.z = vs.z - v.z;
    let dx, dy, dz;
    if (abfangen(p, tP, tV, WF.v, ab)) { dx = ab.x - p.x; dy = ab.y - p.y; dz = ab.z - p.z; } else { dx = tx - p.x; dy = ty - p.y; dz = tz - p.z; }
    let d = L(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
    // Streuung (Dreieck) um zwei Querachsen
    let qx = dz, qy = 0, qz = -dx, ql = L(qx, qy, qz);
    if (ql < 1e-6) { qx = 1; qz = 0; ql = 1; }
    qx /= ql; qz /= ql;
    const hx = dy * qz - dz * qy, hy = dz * qx - dx * qz, hz = dx * qy - dy * qx;
    const e1 = (rnd() + rnd() - 1) * WF.streu, e2 = (rnd() + rnd() - 1) * WF.streu;
    dx += e1 * qx + e2 * hx; dy += e1 * qy + e2 * hy; dz += e1 * qz + e2 * hz;
    d = L(dx, dy, dz); dx /= d; dy /= d; dz /= d;
    // freien Platz im Pool suchen (Ring), sonst verwerfen
    let k = -1;
    for (let a = 0; a < N; a++) { const j = (zeiger + a) % N; if (!geschosse.aktiv[j]) { k = j; break; } }
    if (k < 0) { geschosse.verworfen++; return; }
    zeiger = (k + 1) % N;
    const g = geschosse, o = k * 3;
    g.aktiv[k] = 1; g.anzahlAktiv++; g.alter[k] = 0; g.art[k] = artSlot[i];
    g.pos[o] = g.vorPos[o] = p.x; g.pos[o + 1] = g.vorPos[o + 1] = p.y; g.pos[o + 2] = g.vorPos[o + 2] = p.z;
    g.vel[o] = dx * WF.v + v.x; g.vel[o + 1] = dy * WF.v + v.y; g.vel[o + 2] = dz * WF.v + v.z;
    statistik.schuesse++;
  }

  /** Ein Boot fliegt: Wunschgeschwindigkeit RELATIV zum Schiff (vs + Richtung · Tempo), Beschleunigung begrenzt. */
  function fliege(i, dt, schiffZ) {
    const z = ziele[i], s = st[i], p = z.pos, v = z.vel, S = schiffZ.pos, vs = schiffZ.vel, art = artSlot[i], WF = WAFFE[art];
    const rx = p.x - S.x, ry = p.y - S.y, rz = p.z - S.z, d = L(rx, ry, rz) || 1;
    let wx, wy, wz, tempo = TEMPO[art];
    s.t += dt; s.cd -= dt;
    if (s.weich > 0) { s.weich -= dt; if (s.weich <= 0) s.weichPause = A.ausweich.pause; } else if (s.weichPause > 0) s.weichPause -= dt;
    if (z.phase === 'sammeln') {
      const g = s.peil + (i & 1) * 0.12, c = Math.cos(s.nick);
      weltPunkt(schiffZ, Math.sin(g) * c * A.sammeln, Math.sin(s.nick) * A.sammeln, Math.cos(g) * c * A.sammeln, mP);
      wx = mP.x - p.x; wy = mP.y - p.y; wz = mP.z - p.z;
      s.bereit = L(wx, wy, wz) < A.sammelNah;
      const pz = ziele[i ^ 1], partner = st[i ^ 1];
      const allein = !pz || !pz.aktiv || pz.phase !== 'sammeln' || partner.bereit;
      if ((s.bereit && allein) || s.t > A.sammelMax) { z.phase = 'anlauf'; s.t = 0; statistik.laeufe++; }
    } else if (z.phase === 'anlauf') {
      weltPunkt(schiffZ, 0, 0, s.zielZ, mP);
      wx = mP.x - p.x; wy = mP.y - p.y; wz = mP.z - p.z;
      const wl = L(wx, wy, wz) || 1;
      // Schlangenlinie: quer in der Ebene aus Sichtlinie und Welt-Hoch (Welt-x, falls senkrecht)
      let cx = -wz, cy = 0, cz = wx, cl = L(cx, cy, cz);
      if (cl < 1e-6) { cx = wl; cz = 0; cl = wl; }
      const a = Math.sin(s.t * A.schlange.omega + s.weave) * A.schlange.winkel * wl / cl;
      wx += cx * a; wz += cz * a;
      z.angriff = true;
      // Feuer: im Fenster, Nase (Flug relativ zum Schiff) auf das Ziel, Schiff noch nicht zerstört
      const ux = v.x - vs.x, uy = v.y - vs.y, uz = v.z - vs.z, ul = L(ux, uy, uz) || 1;
      const tx = mP.x - p.x, ty = mP.y - p.y, tz = mP.z - p.z, tl = L(tx, ty, tz) || 1;
      const cosw = (ux * tx + uy * ty + uz * tz) / (ul * tl);
      if (d < A.feuerAb && d > A.abdrehen && s.cd <= 0 && cosw > Math.cos(WF.kegel) && !schiffZ.zerstoert) {
        s.cd = 1 / WF.rate; schiesse(i, schiffZ, mP.x, mP.y, mP.z);
      }
      if (d < A.abdrehen) {
        // Abdrehen: nach außen + bisherige Flugrichtung (relativ) → Bogen am Schiff vorbei
        let ax = rx / d + ux / ul, ay = ry / d + uy / ul, az = rz / d + uz / ul;
        const al = L(ax, ay, az);
        if (al < 1e-3) { ax = rx / d; ay = ry / d; az = rz / d; } else { ax /= al; ay /= al; az /= al; }
        s.ax = ax; s.ay = ay; s.az = az; z.phase = 'abdrehen'; z.angriff = false; s.t = 0;
      }
    } else {
      // abdrehen / ausholen
      wx = s.ax; wy = s.ay; wz = s.az; tempo = TEMPO_AB[art];
      if (d > A.ausholen) { z.phase = 'sammeln'; s.t = 0; s.peil += A.peilSchritt; s.zielZ = (rnd() * 2 - 1) * A.rumpfZiel; }
    }
    let wl = L(wx, wy, wz) || 1;
    wx /= wl; wy /= wl; wz /= wl;
    if (s.weich > 0) { const f = A.ausweich.anteil; wx += s.wx * f; wy += s.wy * f; wz += s.wz * f; wl = L(wx, wy, wz) || 1; wx /= wl; wy /= wl; wz /= wl; }
    // Abstand untereinander (weich)
    for (let j = 0; j < MAXS; j++) {
      if (j === i || !ziele[j].aktiv) continue;
      const q = ziele[j].pos, ex = p.x - q.x, ey = p.y - q.y, ez = p.z - q.z, e = L(ex, ey, ez);
      if (e < A.trenn && e > 1e-6) { const k = (A.trenn - e) / A.trenn / e; wx += ex * k; wy += ey * k; wz += ez * k; }
    }
    // Soll relativ zum Schiff, Beschleunigung begrenzt
    let ax = vs.x + wx * tempo - v.x, ay = vs.y + wy * tempo - v.y, az = vs.z + wz * tempo - v.z;
    const al = L(ax, ay, az), amax = BESCHL[art] * dt;
    if (al > amax) { ax *= amax / al; ay *= amax / al; az *= amax / al; }
    v.x += ax; v.y += ay; v.z += az;
    // Mindestabstand zur Schiffsmitte: Annäherung (relativ) entfernen — WARUM hart: kein Flug durch den Rumpf
    const nd = L(rx + (v.x - vs.x) * dt, ry + (v.y - vs.y) * dt, rz + (v.z - vs.z) * dt);
    if (nd < A.mindest) {
      const vr = ((v.x - vs.x) * rx + (v.y - vs.y) * ry + (v.z - vs.z) * rz) / d;
      if (vr < 0) { v.x -= vr * rx / d; v.y -= vr * ry / d; v.z -= vr * rz / d; }
    }
    z.vorPos.x = p.x; z.vorPos.y = p.y; z.vorPos.z = p.z;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  }

  /** Geschosse fliegen; Treffer = Strecke (relativ zum Schiff, im Schiffsrahmen) schneidet eine Rumpfkugel. */
  function geschosseSchritt(dt, schiffZ, kugeln) {
    const g = geschosse, S = schiffZ.pos, vs = schiffZ.vel;
    const leben0 = Math.round(WAFFE[0].leben / dt), leben1 = Math.round(WAFFE[1].leben / dt);
    for (let k = 0; k < N; k++) {
      if (!g.aktiv[k]) continue;
      const o = k * 3, lebenT = g.art[k] ? leben1 : leben0, schaden = WAFFE[g.art[k]].schaden;
      g.vorPos[o] = g.pos[o]; g.vorPos[o + 1] = g.pos[o + 1]; g.vorPos[o + 2] = g.pos[o + 2];
      g.pos[o] += g.vel[o] * dt; g.pos[o + 1] += g.vel[o + 1] * dt; g.pos[o + 2] += g.vel[o + 2] * dt;
      g.alter[k]++;
      let getroffen = false;
      if (kugeln && !schiffZ.zerstoert) {
        // Ende (b) und Anfang (a) relativ zum Schiff: a = b − (vGeschoss − vs)·dt
        v1.x = g.pos[o] - S.x; v1.y = g.pos[o + 1] - S.y; v1.z = g.pos[o + 2] - S.z; zuSchiff(schiffZ, v1, v1);
        v2.x = (g.vel[o] - vs.x) * dt; v2.y = (g.vel[o + 1] - vs.y) * dt; v2.z = (g.vel[o + 2] - vs.z) * dt; zuSchiff(schiffZ, v2, v2);
        const bx = v1.x, by = v1.y, bz = v1.z, sx = v2.x, sy = v2.y, sz = v2.z, ax = bx - sx, ay = by - sy, az = bz - sz;
        const s2 = sx * sx + sy * sy + sz * sz || 1;
        for (let c = 0; c < kugeln.length; c++) {
          const K = kugeln[c];
          let u = ((K.x - ax) * sx + (K.y - ay) * sy + (K.z - az) * sz) / s2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = ax + sx * u - K.x, qy = ay + sy * u - K.y, qz = az + sz * u - K.z;
          if (qx * qx + qy * qy + qz * qz < K.r * K.r) { getroffen = true; break; }
        }
      }
      if (getroffen) {
        const t = trefferVorrat[treffer.length];
        t.pos.x = g.pos[o]; t.pos.y = g.pos[o + 1]; t.pos.z = g.pos[o + 2]; t.schaden = schaden;
        treffer.push(t); statistik.treffer++; statistik.schaden += schaden;
      }
      if (getroffen || g.alter[k] >= lebenT) { g.aktiv[k] = 0; g.anzahlAktiv--; }
    }
  }

  function schritt(dt, flakEreignisse, schiffZ, kugeln) {
    abschuesse.length = 0; treffer.length = 0;
    // 1) Flak-Ereignisse des vorigen Schritts: Treffer → HP, nahe Detonation → Haken
    const tr = flakEreignisse?.treffer;
    if (tr) for (let k = 0; k < tr.length; k++) {
      const t = tr[k];
      for (let i = 0; i < MAXS; i++) {
        const z = ziele[i];
        if (!z.aktiv || z.id !== t.zielId) continue;
        z.hp -= t.schaden;
        if (z.hp <= 0) {
          z.hp = 0; z.aktiv = false; z.angriff = false; z.phase = 'warten'; st[i].tot = 0;
          const a = abschussVorrat[i]; a.id = z.id; a.pos.x = z.pos.x; a.pos.y = z.pos.y; a.pos.z = z.pos.z;
          abschuesse.push(a); statistik.abschuesse++;
        }
      }
    }
    const det = flakEreignisse?.detonationen;
    if (det) for (let k = 0; k < det.length; k++) {
      const q = det[k].pos;
      for (let i = 0; i < MAXS; i++) {
        const z = ziele[i];
        if (z.aktiv && L(z.pos.x - q.x, z.pos.y - q.y, z.pos.z - q.z) < A.ausweich.nah) ausweichen(i, q.x, q.y, q.z);
      }
    }
    // 2) Wellen: Neustart freier Plätze, Wellenende → Pause → nächste Welle
    if (welle.pause > 0) {
      welle.pause -= dt;
      if (welle.pause <= 1e-9) starteWelle(schiffZ);
    } else {
      let lebend = 0;
      for (let i = 0; i < welle.gleichzeitig; i++) {
        const z = ziele[i];
        if (z.aktiv) { lebend++; continue; }
        st[i].tot += dt;
        if (welle.rest > 0 && !artSlot[i] && st[i].tot >= A.neustart - 1e-9) { welle.rest--; erscheine(i, schiffZ); lebend++; }
      }
      if (lebend === 0 && welle.rest === 0) welle.pause = A.wellenPause;
    }
    // 3) fliegen + schießen, 4) Geschosse
    for (let i = 0; i < MAXS; i++) if (ziele[i].aktiv) fliege(i, dt, schiffZ);
    geschosseSchritt(dt, schiffZ, kugeln);
    return ergebnis;
  }

  zuruecksetzen();
  return { ziele, geschosse, welle, statistik, schritt, zuruecksetzen };
}
