// ZWECK: Form-Werkstatt (Runde 16) — eigene Formen modellieren: Körper aus Vorlagen ansetzen, schieben/drehen/Größe ziehen
//        (Griffe), Spanten einzeln formen (Breite, Höhe, Rundung, Fase, Versatz → Übergänge eckig ↔ rund), Plus/Minus,
//        Spiegeln an der Mittelebene, verschweißen (CSG), Andockpunkte setzen, speichern → konfig/formen/<name>.json.
//        Gespeicherte Formen erscheinen in der Werft als Module („Eigene Formen“).
// ABLAUF: Form (Daten, src/sim/form/form.js) → rohe Körper (koerperGeometrie, je Körper ein Netz, sofort) und — 250 ms
//         nach der letzten Änderung — verschweißtes Netz (formGeometrie, CSG). Beim Ziehen sieht man die rohen Körper.
// REGEL: Daten nur über form.js (normalisiere/pruefe/formZuModul). Rückgängig = ganze Schnappschüsse. Zwischenstand im
//        localStorage. Lehren R15: Rückmeldung bei jeder Auswahl, Hilfe dauerhaft sichtbar, Punkte durch den Rumpf sichtbar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { erstelleRenderer } from '../grafik/renderer.js';
import { materialien } from '../grafik/schiff/bauteile.js';
import { koerperGeometrie } from '../grafik/form/koerper.js';
import { formGeometrie } from '../grafik/form/schweissen.js';
import { VORLAGEN, neuerKoerper, normalisiere, pruefe, formZuModul, huelle, koerperMatrix, profilPunkte } from '../sim/form/form.js';
import { BEISPIEL_FORMEN } from '../sim/form/beispiele.js';

const $ = (id) => document.getElementById(id);
const ZWISCHEN = 'schwarmfront-werkstatt-form';
const RAD = Math.PI / 180;
const ARTEN = [['anbau', 'Anbau'], ['rumpf', 'Rumpf'], ['bug', 'Bug'], ['heck', 'Heck'], ['kommando', 'Kommando'], ['uebergang', 'Übergang'], ['hangar', 'Hangar'], ['turm', 'Turm']];
const MATS = [['rumpf', 'Rumpf hell'], ['dunkel', 'Rumpf dunkel'], ['metall', 'Metall'], ['duese', 'Düse'], ['schacht', 'Schacht'], ['warn', 'Warnfarbe']];
const RICHTUNGEN = [['0,0,1', 'vorn +Z'], ['0,0,-1', 'hinten −Z'], ['0,1,0', 'oben +Y'], ['0,-1,0', 'unten −Y'], ['1,0,0', 'links +X'], ['-1,0,0', 'rechts −X']];
const FARBE = { rumpf: 0x4aa8ff, anbau: 0x6ad27a, turm: 0xf2c070 };

// ---------------- Szene ----------------
const bild = erstelleRenderer($('leinwand'));
const { scene, camera } = bild;
camera.position.set(45, 28, 55);
const steuer = new OrbitControls(camera, $('leinwand'));
steuer.enableDamping = true; steuer.dampingFactor = 0.12; steuer.minDistance = 3; steuer.maxDistance = 800;
steuer.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
const mats = materialien();
const minusMat = new THREE.MeshBasicMaterial({ color: 0xe06040, transparent: true, opacity: 0.28, depthWrite: false });
const auswahlMat = new THREE.MeshBasicMaterial({ color: 0xf2c070, wireframe: true, transparent: true, opacity: 0.35 });
bild.setzeSchattenRadius(60); bild.folgeSchatten(new THREE.Vector3());

// Raster (1 m fein, 5 m grob) auf y = 0 und Mittelebene x = 0 (Spiegel) als Bezug
const raster = new THREE.GridHelper(120, 120, 0x3a3020, 0x1c1810); raster.material.transparent = true; raster.material.opacity = 0.5; scene.add(raster);
const grob = new THREE.GridHelper(120, 24, 0x6a5530, 0x3a2e1a); grob.material.transparent = true; grob.material.opacity = 0.6; scene.add(grob);
const mittelebene = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
mittelebene.rotation.y = Math.PI / 2; mittelebene.position.y = 30; scene.add(mittelebene);
const bugPfeil = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.05, 62), 8, 0xe0a040, 2.5, 1.6); scene.add(bugPfeil);

const rohGruppe = new THREE.Group(); scene.add(rohGruppe);           // je Körper ein Netz (+ Spiegelkopie)
const schweissGruppe = new THREE.Group(); scene.add(schweissGruppe); // verschweißtes Ergebnis
const hilfsGruppe = new THREE.Group(); scene.add(hilfsGruppe);       // Spant-Ring, Andockmarken
const griff = new TransformControls(camera, $('leinwand'));
griff.setTranslationSnap(0.5); griff.setRotationSnap(15 * RAD); griff.setScaleSnap(0.05);
scene.add(griff.getHelper());

// ---------------- Zustand ----------------
let form = ladeZwischenstand() ?? normalisiere(BEISPIEL_FORMEN[0]);
const zurueck = [], vor = [];
let gewaehlt = form.koerper[0]?.id ?? null; // Körper-id
let spantNr = 0;
let verschweisst = true;
let ziehen = false;
let schweissUhr = 0, schweissInfo = null;
const netze = new Map(); // Körper-id → Mesh (Original, Griff hängt daran)

function kopie(x) { return JSON.parse(JSON.stringify(x)); }
function ladeZwischenstand() {
  try { const f = JSON.parse(localStorage.getItem(ZWISCHEN)); return f && Array.isArray(f.koerper) ? normalisiere(f) : null; } catch { return null; }
}
const koerper = () => form.koerper.find((k) => k.id === gewaehlt) ?? null;
const naechsteId = () => form.koerper.reduce((m, k) => Math.max(m, k.id), -1) + 1;

// ---------------- Ändern ----------------
function aendere(neu, { merken = true } = {}) {
  if (merken) { zurueck.push(kopie(form)); if (zurueck.length > 150) zurueck.shift(); vor.length = 0; }
  form = normalisiere(neu);
  if (!form.koerper.some((k) => k.id === gewaehlt)) gewaehlt = form.koerper.at(-1)?.id ?? null;
  const k = koerper(); if (k) spantNr = Math.min(spantNr, k.spanten.length - 1);
  try { localStorage.setItem(ZWISCHEN, JSON.stringify(form)); } catch { /* ohne Zwischenstand */ }
  neuZeichnen();
}
/** Einen Körper ändern: fn bekommt eine Kopie und gibt sie (geändert) zurück. */
function aendereKoerper(id, fn, opt) { aendere({ ...form, koerper: form.koerper.map((k) => (k.id === id ? fn(kopie(k)) : k)) }, opt); }
function rueckgaengig() { if (!zurueck.length) return; vor.push(kopie(form)); aendere(zurueck.pop(), { merken: false }); }
function wiederholen() { if (!vor.length) return; zurueck.push(kopie(form)); aendere(vor.pop(), { merken: false }); }

// ---------------- Zeichnen ----------------
function setzeLage(obj, k) {
  obj.position.set(...k.pos);
  obj.rotation.set(k.dreh[0] * RAD, k.dreh[1] * RAD, k.dreh[2] * RAD, 'XYZ');
  obj.scale.set(1, 1, 1);
}
function neuZeichnen() {
  griff.detach();
  rohGruppe.clear(); netze.clear();
  for (const k of form.koerper) {
    const geo = koerperGeometrie(k); // zwischengespeichert (Schiffbauer, Schlüssel = Spanten)
    const mat = k.op === 'minus' ? minusMat : mats[k.mat] ?? mats.rumpf;
    const netz = new THREE.Mesh(geo, mat); setzeLage(netz, k);
    netz.castShadow = netz.receiveShadow = k.op === 'plus';
    netz.userData.id = k.id; rohGruppe.add(netz); netze.set(k.id, netz);
    if (k.spiegel) {
      // WARUM Gruppe mit scale.x = −1: three dreht bei negativer Skalierung die Vorderseiten selbst um
      const sp = new THREE.Group(); sp.scale.x = -1;
      const n2 = new THREE.Mesh(geo, mat); setzeLage(n2, k); n2.userData.id = k.id; n2.userData.spiegel = true;
      n2.castShadow = n2.receiveShadow = k.op === 'plus';
      sp.add(n2); rohGruppe.add(sp);
    }
  }
  const k = koerper();
  if (k && netze.has(k.id)) griff.attach(netze.get(k.id));
  zeigeHilfen();
  zeigeTafeln();
  sichtbarkeit();
  clearTimeout(schweissUhr);
  schweissGruppe.clear(); schweissInfo = null;
  if (verschweisst) schweissUhr = setTimeout(schweisse, 250);
}

function schweisse() {
  schweissGruppe.traverse((o) => o.geometry?.dispose());
  schweissGruppe.clear();
  if (!form.koerper.some((k) => k.op === 'plus')) { sichtbarkeit(); return; }
  const t0 = performance.now();
  let geos;
  try { geos = formGeometrie(form, { schweissen: true }); } catch (f) { zeigeMeldungKurz('Verschweißen fehlgeschlagen — Einzelteile werden gezeigt'); console.error(f); sichtbarkeit(); return; }
  schweissInfo = { ms: performance.now() - t0, ...(geos.info ?? {}) };
  for (const [mat, geo] of Object.entries(geos)) {
    if (!geo?.isBufferGeometry) continue;
    const netz = new THREE.Mesh(geo, mats[mat] ?? mats.rumpf); netz.castShadow = netz.receiveShadow = true;
    schweissGruppe.add(netz);
  }
  sichtbarkeit(); zeigeWerte();
}

/** Beim Ziehen und in der Ansicht „Einzelteile“ die rohen Körper zeigen, sonst das verschweißte Netz. */
function sichtbarkeit() {
  const fertig = verschweisst && !ziehen && schweissGruppe.children.length > 0;
  schweissGruppe.visible = fertig;
  // WARUM Minus-Körper immer sichtbar als roter Geist: sonst findet man Ausschnitte nicht wieder
  rohGruppe.traverse((o) => { if (o.isMesh) o.visible = !fertig || form.koerper.find((k) => k.id === o.userData.id)?.op === 'minus'; });
  mittelebene.visible = form.koerper.some((k) => k.spiegel);
}

function zeigeHilfen() {
  hilfsGruppe.clear();
  const k = koerper();
  if (k) {
    // Auswahl: Drahtgitter des Körpers + Ring des aktuellen Spants
    const draht = new THREE.Mesh(netze.get(k.id).geometry, auswahlMat); setzeLage(draht, k); hilfsGruppe.add(draht);
    const s = k.spanten[spantNr];
    if (s) {
      const pts = profilPunkte(s).map(([x, y]) => new THREE.Vector3(x, y, s.z));
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd080, depthTest: false }));
      ring.renderOrder = 20; setzeLage(ring, k); hilfsGruppe.add(ring);
    }
  }
  for (const p of form.andock) {
    const n = new THREE.Vector3(...p.n), r = { S: 1.2, M: 2.4, L: 3.4 }[p.groesse] ?? 1.5;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: FARBE[p.art] ?? 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    m.position.set(...p.p).addScaledVector(n, 0.1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); m.renderOrder = 15;
    const pfeil = new THREE.ArrowHelper(n, m.position, r * 1.6, FARBE[p.art] ?? 0xffffff, r * 0.6, r * 0.4);
    hilfsGruppe.add(m, pfeil);
  }
}

// ---------------- Griffe (schieben / drehen / Größe) ----------------
griff.addEventListener('dragging-changed', (e) => {
  steuer.enabled = !e.value;
  ziehen = e.value;
  if (ziehen) { sichtbarkeit(); return; }
  // Loslassen: Lage/Größe aus dem Netz in die Daten übernehmen
  const netz = griff.object, k = koerper(); if (!netz || !k) return;
  const r2 = (x, n = 100) => Math.round(x * n) / n;
  aendereKoerper(k.id, (x) => {
    x.pos = netz.position.toArray().map((v) => r2(v));
    x.dreh = [netz.rotation.x, netz.rotation.y, netz.rotation.z].map((v) => r2(v / RAD, 10));
    const [sx, sy, sz] = netz.scale.toArray().map((v) => Math.abs(v));
    if (Math.abs(sx - 1) + Math.abs(sy - 1) + Math.abs(sz - 1) > 1e-4) {
      // WARUM in die Spanten einrechnen: „Größe ziehen“ soll die Form ändern, nicht eine Skalierung mitschleppen
      x.spanten = x.spanten.map((s) => ({ ...s, b: r2(s.b * sx), h: r2(s.h * sy), x: r2(s.x * sx), y: r2(s.y * sy), z: r2(s.z * sz) }));
    }
    return x;
  });
});
// Spiegelkopie während des Ziehens mitführen
griff.addEventListener('objectChange', () => {
  const netz = griff.object; if (!netz) return;
  rohGruppe.traverse((o) => { if (o.userData.spiegel && o.userData.id === netz.userData.id) { o.position.copy(netz.position); o.rotation.copy(netz.rotation); o.scale.copy(netz.scale); } });
});

// ---------------- Auswahl per Klick ----------------
const strahl = new THREE.Raycaster(), zeiger = new THREE.Vector2();
let gedrueckt = null;
$('leinwand').addEventListener('pointerdown', (e) => { gedrueckt = { x: e.clientX, y: e.clientY }; });
$('leinwand').addEventListener('pointerup', (e) => {
  if (!gedrueckt || Math.hypot(e.clientX - gedrueckt.x, e.clientY - gedrueckt.y) > 5 || griff.dragging) return;
  if (e.button === 2) { waehle(null); return; }
  if (e.button !== 0 || griff.axis) return; // WARUM griff.axis: Klick auf einen Griff ist kein Auswahl-Klick
  const r = $('leinwand').getBoundingClientRect();
  zeiger.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  strahl.setFromCamera(zeiger, camera);
  // WARUM rohe Netze auch wenn unsichtbar: Raycaster prüft keine Sichtbarkeit → Auswahl geht auch in der verschweißten Ansicht
  const t = strahl.intersectObjects(rohGruppe.children, true)[0];
  waehle(t ? t.object.userData.id : null);
});
$('leinwand').addEventListener('contextmenu', (e) => e.preventDefault());

function waehle(id) {
  gewaehlt = id; spantNr = 0;
  const k = koerper();
  griff.detach(); if (k && netze.has(k.id)) griff.attach(netze.get(k.id));
  zeigeHilfen(); zeigeTafeln();
  if (k) zeigeMeldungKurz(`${VORLAGEN[k.typ]?.name ?? 'Körper'} ${k.id} gewählt — W schieben, E drehen, S Größe ziehen, rechts Spanten formen`);
}

// ---------------- Körper ansetzen ----------------
function setzeVorlage(name) {
  const alt = koerper(), id = naechsteId();
  // WARUM neben dem gewählten Körper: so „setzt man an“ statt alles im Ursprung zu stapeln
  let pos = [0, 0, 0];
  if (alt) { const h = huelle(alt); pos = [alt.pos[0], alt.pos[1], Math.round(h.max[2] + 5)]; }
  const k = neuerKoerper(name, id, { pos });
  aendere({ ...form, koerper: [...form.koerper, k] });
  waehle(id);
  zielAuf(id);
}
/** Kamera-Ziel auf einen Körper legen, Blickrichtung und Abstand bleiben (Spieltest R16: neue Körper lagen außerhalb des Bildes). */
function zielAuf(id) {
  const k = form.koerper.find((x) => x.id === id); if (!k) return;
  const h = huelle(k), m = new THREE.Vector3(...[0, 1, 2].map((i) => (h.min[i] + h.max[i]) / 2));
  const versatz = camera.position.clone().sub(steuer.target);
  const groesse = Math.max(...[0, 1, 2].map((i) => h.max[i] - h.min[i]));
  if (versatz.length() > groesse * 6) versatz.setLength(Math.max(20, groesse * 3)); // nicht winzig in der Ferne
  steuer.target.copy(m); camera.position.copy(m).add(versatz);
}

// ---------------- Tafeln ----------------
function zeigeTafeln() {
  $('f-name').value = form.name; $('f-art').value = form.art;
  $('k-ansicht').textContent = verschweisst ? 'Ansicht: verschweißt (V)' : 'Ansicht: Einzelteile (V)';
  $('k-ansicht').classList.toggle('aktiv', verschweisst);
  // Körperliste
  const liste = $('koerperliste'); liste.innerHTML = '';
  for (const k of form.koerper) {
    const z = document.createElement('div'); z.className = 'k' + (k.id === gewaehlt ? ' aktiv' : '');
    z.innerHTML = `<span>${k.op === 'minus' ? '<span class="minus">−</span> ' : ''}${VORLAGEN[k.typ]?.name ?? k.typ} ${k.id}${k.spiegel ? ' ⇋' : ''}</span><small>${k.spanten.length} Sp.</small>`;
    z.addEventListener('click', () => waehle(k.id));
    liste.append(z);
  }
  // Körper
  const k = koerper();
  $('k-tafel').classList.toggle('aus', !k);
  if (k) {
    $('k-titel').textContent = `${VORLAGEN[k.typ]?.name ?? k.typ} ${k.id}`;
    $('k-op').textContent = k.op === 'minus' ? 'Minus (schneidet aus)' : 'Plus (Material)';
    $('k-op').classList.toggle('minus', k.op === 'minus');
    $('k-mat').value = k.mat; $('k-spiegel').checked = k.spiegel;
    ['x', 'y', 'z'].forEach((a, i) => { $('k-p' + a).value = k.pos[i]; $('k-r' + a).value = k.dreh[i]; });
    zeigeSpant(k);
  }
  zeigeAndock();
  zeigeWerte();
}

const SPANT_REGLER = [
  ['b', 'Breite', 0.2, 80, 0.1, ' m'], ['h', 'Höhe', 0.2, 60, 0.1, ' m'], ['rundung', 'Rundung', 0, 1, 0.01, ''], ['fase', 'Fase', 0, 1, 0.01, ''],
  ['x', 'Versatz seitl.', -20, 20, 0.1, ' m'], ['y', 'Versatz hoch', -20, 20, 0.1, ' m'], ['z', 'Lage längs', -100, 100, 0.5, ' m'],
];
function zeigeSpant(k) {
  const s = k.spanten[spantNr];
  $('s-titel').textContent = `${spantNr + 1} / ${k.spanten.length}`;
  const box = $('spant'); box.innerHTML = '';
  for (const [feld, name, min, max, schritt, einheit] of SPANT_REGLER) {
    const z = document.createElement('div'); z.className = 'regler';
    const wert = s[feld] ?? 0;
    // WARUM Bereich um den aktuellen Wert (Spieltest R16, Muss): fester Bereich 0,2–80 m war zu grob (85 px = 60 m).
    // Maße: 0 … max(20, 2,5 × Wert); Versatz/Lage: ± max(10, 2 × |Wert|). Nach jedem Zug neu gelegt → beliebig groß erreichbar.
    const [lo, hi] = einheit && feld !== 'z' && !['x', 'y'].includes(feld) ? [min, Math.max(20, Math.ceil(wert * 2.5))]
      : einheit ? [-Math.max(10, Math.ceil(Math.abs(wert) * 2)), Math.max(10, Math.ceil(Math.abs(wert) * 2))] : [min, max];
    const genau = schritt < 0.1 ? 2 : 1;
    z.innerHTML = `<span>${name}</span><input type="range" min="${lo}" max="${hi}" step="${einheit ? 0.5 : 0.05}" value="${wert}"><input type="number" step="${einheit ? 0.5 : 0.05}" value="${+wert.toFixed(genau)}">`;
    const [regler, feldEin] = z.querySelectorAll('input');
    // Während des Ziehens nur Vorschau (rohe Körper), beim Loslassen in den Rückgängig-Stapel
    regler.addEventListener('input', () => { feldEin.value = +(+regler.value).toFixed(genau); setzeSpantFeld(k.id, feld, +regler.value, false); });
    regler.addEventListener('change', () => setzeSpantFeld(k.id, feld, +regler.value, true));
    feldEin.addEventListener('change', () => { setzeSpantFeld(k.id, feld, +feldEin.value, true); feldEin.blur(); });
    box.append(z);
  }
}
let vorschauMerken = null;
function setzeSpantFeld(id, feld, wert, fertig) {
  // WARUM ein Merkpunkt je Zug: ein Regler-Zug soll ein Rückgängig-Schritt sein, nicht hundert
  if (!vorschauMerken) vorschauMerken = kopie(form);
  const alle = $('s-alle').checked && feld !== 'z';
  const neu = { ...form, koerper: form.koerper.map((k) => k.id !== id ? k : { ...k, spanten: k.spanten.map((s, i) => (alle || i === spantNr ? { ...s, [feld]: wert } : s)) }) };
  ziehen = !fertig;
  if (fertig) { zurueck.push(vorschauMerken); vor.length = 0; vorschauMerken = null; aendere(neu, { merken: false }); }
  else { form = normalisiere(neu); schnellZeichnen(id); }
}
/** Nur den einen Körper neu bauen (Regler-Vorschau), ohne Tafeln und Verschweißen. */
function schnellZeichnen(id) {
  const k = form.koerper.find((x) => x.id === id); if (!k) return;
  const geo = koerperGeometrie(k);
  rohGruppe.traverse((o) => { if (o.isMesh && o.userData.id === id) o.geometry = geo; });
  sichtbarkeit(); zeigeHilfen();
}

function zeigeAndock() {
  const box = $('andock'); box.innerHTML = '';
  form.andock.forEach((p, i) => {
    const z = document.createElement('div'); z.className = 'punkt'; z.style.borderColor = '#' + (FARBE[p.art] ?? 0xffffff).toString(16).padStart(6, '0');
    z.innerHTML = `<div class="zeile"><input type="number" step="0.5" value="${p.p[0]}"><input type="number" step="0.5" value="${p.p[1]}"><input type="number" step="0.5" value="${p.p[2]}">
      <button title="Punkt löschen">×</button></div>
      <div class="zeile"><select class="r">${RICHTUNGEN.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>
      <select class="g"><option>S</option><option>M</option><option>L</option></select>
      <select class="a"><option value="rumpf">Rumpf</option><option value="anbau">Anbau</option><option value="turm">Turm</option></select>
      <label class="haken" title="Stecker = dieses Teil wird angesteckt (Buchse sitzt am Schiff)"><input type="checkbox" class="s"> Stecker</label></div>`;
    const [px, py, pz] = z.querySelectorAll('input[type=number]');
    z.querySelector('.r').value = p.n.join(','); z.querySelector('.g').value = p.groesse; z.querySelector('.a').value = p.art;
    z.querySelector('.s').checked = !!p.stecker;
    const setze = (aenderung) => aendere({ ...form, andock: form.andock.map((q, j) => (j === i ? { ...q, ...aenderung } : q)) });
    [px, py, pz].forEach((inp) => inp.addEventListener('change', () => setze({ p: [+px.value, +py.value, +pz.value] })));
    z.querySelector('.r').addEventListener('change', (e) => setze({ n: e.target.value.split(',').map(Number), u: undefined }));
    z.querySelector('.g').addEventListener('change', (e) => setze({ groesse: e.target.value }));
    z.querySelector('.a').addEventListener('change', (e) => setze({ art: e.target.value, dreh: undefined }));
    z.querySelector('.s').addEventListener('change', (e) => setze({ stecker: e.target.checked }));
    z.querySelector('button').addEventListener('click', () => aendere({ ...form, andock: form.andock.filter((_, j) => j !== i) }));
    box.append(z);
  });
  if (!form.andock.length) box.innerHTML = '<div class="klein">Noch keine — ohne Andockpunkt geht die Form in der Werft nur als Startteil.</div>';
}
/** Neuer Andockpunkt am Vorderende des gewählten Körpers (Mitte der Endfläche), Rumpf-Art bei Rumpfformen. */
function neuerAndockpunkt() {
  const k = koerper();
  if (!k) { zeigeMeldungKurz('Erst einen Körper wählen — der Punkt kommt an sein Vorderende'); return; }
  const h = huelle(k, koerperMatrix(k)), m = [0, 1, 2].map((i) => (h.min[i] + h.max[i]) / 2);
  const rumpf = ['rumpf', 'bug', 'heck', 'uebergang', 'kommando'].includes(form.art);
  aendere({ ...form, andock: [...form.andock, { id: 'p' + form.andock.length, p: [m[0], m[1], h.max[2]], n: [0, 0, 1], groesse: rumpf ? 'M' : 'S', art: rumpf ? 'rumpf' : 'anbau' }] });
  zeigeMeldungKurz('Andockpunkt gesetzt — rechts Lage, Richtung, Größe und Art einstellen');
}

const zahl = (x, n = 1) => (+x).toLocaleString('de-DE', { maximumFractionDigits: n, minimumFractionDigits: n });
function zeigeWerte() {
  const modul = formZuModul(form);
  const h = modul.quader.reduce((a, q) => ({ min: a.min.map((v, i) => Math.min(v, q.min[i])), max: a.max.map((v, i) => Math.max(v, q.max[i])) }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const mass = modul.quader.length ? [0, 1, 2].map((i) => h.max[i] - h.min[i]) : [0, 0, 0];
  const reihen = [
    ['Körper', form.koerper.length], ['Länge · Breite · Höhe', `${zahl(mass[2])} · ${zahl(mass[0])} · ${zahl(mass[1])} m`],
    ['Masse (geschätzt)', zahl(modul.werte.masse, 0) + ' t'], ['Andockpunkte', form.andock.length],
    ['Verschweißen', !verschweisst ? 'aus (Einzelteile)' : schweissInfo ? `${zahl(schweissInfo.ms, 0)} ms${schweissInfo.dreiecke ? ' · ' + zahl(schweissInfo.dreiecke, 0) + ' Dreiecke' : ''}${schweissInfo.offeneKanten ? ' · ' + schweissInfo.offeneKanten + ' offene Kanten' : ''}` : '…'],
  ];
  $('werte').innerHTML = reihen.map(([a, b]) => `<div class="reihe"><span>${a}</span><b>${b}</b></div>`).join('');
  const liste = $('meldungen'); liste.innerHTML = '';
  for (const m of pruefe(form)) {
    const z = document.createElement('div'); z.className = 'm ' + m.stufe; z.textContent = m.text;
    if (m.id !== undefined) { z.dataset.nr = m.id; z.addEventListener('click', () => waehle(m.id)); }
    liste.append(z);
  }
}

let meldungsUhr = 0;
function zeigeMeldungKurz(text) {
  const el = $('meldung'); el.textContent = text; el.classList.toggle('sichtbar', !!text);
  clearTimeout(meldungsUhr); if (text) meldungsUhr = setTimeout(() => el.classList.remove('sichtbar'), 3000);
}

// ---------------- Bedienelemente verdrahten ----------------
for (const [name, v] of Object.entries(VORLAGEN)) {
  const b = document.createElement('button'); b.textContent = v.name; b.title = 'Neuen Körper ansetzen (neben dem gewählten)';
  b.addEventListener('click', () => setzeVorlage(name)); $('vorlagen').append(b);
}
$('f-art').innerHTML = ARTEN.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
$('k-mat').innerHTML = MATS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
$('k-beispiel').innerHTML = '<option value="">Beispiele …</option>' + BEISPIEL_FORMEN.map((f, i) => `<option value="${i}">${f.name}</option>`).join('');
$('f-name').addEventListener('change', (e) => aendere({ ...form, name: e.target.value.trim() || 'Form' }));
$('f-art').addEventListener('change', (e) => aendere({ ...form, art: e.target.value }));
$('k-op').addEventListener('click', () => { const k = koerper(); if (k) aendereKoerper(k.id, (x) => ({ ...x, op: x.op === 'minus' ? 'plus' : 'minus' })); });
$('k-mat').addEventListener('change', (e) => { const k = koerper(); if (k) aendereKoerper(k.id, (x) => ({ ...x, mat: e.target.value })); });
$('k-spiegel').addEventListener('change', (e) => { const k = koerper(); if (k) aendereKoerper(k.id, (x) => ({ ...x, spiegel: e.target.checked })); });
for (const [i, a] of ['x', 'y', 'z'].entries()) {
  $('k-p' + a).addEventListener('change', (e) => { e.target.blur(); const k = koerper(); if (k) aendereKoerper(k.id, (x) => { x.pos[i] = +e.target.value; return x; }); });
  $('k-r' + a).addEventListener('change', (e) => { e.target.blur(); const k = koerper(); if (k) aendereKoerper(k.id, (x) => { x.dreh[i] = +e.target.value; return x; }); });
}
// WARUM Haken aus beim Blättern: wer einen einzelnen Spant ansteuert, will genau diesen formen (Trapez, Übergang)
const einzeln = () => { $('s-alle').checked = false; };
$('s-vor').addEventListener('click', () => { einzeln(); const k = koerper(); if (k) { spantNr = (spantNr - 1 + k.spanten.length) % k.spanten.length; zeigeHilfen(); zeigeSpant(k); } });
$('s-nach').addEventListener('click', () => { einzeln(); const k = koerper(); if (k) { spantNr = (spantNr + 1) % k.spanten.length; zeigeHilfen(); zeigeSpant(k); } });
$('s-neu').addEventListener('click', () => {
  einzeln(); const k = koerper(); if (!k) return;
  // WARUM Mittelwert: neuer Spant liegt zwischen dem aktuellen und dem nächsten → Form bleibt gleich, man kann ihn dann formen
  const a = k.spanten[spantNr], b = k.spanten[spantNr + 1] ?? null;
  const neu = b ? Object.fromEntries(Object.keys(a).map((f) => [f, (a[f] + b[f]) / 2])) : { ...a, z: a.z + 5 };
  aendereKoerper(k.id, (x) => { x.spanten.splice(spantNr + 1, 0, neu); return x; });
  spantNr++; zeigeSpant(koerper()); zeigeHilfen();
});
$('s-weg').addEventListener('click', () => {
  const k = koerper(); if (!k) return;
  if (k.spanten.length <= 2) { zeigeMeldungKurz('Ein Körper braucht mindestens 2 Spanten'); return; }
  aendereKoerper(k.id, (x) => { x.spanten.splice(spantNr, 1); return x; });
});
$('k-kopie').addEventListener('click', dupliziere);
function schalteSchweissen() {
  verschweisst = !verschweisst;
  zeigeMeldungKurz(verschweisst ? 'Verschweißt — alle Körper sind ein Teil' : 'Einzelteile — jeder Körper für sich');
  neuZeichnen();
}
$('k-ansicht').addEventListener('click', schalteSchweissen);
$('hilfe-knopf').addEventListener('click', () => $('hilfe').classList.toggle('versteckt'));
$('k-loeschen').addEventListener('click', loescheKoerper);
$('a-neu').addEventListener('click', neuerAndockpunkt);
$('k-neu').addEventListener('click', () => { aendere({ name: 'Neue Form', art: 'anbau', koerper: [], andock: [] }); gewaehlt = null; zeigeMeldungKurz('Leere Werkstatt — links eine Vorlage wählen'); });
$('k-beispiel').addEventListener('change', (e) => { const i = e.target.value; e.target.value = ''; if (i === '') return; aendere(kopie(BEISPIEL_FORMEN[+i])); waehle(form.koerper[0]?.id ?? null); fokus(); });
$('k-speichern').addEventListener('click', () => speichern());
$('k-werft').addEventListener('click', async () => { if (await speichern()) location.href = '/werft.html'; });
$('k-laden').addEventListener('focus', fuelleListe);
$('k-laden').addEventListener('change', async (e) => {
  const name = e.target.value; e.target.value = ''; if (!name) return;
  try {
    const r = await fetch('/api/formen/' + encodeURIComponent(name)); const d = await r.json();
    if (!r.ok) throw new Error(d.fehler);
    aendere(d); waehle(form.koerper[0]?.id ?? null); fokus(); zeigeMeldungKurz(`„${form.name}“ geladen`);
  } catch (f) { zeigeMeldungKurz('Laden fehlgeschlagen: ' + (f.message || 'Dev-Server?')); }
});
async function fuelleListe() {
  try { const namen = await (await fetch('/api/formen')).json(); $('k-laden').innerHTML = '<option value="">Laden …</option>' + namen.map((n) => `<option>${n.replace(/</g, '&lt;')}</option>`).join(''); } catch { /* ohne Dev-Server */ }
}
async function speichern() {
  const fehler = pruefe(form).filter((m) => m.stufe === 'fehler');
  try {
    const r = await fetch('/api/formen/' + encodeURIComponent(form.name), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await r.json(); if (!r.ok) throw new Error(d.fehler);
    $('f-datei').textContent = 'gespeichert: ' + d.datei;
    zeigeMeldungKurz(fehler.length ? `Gespeichert (mit Fehlern): ${d.datei}` : `Gespeichert: ${d.datei} — erscheint in der Werft unter „Eigene Formen“`);
    return true;
  } catch (f) { zeigeMeldungKurz('Speichern fehlgeschlagen: ' + (f.message || 'Dev-Server?')); return false; }
}
function dupliziere() {
  const k = koerper(); if (!k) return;
  const id = naechsteId(), h = huelle(k);
  aendere({ ...form, koerper: [...form.koerper, { ...kopie(k), id, pos: [k.pos[0], k.pos[1], Math.round(k.pos[2] + (h.max[2] - h.min[2]) + 2)] }] });
  waehle(id);
}
function loescheKoerper() {
  const k = koerper(); if (!k) return;
  aendere({ ...form, koerper: form.koerper.filter((x) => x.id !== k.id) }); waehle(null);
  zeigeMeldungKurz('Körper gelöscht — Strg+Z holt ihn zurück');
}
function fokus() {
  const box = new THREE.Box3(); rohGruppe.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
  const m = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const r = box.isEmpty() ? 30 : Math.max(12, box.getSize(new THREE.Vector3()).length());
  steuer.target.copy(m); camera.position.copy(m).add(new THREE.Vector3(0.7, 0.45, 0.8).normalize().multiplyScalar(r * 1.1));
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  const strg = e.ctrlKey || e.metaKey, t = e.key.toLowerCase();
  if (e.key === 'Escape' && gewaehlt !== null) { waehle(null); e.preventDefault(); return; }
  if (strg && t === 'z') { e.preventDefault(); e.shiftKey ? wiederholen() : rueckgaengig(); return; }
  if (strg && t === 'y') { e.preventDefault(); wiederholen(); return; }
  if (strg && t === 's') { e.preventDefault(); speichern(); return; }
  if (strg && t === 'd') { e.preventDefault(); dupliziere(); return; }
  if (strg) { griff.setTranslationSnap(null); griff.setRotationSnap(null); return; } // Strg halten = ohne Raster
  if (t === 'w') griff.setMode('translate');
  else if (t === 'e') griff.setMode('rotate');
  else if (t === 's') griff.setMode('scale');
  else if (t === 'v') schalteSchweissen();
  else if (t === 'm') { const k = koerper(); if (k) aendereKoerper(k.id, (x) => ({ ...x, spiegel: !x.spiegel })); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); loescheKoerper(); }
  else if (t === 'f') fokus();
  else if (t === 'h') $('hilfe').classList.toggle('versteckt');
}, { capture: true });
addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') { griff.setTranslationSnap(0.5); griff.setRotationSnap(15 * RAD); } });

// ---------------- Start ----------------
neuZeichnen(); fokus(); waehle(gewaehlt);
$('laden').remove();
function schleife() { steuer.update(); bild.zeichnen(); requestAnimationFrame(schleife); }
requestAnimationFrame(schleife);

// CLAUDE.md Regel 6: Debug-Zugang
window.spiel = {
  get form() { return kopie(form); },
  get info() { return schweissInfo; },
  lade(f) { aendere(kopie(f)); fokus(); },
  setze: setzeVorlage, waehle, rueckgaengig, wiederholen, fokus, speichern,
  spant(feld, wert) { const k = koerper(); if (k) setzeSpantFeld(k.id, feld, wert, true); },
  ansicht(r = [0.7, 0.45, 0.8]) { const m = steuer.target.clone(), d = camera.position.distanceTo(m); camera.position.copy(m).add(new THREE.Vector3(...r).normalize().multiplyScalar(d)); steuer.update(); bild.zeichnen(); },
  messwerte: () => { bild.zeichnen(); return bild.messwerte(); },
};
