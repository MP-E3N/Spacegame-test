// ZWECK: Flug- und Kollisionswerte je Schiff an einer Stelle — Abstimmung nur hier.
// LIEFERT: WERTE = { bollwerk, ambos } · SCHIFF = WERTE.bollwerk (Alias für ältere Aufrufer).
// REGEL: Einheiten Meter, Sekunden, Radiant. Schiff lokal: +Z vorne, +X links (Backbord), +Y oben.
// WARUM so träge: ein großes Kriegsschiff mit vier Leuten an Bord soll sich schwer anfühlen, nicht wie ein Jäger.
// VERLAUF: Runde 1 vMax 140 / aVor 16 → Spieltest „viel zu schnell“ → Runde 2 etwa 40 % davon.
//          Runde 5: eigene Werte je Schiff (Ambos spürbar wendiger), aDaempfer gegen Drift, Kollision, HP.

/** Kollision mit Felsen (statisch, unendlich schwer) — für beide Schiffe gleich. */
const KOLLISION = {
  abprall: 0.3,          // Anteil der Aufprallgeschwindigkeit, der zurückfedert (senkrecht zur Fläche)
  gleit: 0.9,            // Anteil der Fahrt entlang der Fläche, der beim Aufprall bleibt
  schadenSchwelle: 3,    // m/s: darunter kein Schaden, kein Abprall (Anlegen statt Zittern)
  schadenProMs: 0.006,   // Anteil von hpMax je m/s über der Schwelle (60 m/s frontal ≈ 34 %)
};

export const WERTE = {
  bollwerk: {
    vMax: 60,             // m/s bei Schubhebel 1 (mit Trägheitsdämpfer)
    vRueck: 15,           // m/s rückwärts bei Schubhebel ganz unten
    vQuer: 12,            // m/s seitlich/vertikal (Manöverdüsen, mit Dämpfer)
    nachbrenner: 1.5,     // Faktor auf vMax und Hauptschub; vMax × nachbrenner = Tempolimit auch ohne Dämpfer
    aVor: 5,              // m/s² Haupttriebwerk
    aRueck: 3,            // m/s² Bremsdüsen (nach vorn gerichtet)
    aQuer: 2.5,           // m/s² Manöverdüsen, wenn der Spieler seitlich/vertikal versetzt
    aDaempfer: 9,         // m/s² Manöverdüsen, wenn der Dämpfer Seitendrift abbaut (≥ ~vMax·gierMax, sonst wächst Drift in Kurven)
    // WARUM getrennt: Versetzen soll träge bleiben, Drift nach Kurven aber schnell verschwinden (Nutzer R4).
    regler: 1.2,          // 1/s: wie schnell der Dämpfer die Wunschgeschwindigkeit ansteuert
    drehMax: { nicken: 0.2, gieren: 0.18, rollen: 0.4 },     // rad/s (≈ 11°/s, 10°/s, 23°/s)
    drehBeschl: { nicken: 0.18, gieren: 0.16, rollen: 0.6 }, // rad/s²
    drehRegler: 2.0,      // 1/s: Drehdämpfung (immer an — Tastatur-Steuerung bleibt beherrschbar)
    hebelRate: 0.35,      // Schubhebel-Weg pro Sekunde bei gehaltener Taste
    hebelMin: -0.25,      // unterster Hebelstand (= volle Rückwärtsfahrt)
    hpMax: 5000,
    ...KOLLISION,
  },
  // Fregatte: kleiner, leichter → schneller und wendiger (Spieltester R4: „fliegt zahlengleich wie Bollwerk“).
  ambos: {
    vMax: 85,
    vRueck: 22,
    vQuer: 16,
    nachbrenner: 1.5,
    aVor: 8,
    aRueck: 5,
    aQuer: 4,
    aDaempfer: 28,        // WARUM so hoch: 85 m/s × 0,32 rad/s = 27 m/s² Seitendrift-Zuwachs in voller Kurve
    regler: 2.5,
    drehMax: { nicken: 0.35, gieren: 0.32, rollen: 0.7 },    // ≈ 20°/s, 18°/s, 40°/s
    drehBeschl: { nicken: 0.35, gieren: 0.32, rollen: 1.0 },
    drehRegler: 2.5,
    hebelRate: 0.45,
    hebelMin: -0.25,
    hpMax: 2500,
    ...KOLLISION,
  },
};

export const SCHIFF = WERTE.bollwerk;
