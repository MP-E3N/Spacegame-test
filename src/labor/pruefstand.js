// ZWECK: Stahl-Prüfstand des Flak-Labors — schlichte Plattform ohne Schiffsrumpf, auf der die 6 Flaktürme stehen.
// LIEFERT: erstellePruefstand(scene) → { gruppe }
// REGEL: Oberkante Deck y = 0 (passt zu src/sim/waffen/lafetten.js). Je Material ein Netz (fuegeZusammen).
//        Türme baut die Waffen-Grafik; hier nur Deck, Träger, Geländer, Munitionskästen, Pylon.
import * as THREE from 'three';
import { kiste, rohrY, rohrX, materialien, leereEimer, fuegeZusammen } from '../grafik/schiff/bauteile.js';
import { LAFETTEN } from '../sim/waffen/lafetten.js';

export function erstellePruefstand(scene) {
  const gruppe = new THREE.Group(); gruppe.name = 'pruefstand';
  const e = leereEimer();
  const B = 54, T = 34; // Deck Breite (x) × Tiefe (z)

  // Deck + Randleisten
  e.rumpf.push(kiste(B, 2.2, T, 0, -1.1, 0));
  e.dunkel.push(kiste(B + 1, 0.8, 1, 0, -0.4, T / 2), kiste(B + 1, 0.8, 1, 0, -0.4, -T / 2));
  e.dunkel.push(kiste(1, 0.8, T + 1, B / 2, -0.4, 0), kiste(1, 0.8, T + 1, -B / 2, -0.4, 0));
  // Warnstreifen an der Deckkante (vorne/hinten), Geländer
  for (const z of [T / 2 - 1.4, -T / 2 + 1.4]) {
    for (let x = -B / 2 + 2; x < B / 2 - 1; x += 3) e.warn.push(kiste(1.4, 0.06, 0.9, x, 0.03, z));
  }
  for (const z of [T / 2 - 0.4, -T / 2 + 0.4]) {
    e.metall.push(kiste(B - 1, 0.12, 0.12, 0, 1.1, z));
    for (let x = -B / 2 + 1; x <= B / 2 - 1; x += 4.5) e.metall.push(rohrY(0.07, 1.1, x, 0.55, z, 6));
  }
  // Fundamente unter den Türmen (Stahlring im Deck)
  for (const l of LAFETTEN) e.dunkel.push(rohrY(3.3, 0.3, l.x, 0.05, l.z, 20));
  // Munitionskästen + Feuerleitstand zwischen den Reihen
  for (const x of [-21, -7, 7, 21]) e.dunkel.push(kiste(3.2, 1.6, 2.4, x, 0.8, 0), kiste(3.4, 0.2, 2.6, x, 1.7, 0));
  e.rumpf.push(kiste(5, 2.6, 3.4, 0, 1.3, -14.5), kiste(3.6, 0.9, 2.4, 0, 3.05, -14.5));
  e.schacht.push(kiste(4.2, 0.5, 0.05, 0, 2.0, -12.78)); // Sehschlitz des Leitstands (dunkel)
  // Träger unter dem Deck
  for (const x of [-21, -7, 7, 21]) e.dunkel.push(kiste(2, 3.5, T - 2, x, -3.95, 0));
  for (const z of [-14, 0, 14]) e.dunkel.push(kiste(B - 2, 1.6, 1.6, 0, -3.2, z));
  for (const z of [-10, 10]) e.metall.push(rohrX(0.35, B - 4, 0, -5.2, z, 8));
  // Pylon nach unten zum Ankerblock (der Prüfstand „hängt“ an einer Station unterhalb)
  e.dunkel.push(rohrY(4.2, 70, 0, -40.5, 0, 12), rohrY(6, 3, 0, -6.5, 0, 12));
  e.rumpf.push(kiste(22, 12, 22, 0, -80, 0), kiste(26, 3, 26, 0, -73, 0));
  for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) e.metall.push(rohrY(0.6, 64, x * 0.55, -42, z * 0.55, 6));

  fuegeZusammen(e, materialien(), gruppe, 'pruefstand');
  scene.add(gruppe);
  return { gruppe };
}
