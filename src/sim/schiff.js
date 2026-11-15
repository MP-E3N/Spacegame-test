// ZWECK: Flugmodell des Spielerschiffs (reine Simulation, fester Schritt).
// LIEFERT: erstelleSchiffSim(werte?) → { z (Zustand), schritt(dt, befehl), zuruecksetzen(), lage(alpha, pos, rot) }
//   befehl = { hebel: -1..1 (Schubhebel bewegen), stopp, gieren, nicken, rollen: -1..1, quer, hoch: -1..1,
//              nachbrenner: bool, daempferUmschalten: bool }
//   z = { pos, vel (Welt, m/s), rot (Quaternion), dreh (lokal, rad/s: x=nicken, y=gieren, z=rollen),
//         hebel, daempfer, nachbrenner (0..1 geglättet), schub (lokal, −1..1 je Achse, für Düsen-Effekte),
//         drehSchub (lokal, −1..1, für Steuerdüsen) }
// REGEL: Kein DOM, kein Renderer, kein Math.random → läuft in Node-Tests und später auf einem Server (Koop).
//        Der Befehl ist das, was später die Steuer-Station über das Netz schickt.
// VORZEICHEN: dreh.y > 0 = Nase nach links (Richtung +X), dreh.x > 0 = Nase runter, dreh.z > 0 = Rolle nach rechts.
import { Vector3, Quaternion } from 'three';
import { SCHIFF } from './werte.js';

const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);

export function erstelleSchiffSim(werte = SCHIFF) {
  const W = werte;
  const z = {
    pos: new Vector3(), vel: new Vector3(), rot: new Quaternion(), dreh: new Vector3(),
    hebel: 0, daempfer: true, nachbrenner: 0,
    schub: new Vector3(), drehSchub: new Vector3(),
    vorherPos: new Vector3(), vorherRot: new Quaternion(),
  };
  // Vorlagen (keine neuen Objekte pro Schritt)
  const vl = new Vector3(), a = new Vector3(), dq = new Quaternion(), achse = new Vector3(), inv = new Quaternion();

  function zuruecksetzen() {
    z.pos.set(0, 0, 0); z.vel.set(0, 0, 0); z.rot.identity(); z.dreh.set(0, 0, 0);
    z.hebel = 0; z.daempfer = true; z.nachbrenner = 0; z.schub.set(0, 0, 0); z.drehSchub.set(0, 0, 0);
    z.vorherPos.copy(z.pos); z.vorherRot.copy(z.rot);
  }

  /** Eine Achse des Dämpfers: Wunschgeschwindigkeit ansteuern, Beschleunigung begrenzt (−aMinus..+aPlus). */
  const regle = (soll, ist, aPlus, aMinus) => klemme((soll - ist) * W.regler, -aMinus, aPlus);

  function schritt(dt, b = {}) {
    z.vorherPos.copy(z.pos); z.vorherRot.copy(z.rot);
    if (b.daempferUmschalten) z.daempfer = !z.daempfer;
    if (b.stopp) z.hebel = 0;
    z.hebel = klemme(z.hebel + (b.hebel || 0) * W.hebelRate * dt, W.hebelMin, 1);
    // Nachbrenner nur bei Vorwärtsfahrt; weich ein/aus, damit Schub und Flamme nicht springen
    const nbSoll = b.nachbrenner && z.hebel > 0.05 ? 1 : 0;
    z.nachbrenner += klemme(nbSoll - z.nachbrenner, -dt * 1.5, dt * 1.5);
    const nb = 1 + (W.nachbrenner - 1) * z.nachbrenner;

    // ---------- Fahrt ----------
    inv.copy(z.rot).invert();
    vl.copy(z.vel).applyQuaternion(inv); // Geschwindigkeit im Schiffs-Rahmen
    const aVor = W.aVor * nb;
    const quer = klemme(b.quer || 0, -1, 1), hoch = klemme(b.hoch || 0, -1, 1);
    if (z.daempfer) {
      const sollZ = z.hebel >= 0 ? z.hebel * W.vMax * nb : (z.hebel / -W.hebelMin) * W.vRueck;
      a.set(
        regle(quer * W.vQuer, vl.x, W.aQuer, W.aQuer),
        regle(hoch * W.vQuer, vl.y, W.aQuer, W.aQuer),
        regle(sollZ, vl.z, aVor, W.aRueck),
      );
    } else {
      // Ohne Dämpfer: Hebel = Schubkraft, nichts bremst von selbst (echtes Treiben im All)
      a.set(quer * W.aQuer, hoch * W.aQuer, z.hebel >= 0 ? z.hebel * aVor : (z.hebel / -W.hebelMin) * W.aRueck);
    }
    z.schub.set(a.x / W.aQuer, a.y / W.aQuer, a.z >= 0 ? a.z / W.aVor : a.z / W.aRueck);
    a.applyQuaternion(z.rot);
    z.vel.addScaledVector(a, dt);
    z.pos.addScaledVector(z.vel, dt);

    // ---------- Drehung (immer gedämpft) ----------
    const M = W.drehMax, B = W.drehBeschl, k = W.drehRegler;
    const soll = [
      -klemme(b.nicken || 0, -1, 1) * M.nicken, // nicken +1 = Nase hoch → dreh.x negativ
      klemme(b.gieren || 0, -1, 1) * M.gieren,
      klemme(b.rollen || 0, -1, 1) * M.rollen,
    ];
    const ax = klemme((soll[0] - z.dreh.x) * k, -B.nicken, B.nicken);
    const ay = klemme((soll[1] - z.dreh.y) * k, -B.gieren, B.gieren);
    const az = klemme((soll[2] - z.dreh.z) * k, -B.rollen, B.rollen);
    z.drehSchub.set(ax / B.nicken, ay / B.gieren, az / B.rollen);
    z.dreh.x += ax * dt; z.dreh.y += ay * dt; z.dreh.z += az * dt;
    const w = z.dreh.length();
    if (w > 1e-9) {
      achse.copy(z.dreh).divideScalar(w);
      dq.setFromAxisAngle(achse, w * dt);
      z.rot.multiply(dq).normalize(); // lokal drehen: rot = rot · dq
    }
  }

  /** Interpolierte Lage für die Darstellung (alpha 0..1 zwischen letztem und aktuellem Schritt). */
  function lage(alpha, pos, rot) {
    pos.lerpVectors(z.vorherPos, z.pos, alpha);
    rot.slerpQuaternions(z.vorherRot, z.rot, alpha);
  }

  zuruecksetzen();
  return { z, werte: W, schritt, zuruecksetzen, lage };
}

/** Geschwindigkeit im Schiffs-Rahmen (für Anzeige und Tests). */
export function lokaleGeschwindigkeit(z, ziel = new Vector3()) {
  return ziel.copy(z.vel).applyQuaternion(new Quaternion().copy(z.rot).invert());
}
