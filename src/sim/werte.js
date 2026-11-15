// ZWECK: Flugwerte des Spielerschiffs an einer Stelle — Abstimmung nur hier.
// REGEL: Einheiten Meter, Sekunden, Radiant. Schiff lokal: +Z vorne, +X links (Backbord), +Y oben.
// WARUM so träge: ein großes Kriegsschiff mit vier Leuten an Bord soll sich schwer anfühlen, nicht wie ein Jäger.
// VERLAUF: Runde 1 vMax 140 / aVor 16 → Spieltest „viel zu schnell“ → Runde 2 etwa 40 % davon.

export const SCHIFF = {
  vMax: 60,             // m/s bei Schubhebel 1 (mit Trägheitsdämpfer)
  vRueck: 15,           // m/s rückwärts bei Schubhebel ganz unten
  vQuer: 12,            // m/s seitlich/vertikal (Manöverdüsen, mit Dämpfer)
  nachbrenner: 1.5,     // Faktor auf vMax und Hauptschub
  aVor: 5,              // m/s² Haupttriebwerk
  aRueck: 3,            // m/s² Bremsdüsen (nach vorn gerichtet)
  aQuer: 2.5,           // m/s² Manöverdüsen seitlich/vertikal
  regler: 1.2,          // 1/s: wie schnell der Dämpfer die Wunschgeschwindigkeit ansteuert
  drehMax: { nicken: 0.2, gieren: 0.18, rollen: 0.4 },     // rad/s (≈ 11°/s, 10°/s, 23°/s)
  drehBeschl: { nicken: 0.18, gieren: 0.16, rollen: 0.6 }, // rad/s²
  drehRegler: 2.0,      // 1/s: Drehdämpfung (immer an — Tastatur-Steuerung bleibt beherrschbar)
  hebelRate: 0.35,      // Schubhebel-Weg pro Sekunde bei gehaltener Taste
  hebelMin: -0.25,      // unterster Hebelstand (= volle Rückwärtsfahrt)
};
