// ZWECK: Kollision Schiff ↔ Felsen (Kugel gegen Kugel): herausschieben, abprallen, Rumpfschaden.
// LIEFERT: kollidiere(z, kugeln, feld, werte) → { treffer, schaden, kontakte }
//   z       Schiffszustand aus sim/schiff.js (pos, vel, rot, hp, zerstoert) — wird verändert
//   kugeln  [{ x, y, z, r }] schiffslokal (aus sim/schiffe, als Parameter)
//   feld    [{ x, y, z, r, … }] Welt, statisch (aus sim/feld.js, als Parameter)
//   werte   Schiffswerte (abprall, gleit, schadenSchwelle, schadenProMs, hpMax)
//   treffer = Kontakte mit Aufprall über der Schwelle · schaden = HP-Verlust dieses Schritts
//   kontakte = alle Berührungen dieses Schritts [{ punkt: Vector3 (Welt), normale: Vector3 (vom Fels weg),
//              tempo (m/s Aufprall, 0 = Anliegen), feld: Index, kugel: Index }]
// REGEL: Kein DOM, kein Zufall; importiert nichts aus schiffe/ oder feld. Felsen in Feld-Reihenfolge, Kugeln in
//        Listen-Reihenfolge (Gleichlauf). Ergebnis und Kontakte werden wiederverwendet → nur bis zum nächsten Aufruf gültig.
//        Aufruf direkt nach schiff.schritt(), im selben Sim-Schritt.
// WARUM kein Durchtunneln: pro Schritt fliegt das Schiff höchstens vMax·nachbrenner/60 ≈ 2,1 m (Ambos); jede Paarung
//        hat r_kugel + r_fels ≫ 2,1 m, also wird jede Berührung erkannt, bevor der Mittelpunkt durch ist.
// WARUM kein Zittern: unter der Schwelle wird die Annäherung nur auf 0 gesetzt (Anliegen), kein Rückprall.
// VEREINFACHUNG: kein Drehimpuls aus dem Stoß; Fels unendlich schwer, Felsdrehung egal (Kugel).
import { Vector3 } from 'three';

const ergebnis = { treffer: 0, schaden: 0, kontakte: [] };
const vorrat = []; // wiederverwendete Kontakt-Objekte
const welt = [];   // Kugel-Mittelpunkte in Welt (wiederverwendet)
const d = new Vector3(), n = new Vector3();

export function kollidiere(z, kugeln, feld, werte) {
  ergebnis.treffer = 0; ergebnis.schaden = 0; ergebnis.kontakte.length = 0;
  if (!kugeln.length || !feld.length) return ergebnis;

  // Hüllkugel des Schiffs (um z.pos) für den Grobtest
  let huelle = 0;
  for (let k = 0; k < kugeln.length; k++) {
    const s = kugeln[k];
    huelle = Math.max(huelle, Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z) + s.r);
    if (!welt[k]) welt[k] = new Vector3();
  }

  for (let i = 0; i < feld.length; i++) {
    const f = feld[i];
    const gx = z.pos.x - f.x, gy = z.pos.y - f.y, gz = z.pos.z - f.z, gr = huelle + f.r;
    if (gx * gx + gy * gy + gz * gz >= gr * gr) continue;

    for (let k = 0; k < kugeln.length; k++) {
      const s = kugeln[k];
      // WARUM jedes Mal neu: z.pos kann sich durch den vorigen Kontakt verschoben haben
      const p = welt[k].set(s.x, s.y, s.z).applyQuaternion(z.rot).add(z.pos);
      d.set(p.x - f.x, p.y - f.y, p.z - f.z);
      const min = s.r + f.r, q = d.lengthSq();
      if (q >= min * min) continue;
      const abst = Math.sqrt(q);
      if (abst > 1e-9) n.copy(d).divideScalar(abst); else n.set(0, 1, 0);

      // 1) ganz herausschieben (keine Restüberlappung → kein Kleben/Zittern im nächsten Schritt)
      z.pos.addScaledVector(n, min - abst);

      // 2) Geschwindigkeit: nur wenn das Schiff auf den Fels zu fliegt
      const vn = z.vel.dot(n);
      let tempo = 0;
      if (vn < 0) {
        tempo = -vn;
        z.vel.addScaledVector(n, -vn); // Annäherung weg → Anliegen
        if (tempo > werte.schadenSchwelle) {
          z.vel.multiplyScalar(werte.gleit);              // Reibung entlang der Fläche
          z.vel.addScaledVector(n, tempo * werte.abprall); // Rückprall
          const s = Math.min(z.hp, (tempo - werte.schadenSchwelle) * werte.schadenProMs * werte.hpMax);
          z.hp -= s; ergebnis.schaden += s; ergebnis.treffer++;
          if (z.hp <= 0) { z.hp = 0; z.zerstoert = true; }
        }
      }

      const nr = ergebnis.kontakte.length;
      const c = vorrat[nr] || (vorrat[nr] = { punkt: new Vector3(), normale: new Vector3(), tempo: 0, feld: 0, kugel: 0 });
      c.normale.copy(n);
      c.punkt.set(f.x, f.y, f.z).addScaledVector(n, f.r); // Berührpunkt auf der Felsoberfläche
      c.tempo = tempo; c.feld = i; c.kugel = k;
      ergebnis.kontakte.push(c);
    }
  }
  return ergebnis;
}
