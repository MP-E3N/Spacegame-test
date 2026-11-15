// ZWECK: Maße und Datensatz eines Geschützturms — eine Quelle für Grafik (bauteile.js turm()) und Waffen-Simulation.
// LIEFERT: TURM (Proportionen je Größe s = 1) · turmDaten(id, roh, teile) → Turm-Datensatz (Entscheidung 2, Runde 5)
// REGEL (Entscheidung 1): Winkel im TURM-Rahmen (nach der Montage; unten = rotation.z = π). gier 0 = Rohr nach Turm-+Z,
//        gier > 0 = zu Turm-+X; nick > 0 = Rohr vom Rumpf weg. Grenzen gier [mitte, halbweite], nick [min, max] (rad).
//        Turm-Koordinaten: Ursprung im Fußpunkt (x, y, z) auf dem Rumpf, Kranzachse x = 0, z = 0, +Y vom Rumpf weg.
//        zapfen {y, z} = Drehpunkt der Wiege (Turm-Koord., inkl. Sockel); muendungen in Wiege-Koord. bei nick 0.
import { fusspunkt } from './rumpf.js';

export const TURM = {
  fussR: 2.7,                 // Radius der Standfläche (Lagerring unten)
  ringR: 2.4, ringH: 1.2,     // Lagerring (fest)
  zapfenY: 2.1, zapfenZ: 2.4, // Wiegen-Drehpunkt über dem Drehkranz
  rohrX: 0.8, rohrR: 0.28, rohrL: 7, rohrZ: 3.2, // rohrZ = Rohrmitte in Wiege-Koord.
  mantelR: 0.45, mantelL: 1.2, mantelZ: 0.5,     // Rohrmantel an der Wiege
};

/** roh = { x, z, oben, typ, s, sockel?, gier, nick } → vollständiger Datensatz, y aus dem Rumpf (fusspunkt). */
export function turmDaten(id, roh, teile) {
  const s = roh.s, sockel = roh.sockel ?? 0;
  const f = fusspunkt(teile, roh.x, roh.z, TURM.fussR * s, roh.oben);
  if (!f) throw new Error(`Turm ${id}: kein Rumpf unter (${roh.x}, ${roh.z})`);
  const mz = (TURM.rohrZ + TURM.rohrL / 2) * s;
  return {
    id, x: roh.x, y: f.y, z: roh.z, oben: roh.oben, typ: roh.typ, s, sockel,
    schuerze: f.schuerze, // Grafik: so weit reicht der Sockel in den Rumpf (Spalt auf der tiefen Seite einer Schräge)
    zapfen: { y: sockel + TURM.zapfenY * s, z: TURM.zapfenZ * s },
    muendungen: [{ x: TURM.rohrX * s, y: 0, z: mz }, { x: -TURM.rohrX * s, y: 0, z: mz }],
    gier: roh.gier, nick: roh.nick,
  };
}
