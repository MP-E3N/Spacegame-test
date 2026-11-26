// ZWECK: Ansichtswürfel der Form-Werkstatt (Runde 17, Nutzer: „3D-Würfel, damit ich immer in die richtige Ansicht
//        wechseln kann, wie bei Inventor“). Kleiner Würfel oben rechts im Bild, dreht sich mit der Kamera. Klick auf
//        Fläche = gerade Ansicht (VORNE, OBEN …), auf Kante = halb schräg, auf Ecke = Iso-Ansicht. Kamera fährt weich hin.
// LIEFERT: erstelleAnsichtswuerfel({ renderer, camera, steuer, leinwand, rechtsFrei }) → { zeichne(), schritt(jetzt),
//          drehNach(richtung, oben?), achsen(), ueber(clientX, clientY), klick(clientX, clientY), bewegt(clientX, clientY), faehrt(), halt(),
//          gerade(), normal() (Bildwinkel sofort normal — vor jedem Setzen der Kamera von außen), tele (an/aus) }
// REGEL: Richtungen im Form-Rahmen (+Z Bug = VORNE, +X Backbord = LINKS, +Y OBEN; CLAUDE.md Regel 3). Der Würfel zeichnet
//        nach dem Hauptbild in einen eigenen Ausschnitt (eigene Szene, eigene Kamera) — keine Wirkung auf Licht/Schatten.
import * as THREE from 'three';

const GROESSE = 118;     // px Kantenlänge des Ausschnitts
const RAND = 12;         // px Abstand nach oben
const FAHRT = 0.35;      // s Kamerafahrt
const BAND = 0.3;        // Trefferpunkt |Koordinate| > BAND (Halbkante 0,5) → gehört zur Kante/Ecke dieser Seite

// Reihenfolge der BoxGeometry-Flächen: +X, −X, +Y, −Y, +Z, −Z
const FLAECHEN = [['LINKS', '#2c3a48'], ['RECHTS', '#2c3a48'], ['OBEN', '#3a3424'], ['UNTEN', '#3a3424'], ['VORNE', '#4a3418'], ['HINTEN', '#2e2a22']];

function beschriftung(text, grund) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = grund; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#8a6a38'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 122);
  g.fillStyle = '#f2c070'; g.font = `bold ${text.length > 5 ? 21 : 24}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function erstelleAnsichtswuerfel({ renderer, camera, steuer, leinwand, rechtsFrei = 330 }) {
  const szene = new THREE.Scene();
  const kam = new THREE.OrthographicCamera(-0.95, 0.95, 0.95, -0.95, 0.1, 10);
  const wuerfel = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    FLAECHEN.map(([t, g]) => new THREE.MeshBasicMaterial({ map: beschriftung(t, g), toneMapped: false })));
  szene.add(wuerfel);
  const kanten = new THREE.LineSegments(new THREE.EdgesGeometry(wuerfel.geometry), new THREE.LineBasicMaterial({ color: 0xc9a060, toneMapped: false }));
  szene.add(kanten);
  // Achsenkreuz am Würfelfuß: rot = X (links), grün = Y (oben), blau = Z (vorn) — wie in CAD üblich
  for (const [r, f] of [[[1, 0, 0], 0xd05040], [[0, 1, 0], 0x60c060], [[0, 0, 1], 0x4a8aff]]) {
    const a = new THREE.ArrowHelper(new THREE.Vector3(...r), new THREE.Vector3(-0.62, -0.62, -0.62), 0.55, f, 0.12, 0.07);
    a.traverse((o) => { if (o.material) o.material.toneMapped = false; });
    szene.add(a);
  }
  const markierung = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.55, depthTest: false, toneMapped: false }));
  markierung.visible = false; markierung.renderOrder = 5; szene.add(markierung);

  const strahl = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let fahrt = null; // { von: Vector3 (Richtung), nach, oben, start, abstand }

  /** Ausschnitt in CSS-Pixeln (links, oben) — links neben der rechten Tafel, damit nichts verdeckt wird. */
  function ausschnitt() {
    const r = leinwand.getBoundingClientRect();
    return { x: r.left + r.width - rechtsFrei - GROESSE, y: r.top + RAND, w: GROESSE, h: GROESSE, breite: r.width, hoehe: r.height, r };
  }
  function ueber(cx, cy) { const a = ausschnitt(); return cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h; }

  /** Treffer auf dem Würfel → Richtung mit Anteilen −1/0/1 (Fläche, Kante oder Ecke) oder null. */
  function bereich(cx, cy) {
    if (!ueber(cx, cy)) return null;
    const a = ausschnitt();
    ndc.set(((cx - a.x) / a.w) * 2 - 1, -((cy - a.y) / a.h) * 2 + 1);
    strahl.setFromCamera(ndc, kam);
    const t = strahl.intersectObject(wuerfel)[0]; if (!t) return null;
    const p = t.point; // Würfel steht im Ursprung ohne Drehung → Weltpunkt = Würfelpunkt
    return [p.x, p.y, p.z].map((v) => (v > BAND ? 1 : v < -BAND ? -1 : 0));
  }

  function bewegt(cx, cy) {
    const b = bereich(cx, cy);
    markierung.visible = !!b;
    if (b) {
      // Markierung deckt genau den Bereich: Seite mit Anteil ±1 → Band 0,3 … 0,5, Anteil 0 → Mitte −0,3 … 0,3
      markierung.scale.set(...b.map((v) => (v ? 0.21 : 0.61)));
      markierung.position.set(...b.map((v) => v * 0.4 * (v ? 1.02 : 0)));
    }
    leinwand.style.cursor = b ? 'pointer' : '';
    return !!b;
  }

  /**
   * Kamera weich in Richtung r drehen (Abstand und Ziel bleiben). oben: gewünschte Bild-Oberkante bei Blick von oben/unten
   * (sonst gilt +Y). WARUM der kleine Versatz: OrbitControls kann nicht genau senkrecht stehen (Pol) — 0,1 % neben dem
   * Pol und zur gewünschten Oberkante hin bestimmt auch, wie das Bild gedreht ist.
   */
  function drehNach(r, oben = null) {
    const nach = new THREE.Vector3(...(r.isVector3 ? r.toArray() : r)).normalize();
    if (Math.abs(nach.y) > 0.999) {
      const o = oben ? new THREE.Vector3(...(oben.isVector3 ? oben.toArray() : oben)) : new THREE.Vector3(0, 0, -1).multiplyScalar(nach.y > 0 ? 1 : -1);
      nach.addScaledVector(o, -0.002).normalize();
    }
    const versatz = camera.position.clone().sub(steuer.target);
    fahrt = { von: versatz.clone().normalize(), nach, start: performance.now(), abstand: versatz.length() };
  }
  /**
   * Tele-Ansicht (Runde 18, „gerade Ansichten ohne Perspektive“ wie im CAD): steht die Kamera genau auf einer Achse,
   * wird der Bildwinkel klein (TELE_FOV) und die Kamera entsprechend weiter weg gestellt — vorderer und hinterer Spant
   * decken sich dann im Bild. Beim Wegdrehen zurück auf den normalen Winkel. WARUM nicht OrthographicCamera: Renderer,
   * Nachbearbeitung und OrbitControls hängen an dieser einen Kamera; ein Wechsel hieße alles doppelt verdrahten.
   * Die scheinbare Größe bleibt beim Umblenden gleich: Abstand × tan(fov/2) = konstant.
   */
  const NORMAL_FOV = camera.fov, TELE_FOV = 3;
  let teleAn = true;
  function gerade() {
    const d = camera.position.clone().sub(steuer.target).normalize();
    return Math.max(Math.abs(d.x), Math.abs(d.y), Math.abs(d.z)) > 0.9995;
  }
  function fernglas() {
    // Nahebene mit dem Abstand (Prüfer R18): bei Tele steht die Kamera Hunderte Meter weg — near = 1 verschenkt Tiefenauflösung
    const nah = Math.max(1, camera.position.distanceTo(steuer.target) * 0.02);
    if (Math.abs(camera.near - nah) > 0.05 * nah) { camera.near = nah; camera.updateProjectionMatrix(); }
    const ziel = teleAn && !fahrt && gerade() ? TELE_FOV : NORMAL_FOV;
    if (Math.abs(camera.fov - ziel) < 0.01) return;
    const alt = camera.fov, neu = Math.abs(ziel - alt) < 0.3 ? ziel : alt + (ziel - alt) * 0.25; // weich in ~10 Bildern
    const versatz = camera.position.clone().sub(steuer.target), faktor = Math.tan(alt * Math.PI / 360) / Math.tan(neu * Math.PI / 360);
    versatz.multiplyScalar(faktor);
    if (fahrt) fahrt.abstand *= faktor; // sonst setzt die Fahrt den alten Abstand zurück
    camera.position.copy(steuer.target).add(versatz);
    camera.fov = neu; camera.updateProjectionMatrix();
    // Zoom-Grenzen mitziehen, sonst schnappt OrbitControls die Entfernung auf maxDistance zurück
    const f = Math.tan(NORMAL_FOV * Math.PI / 360) / Math.tan(neu * Math.PI / 360);
    steuer.minDistance = grenzen.min * f; steuer.maxDistance = grenzen.max * f;
  }
  const grenzen = { min: steuer.minDistance, max: steuer.maxDistance };

  function schritt(jetzt = performance.now()) {
    fernglas();
    if (!fahrt) return;
    const t = Math.min(1, (jetzt - fahrt.start) / (FAHRT * 1000)), w = t * t * (3 - 2 * t);
    // Kugel-Interpolation der Richtung (bei Gegenrichtung über eine Seitenachse, sonst wäre die Drehachse unbestimmt)
    const q = new THREE.Quaternion().setFromUnitVectors(fahrt.von, fahrt.nach);
    const d = fahrt.von.clone().applyQuaternion(new THREE.Quaternion().slerp(q, w));
    camera.position.copy(steuer.target).addScaledVector(d, fahrt.abstand);
    camera.lookAt(steuer.target);
    if (t >= 1) fahrt = null;
  }

  function klick(cx, cy) {
    const b = bereich(cx, cy); if (!b) return false;
    // Blick von oben/unten: Bild-Oberkante = hinten (Bug unten), wie in Inventor „Oben“ mit „Vorne“ unten
    drehNach(b, Math.abs(b[1]) === 1 && !b[0] && !b[2] ? [0, 0, -1] : null);
    return true;
  }

  /**
   * Bildachsen der Kamera auf die nächsten Form-Achsen gerastet: { ex (rechts), ey (oben), n (zum Betrachter) } als
   * Arrays. ex × ey = n (Rechtssystem). Grundlage der Zeichenebene einer Skizze.
   */
  function achsen() {
    const rast = (v) => { const a = v.toArray(), i = [0, 1, 2].reduce((b, j) => (Math.abs(a[j]) > Math.abs(a[b]) ? j : b), 0), o = [0, 0, 0]; o[i] = Math.sign(a[i]) || 1; return o; };
    const n = rast(camera.position.clone().sub(steuer.target));
    let ey = rast(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion));
    if (ey.some((v, i) => v !== 0 && n[i] !== 0)) { // Oberkante fällt mit der Blickachse zusammen → zweitbeste Achse
      const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).toArray().map((v, i) => (n[i] ? 0 : v));
      ey = rast(new THREE.Vector3(...u));
    }
    const ex = new THREE.Vector3(...ey).cross(new THREE.Vector3(...n)).toArray().map((v) => Math.round(v) + 0);
    return { ex, ey, n };
  }

  function zeichne() {
    const a = ausschnitt();
    kam.position.copy(camera.position).sub(steuer.target).setLength(3);
    kam.quaternion.copy(camera.quaternion);
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    const y = a.hoehe - RAND - GROESSE; // WebGL zählt von unten
    const x = a.x - a.r.left;
    renderer.setViewport(x, y, GROESSE, GROESSE); renderer.setScissor(x, y, GROESSE, GROESSE);
    renderer.clearDepth();
    renderer.render(szene, kam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, a.breite, a.hoehe);
    renderer.autoClear = true;
  }

  // halt: laufende Fahrt abbrechen (z. B. F = Kamera auf die Form) — sonst überschriebe die Fahrt die neue Lage
  return { zeichne, schritt, drehNach, achsen, ueber, klick, bewegt, faehrt: () => !!fahrt, halt: () => { fahrt = null; },
    gerade, normal() {
      // Abstand mitnehmen, damit die Form gleich groß bleibt (Abstand × tan(fov/2) = konstant)
      const v = camera.position.clone().sub(steuer.target).multiplyScalar(Math.tan(camera.fov * Math.PI / 360) / Math.tan(NORMAL_FOV * Math.PI / 360));
      camera.position.copy(steuer.target).add(v);
      camera.fov = NORMAL_FOV; camera.updateProjectionMatrix(); steuer.minDistance = grenzen.min; steuer.maxDistance = grenzen.max;
    }, get tele() { return teleAn; }, set tele(an) { teleAn = !!an; } };
}
