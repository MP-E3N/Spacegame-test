// ZWECK: Messungen der Flak-Simulation ohne Browser (`node tests/waffen.mjs`), Runde 6.
//   1) Richtzeit 90° (Gier) eines Turms · 2) Schuss/s der Batterie · 3) schädliche Detonationen/s gegen einen
//   Geradeausflieger (Ersatz-Befehl mit selbst gerechnetem Vorhalt) · 4) Gleichlauf: Prüfsumme nach 3600 Schritten
//   in zwei Läufen gleich, anderer Startwert anders · 5) Rechenzeit ms/Schritt (volle Batterie, ~240 Geschosse, 10 Ziele)
//   6) Nachbar-Sperre (flach über den Nachbarturm → gesperrt, kein Schuss) · 7) Splitterwolke: Durchflug durch einen
//   Sperrfeuer-Schirm (800 m) · 8) höchstens ein Treffer-Ereignis je Ziel und Schritt
//   9) Leuchtspur nur auf Befehl (ohne → 0, mit → alle) · 10) Mindest-Zeitzünder 60 m, Zünder wirkt bei 150 m (Runde 7/8).
//   Runde 8: 11) Streukugel gleichverteilt (Median 0,79 R) · 12) R = 0 → Detonation am Punkt bei jeder v0-Stufe
//   13) Flächenschaden an zwei Drohnen, abfallend · 14) v0-Wechsel im Flug · 15) Zielfeuer mit Streukugel gegen Flieger.
//   Runde 10–12: 16) Ellipsoid · 17) Deckel-Regler · 18) Sperr-Schutz versetzter Granaten, keine Detonation vor der Batterie.
//   Runde 14: Prüfstand bitgleich zu R13 · 19) gedrehtes fliegendes Schiff · 20) unten montiert · 21) Sperren am Schiff,
//   Gleichlauf, Rechenzeit · 22) Mindestabstand 150 m, erreichbar() · 23) Feuer halt ohne Füllwolken (Grafik).
// LIEFERT: Tabelle „Messgröße | Ziel | Wert | ok“; Exit-Code 1 bei FEHLER.
// REGEL: Der Ersatz-Befehl hier ist NUR für die Messung — die echte Zielwahl macht die Turm-KI (src/sim/ki/turmziel.js).
import { erstelleFlak, FLAK, WAFFEN_REGLER } from '../src/sim/waffen/flak.js';
import { LAFETTEN, schiffsLafetten } from '../src/sim/waffen/lafetten.js';
import { SCHIFFSDATEN, rumpfSperre, sperrSektor } from '../src/sim/schiffe/index.js';

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
function punktLauf({ d = 1000, streuKugel = 0, streuTiefe, leuchtspur, zielId = 99, v0 = FLAK.v0, schritte = 600, rein = true, ziele = [], einSchuss = false, startwert = 11, waffe }) {
  const alt = { k: FLAK.zuenderStreuKugel, z: FLAK.zuenderStreu };
  if (rein) { FLAK.zuenderStreuKugel = 0; FLAK.zuenderStreu = 0; }
  try {
    const flak = erstelleFlak({ startwert });
    if (waffe !== undefined) flak.einstellen(waffe);
    const befehle = leererBefehl(), t = flak.tuerme[1], l = LAFETTEN[1], b = befehle[1];
    t.v0 = v0; if (rein) t.streuung = 0;
    const p = { x: l.x, y: l.y + l.zapfen.y + d * Math.sin(0.5), z: l.z + d * Math.cos(0.5) };
    b.punkt = p; b.toleranz = 0.002; b.zielId = zielId; b.streuKugel = streuKugel;
    if (streuTiefe != null) b.streuTiefe = streuTiefe;
    if (leuchtspur != null) b.leuchtspur = leuchtspur;
    for (let i = 0; i < 120; i++) flak.schritt(DT, befehle, ziele);
    b.zuender = Math.hypot(p.x - t.muendung.x, p.y - t.muendung.y, p.z - t.muendung.z) / v0;
    b.feuer = true;
    const ab = [], laengs = [], laengsVz = [], quer = [], streu = [], treffer = []; // laengsVz: mit Vorzeichen, > 0 = hinter dem Punkt (R12)
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
        ab.push(a); laengs.push(Math.abs(l)); laengsVz.push(l); quer.push(Math.sqrt(Math.max(0, a * a - l * l))); streu.push(e.streu);
      }
      treffer.push(flak.ereignisse.treffer.map((e) => ({ id: e.zielId, s: e.schaden, det: flak.ereignisse.detonationen.length })));
    }
    return { ab, laengs, laengsVz, quer, streu, treffer, schuesse, p, flak, el };
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
  // Deckel quer (R10, Werte R12): mit Leuchtspur Kugel 60 m bei 300 m → quer 0,10 · d ≈ 30 m, längs bleiben 60 m.
  // Ohne Leuchtspur Kugel 250 m bei 300 m → quer deckelQuer · d (0,60 → ≈ 175 m), längs deckelTiefe · d (0,80 → ≈ 233 m).
  // WARUM die Sollwerte aus FLAK und el: Deckel messen ab der Mündung (Lehre R10), Standard darf sich ändern.
  // R14: Querdeckel 1,0 (T1) → ohne Leuchtspur Kugel 400 m, damit bei 300 m quer UND längs (0,9 · d) gekürzt wird
  for (const [leuchtspur, R] of [[false, 400], [true, 60]]) {
    const nah = punktLauf({ d: 300, streuKugel: R, schritte: 3000, leuchtspur });
    const mq = nah.quer.length ? Math.max(...nah.quer) : Infinity, ml = nah.laengs.length ? Math.max(...nah.laengs) : Infinity;
    const sq = (leuchtspur ? FLAK.deckelQuerLeucht : FLAK.deckelQuer) * nah.el, sl = Math.min(R, FLAK.deckelTiefe * nah.el);
    zeile(`Kugel ${R} m bei 300 m ${leuchtspur ? 'mit' : 'ohne'} Leuchtspur: größter Versatz quer / längs`, `≈ ${sq.toFixed(0)} / ≈ ${sl.toFixed(0)} m`,
      `${mq.toFixed(1)} / ${ml.toFixed(1)} m (${nah.flak.geschosse.gedeckelt} gedeckelt)`,
      mq <= sq + 1.5 && mq >= sq - 8 && ml <= sl + 1.5 && ml >= sl - 0.08 * sl && nah.flak.geschosse.gedeckelt === nah.schuesse);
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
    const r = punktLauf({ d, streuKugel: R, schritte: 12000 }); // ohne Leuchtspur → quer FLAK.deckelQuer · d (R12: 0,60)
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

// ---------- 17) R11: Deckel-Regler der Waffe (flak.einstellen) ----------
{
  // Querdeckel 0,40 bei 300 m: Kugel 150 → quer bis 0,40 · ~291 m ≈ 116 m; mit Leuchtspur bleibt 0,10 fest
  const ohne = punktLauf({ d: 300, streuKugel: 150, streuTiefe: 0, schritte: 1200, waffe: { deckelQuer: 0.4 } });
  const mit = punktLauf({ d: 300, streuKugel: 150, streuTiefe: 0, schritte: 1200, waffe: { deckelQuer: 0.4 }, leuchtspur: true });
  const soll = 0.4 * ohne.el, mq = Math.max(...ohne.quer), ml = Math.max(...mit.quer);
  zeile('Regler deckelQuer 0,40 bei 300 m: größter Querversatz ohne / mit Leuchtspur', `≈ ${soll.toFixed(0)} / ≤ ${(0.1 * mit.el + 1).toFixed(0)} m`,
    `${mq.toFixed(1)} / ${ml.toFixed(1)} m`, mq <= soll + 1.5 && mq >= soll - 8 && ml <= 0.1 * mit.el + 1);
  const tief = punktLauf({ d: 1000, streuKugel: 10, streuTiefe: 600, schritte: 1200, waffe: { deckelTiefe: 0.5 } });
  const lt = Math.max(...tief.laengs), sl = 0.5 * tief.el;
  zeile('Regler deckelTiefe 0,50 bei 1000 m (Wunsch 600): größter Längsversatz', `≈ ${sl.toFixed(0)} m`, lt.toFixed(1) + ' m', lt <= sl + 1.5 && lt >= sl - 25);
  // Klemmen / Standard
  const f = erstelleFlak({ startwert: 1 });
  f.einstellen({ deckelQuer: 5, deckelTiefe: NaN }); const a = { ...f.einstellung };
  f.einstellen(undefined); const b = { ...f.einstellung };
  zeile('einstellen: 5 → max, NaN/fehlt → Standard', `${WAFFEN_REGLER.deckelQuer.max} / ${FLAK.deckelTiefe} / ${FLAK.deckelQuer}`,
    `${a.deckelQuer} / ${a.deckelTiefe} / ${b.deckelQuer}`,
    a.deckelQuer === WAFFEN_REGLER.deckelQuer.max && a.deckelTiefe === FLAK.deckelTiefe && b.deckelQuer === FLAK.deckelQuer && b.deckelTiefe === FLAK.deckelTiefe);
  // Gleichlauf: ohne einstellen() = einstellen(undefined) (bitgleich zu R10); Wechsel mitten im Lauf in zwei Läufen gleich
  const lauf = (modus) => {
    const flak = erstelleFlak({ startwert: 31 });
    const befehle = leererBefehl();
    // WARUM so große Kugeln (R12): bei ~1550 m deckelt der Standard (0,60 / 0,80) erst ab ~930 / ~1240 m — der Wechsel auf
    // die Obergrenzen muss die Kürzung sichtbar senken.
    befehle.forEach((b, k) => { b.punkt = { x: 200 * k - 500, y: 600, z: 1400 }; b.feuer = true; b.toleranz = 0.03; b.zielId = null; b.streuKugel = 1000; b.streuTiefe = 1300; });
    for (let i = 0; i < 2400; i++) {
      if (modus === 'leer') flak.einstellen(undefined);
      // R14: der Standard (T1) liegt an den Obergrenzen → Wechsel auf die R13-Werte 0,60 / 0,80 (mehr Kürzung)
      if (modus === 'wechsel') flak.einstellen(i < 1200 ? undefined : { deckelQuer: 0.6, deckelTiefe: 0.8 });
      flak.schritt(DT, befehle, []);
    }
    return { h: flak.pruefsumme(), g: flak.geschosse.gedeckelt };
  };
  const roh = lauf('ohne'), leer = lauf('leer'), w1 = lauf('wechsel'), w2 = lauf('wechsel');
  zeile('Gleichlauf Deckel-Regler: ohne = Standard, Wechsel in 2 Läufen gleich, Wechsel wirkt', 'gleich / gleich / anders',
    `${roh.h} / ${leer.h} · ${w1.h} / ${w2.h} (gedeckelt ${roh.g} → ${w1.g})`,
    roh.h === leer.h && roh.g === leer.g && w1.h === w2.h && w1.h !== roh.h && w1.g > roh.g);
}

// ---------- 18) R12: Sperr-Schutz der versetzten Granaten, keine Detonation direkt vor der Batterie ----------
{
  // Prüft an der Abgangsrichtung jeder Granate von Turm 4: keine darf unter den Mindest-Nick einer Sperrzone fliegen.
  const umb = (w) => w - 2 * Math.PI * Math.floor((w + Math.PI) / (2 * Math.PI));
  const sperrLauf = (gier, nick) => {
    const flak = erstelleFlak({ startwert: 12 }), befehle = leererBefehl(), t = flak.tuerme[4], l = LAFETTEN[4], b = befehle[4];
    b.punkt = { x: l.x + 1000 * Math.cos(nick) * Math.sin(gier), y: l.y + l.zapfen.y + 1000 * Math.sin(nick), z: l.z + 1000 * Math.cos(nick) * Math.cos(gier) };
    b.feuer = true; b.toleranz = 0.01; b.zielId = 99; b.streuKugel = 600; b.streuTiefe = 0; b.leuchtspur = false;
    let schuesse = 0, darunter = 0, inZone = 0;
    for (let i = 0; i < 1800; i++) {
      flak.schritt(DT, befehle, []);
      for (const s of flak.ereignisse.schuesse) {
        if (s.turmId !== 4) continue;
        schuesse++;
        const g = Math.atan2(s.richtung.x, s.richtung.z), n = Math.asin(Math.max(-1, Math.min(1, s.richtung.y)));
        let m = -Infinity;
        for (const z of t.sperrzonen) if (Math.abs(umb(g - z.gier)) < z.halb && z.nickMin > m) m = z.nickMin;
        if (Number.isFinite(m)) inZone++;
        if (n < m - 1e-9) darunter++;
      }
    }
    return { schuesse, darunter, inZone, angehoben: flak.geschosse.unterSperre };
  };
  const zonen = erstelleFlak().tuerme[4].sperrzonen;
  const vorn = zonen.find((z) => Math.abs(z.gier) < 0.2), schraeg = zonen.find((z) => Math.abs(z.gier - Math.PI / 4) < 0.2);
  // a) Rohr knapp über der Sperre nach +Z (Turm 1 davor): der Versatz drückt Granaten nach unten (kN < 0).
  const a = sperrLauf(0, (vorn ? vorn.nickMin : 0) + 0.04);
  zeile('Sperr-Schutz a) Turm 4 knapp über der Sperre nach +Z, Kugel 600 m — unter der Sperre / angehoben',
    '0 / > 0', `${a.darunter} / ${a.angehoben} von ${a.schuesse}`, !!vorn && a.schuesse > 50 && a.darunter === 0 && a.angehoben > 0);
  // b) seitlich (Prüfer R12): Rohr flach (Nick 0,02) in der Lücke zwischen zwei Sperrzonen — das Rohr ist frei, erst der
  //    Gier-Versatz kG legt Granaten in die Zonen, auch mit kN ≥ 0 noch unter deren Mindest-Nick.
  const luecke = vorn && schraeg ? (vorn.gier + vorn.halb + schraeg.gier - schraeg.halb) / 2 : 0.43;
  const s = sperrLauf(luecke, 0.02);
  zeile('Sperr-Schutz b) seitlich: Rohr flach zwischen zwei Sperrzonen, Kugel 600 m — unter der Sperre / in Zonen / angehoben',
    '0 / > 0 / > 0', `${s.darunter} / ${s.inZone} / ${s.angehoben} von ${s.schuesse}`,
    !!vorn && !!schraeg && s.schuesse > 50 && s.inZone > 0 && s.darunter === 0 && s.angehoben > 0);

  // Zielkugel 320/320 (Standard der KI R12) bei 600 / 400 m: Detonationen < 150 m vor der Mündung.
  // WARUM 600 hart, 400 Info: mit Längsdeckel 0,80 reicht die Tiefe bei 400 m bis 80 m an die Mündung (Grenzfall).
  const nahe = [];
  let okNah = true;
  for (const d of [600, 400]) {
    const r = punktLauf({ d, streuKugel: 320, streuTiefe: 320, schritte: 3000, rein: false });
    let unter = 0;
    for (let k = 0; k < r.ab.length; k++) {
      const vor = r.el + r.laengsVz[k]; // Abstand zur Mündung längs der Schusslinie, dazu der Querversatz
      if (Math.hypot(vor, r.quer[k]) < 150) unter++;
    }
    nahe.push(`${d} m: ${unter} von ${r.ab.length}`);
    if (d === 600) okNah = okNah && r.ab.length > 200 && unter === 0;
  }
  zeile('Zielkugel 320/320: Detonationen < 150 m vor der Mündung (600 m hart / 400 m Info)', '0 / Info', nahe.join(' · '), okNah);
}

// ---------- Runde 14: Prüfstand bitgleich, Flak am fliegenden Schiff, Sperren, Mindestabstand, Füll-Flak ----------
// Vollständige Prüfsumme (Turmwinkel, Mündungen, Granaten inkl. vorPos/vel, Ereignisse) — dieselbe wie die R13-Referenz
// im Scratchpad (wt14/ref_r13.mjs). WARUM fest eingetragen: so bleibt der Prüfstand-Zweig bitgleich zu R13, solange die
// R13-Werte (Deckel 0,60 / 0,80, Sperr-Splitter 90 HP/s) gesetzt sind — neue Standards ändern ihn nicht unbemerkt.
function hashVoll(flak, h) {
  const mische = (v) => { h ^= (Math.round(v * 1e6) | 0); h = Math.imul(h, 16777619) >>> 0; };
  for (const t of flak.tuerme) { mische(t.gier); mische(t.nick); mische(t.schuesse); mische(t.muendung.x); mische(t.muendung.y); mische(t.muendung.z); }
  const g = flak.geschosse;
  for (let i = 0; i < g.max; i++) if (g.aktiv[i]) for (let k = 0; k < 3; k++) { mische(g.pos[i * 3 + k]); mische(g.vel[i * 3 + k]); mische(g.vorPos[i * 3 + k]); }
  for (const d of flak.ereignisse.detonationen) { mische(d.pos.x); mische(d.pos.y); mische(d.pos.z); }
  for (const s of flak.ereignisse.schuesse) { mische(s.pos.x); mische(s.richtung.y); }
  for (const t of flak.ereignisse.treffer) mische(t.schaden);
  return h;
}
function pruefstandLauf(sw, rahmenJeSchritt) {
  const flak = erstelleFlak({ startwert: sw }); flak.einstellen({ deckelQuer: 0.6, deckelTiefe: 0.8 });
  const bef = LAFETTEN.map((l) => ({ turmId: l.id, zielId: null, punkt: { x: 0, y: 0, z: 0 }, feuer: true, toleranz: 0.03, zuender: 1 }));
  const ziele = Array.from({ length: 8 }, (_, k) => ({ id: k, pos: { x: -600 + 150 * k, y: 300 + 20 * k, z: 900 }, vorPos: { x: 0, y: 0, z: 0 }, vel: { x: 60, y: 0, z: -40 }, r: 6, aktiv: true }));
  let h = 2166136261 >>> 0;
  for (let i = 0; i < 3600; i++) {
    for (const z of ziele) { z.vorPos.x = z.pos.x; z.vorPos.y = z.pos.y; z.vorPos.z = z.pos.z; z.pos.x += z.vel.x * DT; z.pos.z += z.vel.z * DT; }
    bef.forEach((b, k) => { const w = i * DT * 1.3 + k; b.punkt.x = 700 * Math.sin(0.6 * Math.sin(w)); b.punkt.y = 300 + 200 * Math.sin(2 * w); b.punkt.z = 900;
      b.zielId = k % 2 ? 3 : null; b.streuKugel = 150 + 50 * k; b.streuTiefe = 250; b.leuchtspur = ((i >> 6) + k) % 4 === 0; });
    if (rahmenJeSchritt) flak.setzeRahmen(rahmenJeSchritt);
    flak.schritt(DT, bef, ziele);
    h = hashVoll(flak, h);
  }
  return { h: h.toString(16) + '/' + flak.pruefsumme(), verl: flak.geschosse.abstandVerlaengert };
}
{
  const SG = FLAK.sorte[1], echt = SG.splitterDps, REF = { 303: '43512428/8833a6c1', 7: 'e676d157/7285cb66', 202: '92ac96b4/be47596c' };
  const werte = [];
  let ok = true;
  try {
    SG.splitterDps = 90;
    for (const sw of [303, 7, 202]) { const r = pruefstandLauf(sw); werte.push(r.h); ok = ok && r.h === REF[sw]; }
  } finally { SG.splitterDps = echt; }
  zeile('R14 Prüfstand ohne Rahmen bitgleich zu R13 (R13-Werte gesetzt, 3 Startwerte × 3600 Schritte)', 'gleich Referenz', werte.join(' · '), ok);
  // Einheits-Rahmen (Lage 0, keine Drehung, Tempo 0) muss dieselben Zahlen liefern wie gar kein Rahmen — solange der
  // Mindestabstand nicht greift (die Befehle liegen ≥ 700 m weit).
  const ident = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, vel: { x: 0, y: 0, z: 0 } };
  const ohne = pruefstandLauf(303), mit = pruefstandLauf(303, ident);
  zeile('R14 Einheits-Rahmen = kein Rahmen (Prüfsumme)', 'gleich, 0 verlängert', `${ohne.h} / ${mit.h} (${mit.verl} verlängert)`, ohne.h === mit.h && mit.verl === 0);
}

const BW = SCHIFFSDATEN.bollwerk;
const quat = (ax, ay, az, w) => { const l = Math.hypot(ax, ay, az) || 1, s = Math.sin(w / 2); return { x: ax / l * s, y: ay / l * s, z: az / l * s, w: Math.cos(w / 2) }; };
const dreheQ = (q, v) => { const tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + q.y * tz - q.z * ty, y: v.y + q.w * ty + q.z * tx - q.x * tz, z: v.z + q.w * tz + q.x * ty - q.y * tx }; };
const konj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const mal = (a, b) => ({ x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z });
const schiffsFlak = (startwert) => { const { lafetten, hindernisse } = schiffsLafetten(BW);
  return erstelleFlak({ startwert, lafetten, schiff: { hindernisse, rumpf: (l) => rumpfSperre(l, BW.teile) } }); };
/** Richtung im Turm-Rahmen (gier, nick) → Schiffs-Lokal (unten gespiegelt). */
const turmRichtung = (l, g, n) => { const v = { x: Math.sin(g) * Math.cos(n), y: Math.sin(n), z: Math.cos(g) * Math.cos(n) }; if (l.oben === false) { v.x = -v.x; v.y = -v.y; } return v; };
/** Schiffs-Lokal-Richtung → (gier, nick) im Turm-Rahmen. */
const turmWinkel = (l, v) => { const x = l.oben === false ? -v.x : v.x, y = l.oben === false ? -v.y : v.y;
  return { g: Math.atan2(x, v.z), n: Math.asin(Math.max(-1, Math.min(1, y / Math.hypot(v.x, v.y, v.z)))) }; };
/** Freie Richtung je Turm: Lafetten-Mitte, Nick 0,15 über der Sperre (mindestens 0,5). */
function freieRichtung(t) {
  const l = t.lafette, g = l.gier[0];
  let n = 0.5;
  for (let k = 0; k < 40 && !t.erreichbarTest(g, n); k++) n += 0.05;
  return { g, n };
}

// ---------- 19) Gedrehtes, fliegendes Schiff: Granate fliegt aus der Mündung in Rohrrichtung + Schiffstempo ----------
{
  const alt = { k: FLAK.zuenderStreuKugel, z: FLAK.zuenderStreu };
  FLAK.zuenderStreuKugel = 0; FLAK.zuenderStreu = 0;
  try {
    const flak = schiffsFlak(41), q = quat(0.3, 1, 0.2, 1.1), vs = { x: 120, y: 30, z: 250 }, pos = { x: 1000, y: -500, z: 3000 };
    flak.tuerme.forEach((t, i) => { t.streuung = 0; t.erreichbarTest = (g, n) => flak.erreichbar(i, g, n); });
    const ziele = flak.tuerme.map((t) => { const f = freieRichtung(t), d = turmRichtung(t.lafette, f.g, f.n), l = t.lafette;
      return { x: l.x + d.x * 900, y: l.y + d.y * 900, z: l.z + d.z * 900 }; });
    const befehle = flak.tuerme.map((t, i) => ({ turmId: t.id, zielId: 99, punkt: ziele[i], feuer: false, toleranz: 0.002, streuKugel: 0 }));
    let tempoFehler = 0, richtFehler = 0, ortFehler = 0, detFehler = 0, det = 0, schuesse = 0;
    const feuernd = new Set();
    for (let i = 0; i < 600; i++) {
      pos.x += vs.x * DT; pos.y += vs.y * DT; pos.z += vs.z * DT;
      flak.setzeRahmen({ pos, rot: q, vel: vs });
      flak.tuerme.forEach((t, k) => { const b = befehle[k], m = t.muendung; b.feuer = i >= 180;
        b.zuender = Math.hypot(b.punkt.x - m.x, b.punkt.y - m.y, b.punkt.z - m.z) / t.v0; });
      flak.schritt(DT, befehle, []);
      const gs = flak.geschosse;
      for (const s of flak.ereignisse.schuesse) {
        schuesse++; feuernd.add(s.turmIndex);
        const t = flak.tuerme[s.turmIndex];
        // Granate: der jüngste Eintrag mit alter 0 an dieser Mündung
        for (let g = 0; g < gs.max; g++) {
          if (!gs.aktiv[g] || gs.alter[g] !== 0 || Math.abs(gs.pos[g * 3] - s.pos.x) > 1e-9) continue;
          const rx = gs.vel[g * 3] - vs.x, ry = gs.vel[g * 3 + 1] - vs.y, rz = gs.vel[g * 3 + 2] - vs.z;
          tempoFehler = Math.max(tempoFehler, Math.abs(Math.hypot(rx, ry, rz) - t.v0));
        }
        const soll = dreheQ(q, turmRichtung(t.lafette, t.gier, t.nick)); // Rohrrichtung in Welt (Streuung 0)
        richtFehler = Math.max(richtFehler, Math.hypot(s.richtung.x - soll.x, s.richtung.y - soll.y, s.richtung.z - soll.z));
        const mw = t.muendungWelt;
        ortFehler = Math.max(ortFehler, Math.hypot(s.pos.x - mw.x, s.pos.y - mw.y, s.pos.z - mw.z));
      }
      for (const d of flak.ereignisse.detonationen) {
        // zurück in Schiffs-Lokal (Schiff fliegt gleichförmig, keine Drehung → exakt bis auf den Bruch im Schritt)
        const lok = dreheQ(konj(q), { x: d.pos.x - pos.x, y: d.pos.y - pos.y, z: d.pos.z - pos.z });
        let best = Infinity;
        for (const p of ziele) best = Math.min(best, Math.hypot(lok.x - p.x, lok.y - p.y, lok.z - p.z));
        detFehler = Math.max(detFehler, best); det++;
      }
    }
    zeile('R14 Schiff gedreht + 300 m/s: |Granate − Schiffstempo| = v0 / Richtung = gedrehtes Rohr / Abgang an der Mündung',
      '< 1e-6 m/s / < 1e-9 / < 1,5 m (Rohrversatz)', `${tempoFehler.toExponential(1)} / ${richtFehler.toExponential(1)} / ${ortFehler.toFixed(2)} m (${schuesse} Schuss, ${feuernd.size} von ${flak.tuerme.length} Türmen)`,
      schuesse > 500 && feuernd.size === flak.tuerme.length && tempoFehler < 1e-6 && richtFehler < 1e-9 && ortFehler < 1.5);
    // Bruch im Schritt: das Schiff steht beim Vergleich am Schrittende → bis zu |vs| · dt (≈ 4,6 m) Versatz längs vs
    zeile('R14 Schiff gedreht + fliegend: Detonation ↔ befohlener Punkt (Schiffs-Lokal, 900 m)', '< 8 m', `${detFehler.toFixed(2)} m (${det} Det.)`, det > 300 && detFehler < 8);
  } finally { FLAK.zuenderStreuKugel = alt.k; FLAK.zuenderStreu = alt.z; }
}

// ---------- 20) Unten montiert: Turm-Rahmen gespiegelt ----------
{
  const flak = schiffsFlak(42), k = flak.tuerme.findIndex((t) => t.id === 5), t = flak.tuerme[k], l = t.lafette;
  const befehle = flak.tuerme.map((u) => ({ turmId: u.id, zielId: null, punkt: null, feuer: false }));
  befehle[k] = { turmId: 5, zielId: null, punkt: { x: l.x - 1000, y: l.y - 400, z: l.z }, feuer: true, toleranz: 0.02, zuender: 1 };
  let unten = 0, schuesse = 0;
  for (let i = 0; i < 300; i++) {
    flak.schritt(DT, befehle, []);
    for (const s of flak.ereignisse.schuesse) { schuesse++; if (s.richtung.x < 0 && s.richtung.y < 0) unten++; }
  }
  zeile('R14 unten montierter Turm 5: Ziel Schiff −X/unten → Gier im Turm-Rahmen ≈ +π/2, Granaten nach −X und unten',
    'Gier 1,57 ± 0,03, alle', `Gier ${t.gier.toFixed(3)}, ${unten} von ${schuesse}`, Math.abs(t.gier - Math.PI / 2) < 0.03 && schuesse > 10 && unten === schuesse);
}

// ---------- 21) Sperren am Schiff + Rechenzeit + Gleichlauf: Granaten nie unter Rumpf-/Nachbar-Sperre, nie außerhalb der Grenzen ----------
function schiffLauf(startwert) {
  const flak = schiffsFlak(startwert), dreh = quat(0.2, 1, 0.1, 0.1 * DT); // 0,1 rad/s Drehung
  let q = quat(1, 0, 0, 0.4);
  const pos = { x: 0, y: 0, z: 0 }, vs = { x: 40, y: -10, z: 220 };
  const ziele = Array.from({ length: 10 }, (_, k) => ({ id: k, pos: { x: 0, y: 0, z: 0 }, vorPos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, r: 6, aktiv: true }));
  const befehle = flak.tuerme.map((t) => ({ turmId: t.id, zielId: null, punkt: { x: 0, y: 0, z: 0 }, feuer: true, toleranz: 0.08, streuKugel: 400, streuTiefe: 300 }));
  let schuesse = 0, ausserhalb = 0, unterRumpf = 0, unterNachbar = 0, istVerletzt = 0;
  const t0 = performance.now();
  for (let i = 0; i < 3600; i++) {
    pos.x += vs.x * DT; pos.y += vs.y * DT; pos.z += vs.z * DT; q = mal(dreh, q);
    flak.setzeRahmen({ pos, rot: q, vel: vs });
    for (const z of ziele) { const w = i * DT * 0.4 + z.id; z.vorPos = { ...z.pos };
      z.pos = { x: pos.x + 900 * Math.sin(w), y: pos.y + 500 * Math.cos(1.3 * w), z: pos.z + 900 * Math.cos(w) }; }
    // Befehle streichen über die ganze Kugel (lokal, 1200 m) — auch in Richtung Rumpf, die Waffe muss sperren
    flak.tuerme.forEach((t, k) => { const w = i * DT * 0.12 + k * 0.9, g = Math.PI * Math.sin(w), n = 1.4 * Math.sin(1.7 * w + k);
      const p = befehle[k].punkt; p.x = 1200 * Math.sin(g) * Math.cos(n); p.y = 1200 * Math.sin(n); p.z = 1200 * Math.cos(g) * Math.cos(n);
      befehle[k].zielId = k % 2 ? 3 : null; });
    flak.schritt(DT, befehle, ziele);
    const qi = konj(q);
    for (const s of flak.ereignisse.schuesse) {
      schuesse++;
      const t = flak.tuerme[s.turmIndex], l = t.lafette, w = turmWinkel(l, dreheQ(qi, s.richtung)), e = 1e-9;
      const relG = Math.atan2(Math.sin(w.g - l.gier[0]), Math.cos(w.g - l.gier[0]));
      if ((l.gier[1] < Math.PI - 1e-6 && Math.abs(relG) > l.gier[1] + e) || w.n < l.nick[0] - e) ausserhalb++;
      if (t.rumpf && w.n < t.rumpf[sperrSektor(w.g, t.rumpf.length)] - e) unterRumpf++;
      for (const z of t.sperrzonen) if (Math.abs(Math.atan2(Math.sin(w.g - z.gier), Math.cos(w.g - z.gier))) < z.halb && w.n < z.nickMin - e) unterNachbar++;
    }
    for (const t of flak.tuerme) {
      // Ist-Lage beim Feuern: das Rohr selbst liegt nie unter der Sperre (sonst stünde es im Rumpf)
      if (t.abklingen === FLAK.schussAbstand && t.rumpf && t.nick < t.rumpf[sperrSektor(t.gier, t.rumpf.length)] - 1e-9) istVerletzt++;
    }
  }
  return { ms: (performance.now() - t0) / 3600, schuesse, ausserhalb, unterRumpf, unterNachbar, istVerletzt, h: flak.pruefsumme(),
    verworfen: flak.geschosse.verworfen, angehoben: flak.geschosse.unterSperre, tuerme: flak.tuerme.length };
}
{
  schiffLauf(5); // Aufwärmen (JIT)
  const a = schiffLauf(51), b = schiffLauf(51), c = schiffLauf(52);
  zeile(`R14 Sperren am Schiff (${a.tuerme} Flaktürme, Kugel 400/300, 60 s, Schiff dreht 0,1 rad/s): außerhalb Grenzen / unter Rumpf / unter Nachbar / Rohr unter Rumpf`,
    '0 / 0 / 0 / 0', `${a.ausserhalb} / ${a.unterRumpf} / ${a.unterNachbar} / ${a.istVerletzt} von ${a.schuesse} (${a.angehoben} angehoben, ${a.verworfen} verworfen)`,
    a.schuesse > 3000 && a.ausserhalb === 0 && a.unterRumpf === 0 && a.unterNachbar === 0 && a.istVerletzt === 0 && a.verworfen === 0);
  zeile('R14 Gleichlauf am Schiff (gleicher Startwert / anderer)', 'gleich / anders', `${a.h} / ${b.h} / ${c.h}`, a.h === b.h && a.h !== c.h);
  zeile(`R14 Rechenzeit Sim-Schritt am Schiff (${a.tuerme} Türme, 10 Ziele, ~${Math.round(a.schuesse / 60 * 2)} Granaten)`, '≤ 0,5 ms', a.ms.toFixed(3) + ' ms', a.ms <= 0.5);
}

// ---------- 22) Mindestabstand 150 m zur Schiffsmitte + erreichbar() ----------
{
  const flak = schiffsFlak(61), pos = { x: 0, y: 0, z: 0 }, vs = { x: 0, y: 0, z: 300 }, q = quat(0, 1, 0, 0.7);
  // Befehl: Punkte 60–110 m neben der Schiffsmitte (Zünder kurz) — ohne Mindestabstand detonierten sie über dem Rumpf
  const befehle = flak.tuerme.map((t, k) => ({ turmId: t.id, zielId: null, feuer: true, toleranz: 0.05, streuKugel: 0,
    punkt: { x: (t.lafette.x > 0 ? 1 : -1) * 70, y: (t.lafette.oben === false ? -1 : 1) * 70, z: t.lafette.z + 10 * k } }));
  let min = Infinity, det = 0;
  for (let i = 0; i < 900; i++) {
    pos.z += vs.z * DT; flak.setzeRahmen({ pos, rot: q, vel: vs });
    flak.tuerme.forEach((t, k) => { const b = befehle[k], m = t.muendung; b.zuender = Math.hypot(b.punkt.x - m.x, b.punkt.y - m.y, b.punkt.z - m.z) / t.v0; });
    flak.schritt(DT, befehle, []);
    // WARUM + |vs|·dt: das Schiff steht am Schrittende, die Granate zündet im Bruch des Schritts (≤ 5 m früher)
    for (const d of flak.ereignisse.detonationen) { det++; min = Math.min(min, Math.hypot(d.pos.x - pos.x, d.pos.y - pos.y, d.pos.z - pos.z) + 300 * DT); }
  }
  zeile('R14 Mindestabstand: Befehle 60–110 m neben dem Schiff → kleinster Detonationsabstand zur Schiffsmitte', '≥ 150 m',
    `${min.toFixed(1)} m (${det} Det., ${flak.geschosse.abstandVerlaengert} Zünder verlängert)`, det > 100 && min >= 150 - 1e-6 && flak.geschosse.abstandVerlaengert > 0);

  // erreichbar(): knapp unter der Rumpf-Sperre nein, knapp darüber ja (wo Grenzen/Nachbarn nicht stören)
  let falsch = 0, geprueft = 0;
  flak.tuerme.forEach((t, i) => {
    const R = t.rumpf, n = R.length, l = t.lafette;
    for (let k = 0; k < n; k++) {
      const g = -Math.PI + (k + 0.5) * 2 * Math.PI / n, w = R[k];
      if (w - 0.02 < l.nick[0] || w + 0.02 > l.nick[1]) continue;
      if (l.gier[1] < Math.PI - 1e-6 && Math.abs(Math.atan2(Math.sin(g - l.gier[0]), Math.cos(g - l.gier[0]))) > l.gier[1]) continue;
      const nachbar = t.sperrzonen.some((z) => Math.abs(Math.atan2(Math.sin(g - z.gier), Math.cos(g - z.gier))) < z.halb && z.nickMin > w);
      geprueft++;
      if (flak.erreichbar(i, g, w - 0.02)) falsch++;
      if (!nachbar && !flak.erreichbar(i, g, w + 0.02)) falsch++;
    }
  });
  zeile('R14 erreichbar(): knapp unter/über der Rumpf-Sperre', '0 falsch', `${falsch} falsch von ${geprueft} Sektoren`, geprueft > 50 && falsch === 0);
}

// ---------- 23) Feuer halt: keine Füllwolken mehr 0,5 s nach dem letzten Schuss (Grafik in Node, ohne Turm-Modelle) ----------
{
  const THREE = await import('three');
  const { erstelleFlakGrafik } = await import('../src/grafik/waffen/flakgrafik.js');
  const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1e5);
  const modelle = LAFETTEN.map(() => ({ drehkranz: new THREE.Object3D(), wiege: new THREE.Object3D(), rohre: [new THREE.Object3D(), new THREE.Object3D()] }));
  const grafik = erstelleFlakGrafik(new THREE.Scene(), cam, { turmModelle: modelle });
  const flak = erstelleFlak({ startwert: 71 }), befehle = leererBefehl();
  befehle.forEach((b) => { b.punkt = { x: 0, y: 500, z: 900 }; b.toleranz = 0.03; b.zuender = 1.6; b.streuKugel = 150; });
  // lage wie die KI im Sperrfeuer: der Raum bleibt auch bei Feuer halt gesetzt (das war die Ursache)
  const lage = { schirme: [{ mitte: { x: 0, y: 500, z: 900 }, lagen: [{ x: 0, y: 500, z: 900 }], laengs: { x: 0, y: 0.5, z: 0.9 }, breite: 150, hoehe: 80, tiefeHalb: 100 }] };
  let letzterSchuss = -1, waehrend = 0, nach = 0, nachDet = 0;
  for (let i = 0; i < 600; i++) { // 3 s Feuer, dann 7 s Feuer halt
    befehle.forEach((b) => { b.feuer = i < 180; });
    flak.schritt(DT, befehle, []); grafik.nachSchritt(flak);
    if (flak.ereignisse.schuesse.length) letzterSchuss = i;
    const vor = grafik.zaehler.fuellGesetzt;
    grafik.aktualisiere(flak, 1, DT, i * DT, lage);
    const neu = grafik.zaehler.fuellGesetzt - vor;
    if (i < 180) waehrend += neu; else if ((i - letzterSchuss) * DT > 0.5) { nach += neu; nachDet += flak.ereignisse.detonationen.length; }
  }
  zeile('R14 Feuer halt: Füllwolken beim Feuern / ab 0,5 s nach dem letzten Schuss (echte Detonationen danach: Info)', '> 0 / 0',
    `${waehrend} / ${nach} (${nachDet} echte Det. danach)`, waehrend > 0 && nach === 0);
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
