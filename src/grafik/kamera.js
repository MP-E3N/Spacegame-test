// ZWECK: Außenkamera ums Schiff.
// LIEFERT: erstelleKamera(camera) → { update(dt, pos, rot, eingabe), naechsterModus(), setzeModus(name), modus(),
//          setzeFrei(gier, nick, abstand), setzeSkala(schiffslaenge / 150) }
// MODI: verfolger (hinten oben, rollt mit dem Schiff), weit (Übersicht), frei (Maus ziehen = drehen, Rad = Zoom).
// REGEL: liest nur die interpolierte Schiffslage; ändert nichts an der Simulation.
// WARUM schmales Fenster → weiter weg: das Bild ist dann horizontal enger; ohne Ausgleich ragt das Schiff seitlich heraus.
// WARUM die Verfolgerkamera dem Rollen folgt: im All gibt es kein Oben — der Horizont ist das eigene Schiff.
import * as THREE from 'three';

const BREIT = 1.4; // Seitenverhältnis, ab dem das Schiff ohne Ausgleich ins Bild passt
const MODI = ['verfolger', 'weit', 'frei'];
const VERSATZ = { verfolger: new THREE.Vector3(0, 32, -125), weit: new THREE.Vector3(70, 60, -260) };
const BLICK = { verfolger: new THREE.Vector3(0, 8, 45), weit: new THREE.Vector3(0, 0, 30) };

export function erstelleKamera(camera) {
  let modus = 'verfolger';
  let gier = 2.4, nick = 0.25, abstand = 210; // freie Kamera, Winkel im Schiffs-Rahmen
  let skala = 1; // Schiffsgröße relativ zu 150 m (Versätze wachsen mit)
  const pos = new THREE.Vector3(), ziel = new THREE.Vector3(), hoch = new THREE.Vector3(0, 1, 0);
  const sollPos = new THREE.Vector3(), sollZiel = new THREE.Vector3(), sollHoch = new THREE.Vector3();
  let erstesMal = true;

  function update(dt, sPos, sRot, e) {
    const m = e?.maus;
    if (modus === 'frei' && m) {
      gier -= m.dx * 0.005; nick = Math.max(-1.45, Math.min(1.45, nick + m.dy * 0.005));
      if (m.rad) abstand = Math.max(70 * skala, Math.min(900 * skala, abstand * Math.pow(1.12, m.rad)));
    }
    // Soll-Lage relativ zum Schiff (pos/ziel sind Versätze, keine Weltpunkte)
    if (modus === 'frei') {
      sollPos.set(Math.sin(gier) * Math.cos(nick), Math.sin(nick), Math.cos(gier) * Math.cos(nick)).multiplyScalar(abstand).applyQuaternion(sRot);
      sollZiel.set(0, 0, 0);
    } else {
      const schmal = Math.min(2.2, Math.max(1, BREIT / (camera.aspect || BREIT))); // 1 bei Querformat ≥ 1,4
      sollPos.copy(VERSATZ[modus]).multiplyScalar(skala * schmal).applyQuaternion(sRot);
      sollZiel.copy(BLICK[modus]).multiplyScalar(skala).applyQuaternion(sRot);
    }
    sollHoch.set(0, 1, 0).applyQuaternion(sRot);
    if (erstesMal) { pos.copy(sollPos); ziel.copy(sollZiel); hoch.copy(sollHoch); erstesMal = false; }
    // Nachziehen: Position etwas träge (Gefühl von Masse), Ziel schneller, damit das Schiff im Bild bleibt.
    // WARUM relativ zum Schiff glätten: bei 200 m/s würde eine absolut geglättete Kamera weit zurückfallen.
    const kp = 1 - Math.exp(-dt * (modus === 'frei' ? 12 : 3.5)), kz = 1 - Math.exp(-dt * 8), kh = 1 - Math.exp(-dt * 2.5);
    pos.lerp(sollPos, kp);
    ziel.lerp(sollZiel, kz);
    hoch.lerp(sollHoch, kh).normalize();
    camera.position.copy(pos).add(sPos);
    ziel.add(sPos);
    camera.up.copy(hoch);
    camera.lookAt(ziel);
    ziel.sub(sPos);
  }

  return {
    update,
    naechsterModus() { modus = MODI[(MODI.indexOf(modus) + 1) % MODI.length]; return modus; },
    setzeModus(n) { if (MODI.includes(n)) modus = n; },
    modus: () => modus,
    setzeFrei(g, n, a) { gier = g; nick = n; abstand = a * skala; modus = 'frei'; erstesMal = true; },
    setzeSkala(s) { abstand *= s / skala; skala = s; },
  };
}
