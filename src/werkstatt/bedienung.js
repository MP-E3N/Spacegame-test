// ZWECK: Bedienung der Form-Werkstatt „Anfassen statt Einstellen“ (Runde 18, Nutzer: „Editor nicht intuitiv, Bearbeitung
//        fummelig“; Vorbilder nach Recherche: SketchUp/Shapr3D Push/Pull, Tinkercad Arbeitsebene).
//        1) PUSH/PULL: Fläche des GEWÄHLTEN Körpers leuchtet unter der Maus; linke Maus ziehen = Fläche heraus/hinein.
//           Maß am Mauszeiger, Raster 0,5 m (Strg = frei), rastet bündig an Flächen anderer Körper ein. Zahl tippen +
//           Enter = genaue Zugweite (auch direkt nach dem Loslassen: der letzte Zug wird auf die Zahl gesetzt).
//        2) SETZEN: Vorlage gewählt → Geist folgt der Maus und liegt bündig auf der Fläche darunter (ohne Fläche auf dem
//           Boden-Raster) → Klick setzt, Esc/Rechtsklick bricht ab.
// LIEFERT: erstelleBedienung(ctx) → { setzen(vorlage), abbrechen(), aktiv(), taste(e) → bool, setztGerade(), zieht() }
//          ctx = { scene, camera, leinwand, steuer, rohGruppe, wuerfel, griff, holeForm(), koerper(), waehle(id),
//                  vorschau(id, k), uebernehme(merk), setzeForm(form, merk), platziere(k), meldung(t), darf() }
// REGEL: Rechnung NUR über src/sim/form/ziehen.js (flaecheVon, ziehe, flaechenMass, ablegen) — hier nur Maus, Strahl und
//        Anzeige. Ereignisse werden auf window in der Einfang-Phase abgefangen, BEVOR OrbitControls/TransformControls sie
//        sehen; was wir nicht brauchen, läuft unverändert weiter (Kamera drehen, Griffe, Auswahl).
import * as THREE from 'three';
import { flaecheVon, ziehe, flaechenMass, ablegen } from '../sim/form/ziehen.js';
import { huelle, normalisiere, neuerKoerper, koerperListe, NAMEN } from '../sim/form/form.js';
import { koerperGeometrie } from '../grafik/form/koerper.js';

const $ = (id) => document.getElementById(id);
const KLICK_PX = 5;      // weniger Bewegung = Klick (wählen/setzen), mehr = Ziehen
const BUENDIG_PX = 14;   // so nah (im Bild) rastet die gezogene Fläche bündig an eine andere Fläche
const zahl = (x, n = 1) => (+x).toLocaleString('de-DE', { maximumFractionDigits: n, minimumFractionDigits: n });

export function erstelleBedienung(ctx) {
  const { scene, camera, leinwand, rohGruppe } = ctx;
  const strahl = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // Leuchtfläche: Dreiecke der Fläche unter der Maus — WARUM polygonOffset statt depthTest aus: die Fläche soll nur
  // dort leuchten, wo man sie sieht (hinter anderen Körpern nicht), aber ohne Flimmern auf der eigenen Oberfläche
  const hellMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, toneMapped: false });
  const hell = new THREE.Mesh(new THREE.BufferGeometry(), hellMat); hell.matrixAutoUpdate = false; hell.renderOrder = 12; hell.visible = false; scene.add(hell);
  const geistMat = new THREE.MeshStandardMaterial({ color: 0x9ad27a, transparent: true, opacity: 0.5, roughness: 0.7 });
  const geist = new THREE.Mesh(new THREE.BufferGeometry(), geistMat); geist.visible = false; scene.add(geist);
  const pfeil = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 4, 0x4aa8ff, 1.2, 0.7);
  pfeil.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.toneMapped = false; } o.renderOrder = 30; });
  pfeil.visible = false; scene.add(pfeil);
  const mass = $('zugmass');

  let hover = null;   // { id, netz, f, schluessel }
  let unten = null;   // { x, y, art: 'flaeche' | 'setzen', … } — Maus gedrückt, noch nicht entschieden: Klick oder Zug
  let zug = null;     // laufender Push/Pull: { id, netz, f, basis, merk, o (Welt), r (Welt), d, buendig }
  let letzter = null; // letzter fertiger Zug (für Zahl + Enter danach): { id, f, basis, merk }
  let eingabe = '';   // getippte Zahl
  let setzen = null;  // { vorlage, k (pos 0), h, pos }

  // ---------- Hilfen ----------
  function strahlVon(cx, cy) {
    const r = leinwand.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    strahl.setFromCamera(ndc, camera); return strahl;
  }
  const schluesselVon = (f) => (f ? f.art + '|' + (f.ende ?? '') + '|' + (f.achse ?? '') + '|' + (f.vz ?? '') + '|' + (f.j ?? '') : '');
  const alleNetze = (id) => { const l = []; rohGruppe.traverse((o) => { if (o.isMesh && o.userData.id === id) l.push(o); }); return l; };

  /** Treffer auf dem Netz eines Körpers → Fläche (über ziehen.js, Körper-Koordinaten aus der Netz-Matrix inkl. Spiegel). */
  function flaecheAus(t, k) {
    const inv = t.object.matrixWorld.clone().invert();
    const p = t.point.clone().applyMatrix4(inv), n = t.face.normal.clone(); // face.normal ist schon im Netz-Raum
    return flaecheVon(k, p.toArray(), n.toArray(), t.faceIndex);
  }

  /** Leuchtfläche: alle Dreiecke des Netzes, die zur selben Fläche gehören (Mitte + Normale je Dreieck eingeordnet). */
  function zeigeHell(netz, k, f) {
    const g = netz.geometry, pos = g.attributes.position, ix = g.index, schl = schluesselVon(f), punkte = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    const anzahl = (ix ? ix.count : pos.count) / 3;
    for (let t = 0; t < anzahl; t++) {
      const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      m.copy(a).add(b).add(c).multiplyScalar(1 / 3); n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
      if (schluesselVon(flaecheVon(k, m.toArray(), n.toArray(), t)) === schl) punkte.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    hell.geometry.dispose();
    hell.geometry = new THREE.BufferGeometry(); hell.geometry.setAttribute('position', new THREE.Float32BufferAttribute(punkte, 3));
    hell.matrix.copy(netz.matrixWorld); hell.matrixWorld.copy(netz.matrixWorld); hell.visible = punkte.length > 0;
  }

  // ---------- Hover ----------
  function hoverAn(cx, cy) {
    const k = ctx.koerper();
    if (!k || k.fest || !ctx.darf()) { aus(); return; }
    const t = strahlVon(cx, cy).intersectObjects(alleNetze(k.id), false)[0];
    // WARUM nur der gewählte Körper: „erst wählen, dann ziehen“ — sonst dreht man beim Kamera-Ziehen aus Versehen Flächen
    // anderer Körper heraus. Andere Körper: Klick wählt, Ziehen dreht die Kamera.
    // Verdeckt? Erster Treffer aller rohen Netze (auch in der verschweißten Ansicht da) — Minus-Körper verdecken nicht
    const form = ctx.holeForm();
    const vorne = strahlVon(cx, cy).intersectObjects(rohGruppe.children, true).find((x) => x.object.userData.id === k.id || form.koerper.find((y) => y.id === x.object.userData.id)?.op !== 'minus');
    if (!t || (vorne && vorne.object.userData.id !== k.id && vorne.distance < t.distance - 0.01)) { aus(); return; }
    const f = flaecheAus(t, k); if (!f) { aus(); return; }
    const schl = k.id + '#' + t.object.uuid + '#' + schluesselVon(f) + '#' + JSON.stringify(k.spanten);
    if (hover?.schl !== schl) { hover = { id: k.id, netz: t.object, f, schl }; zeigeHell(t.object, k, f); }
    leinwand.style.cursor = 'grab';
  }
  function aus() { if (hover) { hover = null; hell.visible = false; leinwand.style.cursor = ''; } }

  // ---------- Push/Pull ----------
  function startZug(e) {
    const k = ctx.koerper(); if (!k || !hover) return;
    const netz = hover.netz; netz.updateWorldMatrix(true, false);
    const t = strahlVon(unten.x, unten.y).intersectObject(netz, false)[0]; if (!t) return;
    const f = hover.f, r = new THREE.Vector3(...f.richtung).transformDirection(netz.matrixWorld).normalize();
    zug = { id: k.id, netz, f, basis: JSON.parse(JSON.stringify(k)), merk: JSON.parse(JSON.stringify(ctx.holeForm())), o: t.point.clone(), r, d: 0, buendig: null };
    letzter = null; eingabe = '';
    ctx.steuer.enabled = false; leinwand.style.cursor = 'grabbing';
    try { leinwand.setPointerCapture(e.pointerId); } catch { /* Maus schon weg */ }
    bewegeZug(e);
  }
  /** Zugweite aus der Maus: nächster Punkt der Zug-Geraden (o + r·d) zum Mausstrahl. */
  function zugweite(cx, cy) {
    const ray = strahlVon(cx, cy).ray, w0 = zug.o.clone().sub(ray.origin), b = zug.r.dot(ray.direction);
    const nenner = 1 - b * b; if (Math.abs(nenner) < 1e-4) return zug.d; // Blick genau längs der Zugrichtung: nichts ändern
    return (b * ray.direction.dot(w0) - zug.r.dot(w0)) / nenner;
  }
  /** Bündig-Einrasten (SketchUp-„Inferenz“): nur bei achsparalleler Zugrichtung, gegen Hüllflächen aller anderen Körper. */
  function buendig(d) {
    const i = [0, 1, 2].find((a) => Math.abs(zug.r.getComponent(a)) > 0.999); if (i === undefined) return null;
    const s = Math.sign(zug.r.getComponent(i)), ziel = zug.o.getComponent(i) + s * d;
    const form = ctx.holeForm(); let best = null;
    for (const { k, lage } of koerperListe(form)) {
      if (k.id === zug.id) continue;
      const h = huelle(k, lage);
      for (const c of [h.min[i], h.max[i]]) {
        // Abstand im Bild abschätzen: 1 m in Zugrichtung an der Fläche → Pixel
        const px = Math.abs(c - ziel) * pxJeMeter();
        if (px < BUENDIG_PX && (!best || px < best.px)) best = { px, d: (c - zug.o.getComponent(i)) * s, id: k.id };
      }
    }
    return best;
  }
  function pxJeMeter() {
    const a = zug.o.clone().project(camera), b = zug.o.clone().add(zug.r).project(camera), r = leinwand.getBoundingClientRect();
    return Math.max(1e-3, Math.hypot((b.x - a.x) * r.width / 2, (b.y - a.y) * r.height / 2));
  }
  function bewegeZug(e) {
    let d = zugweite(e.clientX, e.clientY);
    d = e.ctrlKey ? Math.round(d * 100) / 100 : Math.round(d * 2) / 2;
    const bu = !e.ctrlKey && buendig(d); zug.buendig = null;
    if (bu) { d = Math.round(bu.d * 1000) / 1000; zug.buendig = bu.id; }
    wendeAn(d);
    zeigeMass(e.clientX, e.clientY);
  }
  function wendeAn(d) {
    const { koerper: neu, d: echt } = ziehe(zug.basis, zug.f, d);
    zug.d = echt; zug.neu = neu;
    ctx.vorschau(zug.id, neu);
    pfeil.position.copy(zug.o).addScaledVector(zug.r, echt); pfeil.setDirection(echt < 0 ? zug.r.clone().negate() : zug.r); pfeil.visible = true;
    hell.visible = false;
  }
  function endeZug(abbrechen = false) {
    const z = zug; zug = null; pfeil.visible = false; ctx.steuer.enabled = true; leinwand.style.cursor = '';
    if (abbrechen || !z.d) { ctx.setzeForm(z.merk, null); versteckeMass(); return; }
    ctx.uebernehme(z.merk);
    letzter = { id: z.id, f: z.f, basis: z.basis, merk: z.merk };
    zeigeMass(null, null, z);
  }
  /** Zahl + Enter: Zugweite genau setzen — während des Zugs oder für den letzten Zug (wie SketchUp). */
  function zahlAnwenden() {
    const d = parseFloat(eingabe.replace(',', '.')); eingabe = '';
    if (!Number.isFinite(d)) { versteckeMass(); return; }
    if (zug) { wendeAn(d); endeZug(); return; }
    if (!letzter) return;
    const { koerper: neu, d: echt } = ziehe(letzter.basis, letzter.f, d);
    const form = ctx.holeForm();
    ctx.setzeForm({ ...form, koerper: form.koerper.map((k) => (k.id === letzter.id ? neu : k)) }, null);
    ctx.meldung(echt === d ? `Zugweite auf ${zahl(d)} m gesetzt` : `Zugweite ${zahl(echt)} m (begrenzt — Mindestmaß 0,1 m)`);
    zeigeMass(null, null, { ...letzter, d: echt, neu });
  }

  // ---------- Maßanzeige am Mauszeiger ----------
  let massLage = [0, 0];
  function zeigeMass(cx, cy, z = zug) {
    if (cx !== null) { const r = leinwand.getBoundingClientRect(); massLage = [cx - r.left + 18, cy - r.top + 14]; }
    const neu = z.neu ?? ctx.koerper(); if (!neu) return;
    const name = z.f.art === 'kappe' ? 'Länge' : z.f.art === 'seite' ? (z.f.achse === 'x' ? 'Breite' : 'Höhe') : 'Maß';
    const wert = flaechenMass(neu, z.f);
    mass.innerHTML = `<b>${z.d > 0 ? '+' : ''}${zahl(z.d, 2)} m</b> · ${name} ${zahl(wert, 2)} m`
      + (z.buendig !== undefined && z.buendig !== null ? `<br><span class="buendig">bündig mit Körper ${z.buendig}</span>` : '')
      + (eingabe ? `<br>Zugweite: <b>${eingabe}▌</b> m — Enter` : `<br><span>Zahl tippen + Enter = genau</span>`);
    mass.style.left = massLage[0] + 'px'; mass.style.top = massLage[1] + 'px'; mass.classList.add('sichtbar');
  }
  function versteckeMass() { mass.classList.remove('sichtbar'); }

  // ---------- Setzen (Tinkercad-Arbeitsebene) ----------
  function startSetzen(vorlage) {
    abbrechen();
    const k = normalisiere({ koerper: [neuerKoerper(vorlage, -1, { pos: [0, 0, 0] })] }).koerper[0];
    setzen = { vorlage, k, h: huelle(k), pos: null };
    geist.geometry = koerperGeometrie(k); geist.visible = false;
    ctx.meldung(`${NAMEN[vorlage] ?? vorlage}: auf eine Fläche zeigen und klicken (Esc = abbrechen)`);
  }
  function bewegeSetzen(cx, cy) {
    const st = strahlVon(cx, cy);
    const t = st.intersectObjects(rohGruppe.children, true).find((x) => x.object.isMesh);
    let treffer;
    if (t) {
      const n = t.face.normal.clone().transformDirection(t.object.matrixWorld).toArray();
      const i = [0, 1, 2].reduce((b, a) => (Math.abs(n[a]) > Math.abs(n[b]) ? a : b), 0), nn = [0, 0, 0]; nn[i] = Math.sign(n[i]) || 1;
      treffer = { p: t.point.toArray(), n: nn };
    } else {
      const p = new THREE.Vector3(); if (!st.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) { geist.visible = false; return; }
      treffer = { p: p.toArray(), n: [0, 1, 0] };
    }
    setzen.pos = ablegen(setzen.h, treffer);
    geist.position.set(...setzen.pos); geist.visible = true;
  }
  function setzeAb() {
    if (!setzen?.pos) return;
    const k = { ...setzen.k, pos: setzen.pos };
    setzen = null; geist.visible = false;
    ctx.platziere(k);
  }

  // ---------- Ereignisse (Einfang-Phase auf window: vor Kamera und Griffen) ----------
  const aufLeinwand = (e) => e.target === leinwand;
  addEventListener('pointerdown', (e) => {
    if (!aufLeinwand(e) || ctx.wuerfel.ueber(e.clientX, e.clientY)) return;
    if (setzen) {
      if (e.button === 2) { abbrechen(); ctx.meldung('Setzen abgebrochen'); e.stopPropagation(); return; }
      if (e.button === 0) unten = { x: e.clientX, y: e.clientY, art: 'setzen' }; // Ziehen dreht weiter die Kamera
      return;
    }
    if (e.button !== 0 || !hover || ctx.griff.axis) return;
    unten = { x: e.clientX, y: e.clientY, art: 'flaeche', id: hover.id };
    e.stopPropagation(); // WARUM: Kamera und Griffe sollen diesen Druck nicht bekommen — er gehört der Fläche
  }, { capture: true });
  addEventListener('pointermove', (e) => {
    if (zug) { bewegeZug(e); return; }
    if (unten?.art === 'flaeche' && Math.hypot(e.clientX - unten.x, e.clientY - unten.y) > KLICK_PX) { startZug(e); return; }
    if (!aufLeinwand(e)) return;
    if (setzen) { bewegeSetzen(e.clientX, e.clientY); return; }
    if (!unten) hoverAn(e.clientX, e.clientY);
  }, { capture: true });
  addEventListener('pointerup', (e) => {
    const u = unten; unten = null;
    if (zug) { endeZug(); e.stopPropagation(); return; }
    if (!u) return;
    const klick = Math.hypot(e.clientX - u.x, e.clientY - u.y) <= KLICK_PX;
    if (u.art === 'setzen' && klick) { bewegeSetzen(e.clientX, e.clientY); setzeAb(); e.stopPropagation(); return; }
    if (u.art === 'flaeche' && klick) { ctx.waehle(u.id); e.stopPropagation(); } // Klick auf die Fläche = Körper wählen (bleibt gewählt)
  }, { capture: true });

  function taste(e) {
    if (setzen && e.key === 'Escape') { abbrechen(); ctx.meldung('Setzen abgebrochen'); return true; }
    if (zug && e.key === 'Escape') { endeZug(true); ctx.meldung('Zug abgebrochen'); return true; }
    if (!zug && !letzter) return false;
    if (/^[0-9]$/.test(e.key) || ((e.key === ',' || e.key === '.') && !/[,.]/.test(eingabe)) || (e.key === '-' && !eingabe)) {
      eingabe += e.key; zeigeMass(null, null, zug ?? { ...letzter, d: 0 }); return true;
    }
    if (e.key === 'Backspace' && eingabe) { eingabe = eingabe.slice(0, -1); zeigeMass(null, null, zug ?? { ...letzter, d: 0 }); return true; }
    if (e.key === 'Enter' && eingabe) { zahlAnwenden(); return true; }
    if (e.key === 'Escape' && letzter) { letzter = null; eingabe = ''; versteckeMass(); return true; }
    return false;
  }
  /** Andere Aktion (Auswahl, Rückgängig …) → kein „letzter Zug“ mehr. */
  function vergiss() { letzter = null; eingabe = ''; if (!zug) versteckeMass(); aus(); }
  function abbrechen() {
    if (zug) endeZug(true);
    setzen = null; geist.visible = false; unten = null; vergiss();
  }

  return { setzen: startSetzen, abbrechen, vergiss, taste, aktiv: () => !!(zug || setzen), setztGerade: () => !!setzen, zieht: () => !!zug,
    // Debug/Prüfung: Fläche unter einem Bildpunkt und Zug ohne Maus
    flaecheBei(cx, cy) { hoverAn(cx, cy); return hover && { id: hover.id, ...hover.f }; },
    get hover() { return hover; } };
}
