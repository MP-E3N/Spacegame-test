// ZWECK: Messungen der Flak-Simulation ohne Browser (`node tests/waffen.mjs`), Runde 6.
//   1) Richtzeit 90° (Gier) eines Turms · 2) Schuss/s der Batterie · 3) schädliche Detonationen/s gegen einen
//   Geradeausflieger (Ersatz-Befehl mit selbst gerechnetem Vorhalt) · 4) Gleichlauf: Prüfsumme nach 3600 Schritten
//   in zwei Läufen gleich, anderer Startwert anders · 5) Rechenzeit ms/Schritt (volle Batterie, ~240 Geschosse, 10 Ziele).
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
    const b = befehle[i], tz = abfang(t.muendung, ziel, FLAK.v0);
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
  t.nick = t.vorNick = 0; // nur Gier messen
  befehle[1].punkt = { x: l.x + 2000, y: l.y + l.zapfen.y, z: l.z };
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
  let det = 0, schaedlich = 0, schaden = 0, nah = 0;
  const schritte = 600;
  for (let i = 0; i < schritte; i++) {
    bewege(ziel);
    zielBefehle(flak, befehle, ziel);
    flak.schritt(DT, befehle, [ziel]);
    det += flak.ereignisse.detonationen.length;
    for (const d of flak.ereignisse.detonationen) if (d.art === 'nah') nah++;
    schaedlich += flak.ereignisse.treffer.length; // ein Ziel → je Detonation höchstens ein Treffer
    for (const t of flak.ereignisse.treffer) schaden += t.schaden;
  }
  const proS = schaedlich / (schritte * DT);
  zeile('schädliche Detonationen/s (800 m, 150 m/s)', '≥ 1', proS.toFixed(1), proS >= 1);
  zeile('Trefferquote (schädlich / alle Detonationen)', 'Info', det ? (100 * schaedlich / det).toFixed(0) + ' %' : '–', true, false);
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
      const tz = abfang(t.muendung, ziel, FLAK.v0); b.feuer = tz > 0; b.zuender = tz; b.toleranz = 0.015; const tt = Math.max(tz, 0);
      b.punkt.x = ziel.pos.x + ziel.vel.x * tt; b.punkt.y = ziel.pos.y + ziel.vel.y * tt; b.punkt.z = ziel.pos.z + ziel.vel.z * tt; });
    else befehle.forEach((b, k) => { const w = i * DT * 1.6 + k * Math.PI / 3, g = 0.5 * Math.sin(w), n = 0.45 + 0.3 * Math.sin(2 * w);
      b.punkt.x = 800 * Math.sin(g) * Math.cos(n); b.punkt.y = 4 + 800 * Math.sin(n); b.punkt.z = 800 * Math.cos(g) * Math.cos(n);
      b.feuer = true; b.toleranz = 0.06; b.zuender = 800 / FLAK.v0; });
    flak.schritt(DT, befehle, ziele);
  }
  return { summe: flak.pruefsumme(), ms: (performance.now() - t0) / 3600, aktiv: flak.geschosse.anzahlAktiv };
}
lauf(9); // Aufwärmen (JIT)
const a = lauf(303), b = lauf(303), c = lauf(304);
zeile('Gleichlauf 3600 Schritte (gleicher Startwert)', 'gleich', `${a.summe} / ${b.summe}`, a.summe === b.summe);
zeile('anderer Startwert → andere Prüfsumme', 'anders', c.summe, c.summe !== a.summe);
zeile('Rechenzeit Sim-Schritt (6 Türme, 10 Ziele)', '≤ 0,3 ms', a.ms.toFixed(3) + ' ms', a.ms <= 0.3);

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
