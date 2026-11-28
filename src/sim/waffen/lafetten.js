// ZWECK: Lafetten-Tabelle (Turm-Montage) des Flak-Labors — EINZIGE Quelle für Waffen-Sim, Turm-KI und Grafik.
// LIEFERT: LAFETTEN (6 Zwillings-Flaktürme, Felder wie turmDaten() in src/sim/schiffe/turm.js) · BATTERIE_MITTE · schiffsLafetten(daten) ·
//          STANDARD_SEKTOR · turmGier/turmNick-Konvention siehe turm.js
// REGEL: Prüfstand ohne Schiff: flache Plattform, Oberkante y = 0, Türme oben montiert, keine Drehung der Montage →
//        Turm-Rahmen = Welt-Rahmen (verschoben). gier 0 = Rohr nach Welt +Z, gier > 0 zu +X; nick > 0 = nach oben.
// BESITZ: Waffentechniker (von der Projektleitung als abgestimmter Startstand angelegt, Runde 6).
import { TURM } from '../schiffe/turm.js';

const S = 1;          // Turmgröße (Rohr 7 m)
const SOCKEL = 1.4;   // Säule unter dem Lagerring → Rohre ragen über die Plattform-Aufbauten
const mz = (TURM.rohrZ + TURM.rohrL / 2) * S;

function lafette(id, x, z) {
  return {
    id, x, y: 0, z, oben: true, typ: 'flak', s: S, sockel: SOCKEL, schuerze: 0,
    zapfen: { y: SOCKEL + TURM.zapfenY * S, z: TURM.zapfenZ * S },
    muendungen: [{ x: TURM.rohrX * S, y: 0, z: mz }, { x: -TURM.rohrX * S, y: 0, z: mz }],
    // WARUM volle Drehung: auf dem Prüfstand gibt es keinen eigenen Rumpf, der im Weg steht.
    gier: [0, Math.PI],
    nick: [-0.05, 1.45],
  };
}

/** 2 Reihen × 3 Türme, Abstand 14 m (Vorschlag Waffentechniker, Frühwarnung R6). */
export const LAFETTEN = [
  lafette(0, -14, 7), lafette(1, 0, 7), lafette(2, 14, 7),
  lafette(3, -14, -7), lafette(4, 0, -7), lafette(5, 14, -7),
];

/** Bezugspunkt für Schirmabstand und Abstandsband der Drohnen (Welt, m). */
export const BATTERIE_MITTE = { x: 0, y: 4, z: 0 };

/** Sperrfeuer-Sektor, zeigt in die Anflugrichtung der Drohnen (+Z, vor dem Gasriesen). Winkel in rad. */
export const STANDARD_SEKTOR = { gierMitte: 0, gierHalb: 0.52, nickMin: 0.17, nickMax: 0.79 };

/**
 * Türme am Schiff (R14, Entscheidung 3; R23 E2): aus einem Schiffsdatensatz (SCHIFFSDATEN.bollwerk) die Lafetten — seit
 * R23 ALLE Türme (typ 'flak' = Zwillings-Gatling, typ 'schwer' = Hauptbatterie) in Schiffs-Turm-Reihenfolge
 * (= flak.tuerme = Befehle der KI, `id` = Schiffs-Turm-id für die Grafik) — und die Hindernisse (ALLE Türme) für die
 * Nachbar-Sperre. Schiffs-Lokalkoordinaten, Turm-Rahmen nach turm.js (unten = gespiegelt). lafette.typ bleibt.
 * WARUM alle (Nutzer R23: „bitte mach die Türme alle funktionsfähig“): bis R22 filterte diese Stelle die schweren Türme
 * heraus — sie drehten nie und schossen nie.
 * Gebrauch: const { lafetten, hindernisse } = schiffsLafetten(BOLLWERK);
 *           erstelleFlak({ lafetten, schiff: { hindernisse, rumpf: (l) => rumpfSperre(l, BOLLWERK.teile) } })
 */
export function schiffsLafetten(daten) {
  const hindernisse = daten.tuerme;
  return { lafetten: hindernisse.slice(), hindernisse };
}
