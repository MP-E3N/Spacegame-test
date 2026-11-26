// ZWECK: Bauteile der Form-Werkstatt (Runde 19, Nutzer: „Geschütze und Antriebe hinzufügen, damit man ein flugtaugliches
//        Modell machen kann; diese soll man dann auch im Flugtest laden können“) — Katalog an einer Stelle und die
//        Umwandlung einer Form in einen Schiffsdatensatz für Sim und Freiflug.
// LIEFERT: BAUTEILE = { ...GESCHUETZE, ...ANTRIEBE } · FLAECHEN (welche Fläche passt) · passtAuf(typ, n) ·
//          pruefeSchiff(form, schonNormal?) → { flug, meldungen, flugtauglich } · formZuSchiff(form) → { name, kennung, laenge, kugeln,
//          tuerme, duesen, werte, form, versatz, schwerpunkt, masse, schub, meldungen, flugtauglich }
// REGEL: rein (kein three, kein DOM). Katalogdaten NUR in geschuetze.js (Waffentechniker) und flug.js (Flugsystem);
//        Kollisionskugeln aus kugeln.js (Schiffbauer). Schiffs-Koordinaten mit Ursprung im SCHWERPUNKT (Protokoll R19,
//        Entscheidung 7) — sonst dreht das Schiff um einen Punkt neben sich und schlingert sichtbar.
import { normalisiere, bauteilListe, huelle, koerperListe } from './form.js';
import { GESCHUETZE, turmAusBauteil, pruefeGeschuetze } from './geschuetze.js';
import { ANTRIEBE, flugwerte, antriebArt } from './flug.js';
import { formKugeln } from './kugeln.js';

export const BAUTEILE = { ...GESCHUETZE, ...ANTRIEBE };

/** Welche Flächennormalen ein Bauteil annimmt (Werkstatt: Geist grün/rot, Meldung). */
const NORMALEN = { oben: [0, 1, 0], unten: [0, -1, 0], hinten: [0, 0, -1], vorn: [0, 0, 1], links: [1, 0, 0], rechts: [-1, 0, 0] };
export function passtAuf(typ, n) {
  const fl = BAUTEILE[typ]?.flaeche ?? [];
  if (fl.includes('alle')) return true;
  return fl.some((f) => NORMALEN[f] && NORMALEN[f].every((v, i) => v === n[i]));
}
export const FLAECHEN = { oben: 'Oberseite', unten: 'Unterseite', hinten: 'Heckfläche', vorn: 'Bugfläche', links: 'Seite', rechts: 'Seite', alle: 'jede Fläche' };

/**
 * Prüfliste „flugtauglich“ (Starfield-Lehre: jede Meldung zeigt auf ihr Teil): Flugwerte + Geschütz-Prüfung zusammen.
 * flugtauglich = keine Meldung der Stufe 'fehler'.
 */
export function pruefeSchiff(roh, schonNormal = false) {
  // WARUM schonNormal (Prüfer R19): ein zweites normalisiere erzeugt ein neues Objekt — der Zwischenspeicher der
  // Geschütz-Prüfung (WeakMap je Form-Objekt) träfe dann nie
  const form = schonNormal ? roh : normalisiere(roh);
  const flug = flugwerte(form, BAUTEILE);
  const meldungen = [...flug.meldungen, ...pruefeGeschuetze(form)];
  return { flug, meldungen, flugtauglich: !meldungen.some((m) => m.stufe === 'fehler') };
}

/**
 * Form → Schiffsdatensatz wie SCHIFFSDATEN.bollwerk (für registriereSchiff + erstelleFormSchiff). Alles um −Schwerpunkt
 * verschoben; versatz = −Schwerpunkt (die Grafik verschiebt Hülle und Bauteile genauso). Turm-ids lückenlos 0…n−1
 * (die Sim und die Grafik nehmen die id als Index).
 */
export function formZuSchiff(roh) {
  const form = normalisiere(roh);
  const { flug, meldungen, flugtauglich } = pruefeSchiff(form, true);
  const sp = flug.schwerpunkt ?? [0, 0, 0], versatz = sp.map((v) => -v + 0);
  const schieb = (p) => p.map((v, i) => v + versatz[i]);
  const liste = bauteilListe(form);
  const tuerme = [];
  for (const e of liste) {
    if (BAUTEILE[e.b.typ]?.art !== 'geschuetz') continue;
    const t = turmAusBauteil(e, tuerme.length, form);
    if (!t) continue; // Seitenmontage o. Ä. — steht in den Meldungen
    tuerme.push({ ...t, x: t.x + versatz[0], y: t.y + versatz[1], z: t.z + versatz[2] });
  }
  const duesen = [];
  for (const e of liste) {
    const k = BAUTEILE[e.b.typ], art = antriebArt(k); if (!art) continue;
    const haupt = art === 'haupt';
    // Haupttriebwerk nur mit Düse nach hinten (Entscheidung 8) — sonst gibt es keinen Schub und keine Glut
    if (haupt && !(e.n[2] === -1)) continue;
    const [x, y, z] = schieb(e.p);
    duesen.push({ x, y, z, r: k.r ?? 1, art: haupt ? 'haupt' : 'steuer', n: [...e.n], bauteil: e.b.id });
  }
  const kugeln = formKugeln(form).map((k) => ({ ...k, x: k.x + versatz[0], y: k.y + versatz[1], z: k.z + versatz[2] }));
  // Länge (längs Z) aus den Plus-Körpern — für Kamera-Skala und Schattenradius im Freiflug
  const plus = koerperListe(form).filter((x) => x.k.op === 'plus').map(({ k, lage }) => huelle(k, lage));
  const laenge = plus.length ? Math.max(...plus.map((h) => h.max[2])) - Math.min(...plus.map((h) => h.min[2])) : 10;
  return {
    name: form.name.toUpperCase(), kennung: 'EF', laenge, kugeln, tuerme, duesen, werte: flug.werte, form, versatz,
    schwerpunkt: sp, masse: flug.masse, schub: flug.schub, meldungen, flugtauglich,
  };
}
