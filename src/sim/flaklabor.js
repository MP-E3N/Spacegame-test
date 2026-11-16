// ZWECK: Sim-Welt des Flak-Labors (Runde 6): Zieldrohnen + Turm-KI + Flak auf dem Prüfstand, fester Schritt.
// LIEFERT: erstelleFlakLabor() → { drohnen, ki, flak, zaehler, abschuesse, schritt(dt, befehl), zuruecksetzen(), pruefsumme() }
//          befehl = { modus: 'sperrfeuer'|'zielfeuer', feuerFrei, folgen, schirmAbstand, v0?, sektor?, waffe? }
//          waffe = { deckelQuer, deckelTiefe } (R11, Regler; fehlt → FLAK-Standard, siehe WAFFEN_REGLER in flak.js)
// REGEL: Schrittfolge Drohnen → Turm-KI → Waffen (Protokoll R6, Entscheidung 3). Treffer aus Schritt n wirken zu Beginn
//        von Schritt n+1 — WARUM: so liest jedes Modul nur fertige Ergebnisse, die Reihenfolge ist eindeutig (Gleichlauf).
//        Kein DOM, kein Math.random (CLAUDE.md Regel 1).
import { erstelleZieldrohnen } from './ki/zieldrohnen.js';
import { erstelleTurmKi } from './ki/turmziel.js';
import { erstelleFlak } from './waffen/flak.js';

const START = { drohnen: 101, ki: 202, flak: 303 };
const ABSCHUSS_VORRAT = 32;

export function erstelleFlakLabor() {
  const drohnen = erstelleZieldrohnen({ startwert: START.drohnen });
  const ki = erstelleTurmKi({ startwert: START.ki });
  const flak = erstelleFlak({ startwert: START.flak });
  // treffer = Treffer-Ereignisse (je Ziel und Schritt, inkl. Splitter-Ticks) · schaden = verteilte HP (fürs HUD, Befund Prüfer R6)
  const zaehler = { takt: 0, schuesse: 0, treffer: 0, schaden: 0, abschuesse: 0 };
  // Abschüsse für die Grafik (Explosion): Ring fester Größe, die Seite liest ab `gelesen` bis `zaehler.abschuesse`.
  const abschuesse = Array.from({ length: ABSCHUSS_VORRAT }, () => ({ x: 0, y: 0, z: 0 }));

  function schritt(dt, befehl) {
    // 1) Drohnen fliegen und verbuchen die Waffen-Ereignisse des vorigen Schritts (Treffer → HP, Detonation → Ausweichen)
    const d = drohnen.schritt(dt, flak.ereignisse);
    for (const a of d?.abschuesse ?? []) {
      const ziel = abschuesse[zaehler.abschuesse % ABSCHUSS_VORRAT];
      ziel.x = a.pos.x; ziel.y = a.pos.y; ziel.z = a.pos.z;
      zaehler.abschuesse++;
    }
    // Mündungsgeschwindigkeit (Runde 8, umschaltbar): gilt für neue Granaten; die KI liest turm.v0 für den Vorhalt.
    if (befehl?.v0) for (const t of flak.tuerme) t.v0 = befehl.v0;
    flak.einstellen(befehl?.waffe); // Deckel-Regler (R11): je Takt, fehlt → Standard
    // 2) Turm-KI entscheidet, 3) Waffen führen aus
    const befehle = ki.schritt(dt, befehl, drohnen.ziele, flak.tuerme);
    flak.schritt(dt, befehle, drohnen.ziele);
    zaehler.schuesse += flak.ereignisse.schuesse.length;
    zaehler.treffer += flak.ereignisse.treffer.length;
    for (const t of flak.ereignisse.treffer) zaehler.schaden += t.schaden;
    zaehler.takt++;
  }

  function zuruecksetzen() {
    drohnen.zuruecksetzen(); flak.zuruecksetzen(); ki.zuruecksetzen?.();
    zaehler.takt = zaehler.schuesse = zaehler.treffer = zaehler.schaden = zaehler.abschuesse = 0;
  }

  /** Gleichlauf-Prüfung: Summe über Drohnenlagen, HP und Turmwinkel (zwei Läufe müssen bitgleich sein). */
  function pruefsumme() {
    let s = zaehler.schuesse * 7 + zaehler.treffer * 13 + zaehler.abschuesse * 17;
    for (const z of drohnen.ziele) s += z.pos.x * 1.1 + z.pos.y * 1.3 + z.pos.z * 1.7 + z.hp + z.id;
    for (const t of flak.tuerme) s += t.gier * 3.1 + t.nick * 3.7;
    return s;
  }

  return { drohnen, ki, flak, zaehler, abschuesse, schritt, zuruecksetzen, pruefsumme, START };
}
