// ZWECK: Rumpf-Sperre eines Geschützturms (Runde 14): je Gier-Sektor der kleinste Nick, ab dem das Rohr über den
//        eigenen Rumpf hinweg frei schießt. Reine Rechnung aus den Querschnitten (ohne three).
// LIEFERT: rumpfSperre(turm, teile, n = 32) → Float64Array(n) · sperrSektor(gier, n) → Sektor-Index
// REGEL (Schnittstelle für Waffe und KI — genau so lesen):
//   - turm = Turm-Datensatz aus turmDaten() (x, y, z, oben, s, zapfen {y, z}, muendungen[].x).
//   - teile = Teile-Objekt des Schiffs (z. B. BOLLWERK.teile) ODER flache Liste { ab, fase }. Beim Bollwerk gehört
//     TEILE.details dazu (Grafik-Anbauten wie Kühlrippen, Rohre, Mast, Triebwerksblock) — einfach BOLLWERK.teile geben.
//   - Winkel im TURM-Rahmen wie turm.js: gier 0 = Turm-+Z, gier > 0 zu Turm-+X; nick > 0 = vom Rumpf weg. Unten
//     montiert: Turm (x, y, z) → Schiff (−x, −y, z) relativ zum Fußpunkt.
//   - Sektor i deckt Gier [−π + i·2π/n, −π + (i+1)·2π/n). Index zu einer Gier g: sperrSektor(g, n) (g beliebig, wird
//     auf [−π, π) gebrochen).
//   - Wert w[i] = kleinster freier Nick (rad) im ganzen Sektor: JEDER Nick ≥ w[i] trifft den Rumpf nicht (Strahlen vom
//     Zapfen durch beide Rohrachsen und die Mitte, bis 300 m). w[i] = −π/2 → keine Sperre; w[i] > π/2 kann nicht
//     vorkommen (senkrecht ist immer frei). Die Turm-Grenzen gier/nick kommen NOCH DAZU (Schnittmenge).
//   - WARUM konservativ: Rumpf um RAND m aufgeblasen (Rohrdicke + Kisten der Aufbauten), Sektor = Maximum über 13
//     Gier-Proben. Prüfung gegen die echten Lofts: tests/schiffe.mjs „Rumpftreffer“.
//   - Ergebnis je (turm, teile, n) zwischengespeichert — die Rechnung dauert ~50 ms je Turm.
//   - R21 (Form im Gefecht): statt teile geht auch eine Quelle { hoehe(x, z, oben) → y | null, huelle { x0, x1, z0, z1 },
//     weite } (Schiffs-Koordinaten, Rand schon eingerechnet) — z. B. formHoehenfeld(form, versatz) aus
//     src/sim/form/geschuetze.js. Gleiche Strahlen und Sektoren; Weite = max(300 m, quelle.weite). Zwischenspeicher je
//     (Quelle, turm, n). Der Bollwerk-Weg (teile) bleibt unverändert.
import { masse, alleTeile } from './rumpf.js';

const RAND = 0.5;        // m, Aufblasen des Rumpfs
const PROBEN = 12;       // Gier-Proben je Sektor = PROBEN + 1 (Ränder inklusive)
const SCHRITT = 0.5;     // m entlang des Strahls (waagrecht im Turm-Rahmen)
const WEITE = 300;       // m, weiter reicht kein Rumpf
const ZWEI_PI = Math.PI * 2;

const umbruch = (w) => w - ZWEI_PI * Math.floor((w + Math.PI) / ZWEI_PI); // → [−π, π)
/** Sektor-Index zu einer Gier (Turm-Rahmen). */
export const sperrSektor = (gier, n = 32) => Math.min(n - 1, Math.floor((umbruch(gier) + Math.PI) / ZWEI_PI * n));

const ablage = new WeakMap(); // turm → Map(schlüssel → Ergebnis)

/** Ober- (oben) bzw. Unterkante (unten) eines Teils an (x, z) mit Rand e, sonst null. Wie rumpf.js rand(). */
function kante(teil, x, z, oben, e) {
  const ab = teil.ab, z0 = ab[0].z, z1 = ab[ab.length - 1].z;
  if (z < z0 - e || z > z1 + e) return null;
  const m = masse(ab, Math.min(z1, Math.max(z0, z)));
  if (!m) return null;
  const d = Math.abs(x - m.x); if (d > m.w + e) return null;
  const tief = Math.max(0, d - (m.w - Math.min(m.w, m.h) * teil.fase));
  return oben ? m.y + m.h + e - tief : m.y - m.h - e + tief;
}

export function rumpfSperre(turm, teile, n = 32) {
  // R21: Form-Schiffe haben keine Querschnitte — Höhenfeld-Quelle { hoehe(x, z, oben), huelle, weite } (Kopf)
  if (teile && typeof teile.hoehe === 'function') return sperreAusFeld(turm, teile, n);
  const liste = Array.isArray(teile) ? teile : alleTeile(teile);
  let karte = ablage.get(turm);
  if (!karte) ablage.set(turm, karte = new Map());
  const schluessel = n + ':' + liste.length;
  if (karte.has(schluessel)) return karte.get(schluessel);

  // Hüllquader in Schiffs-x/z je Teil (schnelles Aussortieren) und gesamt (Strahl nur, solange er darin läuft)
  const huelle = liste.map((t) => {
    let x0 = Infinity, x1 = -Infinity;
    for (const q of t.ab) { const qx = q.x ?? 0; x0 = Math.min(x0, qx - q.w); x1 = Math.max(x1, qx + q.w); }
    return { t, x0: x0 - RAND, x1: x1 + RAND, z0: t.ab[0].z - RAND, z1: t.ab[t.ab.length - 1].z + RAND };
  });
  let gx0 = Infinity, gx1 = -Infinity, gz0 = Infinity, gz1 = -Infinity;
  for (const h of huelle) { gx0 = Math.min(gx0, h.x0); gx1 = Math.max(gx1, h.x1); gz0 = Math.min(gz0, h.z0); gz1 = Math.max(gz1, h.z1); }

  const oben = turm.oben, vx = oben ? 1 : -1; // Turm-x → Schiff-x
  const y0 = turm.zapfen.y, zz = turm.zapfen.z;
  const seiten = [0, turm.muendungen[0].x, -turm.muendungen[0].x];
  /** Kleinster freier Nick für eine Gier g (Maximum der Höhenwinkel aller Rumpfpunkte unter den drei Strahlen). */
  function nickFrei(g) {
    const sg = Math.sin(g), cg = Math.cos(g);
    let best = -Math.PI / 2;
    for (const q of seiten) {
      // Strahlursprung waagrecht: Zapfen (um gier gedreht) + Seitenversatz quer zum Rohr
      const ox = sg * zz + cg * q, oz = cg * zz - sg * q;
      for (let d = SCHRITT; d <= WEITE; d += SCHRITT) {
        const sx = turm.x + vx * (ox + sg * d), sz = turm.z + oz + cg * d;
        if (sx < gx0 || sx > gx1 || sz < gz0 || sz > gz1) {
          // außerhalb der Gesamthülle: läuft der Strahl weiter weg, kommt nichts mehr
          if ((sx < gx0 && vx * sg <= 0) || (sx > gx1 && vx * sg >= 0) || (sz < gz0 && cg <= 0) || (sz > gz1 && cg >= 0)) break;
          continue;
        }
        let h = -Infinity;
        for (const k of huelle) {
          if (sx < k.x0 || sx > k.x1 || sz < k.z0 || sz > k.z1) continue;
          const y = kante(k.t, sx, sz, oben, RAND);
          if (y === null) continue;
          const v = oben ? y - turm.y : turm.y - y; // Höhe im Turm-Rahmen (vom Rumpf weg)
          if (v > h) h = v;
        }
        if (h === -Infinity) continue;
        const w = Math.atan2(h - y0, d);
        if (w > best) best = w;
      }
    }
    return best;
  }

  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + i * ZWEI_PI / n;
    let m = -Math.PI / 2;
    for (let k = 0; k <= PROBEN; k++) m = Math.max(m, nickFrei(a + (ZWEI_PI / n) * k / PROBEN));
    w[i] = m;
  }
  karte.set(schluessel, w);
  return w;
}

const ablageFeld = new WeakMap(); // quelle → WeakMap(turm → Map(n → Ergebnis))

/** Rumpf-Sperre aus einer Höhenfeld-Quelle (R21) — gleiche Strahlen wie oben, Höhe je Schritt aus quelle.hoehe(). */
function sperreAusFeld(turm, quelle, n) {
  let jeTurm = ablageFeld.get(quelle);
  if (!jeTurm) ablageFeld.set(quelle, jeTurm = new WeakMap());
  let karte = jeTurm.get(turm);
  if (!karte) jeTurm.set(turm, karte = new Map());
  if (karte.has(n)) return karte.get(n);

  const { x0: gx0, x1: gx1, z0: gz0, z1: gz1 } = quelle.huelle;
  const weite = Math.max(WEITE, quelle.weite ?? 0);
  const oben = turm.oben, vx = oben ? 1 : -1;
  const y0 = turm.zapfen.y, zz = turm.zapfen.z;
  const seiten = [0, turm.muendungen[0].x, -turm.muendungen[0].x];
  function nickFrei(g) {
    const sg = Math.sin(g), cg = Math.cos(g);
    let best = -Math.PI / 2;
    for (const q of seiten) {
      const ox = sg * zz + cg * q, oz = cg * zz - sg * q;
      for (let d = SCHRITT; d <= weite; d += SCHRITT) {
        const sx = turm.x + vx * (ox + sg * d), sz = turm.z + oz + cg * d;
        if (sx < gx0 || sx > gx1 || sz < gz0 || sz > gz1) {
          if ((sx < gx0 && vx * sg <= 0) || (sx > gx1 && vx * sg >= 0) || (sz < gz0 && cg <= 0) || (sz > gz1 && cg >= 0)) break;
          continue;
        }
        const y = quelle.hoehe(sx, sz, oben);
        if (y === null) continue;
        const h = oben ? y - turm.y : turm.y - y; // Höhe im Turm-Rahmen (vom Rumpf weg)
        const w = Math.atan2(h - y0, d);
        if (w > best) best = w;
      }
    }
    return best;
  }
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + i * ZWEI_PI / n;
    let m = -Math.PI / 2;
    for (let k = 0; k <= PROBEN; k++) m = Math.max(m, nickFrei(a + (ZWEI_PI / n) * k / PROBEN));
    w[i] = m;
  }
  karte.set(n, w);
  return w;
}
