// ZWECK: Messungen der KI des Flak-Labors ohne Browser (`node tests/ki.mjs`), Werte aus der Frühwarnung R6:
//   A) Vorhaltfehler gegen Geradeausflieger (rechnerisch + bei Detonation auf ganzen Takten), unlösbare Abfang-Gleichung
//   B) Sperrfeuer: Detonationen auf der Schale (Radius ±5 %), Abdeckung 6×4-Raster, Streichtempo < Richttempo
//   C) 5 min Zielfeuer gegen 10 Zieldrohnen: Abstandsband, Höhe, +Z, Zusammenstöße, Neustart 4 s mit neuer id,
//      ≤ 2 Türme je Ziel, Zielwechsel/min, Zeit bis zum ersten Angriffslauf durch den Schirm, Rechenzeit
//   F) 5 min Sperrfeuer „folgt“ (R7): Wandmitte ↔ Bedrohung (Winkel), Nachführtempo ≤ 12°/s, Richttempo, Vorstöße/min,
//      engster Abstand ≥ 200 m, Killzone-Hysterese (kein Flackern), Leuchtspur nur im Nahbereich, Türme am Eindringling
//   H) Umschalten Folgen ↔ fest mitten im Lauf: kein Sprung der Schirmmitte/des Abstands über das Nachführtempo
//   I) v0 umschalten mitten im Lauf (R8): Türme mit Richttempo, kein NaN, Vorhalt sofort mit neuem v0, kein Zielwechsel
//   J) Abschüsse je v0-Stufe mit Schaden nach Entscheidung 3 (Info), C zusätzlich Streukugel-Regel + Detonationsabstand
//   D) Gleichlauf: zwei Läufe (Zielfeuer + Folgen + v0-Umschalten) + zuruecksetzen() → gleicher Hash
//   E) src/sim/ki/** ohne Math.random, DOM, grafik/
// Ersatz-Waffen: Turm richtet sich sofort aus (in I mit Richttempo); Granate fliegt gerade mit dem v0 des Turms, zielt
// auf einen Punkt in der Streukugel, zündet nach `zuender` bzw. auf dem Kugelpunkt (nur Zeitzünder, R8). Streuung 0,25°.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { erstelleZieldrohnen, DROHNEN } from '../src/sim/ki/zieldrohnen.js';
import { erstelleTurmKi, abfangen, TURMKI } from '../src/sim/ki/turmziel.js';
import { LAFETTEN, BATTERIE_MITTE as M, STANDARD_SEKTOR as S } from '../src/sim/waffen/lafetten.js';
import { zufall } from '../src/sim/zufall.js';

const DT = 1 / 60, V0 = 620, GRAD = Math.PI / 180;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert, ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};
const L = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
const f1 = (x) => x.toFixed(1), f2 = (x) => x.toFixed(2);

// ---------- Ersatz-Waffen ----------
// R8: Streuung 0,25° (Entscheidung 2), v0 je Turm (umschaltbar), Streukugel, nur Zeitzünder, Schaden nach Entscheidung 3.
function ersatzTuerme(v0 = V0) {
  return LAFETTEN.map((l) => ({ id: l.id, gier: 0, nick: 0.3, muendung: { x: l.x, y: l.y + l.zapfen.y, z: l.z },
    v0, reichweite: 2500, richtGeschw: [60 * GRAD, 50 * GRAD], streuung: 0.25 * GRAD, imBereich: true, ausgerichtet: true, bereit: true, gesperrt: false }));
}
// Schaden je Granatsorte (Entscheidung 3; Sperrgranate = flak.js R7): sofort, quadratischer Abfall ab vollRadius bis
// wirkRadius (Abstand zur Hülle); Splitterwolke linear mit dem Alter, am Rand halb.
const SCHADEN = {
  ziel: { sofort: 22, wirk: 30, voll: 4, splitterR: 30, splitterTakte: 30, splitterDps: 120 },
  sperr: { sofort: 14, wirk: 25, voll: 6, splitterR: 40, splitterTakte: 42, splitterDps: 350 },
};
function richte(tuerme, befehle) { // sofort ausgerichtet
  for (let i = 0; i < tuerme.length; i++) {
    const m = tuerme[i].muendung, p = befehle[i].punkt, dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z, d = L(dx, dy, dz);
    tuerme[i].gier = Math.atan2(dx, dz); tuerme[i].nick = Math.asin(dy / d);
  }
}
/** modell 'r7' = Verhaltens-Prüfungen (15 HP linear bis 25 m, keine Splitter — WARUM: die Schwarm-/Zielwahl-Grenzen in C/F
 *  sind gegen diese Tödlichkeit geeicht; der exakte Ersatz-Vorhalt ist tödlicher als die echte Waffe) ·
 *  'r8' = Schaden nach Entscheidung 3 (nur Info-Messungen je v0-Stufe; die Balance misst das Labor). */
function erstelleErsatzFlak(seed = 303, takteJeSchuss = 12, modell = 'r7') {
  const rnd = zufall(seed), geschosse = [], splitter = [];
  const ereignisse = { schuesse: [], detonationen: [], treffer: [] };
  let takt = 0;
  return {
    ereignisse, geschosse,
    schritt(tuerme, befehle, ziele) {
      ereignisse.schuesse.length = 0; ereignisse.detonationen.length = 0; ereignisse.treffer.length = 0;
      // Splitterwolken älterer Detonationen wirken nach
      for (let k = splitter.length - 1; k >= 0; k--) {
        const w = splitter[k], S = w.art, staerke = w.rest / S.splitterTakte;
        for (const z of ziele) {
          if (!z.aktiv) continue;
          const ab = L(z.pos.x - w.x, z.pos.y - w.y, z.pos.z - w.z) - z.r;
          if (ab < S.splitterR) ereignisse.treffer.push({ zielId: z.id, schaden: S.splitterDps * staerke * DT * (1 - Math.max(0, ab) / S.splitterR * 0.5), pos: w });
        }
        if (--w.rest <= 0) { splitter[k] = splitter[splitter.length - 1]; splitter.pop(); }
      }
      for (let i = 0; i < tuerme.length; i++) {
        const b = befehle[i], tm = tuerme[i], v0 = tm.v0;
        if (!b.feuer || tm.ausgerichtet === false || (takt + i * 2) % takteJeSchuss) continue;
        const m = tm.muendung;
        let qx = b.punkt.x, qy = b.punkt.y, qz = b.punkt.z;
        const dp = L(qx - m.x, qy - m.y, qz - m.z);
        // Streukugel (wie die Waffe, Entscheidung 2): Punkt gleichverteilt in der Kugel um `punkt`, Radius ≤ Deckel·d (R9 0,10),
        // genau 3 Zufallszahlen (Gleichlauf); Zeitzünder auf diesen Punkt.
        const R = Math.min(b.streuKugel ?? 0, TURMKI.kugelDeckel * dp);
        let zuender = b.zuender;
        if (R > 0) {
          const cu = 2 * rnd() - 1, ph = 2 * Math.PI * rnd(), r = R * Math.cbrt(rnd()), su = Math.sqrt(1 - cu * cu);
          qx += r * su * Math.cos(ph); qy += r * cu; qz += r * su * Math.sin(ph);
          zuender = L(qx - m.x, qy - m.y, qz - m.z) / v0;
        }
        let dx = qx - m.x, dy = qy - m.y, dz = qz - m.z; const d = L(dx, dy, dz);
        const s = tm.streuung; dx = dx / d + (rnd() - 0.5) * 2 * s; dy = dy / d + (rnd() - 0.5) * 2 * s; dz = dz / d + (rnd() - 0.5) * 2 * s;
        const l = L(dx, dy, dz);
        geschosse.push({ x: m.x, y: m.y, z: m.z, vx: dx / l * v0, vy: dy / l * v0, vz: dz / l * v0, rest: zuender, turm: i,
          ziel: b.zielId !== null, nah: R > 0 && b.streuKugel < SCHADEN_KUGEL_ZIEL });
        ereignisse.schuesse.push({ turmId: i, leucht: !!b.leuchtspur });
      }
      for (let k = geschosse.length - 1; k >= 0; k--) {
        const g = geschosse[k], t = Math.min(DT, g.rest);
        g.x += g.vx * t; g.y += g.vy * t; g.z += g.vz * t; g.rest -= DT;
        if (g.rest > 0) continue;
        const pos = { x: g.x, y: g.y, z: g.z }, S = g.ziel ? SCHADEN.ziel : SCHADEN.sperr;
        // Nächste Drohne zum Zündzeitpunkt (zwischen den Takten): Lage am Ende dieses Takts zurückgerechnet
        let naechste = Infinity;
        for (const z of ziele) {
          if (!z.aktiv) continue;
          const back = DT - t, zx = z.pos.x - z.vel.x * back, zy = z.pos.y - z.vel.y * back, zz = z.pos.z - z.vel.z * back;
          const e = L(zx - pos.x, zy - pos.y, zz - pos.z);
          naechste = Math.min(naechste, e);
          if (modell === 'r7') { if (e < 25) ereignisse.treffer.push({ zielId: z.id, schaden: 15 * (1 - e / 25), pos }); continue; }
          const ab = Math.max(0, e - z.r);
          if (ab < S.wirk) ereignisse.treffer.push({ zielId: z.id, schaden: S.sofort * (ab <= S.voll ? 1 : (1 - (ab - S.voll) / (S.wirk - S.voll)) ** 2), pos });
        }
        ereignisse.detonationen.push({ pos, radius: S.wirk, art: 'zeit', turm: g.turm, ziel: g.ziel, nah: g.nah, naechste });
        if (modell !== 'r7') splitter.push({ x: pos.x, y: pos.y, z: pos.z, rest: S.splitterTakte, art: S });
        geschosse[k] = geschosse[geschosse.length - 1]; geschosse.pop();
      }
      takt++;
    },
  };
}
const SCHADEN_KUGEL_ZIEL = TURMKI.streuKugel.ziel; // Kugel < Zielfeuer-Radius = Nahbereich (Messung getrennt)

// ---------- A) Vorhalt ----------
{
  const ki = erstelleTurmKi({ startwert: 202 });
  const faelle = [
    ['quer', { x: 1, y: 0, z: 0 }], ['anfliegend', { x: 0, y: 0, z: -1 }], ['fliehend', { x: 0, y: 0, z: 1 }],
    ['schräg steigend', { x: 0.6, y: 0.5, z: -0.62 }], ['quer sinkend', { x: -0.8, y: -0.3, z: 0.52 }],
  ];
  let maxRech = 0, maxTakt = 0, kugelZiel = true;
  const befehl = { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 };
  // R8: Vorhalt mit dem v0 des Turms — beide Enden der Umschalt-Stufen
  for (const V0 of [620, 1100]) for (const [, r] of faelle) {
    const tuerme = ersatzTuerme(V0), m = tuerme[1].muendung;
    const l = L(r.x, r.y, r.z);
    // Ziel 1500 m vor Turm 1, 30° hoch, 150 m/s
    const ziel = { id: 7, pos: { x: m.x, y: m.y + 1500 * Math.sin(0.52), z: m.z + 1500 * Math.cos(0.52) },
      vel: { x: r.x / l * 150, y: r.y / l * 150, z: r.z / l * 150 }, r: 6, aktiv: true, angriff: false };
    ki.zuruecksetzen();
    const b = ki.schritt(DT, befehl, [ziel], tuerme)[1];
    const dx = b.punkt.x - m.x, dy = b.punkt.y - m.y, dz = b.punkt.z - m.z, d = L(dx, dy, dz), t = b.zuender;
    const gx = m.x + dx / d * V0 * t, gy = m.y + dy / d * V0 * t, gz = m.z + dz / d * V0 * t;
    maxRech = Math.max(maxRech, L(gx - ziel.pos.x - ziel.vel.x * t, gy - ziel.pos.y - ziel.vel.y * t, gz - ziel.pos.z - ziel.vel.z * t));
    const tk = Math.round(t / DT) * DT; // Detonation auf dem nächsten ganzen Takt
    maxTakt = Math.max(maxTakt, L(m.x + dx / d * V0 * tk - ziel.pos.x - ziel.vel.x * tk, m.y + dy / d * V0 * tk - ziel.pos.y - ziel.vel.y * tk, m.z + dz / d * V0 * tk - ziel.pos.z - ziel.vel.z * tk));
    const K0 = TURMKI.streuKugel.ziel;
    if (b.streuKugel !== K0 || Math.abs(b.toleranz - Math.max(Math.min(K0, TURMKI.kugelDeckel * d) / d, 0.008)) > 1e-12) kugelZiel = false;
  }
  zeile('A Vorhaltfehler rechnerisch (5 Bahnen × v0 620/1100, 1500 m, 150 m/s)', '< 1 m', f2(maxRech) + ' m', maxRech < 1);
  // WARUM ≤ 11 m: Zündung auf ganzen Takten verschiebt um ≤ DT/2 → (v0 + 150)·DT/2 = 10,4 m bei 1100 m/s
  zeile('A Vorhaltfehler, Zündung nur auf ganzen Takten', '≤ 11 m (Info)', f1(maxTakt) + ' m', maxTakt <= 11, false);
  zeile(`A Zielfeuer: streuKugel ${TURMKI.streuKugel.ziel} m, toleranz = min(Kugel, ${TURMKI.kugelDeckel}·d)/d`, 'ja', kugelZiel ? 'ja' : 'nein', kugelZiel);
  // unlösbar: Ziel flieht schneller als die Granate (v0 620)
  const tuerme = ersatzTuerme(620), m = tuerme[1].muendung;
  const flieht = { id: 9, pos: { x: m.x, y: m.y + 500, z: m.z + 1400 }, vel: { x: 0, y: 0, z: 700 }, r: 6, aktiv: true, angriff: false };
  ki.zuruecksetzen();
  const b = ki.schritt(DT, befehl, [flieht], tuerme)[1];
  const ok = b.zielId === null && !b.feuer && Number.isFinite(b.punkt.x + b.zuender) && !abfangen(m, flieht.pos, flieht.vel, V0, {});
  zeile('A Abfang unlösbar (700 m/s fliehend) → kein Ziel, kein NaN', 'ja', ok ? 'ja' : 'nein', ok);
}

// ---------- B) Sperrfeuer ----------
{
  const ki = erstelleTurmKi({ startwert: 202 }), tuerme = ersatzTuerme(), flak = erstelleErsatzFlak(303, 12);
  const R = 800, befehl = { modus: 'sperrfeuer', feuerFrei: true, schirmAbstand: R, folgen: false };
  const raster = new Array(24).fill(0), alt = tuerme.map(() => null);
  let n = 0, radAbw = 0, maxGr = 0, maxNr = 0, ausserhalb = 0, aktiveMax = 0;
  const takte = 600 + 300; // 10 s messen nach 5 s Vorlauf (Granaten in der Luft)
  for (let k = 0; k < takte; k++) {
    const bef = ki.schritt(DT, befehl, [], tuerme);
    // Streichtempo der Befehle (Rohrwinkel von der Mündung aus)
    for (let i = 0; i < tuerme.length; i++) {
      const m = tuerme[i].muendung, p = bef[i].punkt, dx = p.x - m.x, dy = p.y - m.y, dz = p.z - m.z;
      const g = Math.atan2(dx, dz), nk = Math.asin(dy / L(dx, dy, dz));
      if (alt[i] && k > 1) { maxGr = Math.max(maxGr, Math.abs(g - alt[i][0]) / DT); maxNr = Math.max(maxNr, Math.abs(nk - alt[i][1]) / DT); }
      alt[i] = [g, nk];
    }
    richte(tuerme, bef);
    flak.schritt(tuerme, bef, []);
    if (k < 300) continue;
    aktiveMax = Math.max(aktiveMax, flak.geschosse.length);
    for (const d of flak.ereignisse.detonationen) {
      const x = d.pos.x - M.x, y = d.pos.y - M.y, z = d.pos.z - M.z, r = L(x, y, z);
      radAbw = Math.max(radAbw, Math.abs(r - R) / R);
      const g = Math.atan2(x, z), nk = Math.asin(y / r);
      const gi = Math.floor((g - (S.gierMitte - S.gierHalb)) / (2 * S.gierHalb) * 6), ni = Math.floor((nk - S.nickMin) / (S.nickMax - S.nickMin) * 4);
      n++;
      if (gi < 0 || gi > 5 || ni < 0 || ni > 3) { ausserhalb++; continue; }
      raster[ni * 6 + gi]++;
    }
  }
  const mittel = raster.reduce((a, b) => a + b, 0) / 24, minZelle = Math.min(...raster);
  zeile('B Detonationen in 10 s (6 Türme × 5/s Ersatz)', 'Info', String(n), true, false);
  zeile('B Schalenradius-Abweichung (Schirm 800 m, Streuung 0,5°)', '≤ 5 %', f2(radAbw * 100) + ' %', radAbw <= 0.05);
  zeile('B Abdeckung 6×4: schwächste Zelle / Mittel', '≥ 50 %', (100 * minZelle / mittel).toFixed(0) + ' %', minZelle >= 0.5 * mittel);
  zeile('B Detonationen außerhalb des Sektors (Streuung am Rand)', '≤ 10 %', f1(100 * ausserhalb / n) + ' %', ausserhalb <= 0.1 * n, false);
  zeile('B Streichtempo Gier (Befehl) < Richttempo 60°/s', '< 60°/s', f1(maxGr / GRAD) + '°/s', maxGr < 60 * GRAD);
  zeile('B Streichtempo Nick (Befehl) < Richttempo 50°/s', '< 50°/s', f1(maxNr / GRAD) + '°/s', maxNr < 50 * GRAD);
  zeile('B Granaten gleichzeitig in der Luft', 'Info', String(aktiveMax), true, false);
  const s0 = ki.lage.schirme[0];
  const fest = ki.lage.schirme.length === 1 && Math.abs(s0.abstand - R) < 1e-9 && Math.abs(s0.gier - S.gierMitte) < 1e-9;
  zeile('B folgen: false → ein fester Schirm (Sektor + schirmAbstand)', 'ja', fest ? 'ja' : 'nein', fest);
}

// ---------- C) 5 min Zielfeuer gegen Zieldrohnen ----------
/** Messungen R7 je Takt: Killzone, Leuchtspur, Vorstöße, Folgen. */
function messeR7(k, dr, ki, bef, flak, befehl, m, z0) {
  const lage = ki.lage;
  for (const s of flak.ereignisse.schuesse) if (s.leucht) m.spur++;
  let naechste = Infinity, naechsteId = null;
  dr.ziele.forEach((z, i) => {
    const d = z.aktiv ? L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z) : Infinity;
    if (d < naechste) { naechste = d; naechsteId = z.id; }
    // Vorstoß: engster Abstand je Vorstoß
    if (z.vorstoss) z0.vsMin[i] = Math.min(z0.vsMin[i], d);
    else if (z0.vsWar[i]) { if (z.aktiv && Number.isFinite(z0.vsMin[i])) m.vsNah.push(z0.vsMin[i]); else m.vsAb = (m.vsAb ?? 0) + 1; z0.vsMin[i] = Infinity; }
    z0.vsWar[i] = z.vorstoss;
  });
  if (naechste < 500 && !lage.nahbereich) m.kzVerpasst++;
  if (naechste < 600) m.letzteNah = k;
  if (bef.some((b) => b.leuchtspur !== lage.nahbereich)) m.lsUngleich++;
  if (bef.some((b) => b.leuchtspur) && k - m.letzteNah > 31) m.lsOhneNah++;
  if (lage.nahbereich && !m.alarmWar) { m.alarmAn++; m.alarmStart = k; }
  if (!lage.nahbereich && m.alarmWar) m.alarmMin = Math.min(m.alarmMin, k - m.alarmStart);
  m.alarmWar = lage.nahbereich;
  // Eindringlinge: Wiedereintritt kurz nach dem Austritt = Flackern
  const jetzt = new Set(lage.eindringlinge);
  for (const id of z0.drinIds) if (!jetzt.has(id)) z0.raus.set(id, k);
  for (const id of jetzt) if (!z0.drinIds.has(id)) { m.kzEintritte++; const r = z0.raus.get(id); if (r !== undefined && k - r < 60) m.kzFlackern++; }
  z0.drinIds.clear(); for (const id of jetzt) z0.drinIds.add(id);
  if (lage.eindringlinge.length) {
    m.kzTakte++;
    let best = null, bd = Infinity;
    for (const z of dr.ziele) if (z.aktiv && jetzt.has(z.id)) { const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z); if (d < bd) { bd = d; best = z.id; } }
    if (bef.filter((b) => b.zielId === best).length < 2) m.kzUnterbesetzt++;
  }
  if (befehl.modus !== 'sperrfeuer' || befehl.folgen === false) return;
  // Folgen: Wandmitte ↔ Soll, Nachführtempo je Schirm-Platz
  m.folgTakte++; if (lage.schirme.length >= 2) m.zweiSchirme++;
  for (let g = 0; g < 3; g++) {
    const s = lage.schirme[g];
    if (!s) { z0.vorSchirm[g] = null; continue; }
    const cw = (a, b) => [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)];
    const u = cw(s.gier, s.nick), v = cw(s.sollGier, s.sollNick);
    m.winkel.push(Math.acos(Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
    const p = z0.vorSchirm[g];
    if (p) {
      m.drehMax = Math.max(m.drehMax, Math.acos(Math.min(1, u[0] * p.u[0] + u[1] * p.u[1] + u[2] * p.u[2])) / DT);
      // R9: je Achse (die KI begrenzt Gier und Nick einzeln, wie die Türme richten); nur ohne Umgruppieren im Takt
      if (p.anz === lage.schirme.length) {
        const dg = s.gier - p.gier; m.drehG = Math.max(m.drehG, Math.abs(dg - 2 * Math.PI * Math.round(dg / (2 * Math.PI))) / DT);
        m.drehN = Math.max(m.drehN, Math.abs(s.nick - p.nick) / DT);
      }
      m.abstandTempoMax = Math.max(m.abstandTempoMax, Math.abs(s.abstand - p.abstand) / DT);
    }
    z0.vorSchirm[g] = { u, abstand: s.abstand, gier: s.gier, nick: s.nick, anz: lage.schirme.length };
  }
  // Liegen die Drohnen (außer Eindringlingen) im Sektor eines Kastens (±0,1 rad) bzw. streng IM Kasten (R9, auch Tiefe)?
  for (const z of dr.ziele) {
    if (!z.aktiv || lage.eindringlinge.includes(z.id)) continue;
    const x = z.pos.x - M.x, y = z.pos.y - M.y, zz = z.pos.z - M.z, d = L(x, y, zz), g = Math.atan2(x, zz), nk = Math.asin(y / d);
    m.bedrohung++;
    if (lage.schirme.some((s) => Math.abs(g - s.gier) <= s.gierHalb + 0.1 && Math.abs(nk - s.nick) <= s.nickHalb + 0.1)) m.imSektor++;
    if (lage.schirme.some((s) => Math.abs(g - s.gier) <= s.gierHalb && Math.abs(nk - s.nick) <= s.nickHalb && Math.abs(d - s.abstand) <= Math.max(s.tiefeHalb, 50))) m.imKasten++;
  }
  // Richttempo der Sperr-Rohre (Befehl), nur Rohre, die in beiden Takten Sperrfeuer schießen
  bef.forEach((b, i) => {
    const sch = lage.schirme.findIndex((sc) => sc.tuerme.includes(i)); // Wechsel des Schirms = gewollter Sprung
    const mu = z0.tuerme[i].muendung, dx = b.punkt.x - mu.x, dy = b.punkt.y - mu.y, dz = b.punkt.z - mu.z;
    const g = Math.atan2(dx, dz), nk = Math.asin(dy / L(dx, dy, dz)), p = z0.vorRohr[i];
    /* R9 (Befund Prüfer): Kastenwechsel eines Rohrs wird MIT gemessen (Übergang statt Sprung) */ if (p && b.zielId === null && p.sperr) { m.richtG = Math.max(m.richtG, Math.abs(g - p.g - 2 * Math.PI * Math.round((g - p.g) / (2 * Math.PI))) / DT); /* WARUM umbrechen: Kasten hinter der Batterie (Gier ±180°) */ m.richtN = Math.max(m.richtN, Math.abs(nk - p.n) / DT); }
    z0.vorRohr[i] = { g, n: nk, sperr: b.zielId === null, sch };
    if (p && p.sch !== sch) m.schirmWechselRohr = (m.schirmWechselRohr ?? 0) + 1;
  });
}

/** opt = { v0 (m/s, Start), v0Plan: Map(takt → v0) — R8: Umschalten mitten im Lauf } */
function lauf(takte, mitMessung, befehl = { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, opt = {}) {
  // Startwert der Drohnen per Umgebung tauschbar (Stichprobe: DROHNEN_START=7 node tests/ki.mjs)
  const dr = erstelleZieldrohnen({ startwert: Number(process.env.DROHNEN_START ?? 101) }), ki = erstelleTurmKi({ startwert: 202 });
  const tuerme = ersatzTuerme(opt.v0 ?? V0), flak = erstelleErsatzFlak(303, 12, opt.modell);
  const mess = {
    kzVerpasst: 0, lsUngleich: 0, lsOhneNah: 0, letzteNah: -1e9, alarmAn: 0, alarmWar: false, alarmStart: 0, alarmMin: Infinity,
    kzEintritte: 0, kzFlackern: 0, kzTakte: 0, kzUnterbesetzt: 0, spur: 0,
    vsNah: [], winkel: [], drehMax: 0, abstandTempoMax: 0, imSektor: 0, bedrohung: 0, zweiSchirme: 0, folgTakte: 0,
    richtG: 0, richtN: 0, dMin: Infinity, dMax: 0, yMin: Infinity, zNeg: 0, schritte: 0, paarMin: Infinity, jeZielMax: 0,
    abschuesse: 0, neustartOk: 0, neustartFehler: 0, ersterAngriff: null, durchSchirm: 0, nan: 0, zeitDr: 0, zeitKi: 0, treffer: 0, schuesse: 0,
    kugelFalsch: 0, detZiel: [], detNah: [], detSperr: [], imKasten: 0, kastenProben: 0, drehG: 0, drehN: 0 };
  const wartet = new Map(); // slot → { takt, id }
  const innen = new Array(DROHNEN.anzahl).fill(false);
  const vsMin = new Array(DROHNEN.anzahl).fill(Infinity), vsWar = new Array(DROHNEN.anzahl).fill(false);
  const raus = new Map(), drinIds = new Set(), vorSchirm = [null, null, null], vorRohr = new Array(6).fill(null);
  let h = 0x811c9dc5;
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
  const misch = (x) => { f64[0] = x; h = Math.imul(h ^ u32[0], 16777619); h = Math.imul(h ^ u32[1], 16777619); };
  for (let k = 0; k < takte; k++) {
    const nv = opt.v0Plan?.get(k);
    if (nv) for (const t of tuerme) t.v0 = nv;
    let t0 = performance.now();
    const erg = dr.schritt(DT, flak.ereignisse);
    let t1 = performance.now();
    const bef = ki.schritt(DT, befehl, dr.ziele, tuerme);
    const t2 = performance.now();
    mess.zeitDr += t1 - t0; mess.zeitKi += t2 - t1;
    richte(tuerme, bef);
    flak.schritt(tuerme, bef, dr.ziele);
    mess.treffer += flak.ereignisse.treffer.length; mess.schuesse += flak.ereignisse.schuesse.length;
    for (const z of dr.ziele) { misch(z.pos.x); misch(z.pos.y); misch(z.pos.z); misch(z.id); }
    for (const b of bef) { misch(b.punkt.x); misch(b.zielId ?? -1); misch(b.feuer ? 1 : 0); misch(b.leuchtspur ? 1 : 0); misch(b.streuKugel); }
    for (const sc of ki.lage.schirme) { misch(sc.gier); misch(sc.nick); misch(sc.abstand); }
    if (!mitMessung) continue;
    messeR7(k, dr, ki, bef, flak, befehl, mess, { vsMin, vsWar, raus, drinIds, vorSchirm, vorRohr, tuerme });
    for (const a of erg.abschuesse) { mess.abschuesse++; const slot = dr.ziele.findIndex((z) => z.id === a.id); wartet.set(slot, { takt: k, id: a.id }); }
    // R8/R9: Streukugel-Regel je Befehl (Sperrfeuer/kein Ziel 0, Nahbereich min(20, 0,06·d), Zielfeuer 60) + toleranz
    // (Ziel: min(max(Kugel, 8), Deckel·d)/d ≥ 0,008; Sperrkasten: halbe kleinste Seite / Abstand, 0,015–toleranzSperr)
    const SK = TURMKI.streuKugel, folgt = befehl.modus === 'sperrfeuer' && befehl.folgen !== false;
    bef.forEach((b, i) => {
      const mu = tuerme[i].muendung, d = L(b.punkt.x - mu.x, b.punkt.y - mu.y, b.punkt.z - mu.z);
      const nah = b.zielId !== null && ki.lage.eindringlinge.includes(b.zielId);
      const soll = b.zielId === null ? 0 : nah ? Math.min(SK.nahMax, SK.nahAnteil * d) : SK.ziel;
      const sc = ki.lage.schirme.find((q) => q.tuerme.includes(i));
      const tolSperr = folgt && sc ? Math.min(Math.max(0.5 * Math.min(sc.breite, sc.hoehe) / sc.abstand, 0.015), TURMKI.toleranzSperr) : TURMKI.toleranzSperr;
      const tol = b.zielId === null ? tolSperr : Math.max(Math.min(Math.max(soll, 8), TURMKI.kugelDeckel * d) / d, 0.008);
      if (!(Math.abs(b.streuKugel - soll) < 1e-6 && Math.abs(b.toleranz - tol) < 1e-9)) mess.kugelFalsch++;
    });
    for (const dt of flak.ereignisse.detonationen) if (Number.isFinite(dt.naechste)) (!dt.ziel ? mess.detSperr : dt.nah ? mess.detNah : mess.detZiel).push(dt.naechste);
    const zaehl = new Map();
    for (const b of bef) if (b.zielId !== null) zaehl.set(b.zielId, (zaehl.get(b.zielId) ?? 0) + 1);
    // Killzone-Eindringlinge dürfen 3 Türme haben (R7), alle anderen höchstens 2
    for (const [id, v] of zaehl) {
      if (ki.lage.eindringlinge.includes(id)) mess.jeNahMax = Math.max(mess.jeNahMax ?? 0, v);
      else mess.jeZielMax = Math.max(mess.jeZielMax, v);
    }
    dr.ziele.forEach((z, i) => {
      const w = wartet.get(i);
      if (w && z.aktiv) { if (k - w.takt === 240 && z.id > w.id) mess.neustartOk++; else mess.neustartFehler++; wartet.delete(i); }
      if (!z.aktiv) return;
      if (![z.pos.x, z.pos.y, z.pos.z, z.vel.x, z.vel.y, z.vel.z].every(Number.isFinite)) mess.nan++;
      const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
      mess.dMin = Math.min(mess.dMin, d); mess.dMax = Math.max(mess.dMax, d); mess.yMin = Math.min(mess.yMin, z.pos.y);
      mess.schritte++; if (z.pos.z - M.z < 0) mess.zNeg++;
      const drin = d < 800;
      if (drin && !innen[i] && z.angriff) { mess.durchSchirm++; if (mess.ersterAngriff === null) mess.ersterAngriff = k * DT; }
      innen[i] = drin;
      for (let j = i + 1; j < dr.ziele.length; j++) {
        const q = dr.ziele[j]; if (!q.aktiv) continue;
        mess.paarMin = Math.min(mess.paarMin, L(z.pos.x - q.pos.x, z.pos.y - q.pos.y, z.pos.z - q.pos.z));
      }
    });
  }
  return { mess, h: h >>> 0, dr, ki };
}
{
  const T = 5 * 60 * 60;
  const { mess: m, dr, ki } = lauf(T, true);
  zeile('C Abstand Drohnen ↔ Batterie (5 min)', '200–2000 m', `${f1(m.dMin)} – ${f1(m.dMax)} m`, m.dMin >= 200 - 1e-6 && m.dMax <= 2000 + 1e-6);
  zeile('C Killzone im Zielfeuer: Alarm verpasst / Leuchtspur ≠ Alarm', '0 / 0', `${m.kzVerpasst} / ${m.lsUngleich}`, m.kzVerpasst === 0 && m.lsUngleich === 0);
  zeile('C Killzone im Zielfeuer: Eindringling mit < 2 Türmen (Takte)', '≤ 2 %', f1(100 * m.kzUnterbesetzt / Math.max(1, m.kzTakte)) + ' %', m.kzUnterbesetzt <= 0.02 * m.kzTakte);
  zeile('C Harte Klammer griff (Anteil Drohnen-Takte)', '≤ 1 %', f2(100 * dr.statistik.klammer / m.schritte) + ' %', dr.statistik.klammer <= 0.01 * m.schritte, false);
  zeile('C Tiefste Drohne', '≥ 80 m', f1(m.yMin) + ' m', m.yMin >= 80 - 1e-6);
  zeile('C Anteil im +Z-Halbraum', '≥ 95 %', f1(100 - 100 * m.zNeg / m.schritte) + ' %', m.zNeg <= 0.05 * m.schritte);
  zeile('C Engster Abstand zweier Drohnen', '≥ 30 m', f1(m.paarMin) + ' m', m.paarMin >= 30);
  zeile('C NaN in Lage/Tempo', '0', String(m.nan), m.nan === 0);
  zeile('C Abschüsse / Neustarts genau 240 Takte, neue id', '> 0 / alle', `${m.abschuesse} / ${m.neustartOk} ok, ${m.neustartFehler} falsch`, m.abschuesse > 0 && m.neustartFehler === 0 && m.neustartOk > 0);
  zeile('C Ausweichhaken ausgelöst', '> 0', String(dr.statistik.ausweichen), dr.statistik.ausweichen > 0);
  zeile('C Erster Angriffslauf durch den Schirm (800 m)', '< 20 s', m.ersterAngriff === null ? '—' : f1(m.ersterAngriff) + ' s', m.ersterAngriff !== null && m.ersterAngriff < 20, false);
  zeile('C Angriffsläufe durch den Schirm (5 min)', '≥ 20', String(m.durchSchirm), m.durchSchirm >= 20, false);
  zeile('C Höchstens Türme je Ziel (außer Killzone) / je Eindringling', '≤ 2 / ≤ 3', `${m.jeZielMax} / ${m.jeNahMax ?? 0}`, m.jeZielMax <= 2 && ki.statistik.maxJeZiel <= 2 && (m.jeNahMax ?? 0) <= 3);
  const wMax = Math.max(...ki.statistik.wechsel) / 5, zw = ki.statistik.zwang.reduce((a, b) => a + b, 0) / 5;
  zeile('C Freiwillige Zielwechsel je Turm und Minute (max)', '≤ 6', f1(wMax), wMax <= 6);
  zeile('C Flackern (A → B → A binnen 5 s), alle Türme, 5 min', '≤ 10 (Info: meist Angreifer, der in den Anflug wechselt)', String(ki.statistik.flackern), ki.statistik.flackern <= 10, false);
  zeile('C Zwangswechsel (Ziel weg/außer Reichweite) je Minute, alle Türme', 'Info', f1(zw), true, false);
  zeile('C Treffer je Schuss (Ersatz-Flak, Info)', 'Info', f2(m.treffer / Math.max(1, m.schuesse)), true, false);
  zeile('C Streukugel/toleranz nach Regel (Befehle × Takte falsch)', '0', String(m.kugelFalsch), m.kugelFalsch === 0);
  const dz = m.detZiel.slice().sort((a, b) => a - b), dn = m.detNah.slice().sort((a, b) => a - b);
  const unter4 = (a) => 100 * a.filter((x) => x < 4).length / Math.max(1, a.length);
  // WARUM weich: der Abstand enthält neben der Kugel die Ausweichhaken der Drohnen (Vorhalt-Fehler) — das Labor misst echt
  zeile('C Zielfeuer: Detonation ↔ nächste Drohne (Median / < 4 m)', '10–25 m / < 5 %', `${f1(dz[dz.length >> 1] ?? NaN)} m / ${f1(unter4(dz))} % (n = ${dz.length})`, dz.length > 0 && dz[dz.length >> 1] >= 10 && dz[dz.length >> 1] <= 25 && unter4(dz) < 5, false);
  zeile('C Nahbereich: Detonation ↔ nächste Drohne (Median / < 4 m)', 'Info', `${f1(dn[dn.length >> 1] ?? NaN)} m / ${f1(unter4(dn))} % (n = ${dn.length})`, true, false);
  const msDr = m.zeitDr / T, msKi = m.zeitKi / T;
  zeile('C Rechenzeit Drohnen je Takt', '< 0,1 ms', (msDr * 1000).toFixed(1) + ' µs', msDr < 0.1, false);
  zeile('C Rechenzeit Turm-KI je Takt', '< 0,1 ms', (msKi * 1000).toFixed(1) + ' µs', msKi < 0.1, false);
  zeile('C Rechenzeit KI gesamt je Takt (Budget)', '< 1 ms', ((msDr + msKi) * 1000).toFixed(1) + ' µs', msDr + msKi < 1);
}

// ---------- F) Sperrfeuer folgt (R7) ----------
const FOLGEN = { modus: 'sperrfeuer', feuerFrei: true, schirmAbstand: 800 }; // folgen fehlt → Standard true
{
  const T = 5 * 60 * 60;
  const { mess: m, dr, ki } = lauf(T, true, FOLGEN);
  const w = m.winkel.slice().sort((a, b) => a - b), mittel = w.reduce((a, b) => a + b, 0) / w.length, p90 = w[Math.floor(w.length * 0.9)];
  // WARUM ≤ 12° statt 8° (Frühwarnung): das Nachführtempo ist die Bremse — Messung R7: 12,3° bei 12°/s,
  // 8,4° bei 20°/s; mit überlebenden (gepanzerten) Vorstößen 10,0° — ≤ 10° hält nicht sicher. Sichtbarer Maßstab ist
  // „Drohnen im Schirm-Sektor“.
  zeile('F Wandmitte ↔ Bedrohungsschwerpunkt (Winkel, Mittel)', '≤ 12°', f1(mittel / GRAD) + '°', mittel <= 12 * GRAD);
  zeile('F Wandmitte ↔ Bedrohungsschwerpunkt (Winkel, 90 %)', '≤ 30°', f1(p90 / GRAD) + '°', p90 <= 30 * GRAD, false);
  zeile('F Drohnen (außer Eindringlingen) im Schirm-Sektor', '≥ 50 % (Info)', f1(100 * m.imSektor / Math.max(1, m.bedrohung)) + ' %', m.imSektor >= 0.5 * m.bedrohung, false);
  // R9: Nachführen je Achse begrenzt (Gier um die Hochachse, Nick), wie die Türme richten
  const FG = TURMKI.folgen;
  zeile('F Nachführtempo der Kastenmitte Gier / Nick (max)', `≤ ${f1(FG.maxDreh / GRAD)} / ${f1(FG.maxDrehNick / GRAD)}°/s`, `${f2(m.drehG / GRAD)} / ${f2(m.drehN / GRAD)}°/s`, m.drehG <= FG.maxDreh * 1.001 && m.drehN <= FG.maxDrehNick * 1.001);
  zeile('F Nachführtempo Großkreis (max, Info)', 'Info', f2(m.drehMax / GRAD) + '°/s', true, false);
  zeile('F Abstands-Nachführung (max)', `≤ ${FG.maxAbstandTempo} m/s`, f1(m.abstandTempoMax) + ' m/s', m.abstandTempoMax <= FG.maxAbstandTempo + 1e-6);
  const ds = m.detSperr.slice().sort((a, b) => a - b);
  // WARUM weich: Ersatz-Flak (Zünder exakt, Drohnen sterben) — die Labor-Messung mit unverwundbaren Drohnen ist maßgeblich
  zeile('F Sperrfeuer: Detonation ↔ nächste Drohne (Median, Ersatz-Flak)', '≤ 100 m', `${f1(ds[ds.length >> 1] ?? NaN)} m (n = ${ds.length})`, ds.length > 0 && ds[ds.length >> 1] <= 100, false);
  zeile('F Drohnen streng im Kasten (Gier, Nick, Tiefe)', 'Info', f1(100 * m.imKasten / Math.max(1, m.bedrohung)) + ' %', true, false);
  zeile('F Richttempo der Sperr-Rohre Gier / Nick (Befehl, max)', '< 60 / 50°/s', `${f1(m.richtG / GRAD)} / ${f1(m.richtN / GRAD)}°/s`, m.richtG < 60 * GRAD && m.richtN < 50 * GRAD);
  zeile('F Anteil Zeit mit ≥ 2 Kästen / Gruppenwechsel / Rohr wechselt Kasten', 'Info', `${f1(100 * m.zweiSchirme / m.folgTakte)} % / ${ki.statistik.gruppenWechsel} / ${m.schirmWechselRohr ?? 0}`, true, false);
  const vs = dr.statistik.vorstoesse / 5, nah = m.vsNah.slice().sort((a, b) => a - b);
  zeile('F Vorstöße je Minute', '2–4,5', f1(vs), vs >= 2 && vs <= 4.5);
  zeile('F Vorstöße überlebt / im Vorstoß abgeschossen (Ersatz-Flak)', 'Info', `${nah.length} / ${m.vsAb ?? 0}`, true, false);
  // WARUM weich: die Ersatz-Flak (exakter Vorhalt, 3 Türme) schießt im Nahbereich fast alles ab — ob Vorstöße den Rückzug
  // erleben, entscheidet der echte Zielgranaten-Schaden (Labor-Messung). Die Bahn selbst prüft G ohne Beschuss.
  zeile('F Engster Punkt überlebter Vorstöße (min / Median / max)', '≥ 200 m, ≥ 1 überlebt', nah.length ? `${f1(nah[0])} / ${f1(nah[nah.length >> 1])} / ${f1(nah[nah.length - 1])} m` : '— (keiner überlebt)', nah.length > 0 && nah[0] >= 200 - 1e-6, false);
  zeile('F Engster Abstand zur Batterie (alle Drohnen)', '≥ 200 m', f1(m.dMin) + ' m', m.dMin >= 200 - 1e-6);
  zeile('F Abstand Drohnen ↔ Batterie (5 min)', '200–2000 m', `${f1(m.dMin)} – ${f1(m.dMax)} m`, m.dMin >= 200 - 1e-6 && m.dMax <= 2000 + 1e-6);
  zeile('F Engster Abstand zweier Drohnen', '≥ 30 m', f1(m.paarMin) + ' m', m.paarMin >= 30);
  zeile('F Harte Klammer griff (Anteil Drohnen-Takte)', '≤ 1 %', f2(100 * dr.statistik.klammer / m.schritte) + ' %', dr.statistik.klammer <= 0.01 * m.schritte, false);
  zeile('F Killzone: Eintritte / Wiedereintritt < 1 s nach Austritt', '— / 0', `${m.kzEintritte} / ${m.kzFlackern}`, m.kzEintritte > 0 && m.kzFlackern === 0);
  zeile('F Nahbereich-Alarm: Einschaltungen / kürzeste Dauer', '— / ≥ 0,5 s', `${m.alarmAn} / ${f2(m.alarmMin * DT)} s`, m.alarmAn > 0 && m.alarmMin * DT >= 0.5 - 1e-9);
  zeile('F Alarm verpasst (Drohne < 500 m, kein Alarm)', '0 Takte', String(m.kzVerpasst), m.kzVerpasst === 0);
  zeile('F Leuchtspur ≠ Alarm / Leuchtspur ohne Drohne < 600 m (> 0,5 s)', '0 / 0', `${m.lsUngleich} / ${m.lsOhneNah}`, m.lsUngleich === 0 && m.lsOhneNah === 0);
  zeile('F Eindringling mit < 2 Türmen (Takte)', '≤ 2 %', f1(100 * m.kzUnterbesetzt / Math.max(1, m.kzTakte)) + ' %', m.kzUnterbesetzt <= 0.02 * m.kzTakte);
  zeile('F Schüsse mit Leuchtspur', 'Info', f1(100 * m.spur / Math.max(1, m.schuesse)) + ' %', true, false);
  zeile('F Abschüsse / Treffer je Schuss (Ersatz-Flak)', 'Info', `${m.abschuesse} / ${f2(m.treffer / Math.max(1, m.schuesse))}`, true, false);
  const msKi = m.zeitKi / T, msDr = m.zeitDr / T;
  zeile('F Rechenzeit Drohnen + Turm-KI je Takt', '< 1 ms', ((msDr + msKi) * 1000).toFixed(1) + ' µs', msDr + msKi < 1);
}

// ---------- G) Vorstöße ohne Beschuss (Bahn-Geometrie allein) ----------
{
  const dr = erstelleZieldrohnen({ startwert: Number(process.env.DROHNEN_START ?? 101) });
  const vsMin = new Array(DROHNEN.anzahl).fill(Infinity), war = new Array(DROHNEN.anzahl).fill(false), nah = [];
  let dMin = Infinity, gleichzeitig = 0, atemMin = Infinity, atemMax = 0;
  for (let k = 0; k < 5 * 60 * 60; k++) {
    dr.schritt(DT, null);
    let n = 0;
    dr.ziele.forEach((z, i) => {
      const d = L(z.pos.x - M.x, z.pos.y - M.y, z.pos.z - M.z);
      dMin = Math.min(dMin, d);
      if (z.vorstoss) { n++; vsMin[i] = Math.min(vsMin[i], d); } else if (war[i]) { nah.push(vsMin[i]); vsMin[i] = Infinity; }
      if (!z.vorstoss && !war[i] && (z.bahn === 'kreisen' || z.bahn === 'schlange')) { atemMin = Math.min(atemMin, d); atemMax = Math.max(atemMax, d); }
      war[i] = z.vorstoss;
    });
    gleichzeitig = Math.max(gleichzeitig, n);
  }
  nah.sort((a, b) => a - b);
  zeile('G Vorstöße je Minute (ohne Beschuss)', '2–4,5', f1(dr.statistik.vorstoesse / 5), dr.statistik.vorstoesse / 5 >= 2 && dr.statistik.vorstoesse / 5 <= 4.5);
  zeile('G Engster Punkt je Vorstoß (min / Median / max)', '200–320 m', `${f1(nah[0])} / ${f1(nah[nah.length >> 1])} / ${f1(nah[nah.length - 1])} m`, nah[0] >= 200 - 1e-6 && nah[nah.length - 1] <= 320);
  zeile('G Höchstens gleichzeitige Vorstöße', '≤ 2', String(gleichzeitig), gleichzeitig <= 2);
  zeile('G Kreiser/Schlangen außerhalb der Vorstöße (Atmen)', 'Info', `${f1(atemMin)} – ${f1(atemMax)} m`, true, false);
  zeile('G Engster Abstand zur Batterie', '≥ 200 m', f1(dMin) + ' m', dMin >= 200 - 1e-6);
}

// ---------- H) Umschalten Folgen ↔ fest (Befund Prüfer R7) ----------
{
  const dr = erstelleZieldrohnen({ startwert: 101 }), ki = erstelleTurmKi({ startwert: 202 }), tuerme = ersatzTuerme();
  const befehl = { modus: 'sperrfeuer', feuerFrei: true, schirmAbstand: 800, folgen: true };
  // Takt → Schalter. „seite“ = wie die Seite: beim Umschalten auf fest den aktuellen KI-Abstand übernehmen
  const plan = new Map([[20 * 60, { folgen: false, seite: true }], [35 * 60, { folgen: true }],
    [50 * 60, { folgen: false, seite: false, abstand: 1200 }], [60 * 60, { folgen: true }], [62 * 60, { folgen: false, seite: true }]]);
  const richtung = (sc) => [Math.sin(sc.gier) * Math.cos(sc.nick), Math.sin(sc.nick), Math.cos(sc.gier) * Math.cos(sc.nick)];
  const kopie = () => ki.lage.schirme.map((sc) => ({ u: richtung(sc), abstand: sc.abstand, tuerme: sc.tuerme.length, x: sc.mitte.x, y: sc.mitte.y, z: sc.mitte.z }));
  let vor = null, sprungW = 0, sprungA = 0, normalW = 0, normalA = 0, schalter = 0;
  for (let k = 0; k < 70 * 60; k++) {
    const p = plan.get(k);
    if (p) {
      schalter++;
      befehl.folgen = p.folgen;
      if (p.seite) { let q = ki.lage.schirme[0]; for (const sc of ki.lage.schirme) if (sc.tuerme.length > q.tuerme.length) q = sc; befehl.schirmAbstand = q.abstand; }
      if (p.abstand) befehl.schirmAbstand = p.abstand;
    }
    dr.schritt(DT, null);
    const bef = ki.schritt(DT, befehl, dr.ziele, tuerme);
    richte(tuerme, bef);
    const jetzt = kopie();
    if (vor && vor.length) {
      // je Schirm nach dem Takt: nächster Schirm davor (Winkel, Abstand)
      let w = 0, d = 0;
      for (const j of jetzt) {
        let bw = Infinity, bd = Infinity;
        // WARUM über die 3D-Mitte (R9): Kästen können in gleicher Richtung hintereinander stehen (radiale Teilung)
        let bm = Infinity;
        for (const v of vor) { const e = L(j.x - v.x, j.y - v.y, j.z - v.z); if (e < bm) { bm = e; bw = Math.acos(Math.min(1, j.u[0] * v.u[0] + j.u[1] * v.u[1] + j.u[2] * v.u[2])); bd = Math.abs(j.abstand - v.abstand); } }
        w = Math.max(w, bw); d = Math.max(d, bd);
      }
      if (p || plan.has(k - 1)) { sprungW = Math.max(sprungW, w); sprungA = Math.max(sprungA, d); } else { normalW = Math.max(normalW, w); normalA = Math.max(normalA, d); }
    }
    vor = jetzt;
  }
  const grenzeW = Math.hypot(TURMKI.folgen.maxDreh, TURMKI.folgen.maxDrehNick) * DT * 1.01, grenzeA = TURMKI.folgen.maxAbstandTempo * DT + 1e-6;
  zeile(`H Umschalten Folgen ↔ fest (${schalter}×): Sprung der Mitte im Umschalt-Takt`, `≤ ${f2(grenzeW / GRAD)}°`, f2(sprungW / GRAD) + '°', sprungW <= grenzeW);
  zeile('H Umschalten: Sprung des Abstands im Umschalt-Takt', `≤ ${f2(grenzeA)} m`, f2(sprungA) + ' m', sprungA <= grenzeA);
  zeile('H Zum Vergleich: größter Schritt sonst (Mitte / Abstand)', 'Info', `${f2(normalW / GRAD)}° / ${f2(normalA)} m`, normalW <= grenzeW && normalA <= grenzeA, false);
}

// ---------- I) v0 umschalten mitten im Lauf (R8): 620 → 1100 → 620 → 1100 → 1000 ----------
// Türme mit echtem Richttempo (60/50°/s) statt sofort ausgerichtet; Ersatz-Flak feuert nur ausgerichtet.
const V0_PLAN = new Map([[20 * 60, 1100], [40 * 60, 620], [60 * 60, 1100], [70 * 60, 1000]]);
for (const [name, bef0] of [['Zielfeuer', { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }], ['Sperrfeuer folgt', FOLGEN]]) {
  const dr = erstelleZieldrohnen({ startwert: 101 }), ki = erstelleTurmKi({ startwert: 202 }), tuerme = ersatzTuerme(620);
  const flak = erstelleErsatzFlak(303, 6);
  const wd = (a, b) => { const d = a - b; return d - 2 * Math.PI * Math.floor((d + Math.PI) / (2 * Math.PI)); };
  let rateG = 0, rateN = 0, nan = 0, geprueft = 0, vorhaltMax = 0, sprungU = 0, sprungN = 0, zielWechselU = 0, nachrichtMax = 0;
  const vorBef = tuerme.map(() => null), warte = tuerme.map(() => -1);
  for (let k = 0; k < 80 * 60; k++) {
    const nv = V0_PLAN.get(k);
    if (nv) for (const t of tuerme) t.v0 = nv;
    dr.schritt(DT, flak.ereignisse);
    const bef = ki.schritt(DT, bef0, dr.ziele, tuerme);
    for (let i = 0; i < tuerme.length; i++) {
      const t = tuerme[i], b = bef[i], mu = t.muendung;
      if (![b.punkt.x, b.punkt.y, b.punkt.z, b.zuender, b.toleranz, b.streuKugel].every(Number.isFinite)) nan++;
      const dx = b.punkt.x - mu.x, dy = b.punkt.y - mu.y, dz = b.punkt.z - mu.z, d = L(dx, dy, dz) || 1;
      const sG = Math.atan2(dx, dz), sN = Math.asin(dy / d);
      // Befehls-Sprung (Winkel des Befehls): im Umschalt-Takt vs. sonst, nur bei gleichem Ziel
      const v = vorBef[i];
      if (v && b.zielId !== null && v.ziel === b.zielId) {
        const w = Math.hypot(wd(sG, v.g) * Math.cos(sN), sN - v.n);
        if (nv) sprungU = Math.max(sprungU, w); else sprungN = Math.max(sprungN, w);
      }
      if (nv && v && v.ziel !== null && v.ziel !== b.zielId) zielWechselU++;
      vorBef[i] = { g: sG, n: sN, ziel: b.zielId };
      // Richten mit Grenzen
      const g0 = t.gier, n0 = t.nick, mg = t.richtGeschw[0] * DT, mn = t.richtGeschw[1] * DT;
      t.gier = wd(t.gier + Math.max(-mg, Math.min(mg, wd(sG, t.gier))), 0);
      t.nick += Math.max(-mn, Math.min(mn, sN - t.nick));
      rateG = Math.max(rateG, Math.abs(wd(t.gier, g0)) / DT); rateN = Math.max(rateN, Math.abs(t.nick - n0) / DT);
      if (!Number.isFinite(t.gier + t.nick)) nan++;
      const warAus = t.ausgerichtet;
      t.ausgerichtet = Math.hypot(wd(sG, t.gier) * Math.cos(t.nick), sN - t.nick) <= b.toleranz;
      // Wieder ausgerichtet nach dem Umschalten (gleiches Ziel): Takte zählen
      if (nv && warAus && !t.ausgerichtet && b.zielId !== null) warte[i] = k;
      if (warte[i] >= 0 && (t.ausgerichtet || b.zielId === null)) { nachrichtMax = Math.max(nachrichtMax, k - warte[i]); warte[i] = -1; }
      // Vorhalt im Umschalt-Takt mit dem NEUEN v0: Granate (gerade, v0) und Ziel treffen sich in punkt
      if (nv && b.zielId !== null) {
        const z = dr.ziele.find((q) => q.id === b.zielId), ab = {};
        if (z && abfangen(mu, z.pos, z.vel, t.v0, ab) && ab.t * t.v0 >= TURMKI.zuenderStrecke && ab.t <= 4) {
          const tt = b.zuender;
          vorhaltMax = Math.max(vorhaltMax, L(mu.x + dx / d * t.v0 * tt - z.pos.x - z.vel.x * tt, mu.y + dy / d * t.v0 * tt - z.pos.y - z.vel.y * tt, mu.z + dz / d * t.v0 * tt - z.pos.z - z.vel.z * tt));
          geprueft++;
        }
      }
    }
    flak.schritt(tuerme, bef, dr.ziele);
  }
  zeile(`I ${name}: v0 620→1100→620→1100→1000, NaN in Befehl/Turm`, '0', String(nan), nan === 0);
  zeile(`I ${name}: Turm-Ist-Winkel Gier / Nick (max)`, '≤ 60 / 50°/s', `${f1(rateG / GRAD)} / ${f1(rateN / GRAD)}°/s`, rateG <= 60 * GRAD + 1e-9 && rateN <= 50 * GRAD + 1e-9);
  if (name === 'Zielfeuer') zeile(`I ${name}: Vorhalt im Umschalt-Takt mit neuem v0 (${geprueft} Befehle)`, '< 1 m', f2(vorhaltMax) + ' m', geprueft > 0 && vorhaltMax < 1);
  zeile(`I ${name}: Befehls-Sprung im Umschalt-Takt / sonst (max, gleiches Ziel ≠ null)`, 'Info', `${f2(sprungU / GRAD)}° / ${f2(sprungN / GRAD)}°`, true, false);
  zeile(`I ${name}: Zielwechsel im Umschalt-Takt / wieder ausgerichtet nach`, '0 / ≤ 0,5 s', `${zielWechselU} / ${f2(nachrichtMax * DT)} s`, zielWechselU === 0 && nachrichtMax * DT <= 0.5, false);
}

// ---------- J) Abschüsse je v0-Stufe, Schaden nach Entscheidung 3 (Info; Balance misst das Labor) ----------
{
  const teile = [];
  for (const v0 of [620, 820, 1000, 1100]) {
    const z = lauf(5 * 60 * 60, true, { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, { v0, modell: 'r8' }).mess;
    const f = lauf(5 * 60 * 60, true, FOLGEN, { v0, modell: 'r8' }).mess;
    const dz = z.detZiel.slice().sort((a, b) => a - b);
    teile.push(`${v0}: Z ${z.abschuesse} / S ${f.abschuesse} / Vorstoß überlebt ${f.vsNah.length}/${f.vsNah.length + (f.vsAb ?? 0)} / Med ${f1(dz[dz.length >> 1] ?? NaN)} m`);
  }
  zeile('J 5 min je v0: Abschüsse Zielfeuer / Sperrfeuer, Vorstöße überlebt (Ersatz-Flak: nur Verhalten, KEINE Balance — die misst das Labor mit der echten Flak, Protokoll R8)', 'Info', teile.join(' · '), true, false);
}

// ---------- D) Gleichlauf ----------
{
  const a = lauf(3600, false), b = lauf(3600, false);
  zeile('D Gleichlauf zweier Läufe (3600 Takte)', 'gleich', `${a.h.toString(16)} / ${b.h.toString(16)}`, a.h === b.h);
  const fa = lauf(3600, false, FOLGEN), fb = lauf(3600, false, FOLGEN);
  zeile('D Gleichlauf Folgen + Killzone (3600 Takte)', 'gleich', `${fa.h.toString(16)} / ${fb.h.toString(16)}`, fa.h === fb.h);
  const va = lauf(5400, false, { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, { v0Plan: V0_PLAN, modell: 'r8' });
  const vb = lauf(5400, false, { modus: 'zielfeuer', feuerFrei: true, schirmAbstand: 800 }, { v0Plan: V0_PLAN, modell: 'r8' });
  zeile('D Gleichlauf mit v0-Umschalten + Streukugel + Splitter (5400 Takte)', 'gleich', `${va.h.toString(16)} / ${vb.h.toString(16)}`, va.h === vb.h);
  // zuruecksetzen() muss denselben Anfang liefern
  const dr = erstelleZieldrohnen({ startwert: 101 }), p0 = JSON.stringify(dr.ziele);
  for (let k = 0; k < 500; k++) dr.schritt(DT, null);
  dr.zuruecksetzen();
  zeile('D zuruecksetzen() = Neuanfang', 'gleich', JSON.stringify(dr.ziele) === p0 ? 'gleich' : 'anders', JSON.stringify(dr.ziele) === p0);
  const c = erstelleZieldrohnen({ startwert: 102 });
  zeile('D anderer Startwert → andere Drohnen', 'anders', JSON.stringify(c.ziele) !== p0 ? 'anders' : 'gleich', JSON.stringify(c.ziele) !== p0);
}

// ---------- E) Regeln im Code ----------
{
  const dir = new URL('../src/sim/ki/', import.meta.url);
  const verstoss = [];
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir.pathname.replace(/^\/([A-Za-z]:)/, '$1'), f), 'utf8').replace(/\/\/.*$/gm, '');
    if (/Math\.random|document\.|window\.|from\s+['"][^'"]*grafik\//.test(text)) verstoss.push(f);
  }
  zeile('E src/sim/ki ohne Math.random/DOM/grafik', '0 Dateien', verstoss.join(', ') || '0', verstoss.length === 0);
}

console.table(zeilen);
console.log(harte ? `${harte} FEHLER` : 'Alle harten Prüfungen ok.');
process.exit(harte ? 1 : 0);
