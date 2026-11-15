// ZWECK: Schlachtträger „BT-12 Bollwerk“ (~255 m) — eigener Entwurf nach dem Muster großer Träger-Kriegsschiffe
//        (Nutzerwunsch Runde 2: „wie die Pegasus-Blueprints, aber abgewandelt“).
// AUFBAU: Meißelbug mit gestufter Rückenpanzerung und Seitenwangen · gerippter Hals mit Kommandoblock ·
//         zwei Hangar-Rümpfe DIREKT an der Hülle (Startschächte vorn, Landedeck UNTEN) · breiter Heckblock mit
//         kantiger Rückenpanzerung und SECHS achteckigen Triebwerken im 3×2-Raster.
// VERLAUF: Runde 2 hatte runde Tanks hinten und Hangars an Auslegern → Nutzer (Runde 3): Tanks weg, Hangars an die Hülle.
// BEWUSST ANDERS als das Vorbild: kein Ring aus acht Triebwerken, kein runder Keilkopf, keine offenen Seitendecks,
//         eigene Proportionen, Rippen am Hals, Hangars ohne Ausleger, eigener Name und eigene Beschriftung.
// DATEN: Querschnitte, Türme, Kugeln in src/sim/schiffe/bollwerk.js (Runde 5) — hier nur Aufbau und Details.
// LIEFERT: erstelleBollwerk(scene) → { name, kennung, laenge, gruppe, tuerme, darstellen(pos, rot, z, zeit, dt) }
import * as THREE from 'three';
import { zufall } from '../zufall.js';
import { lofte, masse, nur, kiste, rohrY, rohrZ, aufbauten, turmSperren, materialien, leereEimer, fuegeZusammen, turm, duese,
  schriftMaterial, ausstattung, LICHT } from './bauteile.js';
import { BOLLWERK, TEILE, POD_X, POD_Y } from '../../sim/schiffe/bollwerk.js';

const T = TEILE;

export function erstelleBollwerk(scene) {
  const rnd = zufall(6262);
  const mats = materialien();
  const eimer = leereEimer();
  const ts = turmSperren(BOLLWERK.tuerme), sperre = { sperreOben: ts.oben, sperreUnten: ts.unten };

  // ---------- Kopf ----------
  eimer.rumpf.push(lofte(T.kopf), lofte(T.panzer1), lofte(T.panzer2));
  eimer.dunkel.push(lofte(T.sporn));
  for (const [i, s] of [1, -1].entries()) {
    eimer.dunkel.push(lofte(T.wange[i]));
    // Luken-Reihe über der Wange
    for (let z = 50; z < 92; z += 6) eimer.schacht.push(kiste(0.3, 1.6, 3.2, s * 18.15, 7.2, z));
    // schwere Stufen-Platten an den Bugflanken
    eimer.dunkel.push(kiste(1.2, 5, 10, s * 15.4, 0, 110), kiste(1.2, 3.4, 7, s * 12.6, -1.5, 118));
  }
  aufbauten(rnd, T.kopf.ab, 30, 118, eimer, { dichte: 1.0, fase: T.kopf.fase, skala: 1.3, ...sperre });
  aufbauten(rnd, T.panzer1.ab, 44, 108, eimer, { seiten: false, unten: false, dichte: 0.8, fase: T.panzer1.fase, skala: 1.2, ...sperre });

  // ---------- Hals mit Rippen und Kommandoblock ----------
  eimer.dunkel.push(lofte(T.hals));
  for (const r of T.rippen) eimer.rumpf.push(lofte(r));
  eimer.rumpf.push(lofte(T.kommando));
  aufbauten(rnd, T.kommando.ab, -20, 8, eimer, { unten: false, dichte: 1.4, fase: T.kommando.fase, ...sperre });
  for (const s of [1, -1]) {
    for (const [y, r] of [[4.5, 0.7], [6.6, 0.5]]) eimer.metall.push(rohrZ(r, 72, s * (11.4 + r), y, -7)); // über den Hangars
  }
  // Mast und Sensorkuppeln
  eimer.metall.push(rohrY(0.45, 12, 0, 22.5, -5), rohrY(0.25, 7, 3, 19.5, -12), rohrY(0.25, 5, -3, 18.5, 2));
  eimer.dunkel.push(kiste(7, 0.5, 0.5, 0, 26, -5), kiste(0.5, 0.5, 4, 0, 24, -5));
  eimer.metall.push(nur(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(4, 16.3, -2)),
    nur(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(-4, 16.3, -16)));

  // ---------- Heckblock, Rückenpanzer, Triebwerke ----------
  eimer.rumpf.push(lofte(T.heck), lofte(T.heckpanzer));
  eimer.dunkel.push(lofte(T.heckpanzer2));
  aufbauten(rnd, T.heckpanzer.ab, -112, -58, eimer, { seiten: false, unten: false, dichte: 0.9, fase: T.heckpanzer.fase, skala: 1.2, ...sperre });
  for (const s of [1, -1]) {
    // Lüftergitter und Panzerkanten an den Heckflanken
    for (let z = -110; z < -72; z += 9) eimer.schacht.push(kiste(0.3, 3.2, 6, s * 21.05, 8, z));
    eimer.dunkel.push(kiste(1.4, 2.2, 52, s * 21.4, -11.5, -88));
    // Kühlrippen unter dem Heck
    for (let z = -110; z < -70; z += 1.6) eimer.dunkel.push(kiste(0.22, 2.6, 0.22 + 0, s * 9, -16.2, z), kiste(10, 0.25, 0.25, s * 9, -15.4, z));
    eimer.dunkel.push(kiste(14, 3, 1.2, s * 9, -16.4, -111), kiste(14, 3, 1.2, s * 9, -16.4, -69));
  }
  aufbauten(rnd, T.heck.ab, -116, -52, eimer, { oben: false, unten: false, dichte: 1.2, fase: T.heck.fase, skala: 1.4 });
  const duesen = [];
  for (const y of [6.8, -6.8]) for (const x of [13, 0, -13]) duesen.push(duese(eimer, x, y, -118, 5.4, { seg: 8, gehaeuse: 1.18, gehaeuseLaenge: 6 }));
  eimer.dunkel.push(kiste(40, 1.2, 4, 0, 0, -119.5), kiste(1.2, 28, 4, 6.5, 0, -119.5), kiste(1.2, 28, 4, -6.5, 0, -119.5)); // Düsenrahmen

  // ---------- Startdecks ----------
  for (const [i, s] of [1, -1].entries()) {
    const x = s * POD_X, deck = T.deck[i];
    eimer.rumpf.push(lofte(deck));
    aufbauten(rnd, deck.ab, -50, 14, eimer, { unten: false, dichte: 0.9, fase: deck.fase, skala: 1.2 });
    // Nahtleiste zwischen Hangar und Hülle (verdeckt die Kante, wirkt verschweißt)
    eimer.dunkel.push(kiste(2.2, 1.2, 74, s * (POD_X - 7.2), POD_Y + 6.3, -16));
    for (let z = -48; z <= 14; z += 8) eimer.dunkel.push(kiste(2.6, 1.6, 1.4, s * (POD_X - 7.2), POD_Y + 6.6, z));
    // Startschächte vorn: dunkle Öffnung mit rotem Rahmen
    for (const dx of [-3.6, 0, 3.6]) {
      eimer.warn.push(kiste(3.2, 3.2, 0.25, x + dx, POD_Y - 0.5, 26.05));
      eimer.schacht.push(kiste(2.6, 2.6, 0.3, x + dx, POD_Y - 0.5, 26.15));
    }
    // Landedeck an der Unterseite: dunkle Bahn mit Warnkanten
    eimer.schacht.push(kiste(9, 0.3, 60, x, POD_Y - 6.05, -18));
    eimer.warn.push(kiste(0.6, 0.32, 60, x + 4.8, POD_Y - 6.06, -18), kiste(0.6, 0.32, 60, x - 4.8, POD_Y - 6.06, -18));
    for (let z = -44; z <= 8; z += 12) eimer.warn.push(kiste(9, 0.33, 0.5, x, POD_Y - 6.07, z));
  }

  const gruppe = new THREE.Group();
  gruppe.name = 'bollwerk';
  fuegeZusammen(eimer, mats, gruppe, 'bollwerk');
  // Türme aus den Sim-Daten (Index = id); Runde 5: Hals z 22 auf 6-m-Sockel, Flak-Paar z 62 bei x ±9 (vorher Clips)
  const tuerme = BOLLWERK.tuerme.map((t) => turm(gruppe, mats, t));

  // ---------- Beschriftung ----------
  const name = schriftMaterial('BOLLWERK', 'BT-12  SCHLACHTTRÄGER');
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(36, 6), name);
    p.rotation.y = s * Math.PI / 2; p.position.set(s * 20.64, -1.2, 71);
    p.receiveShadow = true; gruppe.add(p);
  }
  const nummer = new THREE.Mesh(new THREE.PlaneGeometry(18, 3), schriftMaterial('12'));
  nummer.rotation.x = -Math.PI / 2; nummer.rotation.z = Math.PI; nummer.position.set(3, 17.84, -70);
  nummer.receiveShadow = true; gruppe.add(nummer);

  // ---------- Lichter ----------
  const arbeit = [];
  for (let i = 0; i < 70; i++) {
    const teil = rnd();
    const [ab, z0, z1] = teil < 0.4 ? [T.kopf.ab, 32, 112] : teil < 0.7 ? [T.hals.ab, -40, 28] : [T.heck.ab, -114, -54];
    const z = z0 + rnd() * (z1 - z0), m = masse(ab, z), s = rnd() < 0.5 ? 1 : -1;
    if (m) arbeit.push([s * (m.w + 0.1), m.y + (rnd() * 2 - 1) * m.h * 0.55, z]);
  }
  for (let i = 0; i < 24; i++) { const s = i % 2 ? 1 : -1; arbeit.push([s * (POD_X + 8.1), POD_Y + (rnd() * 2 - 1) * 3.5, -48 + rnd() * 62]); }
  for (let i = 0; i < 12; i++) { const s = i % 2 ? 1 : -1; arbeit.push([s * POD_X + (i % 4 < 2 ? 4.4 : -4.4), POD_Y - 6.3, -46 + (i >> 1) * 10]); }

  const darstellen = ausstattung(gruppe, {
    duesen, arbeit, heckZ: -135, puffGroesse: 1.6,
    steuer: {
      bugL: [13.5, -2, 112, 1, 0, 0], bugR: [-13.5, -2, 112, -1, 0, 0], bugO: [0, 8.6, 110, 0, 1, 0], bugU: [0, -11.5, 110, 0, -1, 0],
      heckL: [21.5, 0, -110, 1, 0, 0], heckR: [-21.5, 0, -110, -1, 0, 0], heckO: [0, 15.6, -114, 0, 1, 0], heckU: [0, -15.6, -114, 0, -1, 0],
      podLO: [POD_X, POD_Y + 6.6, 18, 0, 1, 0], podLU: [POD_X, POD_Y - 6.6, 18, 0, -1, 0],
      podRO: [-POD_X, POD_Y + 6.6, 18, 0, 1, 0], podRU: [-POD_X, POD_Y - 6.6, 18, 0, -1, 0],
    },
    lampen: [
      [POD_X + 8.3, POD_Y, 20, LICHT.rot, 1.3, 0, 0.6], [-POD_X - 8.3, POD_Y, 20, LICHT.gruen, 1.3, 0, 0.6],
      [0, 28.6, -5, LICHT.weiss, 1.8, 0.2, 0.5], [0, 15.6, -118.5, LICHT.weiss, 1.8, 0.9, 0.5], [0, -4.5, 128.7, LICHT.rot, 2.6, 0.5, 0.5],
    ],
  });

  scene.add(gruppe);
  return { name: BOLLWERK.name, kennung: BOLLWERK.kennung, laenge: BOLLWERK.laenge, gruppe, tuerme, darstellen };
}
