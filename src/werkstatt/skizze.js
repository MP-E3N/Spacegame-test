// ZWECK: Skizzen-Werkzeug der Form-Werkstatt (Runde 17, Nutzer: „eine Fläche zeichnen und nach hinten ziehen, um einen
//        Körper daraus zu erstellen“ — wie Skizze + Extrusion in Inventor). Zwei Stufen:
//        1) ZEICHNEN auf einer Ebene senkrecht zur Blickrichtung: Linienzug (Klick je Punkt), Rechteck (2 Klicks),
//           Kreis (Mitte + Rand). Raster 0,5 m, Strg = frei. Schließen: Klick auf den ersten Punkt, Doppelklick oder Enter.
//        2) ZIEHEN: Pfeil an der Fläche; Maus ziehen (oder Zahl eingeben) = Tiefe. Enter / „Körper erstellen“ = fertig.
// LIEFERT: erstelleSkizze({ scene, camera, leinwand, steuer, wuerfel, meldung, fertig }) → { start(), aktiv(),
//          abbrechen(), taste(e) → bool, unter(cx, cy) }  — fertig(koerperDaten ohne id) erhält den Körper (form.js skizzenKoerper).
// REGEL: Daten nur über form.js (skizzenKoerper). Die Ebene geht durch den Ursprung (Lage verschiebbar, Feld „Ebene bei“);
//        ihre Achsen kommen gerastet aus der Kamera (wuerfel.achsen()). Linke Maus dreht in der Skizze NICHT die Kamera
//        (dafür der Ansichtswürfel); Rad zoomt, mittlere Maus schiebt.
import * as THREE from 'three';
import { skizzenKoerper } from '../sim/form/form.js';
import { koerperGeometrie } from '../grafik/form/koerper.js';

const $ = (id) => document.getElementById(id);
const KREIS_N = 24;
const SCHLIESS_PX = 12;

export function erstelleSkizze({ scene, camera, leinwand, steuer, wuerfel, meldung, fertig }) {
  const gruppe = new THREE.Group(); gruppe.visible = false; scene.add(gruppe);
  const linieMat = new THREE.LineBasicMaterial({ color: 0xffd080, depthTest: false, toneMapped: false });
  const gummiMat = new THREE.LineDashedMaterial({ color: 0xffd080, dashSize: 0.6, gapSize: 0.4, depthTest: false, toneMapped: false });
  const flaecheMat = new THREE.MeshBasicMaterial({ color: 0xe0a040, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const punktMat = new THREE.SpriteMaterial({ color: 0xffd080, sizeAttenuation: false, depthTest: false, toneMapped: false });
  const geistMat = new THREE.MeshStandardMaterial({ color: 0xc9a060, transparent: true, opacity: 0.55, roughness: 0.7, metalness: 0.2 });
  const geistMinus = new THREE.MeshBasicMaterial({ color: 0xe06040, transparent: true, opacity: 0.3, depthWrite: false });

  const wegwerfen = [];
  const eigen = (g) => { wegwerfen.push(g); return g; };
  let z = null; // Zustand: { stufe, werkzeug, ebene: { ex, ey, n, d }, punkte, zeiger, tiefe, op, griffT, ziehtTiefe }
  const strahl = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const V = (a) => new THREE.Vector3(...a);

  // ---------- Ebene ----------
  function welt([s, t]) { const { ex, ey, n, d } = z.ebene; return V(ex).multiplyScalar(s).addScaledVector(V(ey), t).addScaledVector(V(n), d); }
  function strahlVon(cx, cy) {
    const r = leinwand.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(ndc, camera); return strahl.ray;
  }
  /** Mauspunkt auf der Zeichenebene in Ebenen-Koordinaten [s, t] (gerastet, außer frei) oder null. */
  function aufEbene(cx, cy, frei) {
    const { ex, ey, n, d } = z.ebene, ebene = new THREE.Plane(V(n), -d), p = new THREE.Vector3();
    if (!strahlVon(cx, cy).intersectPlane(ebene, p)) return null;
    const r = (v) => (frei ? Math.round(v * 100) / 100 : Math.round(v * 2) / 2) + 0;
    return [r(p.dot(V(ex))), r(p.dot(V(ey)))];
  }
  function bildpunkt(q) { const v = welt(q).project(camera), r = leinwand.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }

  // ---------- Umriss je Werkzeug ----------
  function umriss(mitZeiger = true) {
    const p = z.punkte, m = mitZeiger && z.zeiger;
    if (z.werkzeug === 'rechteck') {
      const a = p[0], b = p[1] ?? m; if (!a || !b) return p.slice();
      return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
    }
    if (z.werkzeug === 'kreis') {
      const c = p[0], b = p[1] ?? m; if (!c || !b) return p.slice();
      const r = Math.hypot(b[0] - c[0], b[1] - c[1]);
      return Array.from({ length: KREIS_N }, (_, i) => [c[0] + r * Math.cos(i / KREIS_N * 2 * Math.PI), c[1] + r * Math.sin(i / KREIS_N * 2 * Math.PI)].map((v) => Math.round(v * 1000) / 1000));
    }
    return m ? [...p, m] : p.slice();
  }
  const geschlossen = () => z.stufe === 'ziehen';

  // ---------- Zeichnen ----------
  function neuZeichnen() {
    // WARUM eigene Liste: Sprites und Pfeile teilen sich three-eigene Geometrien, der Körper-Geist die des Zwischenspeichers
    for (const x of wegwerfen) x.dispose();
    wegwerfen.length = 0; gruppe.clear();
    if (!z) return;
    const { n, d } = z.ebene;
    // Zeichenraster auf der Ebene (1 m / 5 m)
    for (const [teile, farbe, deck] of [[200, 0x3a3020, 0.45], [40, 0x6a5530, 0.6]]) {
      const g = new THREE.GridHelper(200, teile, farbe, farbe); eigen(g.geometry); eigen(g.material); g.material.transparent = true; g.material.opacity = deck; g.material.depthWrite = false;
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), V(n)); g.position.copy(V(n).multiplyScalar(d));
      g.visible = z.stufe === 'zeichnen'; gruppe.add(g);
    }
    const u = umriss(), pts = u.map(welt);
    if (pts.length >= 2) {
      const zu = geschlossen() || z.werkzeug !== 'linie';
      const l = new (zu ? THREE.LineLoop : THREE.Line)(eigen(new THREE.BufferGeometry().setFromPoints(pts)), linieMat); l.renderOrder = 30; gruppe.add(l);
      if (!zu && pts.length >= 3) { // gestrichelte Schließlinie zum ersten Punkt
        const g = new THREE.Line(eigen(new THREE.BufferGeometry().setFromPoints([pts.at(-1), pts[0]])), gummiMat); g.computeLineDistances(); g.renderOrder = 30; gruppe.add(g);
      }
    }
    if (u.length >= 3) { // Fläche
      const form = new THREE.Shape(u.map(([s, t]) => new THREE.Vector2(s, t)));
      const f = new THREE.Mesh(eigen(new THREE.ShapeGeometry(form)), flaecheMat);
      const { ex, ey } = z.ebene;
      f.matrixAutoUpdate = false; f.matrix.makeBasis(V(ex), V(ey), V(n)).setPosition(V(n).multiplyScalar(d + 0.01)); f.renderOrder = 25;
      gruppe.add(f);
    }
    for (const [i, q] of z.punkte.entries()) { // gesetzte Punkte (der erste größer: dort schließt ein Klick)
      const s = new THREE.Sprite(punktMat); s.scale.setScalar(i === 0 && z.werkzeug === 'linie' ? 0.016 : 0.011); s.position.copy(welt(q)); s.renderOrder = 31; gruppe.add(s);
    }
    if (z.zeiger && z.stufe === 'zeichnen') { const s = new THREE.Sprite(punktMat); s.scale.setScalar(0.008); s.position.copy(welt(z.zeiger)); s.renderOrder = 31; gruppe.add(s); }
    if (z.stufe === 'ziehen') {
      const k = koerper();
      if (k) {
        const netz = new THREE.Mesh(koerperGeometrie(k), z.op === 'minus' ? geistMinus : geistMat);
        netz.position.set(...k.pos); netz.rotation.set(...k.dreh.map((g) => g * Math.PI / 180), 'XYZ'); gruppe.add(netz);
      }
      const c = mitte(), richtung = V(n).multiplyScalar(Math.sign(z.tiefe) || -1);
      const pfeil = new THREE.ArrowHelper(richtung, welt(c).addScaledVector(V(n), z.tiefe), 4, 0x9ad27a, 1.4, 0.9);
      pfeil.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.toneMapped = false; eigen(o.material); } o.renderOrder = 32; });
      gruppe.add(pfeil);
    }
    zeigeLeiste();
  }
  const mitte = () => { const u = umriss(false); return [u.reduce((a, q) => a + q[0], 0) / u.length, u.reduce((a, q) => a + q[1], 0) / u.length]; };
  function koerper() {
    const u = umriss(false); if (u.length < 3) return null;
    try { return skizzenKoerper({ punkte: u, ...z.ebene, tiefe: z.tiefe, op: z.op, id: -1 }); } catch { return null; }
  }

  // ---------- Leiste ----------
  function zeigeLeiste() {
    const l = $('skizze-leiste'); l.classList.toggle('versteckt', !z); if (!z) return;
    $('sk-zeichnen').classList.toggle('versteckt', z.stufe !== 'zeichnen');
    $('sk-ziehen').classList.toggle('versteckt', z.stufe !== 'ziehen');
    for (const w of ['linie', 'rechteck', 'kreis']) $('sk-' + w).classList.toggle('aktiv', z.werkzeug === w);
    if (document.activeElement !== $('sk-tiefe')) $('sk-tiefe').value = z.tiefe;
    if (document.activeElement !== $('sk-d')) $('sk-d').value = z.ebene.d;
    $('sk-op').textContent = z.op === 'minus' ? 'Minus (schneidet aus)' : 'Plus (Material)';
    $('sk-op').classList.toggle('minus', z.op === 'minus');
    const hinweis = { linie: 'Klick = Punkt setzen · Klick auf den ersten Punkt, Doppelklick oder Enter = schließen · Rücktaste = letzten Punkt weg',
      rechteck: 'Klick = erste Ecke · zweiter Klick = gegenüberliegende Ecke', kreis: 'Klick = Mitte · zweiter Klick = Rand (Radius)' }[z.werkzeug];
    $('sk-hinweis').textContent = z.stufe === 'zeichnen' ? hinweis + ' · Strg = ohne Raster · Esc = abbrechen'
      : 'Maus ziehen = Tiefe (grüner Pfeil) · Zahl eingeben geht auch · Enter = Körper erstellen · Esc = abbrechen';
  }

  // ---------- Ablauf ----------
  function start() {
    const a = wuerfel.achsen();
    z = { stufe: 'zeichnen', werkzeug: z?.werkzeug ?? 'linie', ebene: { ...a, d: 0 }, punkte: [], zeiger: null, tiefe: -10, op: 'plus' };
    // WARUM gerade Ansicht: gezeichnet wird auf der Ebene senkrecht zum Blick — schräg sähe man die Fläche verzerrt (Inventor „Ansicht auf Skizze“)
    wuerfel.drehNach(a.n, a.ey);
    steuer.mouseButtons.LEFT = null;
    gruppe.visible = true;
    meldung('Skizze: Ebene ' + ebenenName(a.n) + ' — Fläche zeichnen. Andere Ebene: erst mit dem Würfel die Ansicht wählen, dann neu starten.');
    neuZeichnen();
  }
  function ebenenName(n) { const i = n.findIndex((v) => v !== 0); return ['Seite (YZ)', 'Draufsicht (XZ)', 'Vorderansicht (XY)'][i]; }
  function schliessen() {
    const u = umriss(false);
    if (u.length < 3) { meldung(z.werkzeug === 'linie' ? 'Mindestens 3 Punkte für eine Fläche' : 'Noch einen Klick setzen'); return; }
    const xs = u.map((q) => q[0]), ys = u.map((q) => q[1]);
    if (Math.max(...xs) - Math.min(...xs) < 0.2 || Math.max(...ys) - Math.min(...ys) < 0.2) { meldung('Die Fläche ist zu schmal'); return; }
    if (z.werkzeug !== 'linie') z.punkte = u; // Rechteck/Kreis werden zum Linienzug (gleiche Weiterverarbeitung)
    z.werkzeug = 'linie'; z.stufe = 'ziehen'; z.zeiger = null;
    // Schräg blicken, damit man die Tiefe sieht (gerade von vorn wäre der Pfeil ein Punkt)
    const { ex, ey, n } = z.ebene;
    wuerfel.drehNach(V(n).multiplyScalar(0.75).addScaledVector(V(ex), 0.5).addScaledVector(V(ey), 0.42));
    meldung('Fläche fertig — jetzt nach hinten ziehen (Maus) oder Tiefe eingeben');
    neuZeichnen();
  }
  function erstellen() {
    const k = koerper(); if (!k) return;
    if (Math.abs(z.tiefe) < 0.1) { meldung('Tiefe 0 — erst ziehen'); return; }
    const { id, ...daten } = k;
    beenden(); fertig(daten);
  }
  function beenden() { z = null; gruppe.visible = false; neuZeichnen(); steuer.mouseButtons.LEFT = THREE.MOUSE.ROTATE; steuer.enabled = true; leinwand.style.cursor = ''; zeigeLeiste(); }
  function abbrechen() { if (!z) return; beenden(); meldung('Skizze abgebrochen'); }

  // ---------- Maus ----------
  let unten = null;
  leinwand.addEventListener('pointerdown', (e) => {
    unten = null; // WARUM zuerst: ein alter Wert würde sonst beim Klick auf den Würfel einen Punkt setzen
    if (!z || e.button !== 0 || wuerfel.ueber(e.clientX, e.clientY)) return;
    unten = { x: e.clientX, y: e.clientY };
    if (z.stufe === 'ziehen') { z.ziehtTiefe = true; steuer.enabled = false; leinwand.setPointerCapture(e.pointerId); }
  });
  leinwand.addEventListener('pointermove', (e) => {
    if (!z) return;
    if (z.stufe === 'zeichnen') { z.zeiger = aufEbene(e.clientX, e.clientY, e.ctrlKey); neuZeichnen(); return; }
    if (!z.ziehtTiefe) return;
    // Nächster Punkt der Pfeil-Geraden (Mitte + n·t) zum Mausstrahl → t = Tiefe
    const { n } = z.ebene, ray = strahlVon(e.clientX, e.clientY), a = welt(mitte()), nn = V(n);
    const w0 = a.clone().sub(ray.origin), b = nn.dot(ray.direction), dd = nn.dot(w0), ee = ray.direction.dot(w0), nenner = 1 - b * b;
    if (Math.abs(nenner) < 1e-4) return;
    const t = (b * ee - dd) / nenner;
    z.tiefe = e.ctrlKey ? Math.round(t * 100) / 100 : Math.round(t * 2) / 2 || 0;
    neuZeichnen();
  });
  leinwand.addEventListener('pointerup', (e) => {
    if (!z || e.button !== 0) return;
    if (z.ziehtTiefe) { z.ziehtTiefe = false; steuer.enabled = true; return; }
    if (!unten || Math.hypot(e.clientX - unten.x, e.clientY - unten.y) > 5 || z.stufe !== 'zeichnen') return;
    const q = aufEbene(e.clientX, e.clientY, e.ctrlKey); if (!q) return;
    if (z.werkzeug === 'linie') {
      if (z.punkte.length >= 3) { const [px, py] = bildpunkt(z.punkte[0]); if (Math.hypot(px - e.clientX, py - e.clientY) < SCHLIESS_PX) { schliessen(); return; } }
      const l = z.punkte.at(-1); if (!l || l[0] !== q[0] || l[1] !== q[1]) z.punkte.push(q);
    } else {
      z.punkte.push(q);
      if (z.punkte.length === 2) { schliessen(); return; }
    }
    neuZeichnen();
  });
  leinwand.addEventListener('dblclick', () => { if (z?.stufe === 'zeichnen' && z.werkzeug === 'linie') { z.zeiger = null; schliessen(); } });

  function taste(e) {
    if (!z) return false;
    if (e.key === 'Escape') { abbrechen(); return true; }
    if (e.key === 'Enter') { z.stufe === 'zeichnen' ? schliessen() : erstellen(); return true; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && z.stufe === 'zeichnen') { z.punkte.pop(); neuZeichnen(); return true; }
    return ['w', 'e', 's', 'm', 'p', 'delete', 'backspace'].includes(e.key.toLowerCase()); // Werkstatt-Tasten ruhen in der Skizze
  }

  // ---------- Leiste verdrahten ----------
  for (const w of ['linie', 'rechteck', 'kreis']) $('sk-' + w).addEventListener('click', () => { z.werkzeug = w; z.punkte = []; neuZeichnen(); });
  $('sk-schliessen').addEventListener('click', () => schliessen());
  $('sk-abbrechen').addEventListener('click', abbrechen);
  $('sk-abbrechen2').addEventListener('click', abbrechen);
  $('sk-fertig').addEventListener('click', erstellen);
  $('sk-zurueck').addEventListener('click', () => { z.stufe = 'zeichnen'; wuerfel.drehNach(z.ebene.n, z.ebene.ey); neuZeichnen(); });
  $('sk-umdrehen').addEventListener('click', () => { z.tiefe = -z.tiefe; neuZeichnen(); });
  $('sk-op').addEventListener('click', () => { z.op = z.op === 'minus' ? 'plus' : 'minus'; neuZeichnen(); });
  $('sk-tiefe').addEventListener('change', (e) => { z.tiefe = +e.target.value || 0; e.target.blur(); neuZeichnen(); });
  $('sk-d').addEventListener('change', (e) => { z.ebene.d = Math.round((+e.target.value || 0) * 2) / 2; e.target.blur(); neuZeichnen(); });

  return { start, aktiv: () => !!z, abbrechen, taste, get zustand() { return z && JSON.parse(JSON.stringify({ ...z })); },
    // Debug/Prüfung: Punkte direkt setzen (Ebenen-Koordinaten) und schließen
    zeichneDirekt(punkte, tiefe) { if (!z) start(); z.werkzeug = 'linie'; z.punkte = punkte.map((q) => [...q]); schliessen(); if (tiefe !== undefined) { z.tiefe = tiefe; neuZeichnen(); } },
    erstellen };
}
