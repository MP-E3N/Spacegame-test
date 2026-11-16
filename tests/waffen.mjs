// ZWECK: Messungen der Flak-Simulation ohne Browser (`node tests/waffen.mjs`), Runde 6.
//   1) Richtzeit 90° (Gier) eines Turms · 2) Schuss/s der Batterie · 3) schädliche Detonationen/s gegen einen
//   Geradeausflieger (Ersatz-Befehl mit selbst gerechnetem Vorhalt) · 4) Gleichlauf: Prüfsumme nach 3600 Schritten
//   in zwei Läufen gleich, anderer Startwert anders · 5) Rechenzeit ms/Schritt (volle Batterie, ~240 Geschosse, 10 Ziele)
//   6) Nachbar-Sperre (flach über den Nachbarturm → gesperrt, kein Schuss) · 7) Splitterwolke: Durchflug durch einen
//   Sperrfeuer-Schirm (800 m) · 8) höchstens ein Treffer-Ereignis je Ziel und Schritt
//   9) Leuchtspur nur auf Befehl (ohne → 0, mit → alle) · 10) Mindest-Zeitzünder 60 m, Zünder wirkt bei 150 m (Runde 7/8).
//   Runde 8: 11) Streukugel gleichverteilt (Median 0,79 R) · 12) R = 0 → Detonation am Punkt bei jeder v0-Stufe
//   13) Flächenschaden an zwei Drohnen, abfallend · 14) v0-Wechsel im Flug · 15) Zielfeuer mit Streukugel gegen Flieger.
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
// REGEL: Der Ersatz-Befehl hier ist NUR für die Messung — die echte Zielwahl macht die Turm-KI (src/sim/ki/turmziel.js).
import { erstelleFlak, FLAK } from '../src/sim/waffen/flak.js';
import { LAFETTEN } from '../src/sim/waffen/lafetten.js';

const DT = 1 / 60;
const zeilen = [];
let harte = 0;
const zeile = (groesse, ziel, wert, ok, hart = true) => {
  if (!ok && hart) harte++;
  zeilen.push({ groesse, ziel, wert, ok: ok ? 'ok' : hart ? 'FEHLER' : 'WARN' });
};

const leererBefehl = () => LAFETTEN.map((l) => ({ turmId: l.id, zielId: null, punkt: { x: 0, y: 0, z: 0 }, feuer: false, toleranz: 0.01, zuender: 1 }));

/** Abfang-Gleichung |rel + v·t| = v0·t → kleinste positive t, sonst −1. */
function abfang(m, ziel, v0) {
  const rx = ziel.pos.x - m.x, ry = ziel.pos.y - m.y, rz = ziel.pos.z - m.z;
  const v = ziel.vel;
  const a = v.x * v.x + v.y * v.y + v.z * v.z - v0 * v0;
  const b = 2 * (rx * v.x + ry * v.y + rz * v.z);
  const c = rx * rx + ry * ry + rz * rz;
  const D = b * b - 4 * a * c;
  if (D < 0) return -1;
  const s = Math.sqrt(D), t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
  const t = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  return Number.isFinite(t) ? t : -1;
}

function zielBefehle(flak, befehle, ziel, toleranz = 0.012) {
  flak.tuerme.forEach((t, i) => {
    const b = befehle[i], tz = abfang(t.muendung, ziel, t.v0);
    b.zielId = ziel.id; b.feuer = tz > 0; b.toleranz = toleranz; b.zuender = tz;
    const tt = tz > 0 ? tz : 0;
    b.punkt.x = ziel.pos.x + ziel.vel.x * tt; b.punkt.y = ziel.pos.y + ziel.vel.y * tt; b.punkt.z = ziel.pos.z + ziel.vel.z * tt;
  });
}

const neuesZiel = (id, x, y, z, vx, vy, vz) => ({ id, pos: { x, y, z }, vorPos: { x, y, z }, vel: { x: vx, y: vy, z: vz }, r: 6, hp: 100, hpMax: 100, aktiv: true });
const bewege = (z) => { z.vorPos.x = z.pos.x; z.vorPos.y = z.pos.y; z.vorPos.z = z.pos.z; z.pos.x += z.vel.x * DT; z.pos.y += z.vel.y * DT; z.pos.z += z.vel.z * DT; };

// ---------- 1) Richtzeit 90° ----------
{
  const flak = erstelleFlak({ startwert: 1 });
  const befehle = leererBefehl(), t = flak.tuerme[1], l = LAFETTEN[1];
  t.nick = t.vorNick = 0.3; // nur Gier messen; WARUM erhöht: flach nach +X steht Turm 2 im Weg (Nachbar-Sperre)
  befehle[1].punkt = { x: l.x + 2000, y: l.y + l.zapfen.y + 2000 * Math.tan(0.3), z: l.z };
  let n = 0;
  while (!t.ausgerichtet && n < 600) { flak.schritt(DT, befehle, []); n++; }
  const s = n * DT;
  zeile('Richtzeit 90° Gier', '≤ 1,6 s', s.toFixed(2) + ' s', s <= 1.6);
}

// ---------- 2) Schuss/s der Batterie ----------
{
  const flak = erstelleFlak({ startwert: 2 });
  const befehle = leererBefehl();
  befehle.forEach((b) => { b.punkt = { x: 0, y: 500, z: 900 }; b.feuer = true; b.toleranz = 0.02; b.zuender = 1.6; });
  for (let i = 0; i < 120; i++) flak.schritt(DT, befehle, []); // einrichten
  let schuesse = 0, maxAktiv = 0;
  for (let i = 0; i < 600; i++) { flak.schritt(DT, befehle, []); schuesse += flak.ereignisse.schuesse.length; maxAktiv = Math.max(maxAktiv, flak.geschosse.anzahlAktiv); }
  const rate = schuesse / 10;
  zeile('Schuss/s (6 Zwillinge)', '60 ± 1', rate.toFixed(1), Math.abs(rate - 60) <= 1);
  zeile('Geschosse in der Luft (Zünder 1,6 s)', `≤ ${FLAK.poolGeschosse}`, String(maxAktiv), maxAktiv <= FLAK.poolGeschosse && flak.geschosse.verworfen === 0);
}

// ---------- 3) Geradeausflieger, 800 m, 150 m/s quer ----------
{
  const flak = erstelleFlak({ startwert: 3 });
  const befehle = leererBefehl();
  const ziel = neuesZiel(7, -750, 300, 800, 150, 0, 0);
  let det = 0, schaedlich = 0, schaden = 0, nah = 0, mehrfach = 0, tot = -1;
  const schritte = 600;
  for (let i = 0; i < schritte; i++) {
    bewege(ziel);
    zielBefehle(flak, befehle, ziel);
    flak.schritt(DT, befehle, [ziel]);
    det += flak.ereignisse.detonationen.length;
    for (const d of flak.ereignisse.detonationen) if (d.art === 'nah') nah++;
    schaedlich += flak.ereignisse.treffer.length; // ein Ziel → höchstens ein (zusammengefasster) Treffer je Schritt
    if (flak.ereignisse.treffer.length > 1) mehrfach++;
    for (const t of flak.ereignisse.treffer) schaden += t.schaden;
    if (tot < 0 && schaden >= 100) tot = (i + 1) * DT;
  }
  const proS = schaedlich / (schritte * DT);
  zeile('Schritte mit Treffer/s (Zielfeuer, 800 m, 150 m/s)', '≥ 1', proS.toFixed(1), proS >= 1);
  zeile('Detonationen gesamt (Zielgranaten)', 'Info', String(det), true, false);
  zeile('Zeit bis 100 HP Schaden (ab Feuerbeginn)', 'Info', tot > 0 ? tot.toFixed(2) + ' s' : 'nie', true, false);
  zeile('Treffer je Ziel und Schritt', '≤ 1', mehrfach ? mehrfach + '× mehr' : '1', mehrfach === 0);
  zeile('davon Annäherungszünder', 'Info', String(nah), true, false);
  zeile('Schaden in 10 s (Drohne = 100 HP)', 'Info', schaden.toFixed(0), true, false);
}

// ---------- 4) + 5) Gleichlauf und Rechenzeit ----------
function lauf(startwert) {
  const flak = erstelleFlak({ startwert });
  const befehle = leererBefehl();
  const ziele = Array.from({ length: 10 }, (_, k) => neuesZiel(k, -900 + k * 180, 250 + k * 30, 700 + (k % 3) * 300, 120 * Math.cos(k), 10 * Math.sin(k), 80 * Math.sin(k)));
  const t0 = performance.now();
  for (let i = 0; i < 3600; i++) {
    for (const z of ziele) bewege(z);
    // Wechsel: erst Zielfeuer auf je ein Ziel, dann Sperrfeuer-Streichen auf einer Schale (wie die Turm-KI)
    if (i < 1800) flak.tuerme.forEach((t, k) => { const ziel = ziele[(k + (i >> 7)) % 10]; const b = befehle[k];
      const tz = abfang(t.muendung, ziel, t.v0); b.zielId = ziel.id; b.streuKugel = 20; b.feuer = tz > 0; b.zuender = tz; b.toleranz = 0.015; const tt = Math.max(tz, 0);
      b.punkt.x = ziel.pos.x + ziel.vel.x * tt; b.punkt.y = ziel.pos.y + ziel.vel.y * tt; b.punkt.z = ziel.pos.z + ziel.vel.z * tt; });
    else befehle.forEach((b, k) => { const w = i * DT * 1.6 + k * Math.PI / 3, g = 0.5 * Math.sin(w), n = 0.45 + 0.3 * Math.sin(2 * w);
      b.punkt.x = 800 * Math.sin(g) * Math.cos(n); b.punkt.y = 4 + 800 * Math.sin(n); b.punkt.z = 800 * Math.cos(g) * Math.cos(n);
      b.zielId = null; b.streuKugel = 0; b.feuer = true; b.toleranz = 0.06; b.zuender = 800 / FLAK.v0; });
    flak.schritt(DT, befehle, ziele);
  }
  return { summe: flak.pruefsumme(), ms: (performance.now() - t0) / 3600, aktiv: flak.geschosse.anzahlAktiv };
}
lauf(9); // Aufwärmen (JIT)
const a = lauf(303), b = lauf(303), c = lauf(304);
zeile('Gleichlauf 3600 Schritte (gleicher Startwert)', 'gleich', `${a.summe} / ${b.summe}`, a.summe === b.summe);
zeile('anderer Startwert → andere Prüfsumme', 'anders', c.summe, c.summe !== a.summe);
zeile('Rechenzeit Sim-Schritt (6 Türme, 10 Ziele)', '≤ 0,3 ms', a.ms.toFixed(3) + ' ms', a.ms <= 0.3);

// ---------- 6) Nachbar-Sperre ----------
{
  const flak = erstelleFlak({ startwert: 6 });
  const befehle = leererBefehl(), t = flak.tuerme[4], l = LAFETTEN[4]; // hintere Reihe, Turm 1 steht 14 m vor ihm (+Z)
  befehle[4].punkt = { x: l.x, y: l.y + l.zapfen.y + 5, z: l.z + 2000 }; befehle[4].feuer = true; befehle[4].toleranz = 0.02;
  let schuesse = 0;
  for (let i = 0; i < 180; i++) { flak.schritt(DT, befehle, []); schuesse += flak.ereignisse.schuesse.length; }
  zeile('Nachbar-Sperre: flach nach +Z über Turm 1', 'gesperrt, 0 Schuss', `${t.gesperrt ? 'gesperrt' : 'frei'}, ${schuesse} Schuss, Nick ${t.nick.toFixed(2)}`, t.gesperrt && schuesse === 0);
  befehle[4].punkt.y = l.y + l.zapfen.y + 2000 * Math.tan(0.3);
  schuesse = 0;
  for (let i = 0; i < 180; i++) { flak.schritt(DT, befehle, []); schuesse += flak.ereignisse.schuesse.length; }
  zeile('Nachbar-Sperre: erhöht (Nick 0,3) nach +Z', 'frei, feuert', `${t.gesperrt ? 'gesperrt' : 'frei'}, ${schuesse} Schuss`, !t.gesperrt && schuesse > 0);
}

// ---------- 7) Splitterwolke: Durchflug durch den Sperrfeuer-Schirm ----------
// Schirm wie die Turm-KI: Lissajous-Streichen je Turm auf einer Kugelschale 800 m (Sperrgranaten, zielId null).
// WARUM Bezugsläufe statt fester HP-Zahl (Prüfer R10): die Balance ändert FLAK.sorte[1] jede Runde. Der Schaden ist linear
// in Sofortschaden und Splitter-HP/s (Treffer ändern weder Flak-Zufall noch Flugbahn) → zwei Läufe mit Einheitswerten liefern
// je Durchflug a (HP je 1 HP Sofortschaden) und b (HP je 1 HP/s Splitter). Wächter: die Wand trifft überhaupt (a, b > 0), und
// die echten Werte ergeben a · schaden + b · splitterDps (Sofort- und Splitterschaden addieren sich, nichts geht verloren).
function durchflug() {
  let toedlich = 0, summe = 0;
  const N = 12;
  for (let k = 0; k < N; k++) {
    const flak = erstelleFlak({ startwert: 70 + k });
    const befehle = leererBefehl();
    const g0 = (k / (N - 1) - 0.5) * 0.8, n0 = 0.3 + 0.35 * ((k * 5) % N) / N; // Einflugrichtung im Sektor
    const dir = { x: Math.sin(g0) * Math.cos(n0), y: Math.sin(n0), z: Math.cos(g0) * Math.cos(n0) };
    const ziel = neuesZiel(1, dir.x * 1300, 4 + dir.y * 1300, dir.z * 1300, -dir.x * 150, -dir.y * 150, -dir.z * 150);
    let schaden = 0;
    for (let i = 0; i < 360; i++) { // 6 s: 1300 m → 400 m, quert den Schirm bei ~3,3 s
      bewege(ziel);
      befehle.forEach((b, m) => { const w = i * DT * 1.6 + m * Math.PI / 3, g = 0.52 * Math.sin(w), n = 0.48 + 0.31 * Math.sin(2 * w + m);
        b.punkt.x = 800 * Math.sin(g) * Math.cos(n); b.punkt.y = 4 + 800 * Math.sin(n); b.punkt.z = 800 * Math.cos(g) * Math.cos(n);
        b.zielId = null; b.streuKugel = 0; b.feuer = true; b.toleranz = 0.06; b.zuender = 800 / FLAK.v0; });
      flak.schritt(DT, befehle, [ziel]);
      for (const t of flak.ereignisse.treffer) schaden += t.schaden;
    }
    summe += schaden; if (schaden >= 100) toedlich++;
  }
  return { mittel: summe / N, toedlich, N };
}
{
  // Die Tödlichkeit misst das Labor (Kästen sitzen auf den Drohnen); diese breite Prüf-Wand prüft nur die Mechanik.
  const SG = FLAK.sorte[1], echt = { schaden: SG.schaden, dps: SG.splitterDps };
  let a, b;
  try {
    SG.schaden = 1; SG.splitterDps = 0; a = durchflug().mittel;
    SG.schaden = 0; SG.splitterDps = 1; b = durchflug().mittel;
  } finally { SG.schaden = echt.schaden; SG.splitterDps = echt.dps; }
  const r = durchflug(), soll = a * SG.schaden + b * SG.splitterDps;
  zeile('Durchflug Schirm 800 m: tödlich (≥ 100 HP)', 'Info (Ziel: guter Teil)', `${r.toedlich} / ${r.N}`, true, false);
  zeile('Durchflug Schirm 800 m: Bezug je Einheit (Sofort a / Splitter b)', 'a > 0, b > 0 (Wand trifft)',
    `a ${a.toFixed(3)} HP je HP · b ${b.toFixed(3)} HP je HP/s`, a > 0 && b > 0);
  zeile(`Durchflug Schirm 800 m: mittlerer Schaden (Sperr ${SG.schaden} / ${SG.splitterDps} HP/s)`, 'a · Sofort + b · Splitter ± 1 %',
    `${r.mittel.toFixed(2)} / Soll ${soll.toFixed(2)} HP`, soll > 0 && Math.abs(r.mittel - soll) <= 0.01 * soll + 1e-6);
}

// ---------- 9) Leuchtspur nur auf Befehl ----------
function leuchtLauf(leuchtspur) {
  const flak = erstelleFlak({ startwert: 9 });
  const befehle = leererBefehl();
  befehle.forEach((b) => { b.punkt = { x: 0, y: 500, z: 900 }; b.feuer = true; b.toleranz = 0.02; b.zuender = 1.6; if (leuchtspur != null) b.leuchtspur = leuchtspur; });
  let schuesse = 0, leucht = 0;
  for (let i = 0; i < 300; i++) {
    flak.schritt(DT, befehle, []);
    schuesse += flak.ereignisse.schuesse.length;
    for (let k = 0; k < flak.geschosse.max; k++) if (flak.geschosse.aktiv[k] && flak.geschosse.alter[k] === 0 && flak.geschosse.leucht[k]) leucht++;
  }
  return { schuesse, leucht, aktiv: flak.geschosse.anzahlLeucht, pruef: flak.pruefsumme() };
}
{
  const ohne = leuchtLauf(undefined), aus = leuchtLauf(false), an = leuchtLauf(true);
  zeile('Leuchtspur ohne Befehl (Anteil 0)', '0 Spur-Granaten', `${ohne.leucht} von ${ohne.schuesse}`, ohne.schuesse > 0 && ohne.leucht === 0 && ohne.aktiv === 0);
  zeile('Leuchtspur: leuchtspur = true', 'alle', `${an.leucht} von ${an.schuesse}`, an.schuesse > 0 && an.leucht === an.schuesse);
  zeile('Leuchtspur ändert Bahn/Zufall nicht', 'gleiche Prüfsumme', `${ohne.pruef} / ${aus.pruef} / ${an.pruef}`, ohne.pruef === aus.pruef && aus.pruef === an.pruef);
}

// ---------- 10) Mindest-Zeitzünder, Zünder bei 150 m ----------
function zuenderLauf(zuender) {
  const flak = erstelleFlak({ startwert: 10 });
  const befehle = leererBefehl(), t = flak.tuerme[1], l = LAFETTEN[1];
  const p = { x: l.x, y: l.y + l.zapfen.y + 1000 * Math.tan(0.5), z: l.z + 1000 };
  befehle[1].punkt = p; befehle[1].toleranz = 0.02; befehle[1].zuender = zuender; befehle[1].zielId = 99; // Zielgranate (±4 %): Nahbereich = Zielfeuer
  for (let i = 0; i < 120; i++) flak.schritt(DT, befehle, []);   // einrichten
  befehle[1].feuer = true;
  let min = Infinity, max = 0, n = 0;
  for (let i = 0; i < 120; i++) {
    flak.schritt(DT, befehle, []);
    for (const d of flak.ereignisse.detonationen) {
      const a = Math.hypot(d.pos.x - t.muendung.x, d.pos.y - t.muendung.y, d.pos.z - t.muendung.z);
      min = Math.min(min, a); max = Math.max(max, a); n++;
    }
  }
  return { min, max, n };
}
{
  const z150 = zuenderLauf(150 / FLAK.v0), zMin = zuenderLauf(0.02);
  zeile('Zünder 150 m (0,15 s): Detonationsabstand', '150 ± 15 m', `${z150.min.toFixed(0)}–${z150.max.toFixed(0)} m (${z150.n})`, z150.n > 0 && z150.min > 135 && z150.max < 165);
  zeile('Mindest-Zeitzünder (0,02 s → 60 m Strecke)', '≈ 60 m', `${zMin.min.toFixed(0)}–${zMin.max.toFixed(0)} m`, zMin.n > 0 && zMin.min > 50 && zMin.max < 75);
  zeile('Nick-Richttempo', '50°/s', (FLAK.richtGeschw[1] * 180 / Math.PI).toFixed(0) + '°/s', Math.abs(FLAK.richtGeschw[1] * 180 / Math.PI - 50) < 1e-9);
}

// ---------- Runde 8: Hilfen ----------
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
/** Ein Turm (Nr. 1) richtet auf einen festen Punkt in Entfernung d (Nick 0,5), danach feuert er `schritte` lang.
 *  rein = true: Turmstreuung und Zünderstreuung aus (misst nur Kugel/Zünder). Liefert Detonationen + Treffer je Schritt. */
function punktLauf({ d = 1000, streuKugel = 0, streuTiefe, leuchtspur, zielId = 99, v0 = FLAK.v0, schritte = 600, rein = true, ziele = [], einSchuss = false, startwert = 11 }) {
  const alt = { k: FLAK.zuenderStreuKugel, z: FLAK.zuenderStreu };
  if (rein) { FLAK.zuenderStreuKugel = 0; FLAK.zuenderStreu = 0; }
  try {
    const flak = erstelleFlak({ startwert });
    const befehle = leererBefehl(), t = flak.tuerme[1], l = LAFETTEN[1], b = befehle[1];
    t.v0 = v0; if (rein) t.streuung = 0;
    const p = { x: l.x, y: l.y + l.zapfen.y + d * Math.sin(0.5), z: l.z + d * Math.cos(0.5) };
    b.punkt = p; b.toleranz = 0.002; b.zielId = zielId; b.streuKugel = streuKugel;
    if (streuTiefe != null) b.streuTiefe = streuTiefe;
    if (leuchtspur != null) b.leuchtspur = leuchtspur;
    for (let i = 0; i < 120; i++) flak.schritt(DT, befehle, ziele);
    b.zuender = Math.hypot(p.x - t.muendung.x, p.y - t.muendung.y, p.z - t.muendung.z) / v0;
    b.feuer = true;
    const ab = [], laengs = [], quer = [], streu = [], treffer = [];
    // Schusslinie Turmmündung → p: Abweichung längs (Zünder) und quer (Winkel) getrennt messen (R10)
    const ex = p.x - t.muendung.x, ey = p.y - t.muendung.y, ez = p.z - t.muendung.z, el = Math.hypot(ex, ey, ez);
    let schuesse = 0;
    for (let i = 0; i < schritte; i++) {
      flak.schritt(DT, befehle, ziele);
      schuesse += flak.ereignisse.schuesse.length;
      if (einSchuss && schuesse > 0) b.feuer = false;
      for (const e of flak.ereignisse.detonationen) {
        const vx = e.pos.x - p.x, vy = e.pos.y - p.y, vz = e.pos.z - p.z, a = Math.hypot(vx, vy, vz);
        const l = (vx * ex + vy * ey + vz * ez) / el;
        ab.push(a); laengs.push(Math.abs(l)); quer.push(Math.sqrt(Math.max(0, a * a - l * l))); streu.push(e.streu);
      }
      treffer.push(flak.ereignisse.treffer.map((e) => ({ id: e.zielId, s: e.schaden, det: flak.ereignisse.detonationen.length })));
    }
    return { ab, laengs, quer, streu, treffer, schuesse, p, flak, el };
  } finally { FLAK.zuenderStreuKugel = alt.k; FLAK.zuenderStreu = alt.z; }
}

// ---------- 11) Streukugel gleichverteilt ----------
{
  const R = 20, rein = punktLauf({ streuKugel: R, schritte: 12200 });
  const m = median(rein.ab), mx = Math.max(...rein.ab), soll = R * Math.cbrt(0.5);
  zeile(`Streukugel R ${R} m (1000 m, rein): Median Abstand`, `${soll.toFixed(1)} ± 5 % (0,79 R)`, `${m.toFixed(2)} m (${rein.ab.length} Det.)`,
    rein.ab.length >= 2000 && Math.abs(m - soll) <= 0.05 * soll);
  zeile(`Streukugel R ${R} m: größter Abstand`, `≤ ${R + 3} m`, mx.toFixed(2) + ' m', mx <= R + 3);
  const echt = punktLauf({ streuKugel: R, schritte: 3000, rein: false });
  zeile('Streukugel mit Turm-/Zünderstreuung: Median / max', 'Info', `${median(echt.ab).toFixed(1)} / ${Math.max(...echt.ab).toFixed(1)} m`, true, false);
  // Deckel quer (R10): Kugel 60 m bei 300 m → quer 0,18 · d = 54 m ohne, 0,10 · d = 30 m mit Leuchtspur (+ 0,8 m Rohrversatz);
  // längs 0,35 · d = 105 m → die 60 m bleiben
  for (const [leuchtspur, max] of [[false, 55], [true, 31]]) {
    const nah = punktLauf({ d: 300, streuKugel: 60, schritte: 1200, leuchtspur });
    const mq = nah.quer.length ? Math.max(...nah.quer) : Infinity, ml = nah.laengs.length ? Math.max(...nah.laengs) : Infinity;
    zeile(`Kugel 60 m bei 300 m ${leuchtspur ? 'mit' : 'ohne'} Leuchtspur: größter Versatz quer / längs`, `≤ ${max} / ≤ 61 m`,
      `${mq.toFixed(1)} / ${ml.toFixed(1)} m (${nah.flak.geschosse.gedeckelt} gedeckelt)`,
      mq <= max && mq >= max - 6 && ml <= 61 && ml >= 55 && nah.flak.geschosse.gedeckelt === nah.schuesse);
  }
}

// ---------- 12) R = 0: Detonation am Punkt bei jeder v0-Stufe ----------
{
  const werte = [];
  let ok = true;
  for (const v0 of [620, 820, 1000, 1100]) {
    const r = punktLauf({ d: 800, v0, schritte: 300 });
    const mx = r.ab.length ? Math.max(...r.ab) : Infinity;
    werte.push(`${v0}: ${mx.toFixed(2)}`); ok = ok && r.ab.length > 0 && mx < 3;
  }
  zeile('R = 0, 800 m: größter Abstand Detonation ↔ Punkt je v0', '< 3 m', werte.join(' · ') + ' m', ok);
}

// ---------- 13) Flächenschaden an zwei Drohnen, abfallend ----------
{
  const l = LAFETTEN[1], d = 600, px = l.x, py = l.y + l.zapfen.y + d * Math.sin(0.5), pz = l.z + d * Math.cos(0.5);
  const nah = neuesZiel(1, px + 8, py, pz, 0, 0, 0), fern = neuesZiel(2, px, py + 20, pz, 0, 0, 0); // Hülle 2 m bzw. 14 m entfernt
  const r = punktLauf({ d, schritte: 120, ziele: [nah, fern], einSchuss: true });
  const detSchritt = r.treffer.find((tr) => tr.length && tr[0].det > 0) ?? [];
  const sofort = (id) => detSchritt.find((e) => e.id === id)?.s ?? 0;
  const summe = (id) => r.treffer.flat().filter((e) => e.id === id).reduce((a, e) => a + e.s, 0);
  const S = FLAK.sorte[0], sollFern = S.schaden * (1 - (14 - S.vollRadius) / (S.wirkRadius - S.vollRadius)) ** 2;
  zeile('Ein Schuss, zwei Drohnen: Sofortschaden nah (2 m) / fern (14 m)', `${S.schaden} / ${sollFern.toFixed(1)}`,
    `${sofort(1).toFixed(1)} / ${sofort(2).toFixed(1)} (${r.schuesse} Schuss, ${r.ab.length} Det.)`,
    r.schuesse === 1 && r.ab.length === 1 && Math.abs(sofort(1) - S.schaden) < 0.01 && Math.abs(sofort(2) - sollFern) < 1); // WARUM ±1: Rohr 0,8 m neben der Turmachse
  zeile('… mit Splitterwolke gesamt nah / fern', 'beide > 0, nah > fern', `${summe(1).toFixed(1)} / ${summe(2).toFixed(1)}`, summe(2) > 0 && summe(1) > summe(2));
}

// ---------- 14) v0-Wechsel im Flug ----------
{
  const flak = erstelleFlak({ startwert: 14 });
  const befehle = leererBefehl(), t = flak.tuerme[1], l = LAFETTEN[1], b = befehle[1];
  b.punkt = { x: l.x, y: l.y + l.zapfen.y + 2000 * Math.sin(0.5), z: l.z + 2000 * Math.cos(0.5) }; b.toleranz = 0.02; b.zuender = 3.5;
  t.v0 = 620;
  for (let i = 0; i < 120; i++) flak.schritt(DT, befehle, []);
  b.feuer = true;
  for (let i = 0; i < 60; i++) flak.schritt(DT, befehle, []);
  t.v0 = 1100;
  for (let i = 0; i < 30; i++) flak.schritt(DT, befehle, []);
  const gs = flak.geschosse;
  let alt = 0, neu = 0, falsch = 0;
  for (let i = 0; i < gs.max; i++) {
    if (!gs.aktiv[i]) continue;
    const v = Math.hypot(gs.vel[i * 3], gs.vel[i * 3 + 1], gs.vel[i * 3 + 2]);
    if (gs.alter[i] > 30) { alt++; if (Math.abs(v - 620) > 1e-6) falsch++; } else { neu++; if (Math.abs(v - 1100) > 1e-6) falsch++; }
  }
  zeile('v0-Wechsel 620 → 1100 im Flug: alte / neue Granaten', 'alte 620, neue 1100', `${alt} / ${neu}, ${falsch} falsch`, alt > 0 && neu > 0 && falsch === 0);
}

// ---------- 15) Zielfeuer mit Streukugel gegen einen Flieger (Info für Labor/KI) ----------
{
  const flak = erstelleFlak({ startwert: 15 });
  const befehle = leererBefehl();
  const ziel = neuesZiel(7, -750, 300, 800, 150, 0, 0);
  const ab = [];
  let schaden = 0, tot = -1;
  for (let i = 0; i < 600; i++) {
    bewege(ziel);
    zielBefehle(flak, befehle, ziel);
    for (const b of befehle) b.streuKugel = 20;
    flak.schritt(DT, befehle, [ziel]);
    for (const d of flak.ereignisse.detonationen) ab.push(Math.hypot(d.pos.x - ziel.pos.x, d.pos.y - ziel.pos.y, d.pos.z - ziel.pos.z));
    for (const t of flak.ereignisse.treffer) schaden += t.schaden;
    if (tot < 0 && schaden >= 100) tot = (i + 1) * DT;
  }
  const m = median(ab), unter4 = ab.filter((a) => a < 4).length / (ab.length || 1);
  zeile('Zielfeuer R 20, 800 m: Median Detonation ↔ Drohne (Mitte)', '10–25 m', m.toFixed(1) + ' m', m >= 10 && m <= 25, false);
  zeile('Zielfeuer R 20: Anteil Detonationen < 4 m', '< 5 %', (unter4 * 100).toFixed(1) + ' %', unter4 < 0.05, false);
  zeile('Zielfeuer R 20: Zeit bis 100 HP (6 Türme, ohne Panzer)', 'Info', tot > 0 ? tot.toFixed(2) + ' s' : 'nie', true, false);
}

// ---------- 16) R10: Streu-Ellipsoid in großen Räumen (Sättigungsfeuer) ----------
// Einheitskugel gleichverteilt: |längs| hat F(a) = (3a − a³)/2 → Median 0,347, P90 0,729; Querabstand
// F(a) = 1 − (1 − a²)^1,5 → Median 0,608, P90 0,886 (jeweils × Halbachse).
const quantil = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
{
  let okAlle = true;
  const werte = [];
  for (const d of [600, 1200, 2000]) for (const R of [150, 250]) {
    const r = punktLauf({ d, streuKugel: R, schritte: 12000 }); // ohne Leuchtspur → quer 0,18 · d
    const rq = Math.min(R, FLAK.deckelQuer * r.el), rt = Math.min(R, FLAK.deckelTiefe * r.el); // WARUM r.el: der Deckel misst ab der Mündung (≈ 9 m vor dem Zapfen)
    const mq = median(r.quer), pq = quantil(r.quer, 0.9), ml = median(r.laengs), pl = quantil(r.laengs, 0.9);
    const nah = (w, soll) => Math.abs(w - soll) <= 0.08 * soll + 1; // ±8 % + 1 m Rohrversatz
    const ok = r.ab.length >= 1500 && nah(mq, 0.608 * rq) && nah(pq, 0.886 * rq) && nah(ml, 0.347 * rt) && nah(pl, 0.729 * rt)
      && Math.max(...r.quer) <= rq + 1.5 && Math.max(...r.laengs) <= rt + 1.5
      && r.streu.every((s) => Math.abs(s - Math.max(rq, rt)) < 1) && (r.flak.geschosse.gedeckelt > 0) === (rq < R || rt < R);
    okAlle = okAlle && ok;
    werte.push(`${d}/${R}: q ${mq.toFixed(0)}|${pq.toFixed(0)} l ${ml.toFixed(0)}|${pl.toFixed(0)} ges ${median(r.ab).toFixed(0)}|${quantil(r.ab, 0.9).toFixed(0)}${ok ? '' : ' (!)'}`);
  }
  zeile('Ellipsoid 600/1200/2000 m × R 150/250: Median|P90 quer, längs, gesamt (m)', 'Soll aus Deckel ±8 %', werte.join(' · '), okAlle);

  // streuTiefe getrennt: quer 50, längs 300 bei 1200 m (Tiefenlage einer Sättigungszone)
  const t = punktLauf({ d: 1200, streuKugel: 50, streuTiefe: 300, schritte: 6000 });
  const mq = Math.max(...t.quer), ml = Math.max(...t.laengs);
  zeile('streuKugel 50 / streuTiefe 300 bei 1200 m: größter Versatz quer / längs', '≤ 51 / ≤ 301 m, längs ≥ 270',
    `${mq.toFixed(1)} / ${ml.toFixed(1)} m`, mq <= 51 && ml <= 301 && ml >= 270 && t.flak.geschosse.gedeckelt === 0);

  // Sperrgranate mit Kugel: Zünderstreuung ±1 % statt ±8 % (Entscheidung R10/1) — Kugel 1 m, 1000 m, Turmstreuung an
  const s = punktLauf({ d: 1000, streuKugel: 1, zielId: null, schritte: 1200, rein: false });
  const sl = Math.max(...s.laengs);
  zeile('Sperrgranate mit Kugel 1 m, 1000 m: größter Längsversatz (Zünder ±1 %)', '≤ 13 m (±8 % wären ~80 m)', sl.toFixed(1) + ' m', s.ab.length > 0 && sl <= 13);

  // Gleichlauf mit Ellipsoid und wechselnder Leuchtspur: zwei Läufe gleich, anderer Startwert anders
  const lauf = (startwert) => {
    const flak = erstelleFlak({ startwert });
    const befehle = leererBefehl();
    befehle.forEach((b, k) => { b.punkt = { x: 200 * k - 500, y: 600, z: 1400 }; b.feuer = true; b.toleranz = 0.03; b.zielId = k % 2 ? 99 : null;
      b.streuKugel = 180; b.streuTiefe = 300; });
    for (let i = 0; i < 2400; i++) { befehle.forEach((b, k) => { b.leuchtspur = ((i >> 5) + k) % 3 === 0; }); flak.schritt(DT, befehle, []); }
    return { h: flak.pruefsumme(), g: flak.geschosse.gedeckelt };
  };
  const g1 = lauf(21), g2 = lauf(21), g3 = lauf(22);
  zeile('Gleichlauf Ellipsoid + Leuchtspur-Wechsel (2400 Schritte)', 'gleich, anderer Startwert anders',
    `${g1.h} / ${g2.h} / ${g3.h} (${g1.g} gedeckelt)`, g1.h === g2.h && g1.g === g2.g && g1.h !== g3.h);
}

// ---------- Ausgabe ----------
const breite = (k) => Math.max(k.length, ...zeilen.map((z) => String(z[k]).length));
const spalten = ['groesse', 'ziel', 'wert', 'ok'], kopf = { groesse: 'Messgröße', ziel: 'Ziel', wert: 'Wert', ok: 'ok' };
const w = Object.fromEntries(spalten.map((k) => [k, Math.max(breite(k), kopf[k].length)]));
const fmt = (z) => spalten.map((k) => String(z[k]).padEnd(w[k])).join(' | ');
console.log(fmt(kopf));
console.log(spalten.map((k) => '-'.repeat(w[k])).join('-|-'));
zeilen.forEach((z) => console.log(fmt(z)));
console.log(harte ? `\n${harte} FEHLER` : '\nalle Waffen-Messungen ok');
process.exit(harte ? 1 : 0);
