// ZWECK: Fregatte „FK-07 Ambos“ (~150 m) — erstes Schiff (Runde 1). Vom Nutzer gesichert („hat was von einem U-Boot“).
//        Gepanzerter Rumpf, Bugpanzer, zwei Seitenrümpfe mit Triebwerken, Kommandoblock ohne Fenster.
// LIEFERT: erstelleAmbos(scene) → { name, kennung, laenge, gruppe, tuerme, darstellen(pos, rot, z, zeit, dt) }
// REGEL: Form NICHT ohne Rückfrage ändern (Nutzer-Wunsch: Design bewahren). Bausteine in bauteile.js.
// DATEN: Querschnitte, Türme, Kugeln in src/sim/schiffe/ambos.js (Runde 5: Türme und „07“ bündig, vorher schwebend).
import * as THREE from 'three';
import { zufall } from '../zufall.js';
import { lofte, masse, nur, kiste, rohrX, rohrY, rohrZ, aufbauten, turmSperren, materialien, leereEimer, fuegeZusammen, turm, duese,
  schriftMaterial, ausstattung, LICHT } from './bauteile.js';
import { AMBOS, TEILE, POD_X } from '../../sim/schiffe/ambos.js';
import { oberkante } from '../../sim/schiffe/rumpf.js';

// Querschnitte aus den Sim-Daten (unverändert, nur umgezogen) — kurze Namen wie bisher
const T = TEILE, RUECKGRAT = T.rueckgrat.ab, BUGPANZER = T.bugpanzer.ab, KOMMANDO = T.kommando.ab;
// WARUM eigene Sperrfläche: die Nummer „07“ liegt bündig auf dem Rücken; Kisten würden sie verdecken (Lernbuch R1–3)
const NUMMER = { x: -1, z: -57, textX: 6.6 }; // textX = Mitte der Ziffern (Abziehbild ist um π gedreht)

export function erstelleAmbos(scene) {
  const rnd = zufall(1977);
  const mats = materialien();
  const eimer = leereEimer();
  const ts = turmSperren(AMBOS.tuerme), sperre = { sperreOben: [...ts.oben, [NUMMER.textX, NUMMER.z, 2.5]], sperreUnten: ts.unten };

  eimer.rumpf.push(lofte(T.rueckgrat), lofte(T.bugpanzer), lofte(T.kommando));
  eimer.dunkel.push(lofte(T.kiel));
  for (const [i, s] of [1, -1].entries()) {
    eimer.rumpf.push(lofte(T.seitenrumpf[i]));
    for (const z of [-46, -22, 0]) {
      eimer.dunkel.push(kiste(6.5, 3, 7, s * 13.8, -1, z));
      eimer.metall.push(rohrX(0.45, 7, s * 13.8, 1.1, z - 2.6), rohrX(0.45, 7, s * 13.8, 1.1, z + 2.6), rohrX(0.3, 7, s * 13.8, -2.9, z));
    }
    for (let z = -44; z < -14; z += 1.3) eimer.dunkel.push(kiste(1.4, 5.5, 0.18, s * (POD_X + 5.5 + 0.6), -1, z));
    eimer.metall.push(rohrZ(0.35, 32, s * (POD_X + 5.9), 2.2, -29), rohrZ(0.35, 32, s * (POD_X + 5.9), -4.2, -29));
    for (const [y, r] of [[3.2, 0.55], [1.9, 0.4], [-4.6, 0.5]]) {
      eimer.metall.push(rohrZ(r, 42, s * (11 + r * 0.8), y, 3));
      for (let z = -16; z <= 22; z += 3.8) eimer.dunkel.push(kiste(r * 2.4, r * 2.6, 0.4, s * (11 + r * 0.6), y, z));
    }
    eimer.dunkel.push(kiste(0.5, 6, 14, s * 11.1, -1.5, -40));
    aufbauten(rnd, T.seitenrumpf[i].ab, -60, 16, eimer, { dichte: 0.8, fase: T.seitenrumpf[i].fase });
  }
  aufbauten(rnd, RUECKGRAT, -60, 80, eimer, { dichte: 1.3, fase: T.rueckgrat.fase, ...sperre });
  aufbauten(rnd, BUGPANZER, 8, 82, eimer, { unten: false, seiten: false, dichte: 0.9, fase: T.bugpanzer.fase, ...sperre });
  aufbauten(rnd, KOMMANDO, -34, -3, eimer, { unten: false, dichte: 1.5, fase: T.kommando.fase, ...sperre });

  eimer.metall.push(rohrY(0.35, 9, 0, 19.5, -20), rohrY(0.2, 6, 2.5, 18, -26), rohrY(0.2, 4, -2.5, 17, -14));
  eimer.dunkel.push(kiste(5, 0.4, 0.4, 0, 22, -20), kiste(0.4, 0.4, 3, 0, 20.5, -20), kiste(3.5, 2, 3.5, 0, 16, -30));
  eimer.metall.push(nur(new THREE.SphereGeometry(3.2, 20, 8, 0, Math.PI * 2, 0, 0.9).rotateX(-0.9).translate(-3, 17.5, -11)));
  eimer.dunkel.push(kiste(1.2, 1.2, 10, 0, -1.4, 86), rohrZ(0.5, 6, 3, -0.8, 85), rohrZ(0.5, 6, -3, -0.8, 85));

  const duesen = [duese(eimer, 4.4, 0, -66, 3.6), duese(eimer, -4.4, 0, -66, 3.6), duese(eimer, POD_X, -1, -64, 3.4), duese(eimer, -POD_X, -1, -64, 3.4)];

  const gruppe = new THREE.Group();
  gruppe.name = 'ambos';
  fuegeZusammen(eimer, mats, gruppe, 'ambos');
  const tuerme = AMBOS.tuerme.map((t) => turm(gruppe, mats, t)); // Index = id; Höhen aus dem Rumpf (Runde 5)

  // Beschriftung: Name vorn an der Rumpfseite (vor den Seitenrümpfen), folgt der Verjüngung
  const neigung = Math.atan2(RUECKGRAT[3].w - RUECKGRAT[4].w, RUECKGRAT[4].z - RUECKGRAT[3].z);
  const name = schriftMaterial('AMBOS', 'FK-07  FLOTTENKORVETTE');
  for (const s of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(21, 3.5), name);
    const m = masse(RUECKGRAT, 36.5);
    p.rotation.y = s * (Math.PI / 2 - neigung); p.position.set(s * (m.w + 0.04), 0.6, 36.5);
    p.receiveShadow = true; gruppe.add(p);
  }
  const nummer = new THREE.Mesh(new THREE.PlaneGeometry(18, 3), schriftMaterial('07'));
  // Runde 5: bündig (+4 cm) statt 0,5 m darüber; x von 2 auf −1, damit die Ziffern auf der flachen Rückenfläche liegen
  // (bei x 2 lagen sie über der Fase bis über die Rumpfkante hinaus)
  const nummerY = Math.max(...[-1, 0, 1].map((dz) => oberkante(T.rueckgrat, NUMMER.z + dz, NUMMER.textX))) + 0.04;
  nummer.rotation.x = -Math.PI / 2; nummer.rotation.z = Math.PI; nummer.position.set(NUMMER.x, nummerY, NUMMER.z);
  nummer.receiveShadow = true; gruppe.add(nummer);

  const arbeit = [];
  for (let i = 0; i < 46; i++) {
    const z = -58 + rnd() * 130, m = masse(RUECKGRAT, z), s = rnd() < 0.5 ? 1 : -1;
    if (!m) continue;
    if (rnd() < 0.6) arbeit.push([s * (m.w + 0.1), m.y + (rnd() * 2 - 1) * m.h * 0.6, z]);
    else arbeit.push([m.x + (rnd() * 2 - 1) * m.w * 0.6, m.y - m.h - 0.1, z]);
  }
  for (let i = 0; i < 16; i++) { const s = i % 2 ? 1 : -1; arbeit.push([s * (POD_X + 5.6), -1 + (rnd() * 2 - 1) * 4, -58 + rnd() * 70]); }

  const darstellen = ausstattung(gruppe, {
    duesen, arbeit, heckZ: -80,
    steuer: {
      bugL: [6.2, -1, 74, 1, 0, 0], bugR: [-6.2, -1, 74, -1, 0, 0], bugO: [0, 3.6, 76, 0, 1, 0], bugU: [0, -5.6, 76, 0, -1, 0],
      heckL: [8.6, 0, -60, 1, 0, 0], heckR: [-8.6, 0, -60, -1, 0, 0], heckO: [0, 9.2, -62, 0, 1, 0], heckU: [0, -9.2, -62, 0, -1, 0],
      podLO: [POD_X, 5.2, 14, 0, 1, 0], podLU: [POD_X, -7.2, 14, 0, -1, 0], podRO: [-POD_X, 5.2, 14, 0, 1, 0], podRU: [-POD_X, -7.2, 14, 0, -1, 0],
    },
    lampen: [
      [POD_X + 2.9, -1.2, 26.3, LICHT.rot, 1.2, 0], [-POD_X - 2.9, -1.2, 26.3, LICHT.gruen, 1.2, 0],
      [0, 24.2, -20, LICHT.weiss, 1.6, 0.2, 0.35], [0, 0, -67, LICHT.weiss, 1.6, 0.9, 0.35], [0, 3.5, 87, LICHT.rot, 2.4, 0.5, 0.35],
    ],
  });

  scene.add(gruppe);
  return { name: AMBOS.name, kennung: AMBOS.kennung, laenge: AMBOS.laenge, gruppe, tuerme, darstellen };
}
