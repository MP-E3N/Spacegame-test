// ZWECK: Fregatte „FK-07 Ambos“ (~150 m) — erstes Schiff (Runde 1). Vom Nutzer gesichert („hat was von einem U-Boot“).
//        Gepanzerter Rumpf, Bugpanzer, zwei Seitenrümpfe mit Triebwerken, Kommandoblock ohne Fenster.
// LIEFERT: erstelleAmbos(scene) → { name, kennung, laenge, gruppe, tuerme, darstellen(pos, rot, z, zeit, dt) }
// REGEL: Form NICHT ohne Rückfrage ändern (Nutzer-Wunsch: Design bewahren). Bausteine in bauteile.js.
import * as THREE from 'three';
import { zufall } from '../zufall.js';
import { loft, masse, nur, kiste, rohrX, rohrY, rohrZ, aufbauten, materialien, leereEimer, fuegeZusammen, turm, duese,
  schriftMaterial, ausstattung, LICHT } from './bauteile.js';

const RUECKGRAT = [
  { z: -66, w: 8, h: 7.5 }, { z: -58, w: 10.5, h: 9 }, { z: -20, w: 11, h: 9.5 }, { z: 25, w: 11, h: 9 },
  { z: 48, w: 9, h: 7, y: -0.5 }, { z: 72, w: 6, h: 4.5, y: -1 }, { z: 84, w: 3.8, h: 2.6, y: -1.4 },
];
const BUGPANZER = [
  { z: 6, w: 11, h: 1.2, y: 9.6 }, { z: 18, w: 15, h: 2.2, y: 9.9 }, { z: 52, w: 14, h: 2.4, y: 8.4 },
  { z: 74, w: 9, h: 1.8, y: 5.4 }, { z: 86, w: 5, h: 1.1, y: 3.4 },
];
const KIEL = [{ z: -40, w: 5, h: 1, y: -9.6 }, { z: 0, w: 7, h: 1.4, y: -9.6 }, { z: 40, w: 7.5, h: 1.6, y: -8.2 }, { z: 70, w: 4.5, h: 1.1, y: -5.6 }];
const SEITENRUMPF = (x) => [
  { z: -64, w: 4.5, h: 5, x, y: -1 }, { z: -56, w: 5.5, h: 6, x, y: -1 }, { z: 4, w: 5.5, h: 6, x, y: -1 },
  { z: 18, w: 4.6, h: 4.6, x, y: -1 }, { z: 26, w: 2.8, h: 3, x, y: -1.2 },
];
const KOMMANDO = [{ z: -36, w: 6, h: 2.5, y: 11.2 }, { z: -28, w: 7, h: 3.4, y: 12 }, { z: -9, w: 6, h: 3.2, y: 12 }, { z: -2, w: 4, h: 2, y: 11.4 }];
const POD_X = 21;

export function erstelleAmbos(scene) {
  const rnd = zufall(1977);
  const mats = materialien();
  const eimer = leereEimer();

  eimer.rumpf.push(loft(RUECKGRAT), loft(BUGPANZER, 0.4), loft(KOMMANDO, 0.35));
  eimer.dunkel.push(loft(KIEL, 0.4));
  for (const s of [1, -1]) {
    eimer.rumpf.push(loft(SEITENRUMPF(s * POD_X)));
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
    aufbauten(rnd, SEITENRUMPF(s * POD_X), -60, 16, eimer, { dichte: 0.8 });
  }
  aufbauten(rnd, RUECKGRAT, -60, 80, eimer, { dichte: 1.3 });
  aufbauten(rnd, BUGPANZER, 8, 82, eimer, { unten: false, seiten: false, dichte: 0.9, fase: 0.4 });
  aufbauten(rnd, KOMMANDO, -34, -3, eimer, { unten: false, dichte: 1.5, fase: 0.35 });

  eimer.metall.push(rohrY(0.35, 9, 0, 19.5, -20), rohrY(0.2, 6, 2.5, 18, -26), rohrY(0.2, 4, -2.5, 17, -14));
  eimer.dunkel.push(kiste(5, 0.4, 0.4, 0, 22, -20), kiste(0.4, 0.4, 3, 0, 20.5, -20), kiste(3.5, 2, 3.5, 0, 16, -30));
  eimer.metall.push(nur(new THREE.SphereGeometry(3.2, 20, 8, 0, Math.PI * 2, 0, 0.9).rotateX(-0.9).translate(-3, 17.5, -11)));
  eimer.dunkel.push(kiste(1.2, 1.2, 10, 0, -1.4, 86), rohrZ(0.5, 6, 3, -0.8, 85), rohrZ(0.5, 6, -3, -0.8, 85));

  const duesen = [duese(eimer, 4.4, 0, -66, 3.6), duese(eimer, -4.4, 0, -66, 3.6), duese(eimer, POD_X, -1, -64, 3.4), duese(eimer, -POD_X, -1, -64, 3.4)];

  const gruppe = new THREE.Group();
  gruppe.name = 'ambos';
  fuegeZusammen(eimer, mats, gruppe, 'ambos');
  const tuerme = [turm(gruppe, mats, 0, 9.4, -48, false), turm(gruppe, mats, 0, 12.1, 34, false), turm(gruppe, mats, 0, -10.5, -24, true), turm(gruppe, mats, 0, -9.7, 28, true)];

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
  nummer.rotation.x = -Math.PI / 2; nummer.rotation.z = Math.PI; nummer.position.set(2, 9.53, -57);
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
  return { name: 'AMBOS', kennung: 'FK-07', laenge: 150, gruppe, tuerme, darstellen };
}
