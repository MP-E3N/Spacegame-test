// ZWECK: Turm-KI des Flak-Labors — entscheidet je Turm und Schritt, WOHIN gerichtet wird, WANN gefeuert wird, WANN die
//        Granate zündet und ob sie Leuchtspur trägt.
//        · sperrfeuer, folgen (Standard): 1–2 Schirme folgen der Bedrohung (vorausgesagte Lage der Drohnen, träge
//          nachgeführt, schmaler Sektor); die Rohre streichen jeden Schirm im Dreieck-Lissajous-Muster ab, alle
//          Zielpunkte auf einer Kugelschale um BATTERIE_MITTE (Radius = Schirmabstand des Schirms).
//        · sperrfeuer, folgen === false: fester Sektor (befehl.sektor | STANDARD_SEKTOR) + befehl.schirmAbstand (R6).
//        · zielfeuer: Zielwahl mit Gewichten + Trägheit, höchstens 2 Türme je Ziel, Vorhalt aus der Abfang-Gleichung.
//        · Killzone (beide Betriebsarten): Drohne < 500 m → Eindringling (aus erst > 600 m); die 2–3 nächsten Türme
//          schießen Zielgranaten auf ihn; solange der Nahbereich aktiv ist (+0,5 s Nachlauf) → leuchtspur für ALLE Türme.
// LIEFERT: erstelleTurmKi({ startwert }) → { befehle, lage, schritt(dt, befehl, ziele, turmZustand) → befehle,
//          zuruecksetzen(), statistik } · TURMKI (Werte) · abfangen(m, pos, vel, v0, aus) (für Tests)
//          befehle[i] = { turmId, zielId|null, punkt{x,y,z} (Welt, mit Vorhalt), feuer, toleranz (rad), zuender (s), leuchtspur }
//          lage = { nahbereich (bool), schirme: [{ mitte{x,y,z}, abstand, gierHalb, nickHalb, tuerme[], gier, nick,
//          sollGier, sollNick, sollAbstand }], eindringlinge: [id] } — Objekte/Arrays werden wiederverwendet.
// REGEL: Die KI ENTSCHEIDET, die Waffen (flak.js) FÜHREN AUS (Richten mit Grenzen, Feuern bei `ausgerichtet`).
//        Simulation: kein DOM, kein Math.random, fester Schritt; keine neuen Objekte im Schritt.
//        Abschuss-Zeitpunkt = aktuelle Drohnen-Lage (Schrittfolge Drohnen → Turm-KI → Waffen).
import { zufall } from '../zufall.js';
import { LAFETTEN, BATTERIE_MITTE as M, STANDARD_SEKTOR } from '../waffen/lafetten.js';

export const TURMKI = {
  v0: 620, reichweite: 2500, zuender: [0.1, 4],   // Ersatzwerte, falls turmZustand fehlt (Zahlen Waffentechniker R7)
  nick: [-0.05, 1.45],
  // Sperrfeuer: Gier-Dreieck 4 s, Nick-Dreieck 4/1,5 s. Spitzentempo bei gierHalb 0,52: 4·0,52/4 = 0,52 rad/s (30°/s)
  // < 60°/s Gier; Nick 4·0,31/2,67 = 0,47 rad/s (27°/s) < 50°/s → die Türme kommen dem Muster nach.
  periodeGier: 4, verhaeltnis: 1.5,
  toleranzSperr: 0.06,
  gewichte: { naehe: 1.0, annaeherung: 0.8, angriff: 0.5, winkel: 0.3 },
  tempoBezug: 180,        // m/s → Annäherung 1,0
  // WARUM 1,4 / 2 s statt 1,25 / 1 s (Frühwarnung R6): Messung ergab 8,4 freiwillige Wechsel je Turm und Minute
  // (Ziel ≤ 6), mit 1,3 / 2 s 5,0–5,8 (4 Startwerte). R7: Vorstöße bringen mehr schnelle Annäherer → 6,2–6,6;
  // mit 1,4 / 2 s 4,8–5,8. Angriffsläufer ziehen das Feuer trotzdem sofort auf sich.
  wechselFaktor: 1.4,     // neues Ziel muss 40 % besser sein …
  haltezeit: 2,           // … und das alte mindestens 2 s gehalten
  maxJeZiel: 2,
  takteJeBewertung: 6,    // Turm i bewertet neu, wenn takt % 6 == i % 6 (gestaffelt)
  gesperrtFrei: 0.5,      // s: so lange gesperrt (Nachbar-Sperre/Grenze) → Ziel freigeben
  // Folgen (R7): Schirm vor die Bedrohung legen
  folgen: {
    vorne: 120,                 // m: Schirm so weit VOR dem (vorausgesagten) Schwerpunkt
    abstand: [450, 2000],
    tau: 1.5,                   // s: Glättung der Schirmmitte und des Abstands
    maxDreh: 12 * Math.PI / 180, // rad/s: Nachführtempo der Mitte
    maxAbstandTempo: 150,       // m/s
    gierHalb: [0.12, 0.35], gierRand: 0.08, nickHalb: [0.08, 0.2], nickRand: 0.05,
    luecke: [0.6, 0.45],        // rad: größte Gier-Lücke > 0,6 → zwei Gruppen, < 0,45 → wieder eine (Hysterese)
    umgruppieren: 2,            // s: frühestens so oft Gruppen/Türme neu verteilen
    minTuerme: 2,
  },
  // Killzone (R7, Entscheidung 3): Hysterese ein < 500 m, aus > 600 m um BATTERIE_MITTE, Alarm-Nachlauf 0,5 s
  killzone: { ein: 500, aus: 600, nachlauf: 0.5, tuermeEiner: 3, tuermeJe: 2 },
};

const L = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const dreieck = (u) => 1 - 4 * Math.abs(u - Math.floor(u) - 0.5); // −1 … 1 … −1, Periode 1
const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
const winkelDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/**
 * Abfang-Gleichung |r + v·t| = v0·t (Geschoss gerade, konstant v0, erbt nichts). Kleinste Lösung t > 0.
 * Schreibt aus = { t, x, y, z } und liefert true; false, wenn unlösbar (Ziel schneller und flieht).
 */
export function abfangen(m, pos, vel, v0, aus) {
  const rx = pos.x - m.x, ry = pos.y - m.y, rz = pos.z - m.z;
  const a = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z - v0 * v0;
  const b = 2 * (rx * vel.x + ry * vel.y + rz * vel.z);
  const c = rx * rx + ry * ry + rz * rz;
  let t;
  if (Math.abs(a) < 1e-9) { if (b >= 0) return false; t = -c / b; }
  else {
    const disk = b * b - 4 * a * c;
    if (disk < 0) return false;
    const w = Math.sqrt(disk), t1 = (-b - w) / (2 * a), t2 = (-b + w) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
    if (!(t > 0)) return false;
  }
  aus.t = t; aus.x = pos.x + vel.x * t; aus.y = pos.y + vel.y * t; aus.z = pos.z + vel.z * t;
  return true;
}

export function erstelleTurmKi({ startwert = 202 } = {}) {
  const K = TURMKI, F = K.folgen, KZ = K.killzone, n = LAFETTEN.length;
  const befehle = LAFETTEN.map((l) => ({ turmId: l.id, zielId: null, punkt: { x: 0, y: 0, z: 0 }, feuer: false, toleranz: K.toleranzSperr, zuender: 1, leuchtspur: false }));
  // Ersatz-Mündung (Drehpunkt der Wiege), falls turmZustand noch keine liefert
  const ersatzM = LAFETTEN.map((l) => ({ x: l.x, y: l.y + l.zapfen.y, z: l.z }));
  const halt = new Float64Array(n);           // Haltezeit des aktuellen Ziels je Turm
  const gesperrtZeit = new Float64Array(n);
  const zielSlot = new Int32Array(n).fill(-1); // Index in ziele[] (−1 = keins)
  const MAXZ = 64;
  const zaehl = new Int32Array(MAXZ);          // Türme je Ziel-Slot
  const nahSlot = new Uint8Array(MAXZ), nahId = new Float64Array(MAXZ).fill(-1); // Killzone-Hysterese je Ziel-Slot
  const nahTurm = new Int32Array(n);           // −1 = frei, sonst Ziel-Slot des Eindringlings
  const statistik = { wechsel: new Int32Array(n), zwang: new Int32Array(n), flackern: 0, maxJeZiel: 0, unloesbar: 0, alarmAn: 0, gruppenWechsel: 0 };
  const vorZiel = new Float64Array(n).fill(-1), wechselZeit = new Float64Array(n).fill(-1e9); // Flackern: A → B → A in < 5 s
  const ab = { t: 0, x: 0, y: 0, z: 0 }, abBest = { t: 0, x: 0, y: 0, z: 0 };

  // Schirme (fest 2 Stück, lage.schirme zeigt 0–2 davon)
  const schirmVorrat = [0, 1].map(() => ({ mitte: { x: 0, y: 0, z: 0 }, abstand: 800, gierHalb: 0.3, nickHalb: 0.15, tuerme: [],
    gier: 0, nick: 0.4, sollGier: 0, sollNick: 0.4, sollAbstand: 800 }));
  const lage = { nahbereich: false, schirme: [], eindringlinge: [] };
  // Arbeitsfelder Folgen
  const bG = new Float64Array(MAXZ), bN = new Float64Array(MAXZ), bD = new Float64Array(MAXZ), bW = new Float64Array(MAXZ);
  const ord = new Int32Array(MAXZ), gruppeTurm = new Int32Array(n), turmNachX = LAFETTEN.map((l, i) => i).sort((a, b) => LAFETTEN[a].x - LAFETTEN[b].x || a - b);
  let takt, zeit, phase0, letzterModus, alarmRest, anzahlGruppen, seitUmgruppiert, schirmeBereit;

  function zuruecksetzen() {
    const rnd = zufall(startwert);
    phase0 = rnd(); // gemeinsamer Phasenversatz des Musters (nur Optik, deterministisch)
    takt = 0; zeit = 0; letzterModus = null; alarmRest = 0; anzahlGruppen = 1; seitUmgruppiert = 1e9; schirmeBereit = false;
    halt.fill(0); zielSlot.fill(-1); gesperrtZeit.fill(0); nahSlot.fill(0); nahId.fill(-1); nahTurm.fill(-1); gruppeTurm.fill(0);
    statistik.wechsel.fill(0); statistik.zwang.fill(0); statistik.flackern = 0; vorZiel.fill(-1); wechselZeit.fill(-1e9);
    statistik.maxJeZiel = 0; statistik.unloesbar = 0; statistik.alarmAn = 0; statistik.gruppenWechsel = 0;
    for (const b of befehle) { b.zielId = null; b.feuer = false; b.leuchtspur = false; }
    lage.nahbereich = false; lage.schirme.length = 0; lage.eindringlinge.length = 0;
  }

  /** Bewertung von Ziel z für Turm i; −1 = ungültig. Schreibt den Abfangpunkt nach `aus`. */
  function bewerte(i, z, m, v0, rw, rx, ry, rz, aus) {
    if (!z.aktiv) return -1;
    if (!abfangen(m, z.pos, z.vel, v0, aus)) { statistik.unloesbar++; return -1; }
    if (aus.t < K.zuender[0] || aus.t > K.zuender[1] || aus.t * v0 > rw) return -1;
    const dx = aus.x - m.x, dy = aus.y - m.y, dz = aus.z - m.z, d = L(dx, dy, dz);
    const nick = Math.asin(dy / d), lim = LAFETTEN[i].nick ?? K.nick;
    if (nick < lim[0] || nick > lim[1]) return -1;
    const G = K.gewichte;
    const ex = z.pos.x - M.x, ey = z.pos.y - M.y, ez = z.pos.z - M.z, e = L(ex, ey, ez) || 1;
    const nah = -(z.vel.x * ex + z.vel.y * ey + z.vel.z * ez) / e / K.tempoBezug;
    const cosw = (dx * rx + dy * ry + dz * rz) / d;
    return G.naehe * (1 - L(z.pos.x - m.x, z.pos.y - m.y, z.pos.z - m.z) / rw)
      + G.annaeherung * Math.min(Math.max(nah, 0), 1)
      + G.angriff * (z.angriff ? 1 : 0)
      + G.winkel * (1 - Math.acos(Math.min(Math.max(cosw, -1), 1)) / Math.PI);
  }

  function setzeAufSchale(b, m, v0, gier, nick, R) {
    const cn = Math.cos(nick);
    b.punkt.x = M.x + Math.sin(gier) * cn * R; b.punkt.y = M.y + Math.sin(nick) * R; b.punkt.z = M.z + Math.cos(gier) * cn * R;
    const t = L(b.punkt.x - m.x, b.punkt.y - m.y, b.punkt.z - m.z) / v0;
    b.zuender = Math.min(Math.max(t, K.zuender[0]), K.zuender[1]);
  }

  /** Lissajous-Punkt für Turm k (Phase k/nG) im Sektor (gm ± gh, nm ± nh). */
  function streiche(b, m, v0, k, nG, gm, gh, nm, nh, R) {
    const Tg = K.periodeGier, Tn = Tg / K.verhaeltnis;
    // WARUM eigene Nick-Phase (k·5/12 statt proportional zur Gier-Phase): sonst laufen alle Türme zeitversetzt
    // dieselbe geschlossene Lissajous-Kurve ab → Linie statt Fläche.
    const gier = gm + gh * dreieck(zeit / Tg + k / nG + phase0);
    const nick = nm + nh * dreieck(zeit / Tn + (k * 5 % 12) / 12 + phase0 * 0.37);
    setzeAufSchale(b, m, v0, gier, nick, R);
  }

  // ---------- Killzone ----------
  function killzone(dt, ziele, turmZustand) {
    const E = lage.eindringlinge;
    E.length = 0;
    for (let j = 0; j < ziele.length && j < MAXZ; j++) {
      const z = ziele[j];
      if (!z.aktiv || z.id !== nahId[j]) { nahSlot[j] = 0; nahId[j] = z.id; }
      if (!z.aktiv) continue;
      const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
      if (nahSlot[j]) { if (d > KZ.aus) nahSlot[j] = 0; } else if (d < KZ.ein) nahSlot[j] = 1;
      if (nahSlot[j]) E.push(z.id);
    }
    const warAn = lage.nahbereich;
    if (E.length) alarmRest = KZ.nachlauf; else alarmRest -= dt;
    lage.nahbereich = E.length > 0 || alarmRest > 1e-9;
    if (lage.nahbereich && !warAn) statistik.alarmAn++;
    // Türme zuteilen: Eindringlinge nach Entfernung, je 2 (einer allein: 3) nächste freie, nicht gesperrte Türme
    nahTurm.fill(-1);
    if (!E.length) return;
    const je = E.length === 1 ? KZ.tuermeEiner : KZ.tuermeJe;
    let frei = n;
    for (let r = 0; r < E.length && frei > 0; r++) {
      // r-nächster Eindringling (kleine Liste → Auswahl ohne Sortier-Objekte)
      let best = -1, bestD = Infinity;
      for (let j = 0; j < ziele.length && j < MAXZ; j++) {
        if (!nahSlot[j] || !ziele[j].aktiv || zaehl[j] === -1) continue;
        const z = ziele[j], d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (best < 0) break;
      zaehl[best] = -1; // als „vergeben“ markieren (wird unten zurückgesetzt)
      for (let k = 0; k < je && frei > 0; k++) {
        let bt = -1, btD = Infinity;
        for (let i = 0; i < n; i++) {
          if (nahTurm[i] >= 0) continue;
          const tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i];
          // gesperrt (Nachbar-Sperre) zählt als 400 m weiter weg → anderer Turm übernimmt, wenn es einen gibt
          const p = ziele[best].pos, d = L(p.x - m.x, p.y - m.y, p.z - m.z) + (tz?.gesperrt ? 400 : 0);
          if (d < btD) { btD = d; bt = i; }
        }
        if (bt < 0) break;
        nahTurm[bt] = best; frei--;
      }
    }
    for (let j = 0; j < MAXZ; j++) if (zaehl[j] === -1) zaehl[j] = 0;
  }

  function richteNah(i, ziele, m, v0, frei) {
    const b = befehle[i], z = ziele[nahTurm[i]];
    b.zielId = z.id;
    if (abfangen(m, z.pos, z.vel, v0, ab) && ab.t <= K.zuender[1]) {
      b.punkt.x = ab.x; b.punkt.y = ab.y; b.punkt.z = ab.z; b.zuender = Math.max(ab.t, K.zuender[0]);
    } else { b.punkt.x = z.pos.x; b.punkt.y = z.pos.y; b.punkt.z = z.pos.z; b.zuender = K.zuender[0]; }
    const d = L(b.punkt.x - m.x, b.punkt.y - m.y, b.punkt.z - m.z) || 1;
    b.toleranz = Math.min(Math.max(25 / d, 0.008), 0.08);
    b.feuer = frei;
  }

  // ---------- Folgen: Schirme aus der Bedrohung ----------
  function folgeSchirme(dt, ziele, v0) {
    // 1) Bedrohung: vorausgesagte Lage (pos + vel · Flugzeit), Gewicht 1 + Angriff + 0,5·Annäherung
    let nb = 0;
    for (let j = 0; j < ziele.length && j < MAXZ; j++) {
      const z = ziele[j];
      if (!z.aktiv || nahSlot[j]) continue; // Eindringlinge bekommen Direktbeschuss, keine Wand
      const d0 = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z), tf = d0 / v0;
      const qx = z.pos.x + z.vel.x * tf - M.x, qy = z.pos.y + z.vel.y * tf - M.y, qz = z.pos.z + z.vel.z * tf - M.z, d = L(qx, qy, qz) || 1;
      const an = -((z.pos.x - M.x) * z.vel.x + (z.pos.y - M.y) * z.vel.y + (z.pos.z - M.z) * z.vel.z) / (d0 || 1) / K.tempoBezug;
      bG[nb] = Math.atan2(qx, qz); bN[nb] = Math.asin(klemme(qy / d, -1, 1)); bD[nb] = d;
      bW[nb] = 1 + (z.angriff ? 1 : 0) + 0.5 * klemme(an, 0, 1);
      nb++;
    }
    const S0 = schirmVorrat[0], S1 = schirmVorrat[1];
    if (!schirmeBereit) {
      // Start: Standard-Sektor, damit die erste Bewegung weich aus der Mitte kommt
      for (const s of schirmVorrat) { s.gier = s.sollGier = STANDARD_SEKTOR.gierMitte; s.nick = s.sollNick = (STANDARD_SEKTOR.nickMin + STANDARD_SEKTOR.nickMax) / 2; s.abstand = s.sollAbstand = 800; }
      schirmeBereit = true;
    }
    seitUmgruppiert += dt;
    if (nb > 0) {
      // 2) nach Gier sortieren (Einfügen, ≤ 64), größte Lücke suchen
      for (let a = 0; a < nb; a++) ord[a] = a;
      for (let a = 1; a < nb; a++) { const v = ord[a]; let c = a - 1; while (c >= 0 && bG[ord[c]] > bG[v]) { ord[c + 1] = ord[c]; c--; } ord[c + 1] = v; }
      let teil = -1, lueckeMax = 0;
      for (let a = 0; a + 1 < nb; a++) { const g = bG[ord[a + 1]] - bG[ord[a]]; if (g > lueckeMax) { lueckeMax = g; teil = a; } }
      const wunschGruppen = anzahlGruppen === 1 ? (lueckeMax > F.luecke[0] ? 2 : 1) : (lueckeMax < F.luecke[1] ? 1 : 2);
      if (wunschGruppen !== anzahlGruppen && seitUmgruppiert >= F.umgruppieren) {
        if (wunschGruppen === 2 && anzahlGruppen === 1) { // neuer Schirm entsteht aus dem alten (weicher Übergang)
          S1.gier = S0.gier; S1.nick = S0.nick; S1.abstand = S0.abstand; S1.gierHalb = S0.gierHalb; S1.nickHalb = S0.nickHalb;
        }
        anzahlGruppen = wunschGruppen; seitUmgruppiert = 0; statistik.gruppenWechsel++;
      }
      if (anzahlGruppen === 2 && (teil < 0 || nb < 2)) teil = -1;
      // 3) Sollwerte je Gruppe (Gruppe 0 = kleinere Gier = −X-Seite)
      let W0 = 0, W1 = 0;
      for (let g = 0; g < anzahlGruppen; g++) {
        const von = anzahlGruppen === 2 && teil >= 0 ? (g === 0 ? 0 : teil + 1) : 0;
        const bis = anzahlGruppen === 2 && teil >= 0 ? (g === 0 ? teil + 1 : nb) : nb;
        if (bis <= von) continue;
        let sx = 0, sy = 0, sz = 0, sw = 0, sd = 0;
        for (let a = von; a < bis; a++) {
          const k = ord[a], w = bW[k], cn = Math.cos(bN[k]);
          sx += w * Math.sin(bG[k]) * cn; sy += w * Math.sin(bN[k]); sz += w * Math.cos(bG[k]) * cn; sw += w; sd += w * bD[k];
        }
        const s = schirmVorrat[g], l = L(sx, sy, sz) || 1;
        s.sollGier = Math.atan2(sx, sz); s.sollNick = Math.asin(klemme(sy / l, -1, 1));
        s.sollAbstand = klemme(sd / sw - F.vorne, F.abstand[0], F.abstand[1]);
        let vg = 0, vn = 0;
        for (let a = von; a < bis; a++) { const k = ord[a], dg = winkelDiff(bG[k], s.sollGier), dn = bN[k] - s.sollNick; vg += bW[k] * dg * dg; vn += bW[k] * dn * dn; }
        const zielGh = klemme(Math.sqrt(vg / sw) + F.gierRand, F.gierHalb[0], F.gierHalb[1]);
        const zielNh = klemme(Math.sqrt(vn / sw) + F.nickRand, F.nickHalb[0], F.nickHalb[1]);
        const a1 = 1 - Math.exp(-dt / 1.0);
        s.gierHalb += (zielGh - s.gierHalb) * a1; s.nickHalb += (zielNh - s.nickHalb) * a1;
        if (g === 0) W0 = sw; else W1 = sw;
      }
      // 4) Türme verteilen (nur beim Umgruppieren bzw. alle 2 s): nach Gewicht, mind. 2 je Schirm, +X-Türme → +X-Schirm
      if (seitUmgruppiert === 0 || takt % Math.round(F.umgruppieren * 60) === 0) {
        let n0 = n;
        if (anzahlGruppen === 2) n0 = klemme(Math.round(n * W0 / ((W0 + W1) || 1)), F.minTuerme, n - F.minTuerme);
        for (let a = 0; a < n; a++) gruppeTurm[turmNachX[a]] = a < n0 ? 0 : 1;
      }
    }
    // 5) träge nachführen: Glättung τ, Drehtempo ≤ 12°/s, Abstand ≤ 150 m/s
    const al = 1 - Math.exp(-dt / F.tau);
    lage.schirme.length = 0;
    for (let g = 0; g < anzahlGruppen; g++) {
      const s = schirmVorrat[g];
      let dg = winkelDiff(s.sollGier, s.gier) * al, dn = (s.sollNick - s.nick) * al;
      const cn = Math.cos(s.nick), w = Math.sqrt(dg * dg * cn * cn + dn * dn), wmax = F.maxDreh * dt;
      if (w > wmax) { dg *= wmax / w; dn *= wmax / w; }
      s.gier = winkelDiff(s.gier + dg, 0); s.nick += dn;
      s.abstand += klemme((s.sollAbstand - s.abstand) * al, -F.maxAbstandTempo * dt, F.maxAbstandTempo * dt);
      const c2 = Math.cos(s.nick);
      s.mitte.x = M.x + Math.sin(s.gier) * c2 * s.abstand; s.mitte.y = M.y + Math.sin(s.nick) * s.abstand; s.mitte.z = M.z + Math.cos(s.gier) * c2 * s.abstand;
      s.tuerme.length = 0;
      lage.schirme.push(s);
    }
    if (anzahlGruppen === 1) for (let i = 0; i < n; i++) gruppeTurm[i] = 0;
    for (let i = 0; i < n; i++) schirmVorrat[gruppeTurm[i]].tuerme.push(i);
  }

  function festerSchirm(R, S) {
    const s = schirmVorrat[0];
    s.gier = s.sollGier = S.gierMitte; s.nick = s.sollNick = (S.nickMin + S.nickMax) / 2;
    s.abstand = s.sollAbstand = R; s.gierHalb = S.gierHalb; s.nickHalb = (S.nickMax - S.nickMin) / 2;
    const c = Math.cos(s.nick);
    s.mitte.x = M.x + Math.sin(s.gier) * c * R; s.mitte.y = M.y + Math.sin(s.nick) * R; s.mitte.z = M.z + Math.cos(s.gier) * c * R;
    s.tuerme.length = 0; for (let i = 0; i < n; i++) s.tuerme.push(i);
    lage.schirme.length = 0; lage.schirme.push(s);
    schirmeBereit = false; anzahlGruppen = 1; // beim Zurückschalten auf Folgen weich aus dem Standard-Sektor
  }

  function schritt(dt, befehl, ziele, turmZustand) {
    const modus = befehl?.modus ?? 'sperrfeuer', frei = !!befehl?.feuerFrei;
    const R = befehl?.schirmAbstand ?? 800, S = befehl?.sektor ?? STANDARD_SEKTOR, folgen = befehl?.folgen !== false;
    if (modus !== letzterModus) { zielSlot.fill(-1); halt.fill(0); letzterModus = modus; }
    const v0Std = turmZustand?.[0]?.v0 ?? K.v0;

    zaehl.fill(0);
    killzone(dt, ziele, turmZustand);
    const leucht = lage.nahbereich;

    if (modus === 'sperrfeuer') {
      if (folgen) folgeSchirme(dt, ziele, v0Std); else festerSchirm(R, S);
      for (let g = 0; g < lage.schirme.length; g++) {
        const s = lage.schirme[g], T = s.tuerme;
        for (let k = 0; k < T.length; k++) {
          const i = T[k], b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i], v0 = tz?.v0 ?? K.v0;
          b.leuchtspur = leucht;
          if (nahTurm[i] >= 0) { richteNah(i, ziele, m, v0, frei); continue; }
          // WARUM Phase nach fester Turmnummer (nicht Platz im Schirm): sonst springt das Muster, wenn ein Turm in die
          // Killzone wechselt oder zurückkommt (Messung R7: Befehls-Sprünge bis 5900°/s)
          streiche(b, m, v0, i, n, s.gier, s.gierHalb, s.nick, s.nickHalb, s.abstand);
          b.zielId = null; b.feuer = frei; b.toleranz = K.toleranzSperr;
        }
      }
    } else {
      lage.schirme.length = 0;
      for (let i = 0; i < n; i++) {
        if (nahTurm[i] >= 0) { zielSlot[i] = -1; continue; } // Killzone hat Vorrang
        const s = zielSlot[i];
        if (s >= 0 && (s >= ziele.length || !ziele[s].aktiv || ziele[s].id !== befehle[i].zielId || nahSlot[s])) zielSlot[i] = -1; // aktiv=false → sofort frei
        if (zielSlot[i] >= 0) zaehl[zielSlot[i]]++;
      }
      for (let i = 0; i < n; i++) {
        const b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i];
        const v0 = tz?.v0 ?? K.v0, rw = tz?.reichweite ?? K.reichweite;
        b.leuchtspur = leucht;
        if (nahTurm[i] >= 0) { richteNah(i, ziele, m, v0, frei); continue; }
        // Nachbar-Sperre/Grenze: länger als 0,5 s gesperrt → Ziel freigeben, ein anderer Turm darf übernehmen
        gesperrtZeit[i] = tz?.gesperrt ? gesperrtZeit[i] + dt : 0;
        // aktuelle Rohrrichtung (für das Winkel-Gewicht)
        let rx, ry, rz;
        if (tz && tz.gier !== undefined) { const cn = Math.cos(tz.nick); rx = Math.sin(tz.gier) * cn; ry = Math.sin(tz.nick); rz = Math.cos(tz.gier) * cn; }
        else { const qx = b.punkt.x - m.x, qy = b.punkt.y - m.y, qz = b.punkt.z - m.z, q = L(qx, qy, qz) || 1; rx = qx / q; ry = qy / q; rz = qz / q; }

        let cur = zielSlot[i], curWert = -1;
        if (cur >= 0) {
          curWert = gesperrtZeit[i] > K.gesperrtFrei ? -1 : bewerte(i, ziele[cur], m, v0, rw, rx, ry, rz, ab);
          if (curWert < 0) { zaehl[cur]--; cur = -1; zielSlot[i] = -1; gesperrtZeit[i] = 0; }
        }
        halt[i] += dt;
        const dran = cur < 0 || (takt % K.takteJeBewertung === i % K.takteJeBewertung && halt[i] >= K.haltezeit);
        if (dran) {
          let best = -1, bestWert = -1;
          for (let j = 0; j < ziele.length; j++) {
            if (j === cur || (j < MAXZ && (zaehl[j] >= K.maxJeZiel || nahSlot[j]))) continue;
            const w = bewerte(i, ziele[j], m, v0, rw, rx, ry, rz, abBest);
            if (w > bestWert) { bestWert = w; best = j; }
          }
          if (best >= 0 && (cur < 0 || bestWert > curWert * K.wechselFaktor)) {
            if (cur >= 0) { zaehl[cur]--; statistik.wechsel[i]++; } else if (b.zielId !== null) statistik.zwang[i]++;
            if (ziele[best].id === vorZiel[i] && zeit - wechselZeit[i] < 5) statistik.flackern++;
            vorZiel[i] = b.zielId ?? -1; wechselZeit[i] = zeit;
            cur = best; zielSlot[i] = best; zaehl[best]++; halt[i] = 0;
            curWert = bewerte(i, ziele[cur], m, v0, rw, rx, ry, rz, ab);
          }
        }
        if (cur >= 0) {
          b.zielId = ziele[cur].id;
          b.punkt.x = ab.x; b.punkt.y = ab.y; b.punkt.z = ab.z;
          b.zuender = ab.t;
          const d = ab.t * v0;
          b.toleranz = Math.min(Math.max(25 / d, 0.008), 0.05); // Wolkenradius ~25 m im Winkel, gedeckelt
          b.feuer = frei;
          if (zaehl[cur] > statistik.maxJeZiel) statistik.maxJeZiel = zaehl[cur];
        } else {
          // kein Ziel: Ruhestellung Sektormitte auf dem Schirm, nicht feuern
          if (b.zielId !== null) statistik.zwang[i]++;
          b.zielId = null; b.feuer = false; b.toleranz = K.toleranzSperr;
          setzeAufSchale(b, m, v0, S.gierMitte, (S.nickMin + S.nickMax) / 2, R);
        }
      }
    }
    takt++; zeit += dt;
    return befehle;
  }

  zuruecksetzen();
  return { befehle, lage, schritt, zuruecksetzen, statistik };
}
