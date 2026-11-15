// ZWECK: Turm-KI des Flak-Labors — entscheidet je Turm und Schritt, WOHIN gerichtet wird, WANN gefeuert wird und
//        WANN die Granate zündet. Zwei Betriebsarten:
//        · sperrfeuer: Rohre streichen den Sektor im Dreieck-Lissajous-Muster ab (je Turm eigene Phase), alle
//          Zielpunkte liegen auf EINER Kugelschale um BATTERIE_MITTE (Radius schirmAbstand) → sichtbare Flak-Wand.
//        · zielfeuer: Zielwahl mit Gewichten + Trägheit, höchstens 2 Türme je Ziel, Vorhalt aus der Abfang-Gleichung,
//          Zünder = Flugzeit bis zum Abfangpunkt.
// LIEFERT: erstelleTurmKi({ startwert }) → { befehle, schritt(dt, befehl, ziele, turmZustand) → befehle,
//          zuruecksetzen(), statistik } · TURMKI (Werte) · abfangen(m, pos, vel, v0, aus) (für Tests)
//          befehle[i] = { turmId, zielId|null, punkt{x,y,z} (Welt, mit Vorhalt), feuer, toleranz (rad), zuender (s) }
// REGEL: Die KI ENTSCHEIDET, die Waffen (flak.js) FÜHREN AUS (Richten mit Grenzen, Feuern bei `ausgerichtet`).
//        Simulation: kein DOM, kein Math.random, fester Schritt; Arrays/Objekte werden wiederverwendet.
//        Abschuss-Zeitpunkt = aktuelle Drohnen-Lage (Schrittfolge Drohnen → Turm-KI → Waffen).
import { zufall } from '../zufall.js';
import { LAFETTEN, BATTERIE_MITTE as M, STANDARD_SEKTOR } from '../waffen/lafetten.js';

export const TURMKI = {
  v0: 620, reichweite: 2500, zuender: [0.3, 4],   // Ersatzwerte, falls turmZustand fehlt (Zahlen Waffentechniker R6)
  nick: [-0.05, 1.45],
  // Sperrfeuer: Gier-Dreieck 4 s, Nick-Dreieck 4/1,5 s. Spitzentempo bei gierHalb 0,52: 4·0,52/4 = 0,52 rad/s (30°/s)
  // < 60°/s Gier; Nick 4·0,31/2,67 = 0,47 rad/s (27°/s) < 40°/s → die Türme kommen dem Muster nach.
  periodeGier: 4, verhaeltnis: 1.5,
  toleranzSperr: 0.06,
  gewichte: { naehe: 1.0, annaeherung: 0.8, angriff: 0.5, winkel: 0.3 },
  tempoBezug: 180,        // m/s → Annäherung 1,0
  // WARUM 1,3 / 1,5 s statt 1,25 / 1 s (Frühwarnung): Messung R6 ergab 8,4 freiwillige Wechsel je Turm und Minute
  // (Ziel ≤ 6), mit 1,3 / 2 s 5,0–5,8 (4 Startwerte) — Angriffsläufer ziehen das Feuer trotzdem sofort auf sich.
  wechselFaktor: 1.3,     // neues Ziel muss 30 % besser sein …
  haltezeit: 2,           // … und das alte mindestens 2 s gehalten
  maxJeZiel: 2,
  takteJeBewertung: 6,    // Turm i bewertet neu, wenn takt % 6 == i % 6 (gestaffelt)
};

const L = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const dreieck = (u) => 1 - 4 * Math.abs(u - Math.floor(u) - 0.5); // −1 … 1 … −1, Periode 1

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
  const K = TURMKI, n = LAFETTEN.length;
  const befehle = LAFETTEN.map((l) => ({ turmId: l.id, zielId: null, punkt: { x: 0, y: 0, z: 0 }, feuer: false, toleranz: K.toleranzSperr, zuender: 1 }));
  // Ersatz-Mündung (Drehpunkt der Wiege), falls turmZustand noch keine liefert
  const ersatzM = LAFETTEN.map((l) => ({ x: l.x, y: l.y + l.zapfen.y, z: l.z }));
  const halt = new Float64Array(n);           // Haltezeit des aktuellen Ziels je Turm
  const zielSlot = new Int32Array(n).fill(-1); // Index in ziele[] (−1 = keins)
  const zaehl = new Int32Array(64);            // Türme je Ziel-Slot
  const statistik = { wechsel: new Int32Array(n), zwang: new Int32Array(n), flackern: 0, maxJeZiel: 0, unloesbar: 0 };
  const vorZiel = new Float64Array(n).fill(-1), wechselZeit = new Float64Array(n).fill(-1e9); // Flackern: A → B → A in < 5 s
  const ab = { t: 0, x: 0, y: 0, z: 0 }, abBest = { t: 0, x: 0, y: 0, z: 0 };
  let takt, zeit, phase0, letzterModus;

  function zuruecksetzen() {
    const rnd = zufall(startwert);
    phase0 = rnd(); // gemeinsamer Phasenversatz des Musters (nur Optik, deterministisch)
    takt = 0; zeit = 0; letzterModus = null;
    halt.fill(0); zielSlot.fill(-1);
    statistik.wechsel.fill(0); statistik.zwang.fill(0); statistik.flackern = 0; vorZiel.fill(-1); wechselZeit.fill(-1e9); statistik.maxJeZiel = 0; statistik.unloesbar = 0;
    for (const b of befehle) { b.zielId = null; b.feuer = false; }
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

  function schritt(dt, befehl, ziele, turmZustand) {
    const modus = befehl?.modus ?? 'sperrfeuer', frei = !!befehl?.feuerFrei;
    const R = befehl?.schirmAbstand ?? 800, S = befehl?.sektor ?? STANDARD_SEKTOR;
    if (modus !== letzterModus) { zielSlot.fill(-1); halt.fill(0); letzterModus = modus; }

    if (modus === 'sperrfeuer') {
      const Tg = K.periodeGier, Tn = Tg / K.verhaeltnis;
      const nm = (S.nickMin + S.nickMax) / 2, nh = (S.nickMax - S.nickMin) / 2;
      for (let i = 0; i < n; i++) {
        const b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i], v0 = tz?.v0 ?? K.v0;
        // WARUM eigene Nick-Phase (i·5/12 statt proportional zur Gier-Phase): sonst laufen alle Türme zeitversetzt
        // dieselbe geschlossene Lissajous-Kurve ab → Linie statt Fläche.
        const gier = S.gierMitte + S.gierHalb * dreieck(zeit / Tg + i / n + phase0);
        const nick = nm + nh * dreieck(zeit / Tn + (i * 5 % 12) / 12 + phase0 * 0.37);
        setzeAufSchale(b, m, v0, gier, nick, R);
        b.zielId = null; b.feuer = frei; b.toleranz = K.toleranzSperr;
      }
    } else {
      zaehl.fill(0);
      for (let i = 0; i < n; i++) {
        const s = zielSlot[i];
        if (s >= 0 && (s >= ziele.length || !ziele[s].aktiv || ziele[s].id !== befehle[i].zielId)) zielSlot[i] = -1; // aktiv=false → sofort frei
        if (zielSlot[i] >= 0) zaehl[zielSlot[i]]++;
      }
      for (let i = 0; i < n; i++) {
        const b = befehle[i], tz = turmZustand?.[i], m = tz?.muendung ?? ersatzM[i];
        const v0 = tz?.v0 ?? K.v0, rw = tz?.reichweite ?? K.reichweite;
        // aktuelle Rohrrichtung (für das Winkel-Gewicht)
        let rx, ry, rz;
        if (tz && tz.gier !== undefined) { const cn = Math.cos(tz.nick); rx = Math.sin(tz.gier) * cn; ry = Math.sin(tz.nick); rz = Math.cos(tz.gier) * cn; }
        else { const qx = b.punkt.x - m.x, qy = b.punkt.y - m.y, qz = b.punkt.z - m.z, q = L(qx, qy, qz) || 1; rx = qx / q; ry = qy / q; rz = qz / q; }

        let cur = zielSlot[i], curWert = -1;
        if (cur >= 0) { curWert = bewerte(i, ziele[cur], m, v0, rw, rx, ry, rz, ab); if (curWert < 0) { zaehl[cur]--; cur = -1; zielSlot[i] = -1; } }
        halt[i] += dt;
        const dran = cur < 0 || (takt % K.takteJeBewertung === i % K.takteJeBewertung && halt[i] >= K.haltezeit);
        if (dran) {
          let best = -1, bestWert = -1;
          for (let j = 0; j < ziele.length; j++) {
            if (j === cur || zaehl[j] >= K.maxJeZiel) continue;
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
  return { befehle, schritt, zuruecksetzen, statistik };
}
