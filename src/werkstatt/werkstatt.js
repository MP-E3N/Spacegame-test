// ZWECK: Form-Werkstatt (Runde 16) — eigene Formen modellieren: Körper aus Vorlagen ansetzen, schieben/drehen/Größe ziehen
//        (Griffe), Spanten einzeln formen (Breite, Höhe, Rundung, Fase, Versatz → Übergänge eckig ↔ rund), Plus/Minus,
//        Spiegeln an der Mittelebene, verschweißen (CSG), Andockpunkte setzen, speichern → konfig/formen/<name>.json.
//        Gespeicherte Formen erscheinen in der Werft als Module („Eigene Formen“).
//        Runde 17 (Schnellrunde ohne Team, Nutzerwunsch): Skizze zeichnen + ziehen (skizze.js), Punkte an Kanten setzen und
//        ziehen (Taste P), Spiegeln an drei Ebenen (verbunden oder als eigene Kopie), Ansichtswürfel (ansichtswuerfel.js).
//        Runde 18 „Anfassen statt Einstellen“ (bedienung.js): Push/Pull auf Flächen, Setzen auf die Fläche unter der Maus,
//        Symmetrie als ein Schalter (Standard an), Werkzeugleiste am gewählten Teil, Details unter „Mehr“, rechte Maus dreht.
// ABLAUF: Form (Daten, src/sim/form/form.js) → rohe Körper (koerperGeometrie, je Körper ein Netz, sofort) und — 250 ms
//         nach der letzten Änderung — verschweißtes Netz (formGeometrie, CSG). Beim Ziehen sieht man die rohen Körper.
// REGEL: Daten nur über form.js (normalisiere/pruefe/formZuModul). Rückgängig = ganze Schnappschüsse. Zwischenstand im
//        localStorage. Lehren R15: Rückmeldung bei jeder Auswahl, Hilfe dauerhaft sichtbar, Punkte durch den Rumpf sichtbar.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { erstelleRenderer, STIMMUNGEN } from '../grafik/renderer.js';
import { stimmungsKnopf } from '../menue/stimmung.js';
import { materialien } from '../grafik/schiff/bauteile.js';
import { koerperGeometrie } from '../grafik/form/koerper.js';
import { formGeometrie } from '../grafik/form/schweissen.js';
import { VORLAGEN, neuerKoerper, normalisiere, pruefe, formZuModul, huelle, koerperMatrix, profilPunkte, koerperListe, NAMEN, ACHSEN,
  alsPunkte, fuegePunktEin, loeschePunkt, spiegelKoerper, verschiebePunkte, fuegeSpantEin, loescheSpant, klappeKoerper } from '../sim/form/form.js';
import { erstelleAnsichtswuerfel } from './ansichtswuerfel.js';
import { erstelleSkizze } from './skizze.js';
import { erstelleBedienung } from './bedienung.js';
import { BAUTEILE, passtAuf, FLAECHEN, pruefeSchiff } from '../sim/form/bauteile.js';
import { bauteilGrafik } from '../grafik/form/schiff.js';
import { bauteilListe } from '../sim/form/form.js';
import { BEISPIEL_FORMEN } from '../sim/form/beispiele.js';
import { erstelleGeneratorTafel } from './generator-tafel.js';
import { erstelleKantenWerkzeug } from './kanten.js';

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
// WARUM rechts auch drehen (R18): links auf einer Fläche des gewählten Körpers zieht die Fläche (Push/Pull) — die Kamera
// dreht man dann mit links im Leeren oder mit rechts überall (wie Tinkercad)
steuer.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
const mats = materialien();
const minusMat = new THREE.MeshBasicMaterial({ color: 0xe06040, transparent: true, opacity: 0.28, depthWrite: false });
const auswahlMat = new THREE.MeshBasicMaterial({ color: 0xf2c070, wireframe: true, transparent: true, opacity: 0.35 });
bild.setzeSchattenRadius(60); bild.folgeSchatten(new THREE.Vector3());

// Raster (1 m fein, 5 m grob) auf y = 0 und Mittelebene x = 0 (Spiegel) als Bezug
// R21: Farben je Stimmung (Weltall/Studio, Lichtsetzer STIMMUNGEN[name].raster) — WARUM neu bauen statt umfärben:
// GridHelper trägt die Farben als Vertex-Farben; neu bauen nur beim Umschalten (Klick), gleicher Materialtyp = kein neues Programm
let raster = null, grob = null;
function baueRaster(name) {
  for (const g of [raster, grob]) if (g) { scene.remove(g); g.geometry.dispose(); g.material.dispose(); }
  const r = STIMMUNGEN[name]?.raster ?? STIMMUNGEN.weltall.raster;
  raster = new THREE.GridHelper(120, 120, r.feinMitte, r.fein); raster.material.transparent = true; raster.material.opacity = r.feinDeckkraft; scene.add(raster);
  grob = new THREE.GridHelper(120, 24, r.grobMitte, r.grob); grob.material.transparent = true; grob.material.opacity = r.grobDeckkraft; scene.add(grob);
}
baueRaster('weltall');
// Spiegelebenen x = 0 / y = 0 / z = 0 — sichtbar, sobald ein Körper an ihnen gespiegelt wird
const ebenenMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
const mittelebenen = ACHSEN.map((a) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 60), ebenenMat);
  if (a === 'x') { m.rotation.y = Math.PI / 2; m.position.y = 30; } else if (a === 'y') { m.rotation.x = -Math.PI / 2; m.scale.y = 2; } else m.position.y = 30;
  scene.add(m); return m;
});
const bugPfeil = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.05, 62), 8, 0xe0a040, 2.5, 1.6); scene.add(bugPfeil);

const rohGruppe = new THREE.Group(); scene.add(rohGruppe);           // je Körper ein Netz (+ Spiegelkopie)
const schweissGruppe = new THREE.Group(); scene.add(schweissGruppe); // verschweißtes Ergebnis
const hilfsGruppe = new THREE.Group(); scene.add(hilfsGruppe);       // Spant-Ring, Andockmarken
const bauteilGruppe = new THREE.Group(); scene.add(bauteilGruppe);   // R19: Geschütze, Triebwerke (+ Spiegelkopien)
const markerGruppe = new THREE.Group(); scene.add(markerGruppe);     // R19: Schwerpunkt, Schubpunkt, Schubpfeil
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
let punkteModus = false;  // Taste P: Punkte des aktuellen Spants ziehen, + an Kanten, Rechtsklick löscht
let punktZug = null;      // { j, merk (Form vor dem Zug), basis (Körper zu Zugbeginn) }
// R18: Werkzeug des gewählten Körpers — 'ziehen' (Flächen anfassen, Standard) | 'schieben' | 'drehen' | 'groesse' (Griffe)
let modus = 'ziehen';
let bauteilWahl = null;   // R19: gewähltes Bauteil (b.id) — statt eines Körpers
let schiffPruefung = null; // R19: pruefeSchiff(form) — Flugwerte, Meldungen, flugtauglich
// WARUM let oben statt const unten (Prüfer R18): ?. schützt nicht vor der „temporal dead zone“ — so sind die drei vor
// ihrer Erzeugung (Ende der Datei) einfach null
let wuerfel = null, skizze = null, bedienung = null;
let kantenWerkzeug = null, kantenArt = null; // R21: Fase/Rundung an Kanten (Schiffbauer, src/werkstatt/kanten.js)
let mehrOffen = false;    // rechte Tafel: Körper-Details (Spanten, Punkte, Lage …) nur auf Wunsch
const SYM = 'schwarmfront-werkstatt-symmetrie';
let symmetrie = localStorage.getItem(SYM) !== 'aus'; // Standard an (KSP/Space Engineers: Symmetrie ist EIN Schalter)
const punktGruppe = new THREE.Group(); scene.add(punktGruppe);

function kopie(x) { return JSON.parse(JSON.stringify(x)); }
function ladeZwischenstand() {
  try { const f = JSON.parse(localStorage.getItem(ZWISCHEN)); return f && Array.isArray(f.koerper) ? normalisiere(f) : null; } catch { return null; }
}
const koerper = () => form.koerper.find((k) => k.id === gewaehlt) ?? null;
const naechsteId = () => form.koerper.reduce((m, k) => Math.max(m, k.id), -1) + 1;

// ---------------- Ändern ----------------
function aendere(neu, { merken = true } = {}) {
  bedienung?.fremd(); // Prüfer R18: sonst überschriebe „Zahl + Enter“ später eine Zwischenänderung aus altem Stand
  if (merken) { zurueck.push(kopie(form)); if (zurueck.length > 150) zurueck.shift(); vor.length = 0; }
  form = normalisiere(neu);
  if (!form.koerper.some((k) => k.id === gewaehlt)) gewaehlt = form.koerper.at(-1)?.id ?? null;
  const k = koerper(); if (k) spantNr = Math.min(spantNr, k.spanten.length - 1);
  try { localStorage.setItem(ZWISCHEN, JSON.stringify(form)); } catch { /* ohne Zwischenstand */ }
  neuZeichnen();
}
/** Einen Körper ändern: fn bekommt eine Kopie und gibt sie (geändert) zurück. */
function aendereKoerper(id, fn, opt) { aendere({ ...form, koerper: form.koerper.map((k) => (k.id === id ? fn(kopie(k)) : k)) }, opt); }
function rueckgaengig() { bedienung?.vergiss(); if (!zurueck.length) return; vor.push(kopie(form)); aendere(zurueck.pop(), { merken: false }); }
function wiederholen() { bedienung?.vergiss(); if (!vor.length) return; zurueck.push(kopie(form)); aendere(vor.pop(), { merken: false }); }

// ---------------- Zeichnen ----------------
function setzeLage(obj, k) {
  obj.position.set(...k.pos);
  obj.rotation.set(k.dreh[0] * RAD, k.dreh[1] * RAD, k.dreh[2] * RAD, 'XYZ');
  obj.scale.set(1, 1, 1);
}
function neuZeichnen() {
  griff.detach();
  rohGruppe.clear(); netze.clear();
  for (const { k, lage } of koerperListe(form)) {
    const geo = koerperGeometrie(k); // zwischengespeichert (Schiffbauer, Schlüssel = Spanten)
    const mat = k.op === 'minus' ? minusMat : mats[k.mat] ?? mats.rumpf;
    const netz = new THREE.Mesh(geo, mat); setzeLage(netz, k);
    netz.castShadow = netz.receiveShadow = k.op === 'plus';
    netz.userData.id = k.id;
    if (!lage.spiegel) { rohGruppe.add(netz); netze.set(k.id, netz); continue; }
    // WARUM Gruppe mit negativer Skalierung: three dreht bei negativer Determinante die Vorderseiten selbst um
    const sp = new THREE.Group(); sp.scale.set(...lage.spiegel);
    netz.userData.spiegel = true; sp.add(netz); rohGruppe.add(sp);
  }
  zeigeBauteile();
  const k = koerper();
  haengeGriff();
  zeigeHilfen();
  zeigeTafeln();
  clearTimeout(schweissUhr);
  schweissGruppe.clear(); schweissInfo = null;
  sichtbarkeit(); // WARUM nach dem Leeren: sonst blieben die rohen Körper bis zum Verschweißen (250 ms) unsichtbar (Bild leer)
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
  ACHSEN.forEach((a, i) => { mittelebenen[i].visible = form.koerper.some((k) => k.spiegel.includes(a)); });
  // R21: auf hellem Studio-Grund wirkte die blaue Ebene als grauer Balken — dort nur angedeutet
  ebenenMat.opacity = document.body.classList.contains('studio') ? 0.025 : 0.05;
  passeEbenenAn();
}
/**
 * Spiegelebenen an die Größe der Form anpassen. WARUM (Spieltest R20, Kann): die feste 120 × 60-m-Ebene stand bei einem
 * 280-m-Träger als blaue Wand mitten im Rumpf und ragte weit über ihn hinaus — jetzt knapp größer als die Form.
 */
function passeEbenenAn() {
  const box = new THREE.Box3(); rohGruppe.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
  if (box.isEmpty()) return;
  const g = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const lz = Math.max(20, g.z * 1.15), hy = Math.max(10, g.y * 1.3), bx = Math.max(20, g.x * 1.3);
  const [ex, ey, ez] = mittelebenen;
  ex.scale.set(lz / 120, hy / 60, 1); ex.position.set(0, c.y, c.z);            // Ebene x = 0: Länge × Höhe
  ey.scale.set(bx / 120, lz / 60, 1); ey.position.set(c.x, 0, c.z);            // Ebene y = 0: Breite × Länge
  ez.scale.set(bx / 120, hy / 60, 1); ez.position.set(c.x, c.y, 0);            // Ebene z = 0: Breite × Höhe
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
  zeigePunkte();
  for (const p of form.andock) {
    const n = new THREE.Vector3(...p.n), r = { S: 1.2, M: 2.4, L: 3.4 }[p.groesse] ?? 1.5;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), new THREE.MeshBasicMaterial({ color: FARBE[p.art] ?? 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    m.position.set(...p.p).addScaledVector(n, 0.1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); m.renderOrder = 15;
    const pfeil = new THREE.ArrowHelper(n, m.position, r * 1.6, FARBE[p.art] ?? 0xffffff, r * 0.6, r * 0.4);
    hilfsGruppe.add(m, pfeil);
  }
}

// ---------------- Punkte an Kanten (Runde 17) ----------------
// WARUM Sprites ohne Größenabnahme: die Griffe bleiben bei jedem Zoom gleich groß und liegen über dem Rumpf (depthTest aus)
const punktMat = new THREE.SpriteMaterial({ color: 0xffd080, sizeAttenuation: false, depthTest: false, toneMapped: false });
const punktZugMat = new THREE.SpriteMaterial({ color: 0x9ad27a, sizeAttenuation: false, depthTest: false, toneMapped: false });
const plusMat = new THREE.SpriteMaterial({ map: plusTextur(), sizeAttenuation: false, depthTest: false, toneMapped: false });
function plusTextur(farbe = '#9ad27a') {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(20, 30, 20, 0.85)'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
  g.strokeStyle = farbe; g.lineWidth = 5; g.stroke(); g.lineWidth = 7; g.beginPath(); g.moveTo(32, 16); g.lineTo(32, 48); g.moveTo(16, 32); g.lineTo(48, 32); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const punktGesperrtMat = new THREE.SpriteMaterial({ color: 0x8a7a5a, transparent: true, opacity: 0.7, sizeAttenuation: false, depthTest: false, toneMapped: false });
const spantPlusMat = new THREE.SpriteMaterial({ map: plusTextur('#6ab4ff'), sizeAttenuation: false, depthTest: false, toneMapped: false });
// Punkte, die entlang der Blickachse hintereinander liegen (quer dazu < 1 cm), gehören zusammen — z. B. oben/unten in der
// Draufsicht, vorderer/hinterer Spant in der Vorderansicht. WARUM in 3D statt im Bild: in der Perspektive liegen sie im Bild nicht aufeinander
const STAPEL_M = 0.01;
const deckt = (a, b, achse) => [0, 1, 2].every((c) => achse.getComponent(c) !== 0 || Math.abs(a.getComponent(c) - b.getComponent(c)) < STAPEL_M);

/** Gerade Ansicht (über den Würfel gewählt)? Liefert die Blickachse als Einheitsvektor (Welt) oder null. */
function geradeAnsicht() {
  const d = camera.position.clone().sub(steuer.target).normalize().toArray(), i = d.reduce((b, v, j) => (Math.abs(v) > Math.abs(d[b]) ? j : b), 0);
  if (Math.abs(d[i]) < 0.9995) return null; // ≈ 1,8° Spiel — WARUM: die Würfel-Fahrt nach oben steht bewusst 0,1 % neben dem Pol
  const a = [0, 0, 0]; a[i] = Math.sign(d[i]); return new THREE.Vector3(...a);
}
const alleNetze = (id) => { const l = []; rohGruppe.traverse((o) => { if (o.isMesh && o.userData.id === id) l.push(o); }); return l; };
/** Weltlage von Punkt j des Spants i eines Körpers in einem seiner Netze (Original oder Spiegelkopie). */
function weltPunkt(netz, k, i, j) { const s = k.spanten[i], q = profilPunkte(s)[j]; return new THREE.Vector3(q[0], q[1], s.z).applyMatrix4(netz.matrixWorld); }

/**
 * Punkte aller Spanten an Original UND Spiegelkopien (Nutzer R17b). Ziehen nur in gerader Ansicht; sonst stumpf gezeigt.
 * Plus-Marken: Blick längs des Körpers → auf den Querschnitt-Kanten (neuer Punkt in allen Spanten); Blick quer → auf den
 * Längskanten (neuer Spant). Marken an derselben Bildstelle werden nur einmal gezeigt.
 */
let punkteAnsicht = '';
function zeigePunkte() {
  punktGruppe.clear(); punkteAnsicht = '';
  const k = koerper();
  if (!punkteModus || !k || !k.spanten[0]?.p) return;
  const netzListe = alleNetze(k.id); if (!netzListe.length) return;
  netzListe.forEach((n) => n.updateWorldMatrix(true, false));
  const achse = geradeAnsicht(), frei = !!achse && !k.fest;
  const langZ = new THREE.Vector3(0, 0, 1).transformDirection(netzListe[0].matrixWorld);
  const laengs = achse && Math.abs(langZ.dot(achse)) > 0.999, quer = achse && Math.abs(langZ.dot(achse)) < 0.001;
  punkteAnsicht = !achse ? 'schraeg' : laengs ? 'laengs' : quer ? 'quer' : 'gerade';
  const belegt = [], frei2 = (w) => { if (belegt.some((c) => deckt(c, w, achse))) return false; belegt.push(w); return true; };
  const N = k.spanten[0].p.length;
  for (const netz of netzListe) for (let i = 0; i < k.spanten.length; i++) for (let j = 0; j < N; j++) {
    const a = new THREE.Sprite(punktZug?.stapel.some((x) => x.i === i && x.j === j) ? punktZugMat : !frei ? punktGesperrtMat : punktMat);
    a.scale.setScalar(frei ? 0.024 : 0.016); a.position.copy(weltPunkt(netz, k, i, j));
    a.userData = { art: 'punkt', i, j, netz }; a.renderOrder = 40; punktGruppe.add(a);
  }
  if (!frei || punktZug) return; // WARUM beim Ziehen keine Marken: sie lägen unter dem Mauszeiger im Weg
  for (const netz of netzListe) for (let i = 0; i < k.spanten.length; i++) for (let j = 0; j < N; j++) {
    let pos, art;
    if (laengs) { pos = weltPunkt(netz, k, i, j).add(weltPunkt(netz, k, i, (j + 1) % N)).multiplyScalar(0.5); art = 'plus'; }
    else if (quer && i < k.spanten.length - 1) { pos = weltPunkt(netz, k, i, j).add(weltPunkt(netz, k, i + 1, j)).multiplyScalar(0.5); art = 'spant'; }
    else continue;
    if (!frei2(pos)) continue;
    const b = new THREE.Sprite(art === 'plus' ? plusMat : spantPlusMat); b.scale.setScalar(0.024); b.position.copy(pos);
    b.userData = { art, i, j, netz }; b.renderOrder = 41; punktGruppe.add(b);
  }
}
function schaltePunkte(an = !punkteModus) {
  const k = koerper();
  if (an && !k) { zeigeMeldungKurz('Erst einen Körper wählen — dann P für seine Punkte'); return; }
  punkteModus = an;
  if (an) {
    griff.detach();
    if (!k.spanten[0].p) aendereKoerper(k.id, alsPunkte);
    zeigeMeldungKurz(`${koerper().spanten[0].p.length} Punkte je Spant — ziehen geht nur in gerader Ansicht (Würfel-Fläche anklicken). + = neuer Punkt, blaues + = neuer Spant, Rechtsklick = löschen`);
  } else zeigeMeldungKurz('Punkte fertig — W schieben, E drehen, S Größe');
  neuZeichnen();
}
/** Alle Punkte (beliebiger Netze des Körpers), die entlang der Blickachse hinter/vor w liegen: [{ i, j, netz, welt }] — je (i, j) einmal. */
function stapelBei(k, b, netzListe, achse) {
  const aus = [], N = k.spanten[0].p.length;
  for (const netz of netzListe) for (let i = 0; i < k.spanten.length; i++) for (let j = 0; j < N; j++) {
    const w = weltPunkt(netz, k, i, j);
    if (deckt(w, b, achse) && !aus.some((x) => x.i === i && x.j === j)) aus.push({ i, j, netz, welt: w });
  }
  return aus;
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
function setzeZeiger(e) {
  const r = $('leinwand').getBoundingClientRect();
  zeiger.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  strahl.setFromCamera(zeiger, camera);
}
let gedrueckt = null;
$('leinwand').addEventListener('pointerdown', (e) => {
  gedrueckt = null;
  if (wuerfel.ueber(e.clientX, e.clientY) || skizze.aktiv()) return; // Würfel und Skizze haben eigene Mausregeln
  gedrueckt = { x: e.clientX, y: e.clientY };
  const k = koerper();
  if (!punkteModus || !k || e.button !== 0) return;
  setzeZeiger(e);
  const t = strahl.intersectObjects(punktGruppe.children)[0]; if (!t) return;
  const achse = geradeAnsicht();
  if (k.fest) { zeigeMeldungKurz('Körper ist fixiert — rechts „Lösen“, dann lassen sich Punkte ziehen'); gedrueckt = null; return; }
  if (!achse) { zeigeMeldungKurz('Punkte ziehen geht nur in gerader Ansicht — oben am Würfel eine Fläche anklicken'); return; }
  // Greifen: Punkt (samt allen, die im Bild genau darauf liegen) — oder an einer Kante einen neuen herausziehen
  const merk = kopie(form), u = t.object.userData, b0 = t.object.position.clone();
  let basis = k;
  if (u.art === 'plus') basis = fuegePunktEin(k, u.j);
  else if (u.art === 'spant') basis = fuegeSpantEin(k, u.i);
  if (basis !== k) { form = normalisiere({ ...form, koerper: form.koerper.map((x) => (x.id === k.id ? basis : x)) }); neuZeichnen(); }
  basis = koerper();
  const netzListe = alleNetze(k.id); netzListe.forEach((n) => n.updateWorldMatrix(true, false));
  const stapel = stapelBei(basis, b0, netzListe, achse); if (!stapel.length) return;
  const greif = stapel[0].welt.clone();
  punktZug = { merk, basis: kopie(basis), id: k.id, stapel, greif, achse, ebene: new THREE.Plane().setFromNormalAndCoplanarPoint(achse, greif), bewegt: basis !== k };
  ziehen = true; steuer.enabled = false; gedrueckt = null;
  $('leinwand').setPointerCapture(e.pointerId);
  zeigePunkte();
});
$('leinwand').addEventListener('pointermove', (e) => {
  if (!punktZug) { wuerfel.bewegt(e.clientX, e.clientY); return; }
  const z = punktZug; setzeZeiger(e);
  const p = new THREE.Vector3(); if (!strahl.ray.intersectPlane(z.ebene, p)) return;
  // Raster 0,25 m in der Bildebene (Welt), Strg = frei; die Blickachse bleibt wie sie war
  const r = (v) => (e.ctrlKey ? Math.round(v * 100) / 100 : Math.round(v * 4) / 4);
  const ziel = new THREE.Vector3(...p.toArray().map((v, i) => (z.achse.getComponent(i) ? z.greif.getComponent(i) : r(v))));
  const dW = ziel.sub(z.greif);
  const liste = z.stapel.map(({ i, j, netz, welt }) => {
    const inv = netz.matrixWorld.clone().invert(), a = welt.clone().applyMatrix4(inv), b = welt.clone().add(dW).applyMatrix4(inv);
    return { i, j, d: [b.x - a.x, b.y - a.y, b.z - a.z] };
  });
  const neu = verschiebePunkte(z.basis, liste);
  form = normalisiere({ ...form, koerper: form.koerper.map((x) => (x.id === z.id ? neu : x)) });
  z.bewegt = true; schnellZeichnen(z.id);
});
addEventListener('pointerup', () => {
  if (!punktZug) return;
  const z = punktZug; punktZug = null; ziehen = false; steuer.enabled = true;
  if (!z.bewegt) { neuZeichnen(); return; }
  zurueck.push(z.merk); if (zurueck.length > 150) zurueck.shift(); vor.length = 0;
  aendere(form, { merken: false });
});
$('leinwand').addEventListener('pointerup', (e) => {
  if (wuerfel.klick(e.clientX, e.clientY)) return;
  if (!gedrueckt || Math.hypot(e.clientX - gedrueckt.x, e.clientY - gedrueckt.y) > 5 || griff.dragging) return;
  setzeZeiger(e);
  if (e.button === 2) {
    // Rechtsklick auf einen Punkt = Punkt löschen (mindestens 3 bleiben)
    const t = punkteModus && geradeAnsicht() && strahl.intersectObjects(punktGruppe.children).find((x) => x.object.userData.art === 'punkt');
    if (t) {
      const k = koerper(), { i, j } = t.object.userData;
      if (k.fest) { zeigeMeldungKurz('Körper ist fixiert'); return; }
      // Blick quer zum Körper: der Punkt steht für seinen ganzen Spant → Spant löschen; sonst den Punkt (in allen Spanten)
      if (punkteAnsicht === 'quer') {
        if (k.spanten.length <= 2) zeigeMeldungKurz('Mindestens 2 Spanten bleiben');
        else { aendereKoerper(k.id, (x) => loescheSpant(x, i)); zeigeMeldungKurz('Spant gelöscht — Strg+Z holt ihn zurück'); }
      } else if (k.spanten[0].p.length <= 3) zeigeMeldungKurz('Mindestens 3 Punkte bleiben');
      else { aendereKoerper(k.id, (x) => loeschePunkt(x, j)); zeigeMeldungKurz('Punkt gelöscht — Strg+Z holt ihn zurück'); }
      return;
    }
    waehle(null); return;
  }
  if (e.button !== 0 || griff.axis) return; // WARUM griff.axis: Klick auf einen Griff ist kein Auswahl-Klick
  // WARUM rohe Netze auch wenn unsichtbar: Raycaster prüft keine Sichtbarkeit → Auswahl geht auch in der verschweißten Ansicht
  // R19: Bauteile liegen auf dem Rumpf — erst sie prüfen
  const tb = strahl.intersectObjects(bauteilGruppe.children, true).find((x) => x.object.isMesh && x.object.userData.bauteil !== undefined);
  const t = strahl.intersectObjects(rohGruppe.children, true)[0];
  if (tb && (!t || tb.distance <= t.distance + 0.5)) { waehleBauteil(tb.object.userData.bauteil); return; }
  if (bauteilWahl !== null) { bauteilWahl = null; zeigeBauteile(); }
  waehle(t ? t.object.userData.id : null);
});
$('leinwand').addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------- Bauteile, Schwerpunkt, Schubpunkt (Runde 19) ----------------
/** Geometrien einer Gruppe freigeben (Materialien sind geteilt: mats). WARUM (Prüfer R19): sonst wachsen die GPU-Puffer mit jeder Änderung. */
function gibFrei(o) { o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }
function zeigeBauteile() {
  gibFrei(bauteilGruppe); bauteilGruppe.clear();
  for (const e of bauteilListe(form)) {
    let g = null;
    try { g = bauteilGrafik(e, mats, form); } catch (f) { console.warn('Bauteil', e.b.typ, f); }
    if (!g) continue;
    g.traverse((o) => { o.userData.bauteil = e.b.id; });
    bauteilGruppe.add(g);
  }
  // Auswahl-Kasten um das gewählte Bauteil (alle Kopien)
  if (bauteilWahl !== null) for (const g of bauteilGruppe.children) if (g.userData.bauteil === bauteilWahl) bauteilGruppe.add(new THREE.BoxHelper(g, 0xf2c070));
}
function zeichen(farbe, art) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fillStyle = '#111'; g.fill(); g.lineWidth = 4; g.strokeStyle = farbe; g.stroke();
  if (art === 'schwer') { g.fillStyle = farbe; g.beginPath(); g.moveTo(32, 32); g.arc(32, 32, 24, 0, Math.PI / 2); g.fill(); g.beginPath(); g.moveTo(32, 32); g.arc(32, 32, 24, Math.PI, Math.PI * 1.5); g.fill(); }
  else { g.fillStyle = farbe; g.beginPath(); g.arc(32, 32, 10, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, sizeAttenuation: false, depthTest: false, toneMapped: false });
}
const schwerMat = zeichen('#f2c070', 'schwer'), schubMat = zeichen('#6ab4ff', 'schub');
/** Schwerpunkt (gelb, geviertelt) und Schubpunkt (blau) + Schubpfeil — wie KSP: liegt der Schub neben dem Schwerpunkt, dreht das Schiff. */
function zeigeMarker() {
  markerGruppe.clear();
  const fl = schiffPruefung?.flug; if (!fl) return;
  if (fl.schwerpunkt) { const s = new THREE.Sprite(schwerMat); s.scale.setScalar(0.04); s.position.set(...fl.schwerpunkt); s.renderOrder = 50; markerGruppe.add(s); }
  if (fl.schubpunkt) {
    const s = new THREE.Sprite(schubMat); s.scale.setScalar(0.034); s.position.set(...fl.schubpunkt); s.renderOrder = 51; markerGruppe.add(s);
    const pf = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...fl.schubpunkt), 12, 0x6ab4ff, 3, 1.6);
    pf.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.toneMapped = false; } o.renderOrder = 49; });
    markerGruppe.add(pf);
  }
}
/** Halbe Breite eines Bauteils quer zur Fläche (m) — für Einrasten und „braucht eine Spiegelkopie?“. */
function halbBreite(typ) {
  const k = BAUTEILE[typ]; if (!k) return 1;
  return k.art === 'geschuetz' ? 2.7 * (k.turm?.s ?? 1) : (k.r ?? 1) * 1.25;
}
/**
 * Einrasten beim Setzen (Spieltest R19, Muss): ein Haupttriebwerk am Klickpunkt saß meist neben dem Schwerpunkt → Schub-
 * versatz, nicht flugtauglich. Darum: Haupttriebwerke rasten quer auf die Schwerpunkt-Achse, wenn sie näher als ihre
 * Breite daran sind; jedes Bauteil rastet auf x = 0, wenn es die Mittelebene berühren würde (dann ohne Spiegelkopie).
 */
function rasteBauteil(typ, p, n) {
  const q = [...p], hb = halbBreite(typ), sp = schiffPruefung?.flug?.schwerpunkt;
  const haupt = BAUTEILE[typ]?.art === 'antrieb' && (BAUTEILE[typ].flaeche ?? []).includes('hinten');
  for (let i = 0; i < 3; i++) {
    if (n[i] !== 0) continue; // längs der Normalen bleibt der Punkt auf der Fläche
    if (haupt && sp && Math.abs(q[i] - sp[i]) < hb) q[i] = Math.round(sp[i] * 100) / 100 + 0;
    else if (i === 0 && Math.abs(q[0]) < hb) q[0] = 0;
  }
  return q;
}
function platziereBauteil(b) {
  const id = form.bauteile.reduce((m, x) => Math.max(m, x.id), -1) + 1;
  // WARUM erst ab halber Breite spiegeln (Spieltest R19, Muss): bei x = ±0,5 lagen Original und Kopie übereinander
  const neu = { id, ...b, spiegel: symmetrie && Math.abs(b.p[0]) >= halbBreite(b.typ) ? ['x'] : [] };
  aendere({ ...form, bauteile: [...form.bauteile, neu] });
  zeigeMeldungKurz(`${BAUTEILE[b.typ]?.name ?? b.typ} gesetzt${neu.spiegel.length ? ' (mit Spiegelkopie)' : ''} — weiter klicken setzt mehr, Esc beendet`);
}
function waehleBauteil(id) {
  bauteilWahl = id;
  if (id !== null) { gewaehlt = null; punkteModus = false; griff.detach(); }
  zeigeBauteile(); zeigeHilfen(); zeigeTafeln();
  const b = form.bauteile.find((x) => x.id === id);
  if (b) zeigeMeldungKurz(`${BAUTEILE[b.typ]?.name ?? b.typ} ${b.id} gewählt — Entf löscht, M schaltet die Spiegelkopie`);
}
function loescheBauteil() {
  if (bauteilWahl === null) return false;
  aendere({ ...form, bauteile: form.bauteile.filter((b) => b.id !== bauteilWahl) }); bauteilWahl = null; zeigeBauteile();
  zeigeMeldungKurz('Bauteil gelöscht — Strg+Z holt es zurück'); return true;
}
function spiegleBauteil() {
  if (bauteilWahl === null) return false;
  aendere({ ...form, bauteile: form.bauteile.map((b) => (b.id === bauteilWahl ? { ...b, spiegel: b.spiegel.includes('x') ? [] : ['x'] } : b)) }); return true;
}
async function probeflug() {
  const pr = pruefeSchiff(form, true);
  if (!pr.flugtauglich) {
    const f1 = pr.meldungen.find((m) => m.stufe === 'fehler');
    zeigeMeldungKurz('Nicht flugtauglich: ' + (f1?.text ?? '') + ' — rechts unter WERTE steht, was fehlt'); return;
  }
  if (await speichern()) location.href = '/freiflug.html?form=' + encodeURIComponent(form.name);
}
/** R21 (Nutzer: „gespeicherte Formen im Gefecht testen“): speichern und im Gefechtstest gegen die Kanonenboote fliegen. */
async function gefechtstest() {
  const pr = pruefeSchiff(form, true);
  if (!pr.flugtauglich) {
    const f1 = pr.meldungen.find((m) => m.stufe === 'fehler');
    zeigeMeldungKurz('Nicht flugtauglich: ' + (f1?.text ?? '') + ' — rechts unter WERTE steht, was fehlt'); return;
  }
  if (!form.bauteile.some((b) => BAUTEILE[b.typ]?.art === 'geschuetz')) zeigeMeldungKurz('Hinweis: ohne Geschütze wehrt sich das Schiff im Gefecht nicht');
  if (await speichern()) location.href = '/gefecht.html?form=' + encodeURIComponent(form.name);
}

/** Griffe (W/E/S) nur im passenden Werkzeug, nie bei fixierten Körpern, Punkten oder Skizze. */
function haengeGriff() {
  griff.detach();
  const k = koerper();
  if (!k || !netze.has(k.id) || modus === 'ziehen' || punkteModus || k.fest || skizze?.aktiv()) return;
  griff.setMode({ schieben: 'translate', drehen: 'rotate', groesse: 'scale' }[modus]);
  griff.attach(netze.get(k.id));
}
/** Werkzeug wechseln (Leiste am Teil oder W/E/S, Esc = zurück zu „Ziehen“). */
function setzeModus(m) {
  const k = koerper();
  if (m !== 'ziehen' && k?.fest) { zeigeMeldungKurz('Körper ist fixiert — erst lösen (L)'); m = 'ziehen'; }
  if (punkteModus) schaltePunkte(false);
  modus = m; haengeGriff(); zeigeLeiste();
  if (k) zeigeMeldungKurz({ ziehen: 'Körper ziehen = verschieben · blauer Pfeil auf der Fläche = Fläche ziehen · Zahl + Enter = genau', schieben: 'Verschieben: an den Pfeilen ziehen · Esc = zurück zu Ziehen',
    drehen: 'Drehen: an den Ringen ziehen (15°-Raster) · Esc = zurück zu Ziehen', groesse: 'Größe: an den Würfeln ziehen · Esc = zurück zu Ziehen' }[m]);
}
function waehle(id) {
  // WARUM Punkte-Modus aus bei neuer Auswahl: er würde den neuen Körper sonst ungefragt in Punkte umwandeln
  if (id !== gewaehlt && punkteModus) punkteModus = false;
  if (id !== gewaehlt) { bedienung?.vergiss(); if (id === null) modus = 'ziehen'; }
  if (id !== null && bauteilWahl !== null) { bauteilWahl = null; zeigeBauteile(); }
  gewaehlt = id; spantNr = 0;
  zeigeBauteile();
  const k = koerper();
  haengeGriff();
  zeigeHilfen(); zeigeTafeln();
  if (k) zeigeMeldungKurz(`${NAMEN[k.typ] ?? 'Körper'} ${k.id} gewählt — ziehen = verschieben · blauer Pfeil = Fläche länger/kürzer · gerade Ansicht (Würfel): Pfeile an den Seiten`);
  zeigeLeiste();
}

// ---------------- Körper ansetzen ----------------
/**
 * Symmetrie-Schalter (R18): neue Körper bekommen die verbundene Spiegelung an x = 0 — außer sie liegen quer über der
 * Mitte (dann sind sie selbst die Mitte des Schiffs, eine Kopie läge in ihnen).
 */
function mitSymmetrie(k) {
  const sp = Array.isArray(k.spiegel) ? k.spiegel : k.spiegel === true ? ['x'] : []; // neuerKoerper liefert spiegel: false
  if (!symmetrie || sp.includes('x')) return k;
  const h = huelle(normalisiere({ koerper: [k] }).koerper[0]);
  return h.min[0] < -0.01 && h.max[0] > 0.01 ? k : { ...k, spiegel: [...sp, 'x'] };
}
function platziere(k) {
  const id = naechsteId(), neu = mitSymmetrie({ ...k, id });
  aendere({ ...form, koerper: [...form.koerper, neu] });
  waehle(id);
  // WARUM den Grund nennen (Spieltest R18): „Symmetrie an“ ohne Kopie wirkte wie ein Fehler
  const sym = !symmetrie ? '' : neu.spiegel.includes('x') ? ' (mit Spiegelkopie — Symmetrie an)' : ' (ohne Spiegelkopie: liegt über der Mitte)';
  zeigeMeldungKurz(`${NAMEN[neu.typ] ?? 'Körper'} ${id} gesetzt${sym} — blauer Pfeil = Fläche ziehen, Körper ziehen = verschieben`);
}
function setzeVorlage(name) {
  const alt = koerper(), id = naechsteId();
  // WARUM neben dem gewählten Körper: so „setzt man an“ statt alles im Ursprung zu stapeln
  let pos = [0, 0, 0];
  if (alt) { const h = huelle(alt); pos = [alt.pos[0], alt.pos[1], Math.round(h.max[2] + 5)]; }
  const k = mitSymmetrie(neuerKoerper(name, id, { pos }));
  aendere({ ...form, koerper: [...form.koerper, k] });
  waehle(id);
  zielAuf(id);
}
/** Kamera-Ziel auf einen Körper legen, Blickrichtung und Abstand bleiben (Spieltest R16: neue Körper lagen außerhalb des Bildes). */
function zielAuf(id) {
  const k = form.koerper.find((x) => x.id === id); if (!k) return;
  wuerfel?.normal(); // Abstand unten gilt für den normalen Bildwinkel (Prüfer R18)
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
    z.innerHTML = `<span>${k.op === 'minus' ? '<span class="minus">−</span> ' : ''}${k.fest ? '🔒 ' : ''}${NAMEN[k.typ] ?? k.typ} ${k.id}${k.spiegel.length ? ' ⇋' : ''}</span><small>${k.spanten[0]?.p ? k.spanten[0].p.length + ' Pkt · ' : ''}${k.spanten.length} Sp.</small>`;
    z.addEventListener('click', () => waehle(k.id));
    liste.append(z);
  }
  // Körper
  const k = koerper();
  $('k-tafel').classList.toggle('aus', !k || !mehrOffen);
  $('k-mehr').classList.toggle('versteckt', !k);
  $('k-mehr').textContent = mehrOffen ? '▾ Details des Körpers ausblenden' : '▸ Details des Körpers (Spanten, Punkte, Lage …)';
  $('k-symmetrie').textContent = symmetrie ? '⇋ Symmetrie: an' : '⇋ Symmetrie: aus';
  $('k-symmetrie').classList.toggle('an', symmetrie);
  if (k) {
    $('k-titel').textContent = `${NAMEN[k.typ] ?? k.typ} ${k.id}`;
    $('k-op').textContent = k.op === 'minus' ? 'Minus (schneidet aus)' : 'Plus (Material)';
    $('k-op').classList.toggle('minus', k.op === 'minus');
    $('k-mat').value = k.mat;
    for (const a of ACHSEN) $('sv-' + a).classList.toggle('an', k.spiegel.includes(a));
    $('k-punkte').classList.toggle('an', punkteModus);
    $('k-punkte').textContent = punkteModus ? '◆ Punkte fertig (P)' : '◆ Punkte an Kanten (P)';
    $('k-punkte-weg').classList.toggle('versteckt', !k.spanten[0]?.p);
    $('k-fest').textContent = k.fest ? '🔒 Fixiert — Lösen' : '🔓 Fixieren';
    $('k-fest').classList.toggle('an', !!k.fest);
    // Fixiert: nichts, was Lage oder Form ändert (Lage, Drehung, Spanten, Umklappen, Löschen) — Ansicht, Material, Spiegeln gehen
    for (const el of document.querySelectorAll('#k-tafel .gitter3 input, #spant input, #s-neu, #s-weg, #k-loeschen, .klappen button, #k-punkte-weg')) el.disabled = !!k.fest;
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
    if (s.p && (feld === 'rundung' || feld === 'fase')) continue; // eigener Umriss: Ecken formt man mit Punkten
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
  if (form.koerper.find((k) => k.id === id)?.fest) { zeigeMeldungKurz('Körper ist fixiert'); return; }
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
  sichtbarkeit(); zeigeHilfen(); zeigeMasse();
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

/**
 * Dichtheit fürs Werte-Feld. WARUM der Flächenschluss entscheidet (R17): wo Körper Fläche an Fläche stoßen (Spiegelkopie an
 * der Ebene, gleiche Deckhöhen), lässt die CSG T-Stöße, die die Kantenzählung nicht alle paart (bis ~100 „offene Kanten“
 * bei dichter Hülle). Ein echtes Loch zeigt sich im Flächenschluss (|Σ n·A| / Σ A > 1e-6).
 */
const dichtText = (i) => (i.flaechenschluss === undefined ? '' : i.flaechenschluss > 1e-6 ? ' · undicht (' + i.offeneKanten + ' offene Kanten)' : ' · dicht');
const zahl = (x, n = 1) => (+x).toLocaleString('de-DE', { maximumFractionDigits: n, minimumFractionDigits: n });
function zeigeWerte() {
  const modul = formZuModul(form);
  const h = modul.quader.reduce((a, q) => ({ min: a.min.map((v, i) => Math.min(v, q.min[i])), max: a.max.map((v, i) => Math.max(v, q.max[i])) }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const mass = modul.quader.length ? [0, 1, 2].map((i) => h.max[i] - h.min[i]) : [0, 0, 0];
  try { schiffPruefung = pruefeSchiff(form, true); } catch (f) { console.warn('Prüfung', f); schiffPruefung = null; }
  const fl = schiffPruefung?.flug, w = fl?.werte;
  zeigeMarker();
  const st = $('flugstatus');
  st.textContent = !schiffPruefung ? '' : schiffPruefung.flugtauglich ? 'FLUGTAUGLICH' : 'NICHT FLUGTAUGLICH';
  st.className = schiffPruefung?.flugtauglich ? 'gut' : 'schlecht';
  const reihen = [
    ['Körper · Bauteile', `${form.koerper.length} · ${bauteilListe(form).length}`], ['Länge · Breite · Höhe', `${zahl(mass[2])} · ${zahl(mass[0])} · ${zahl(mass[1])} m`],
    ['Masse', zahl(fl?.masse ?? modul.werte.masse, 0) + ' t'], ['Schub', fl ? zahl(fl.schub, 0) + ' kN' : '–'],
    // WARUM Striche ohne Schub (Spieltest R19, Muss): die Flugwerte haben Untergrenzen (fliegbar) — ohne Triebwerk wirkten 2,5 m/s² kaputt
    ['Beschleunigung', w && fl.schub > 0 ? `${zahl(w.aVor)} m/s²` : '–'],
    ['Höchstfahrt', w && fl.schub > 0 ? `${zahl(w.vMax, 0)} m/s` : '–'],
    ['Wendigkeit gieren · rollen', w && fl.schub > 0 ? `${zahl(w.drehMax.gieren * 180 / Math.PI)} · ${zahl(w.drehMax.rollen * 180 / Math.PI)} °/s` : '–'],
    ['Andockpunkte', form.andock.length],
    ['Verschweißen', !verschweisst ? 'aus (Einzelteile)' : schweissInfo ? `${zahl(schweissInfo.ms, 0)} ms${schweissInfo.dreiecke ? ' · ' + zahl(schweissInfo.dreiecke, 0) + ' Dreiecke' : ''}${dichtText(schweissInfo)}` : '…'],
  ];
  zeigeMasse();
  $('werte').innerHTML = reihen.map(([a, b]) => `<div class="reihe"><span>${a}</span><b>${b}</b></div>`).join('');
  const liste = $('meldungen'); liste.innerHTML = '';
  // Form-Meldungen + Prüfliste „flugtauglich“ (Starfield-Lehre: Klick zeigt auf das Teil)
  for (const m of [...pruefe(form), ...(schiffPruefung?.meldungen ?? [])]) {
    const z = document.createElement('div'); z.className = 'm ' + (m.stufe === 'hinweis' ? 'warnung' : m.stufe); z.textContent = m.text;
    const kid = m.id ?? m.koerper;
    if (m.bauteil !== undefined) { z.dataset.nr = m.bauteil; z.addEventListener('click', () => waehleBauteil(m.bauteil)); }
    else if (kid !== undefined) { z.dataset.nr = kid; z.addEventListener('click', () => waehle(kid)); }
    liste.append(z);
  }
}

/** Maße der ganzen Form (und des gewählten Körpers) oben im Bild — Nutzer R17b: „Länge und Höhe immer sehen“. */
let masseText = '';
function zeigeMasse() {
  const box = (liste) => liste.reduce((a, q) => ({ min: a.min.map((v, i) => Math.min(v, q.min[i])), max: a.max.map((v, i) => Math.max(v, q.max[i])) }), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
  const mass = (h) => [2, 0, 1].map((i) => zahl(h.max[i] - h.min[i]));
  const plus = koerperListe(form).filter((x) => x.k.op === 'plus');
  let t = plus.length ? (() => { const [l, b, h] = mass(box(plus.map(({ k, lage }) => huelle(k, lage)))); return `<b>FORM</b> Länge <b>${l} m</b> · Breite <b>${b} m</b> · Höhe <b>${h} m</b>`; })() : '<b>FORM</b> leer';
  const k = koerper();
  if (k) { const [l, b, h] = mass(huelle(k)); t += `<br><span>${NAMEN[k.typ] ?? k.typ} ${k.id}${k.fest ? ' 🔒' : ''}: ${l} · ${b} · ${h} m</span>`; }
  if (t !== masseText) { masseText = t; $('masse').innerHTML = t; }
}

let meldungsUhr = 0;
function zeigeMeldungKurz(text) {
  const el = $('meldung'); el.textContent = text; el.classList.toggle('sichtbar', !!text);
  clearTimeout(meldungsUhr); if (text) meldungsUhr = setTimeout(() => el.classList.remove('sichtbar'), 3000);
}

// ---------------- Bedienelemente verdrahten ----------------
for (const [typ, v] of Object.entries(BAUTEILE)) {
  const b = document.createElement('button');
  b.textContent = (v.art === 'geschuetz' ? '⌖ ' : '▲ ') + v.name; b.title = `Auf die ${flaechenText(typ)} setzen (${v.masse ?? '?'} t)`;
  b.addEventListener('click', () => { bauteilWahl = null; bedienung.setzeBauteil(typ); });
  $(v.art === 'geschuetz' ? 'geschuetze' : 'antriebe').append(b);
}
function flaechenText(typ) { return [...new Set((BAUTEILE[typ]?.flaeche ?? ['alle']).map((x) => FLAECHEN[x] ?? x))].join(' oder '); }
for (const [name, v] of Object.entries(VORLAGEN)) {
  const b = document.createElement('button'); b.textContent = v.name; b.title = 'Neuen Körper ansetzen (neben dem gewählten)';
  b.title = 'Klicken, dann auf eine Fläche (oder den Boden) zeigen und klicken'; b.addEventListener('click', () => bedienung.setzen(name)); $('vorlagen').append(b);
}
$('f-art').innerHTML = ARTEN.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
$('k-mat').innerHTML = MATS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
$('k-beispiel').innerHTML = '<option value="">Beispiele …</option>' + BEISPIEL_FORMEN.map((f, i) => `<option value="${i}">${f.name}</option>`).join('');
$('f-name').addEventListener('change', (e) => aendere({ ...form, name: e.target.value.trim() || 'Form' }));
$('f-art').addEventListener('change', (e) => aendere({ ...form, art: e.target.value }));
$('k-op').addEventListener('click', () => { const k = koerper(); if (k) aendereKoerper(k.id, (x) => ({ ...x, op: x.op === 'minus' ? 'plus' : 'minus' })); });
$('k-mat').addEventListener('change', (e) => { const k = koerper(); if (k) aendereKoerper(k.id, (x) => ({ ...x, mat: e.target.value })); });
function schalteSpiegel(a) {
  const k = koerper(); if (!k) { zeigeMeldungKurz('Erst einen Körper wählen'); return; }
  const an = !k.spiegel.includes(a);
  aendereKoerper(k.id, (x) => ({ ...x, spiegel: an ? [...x.spiegel, a] : x.spiegel.filter((y) => y !== a) }));
  zeigeMeldungKurz(an ? `Verbunden gespiegelt (${{ x: 'links ↔ rechts', y: 'oben ↔ unten', z: 'vorn ↔ hinten' }[a]}) — die Kopie formt sich mit` : 'Spiegelung aufgehoben');
}
function spiegelKopie(a) {
  const k = koerper(); if (!k) { zeigeMeldungKurz('Erst einen Körper wählen'); return; }
  const id = naechsteId(), neu = spiegelKoerper(k, a, id), h1 = huelle(k), h2 = huelle(normalisiere({ koerper: [neu] }).koerper[0]);
  aendere({ ...form, koerper: [...form.koerper, neu] }); waehle(id);
  const gleich = [0, 1, 2].every((i) => Math.abs(h1.min[i] - h2.min[i]) < 0.01 && Math.abs(h1.max[i] - h2.max[i]) < 0.01);
  zeigeMeldungKurz(gleich ? 'Gespiegelte Kopie liegt genau auf dem Original (Körper steht auf der Ebene) — mit W wegschieben'
    : 'Gespiegelte Kopie erstellt — ein eigener Körper, getrennt formbar');
}
function klappe(a) {
  const k = koerper(); if (!k) { zeigeMeldungKurz('Erst einen Körper wählen'); return; }
  if (k.fest) { zeigeMeldungKurz('Körper ist fixiert'); return; }
  aendereKoerper(k.id, (x) => klappeKoerper(x, a));
  zeigeMeldungKurz(`Körper umgeklappt (${{ x: 'links ↔ rechts', y: 'oben ↔ unten', z: 'vorn ↔ hinten' }[a]}) — gespiegelt an seiner eigenen Mitte`);
}
function schalteFest() {
  const k = koerper(); if (!k) { zeigeMeldungKurz('Erst einen Körper wählen'); return; }
  const an = !k.fest;
  aendereKoerper(k.id, (x) => { const y = { ...x }; if (an) y.fest = true; else delete y.fest; return y; });
  zeigeMeldungKurz(an ? 'Fixiert — Lage und Form sind gesperrt (Material, Spiegeln und Ansicht gehen weiter)' : 'Gelöst — wieder verschiebbar');
}
for (const a of ACHSEN) { $('sv-' + a).addEventListener('click', () => schalteSpiegel(a)); $('se-' + a).addEventListener('click', () => spiegelKopie(a)); $('su-' + a).addEventListener('click', () => klappe(a)); }
$('k-fest').addEventListener('click', schalteFest);
$('k-punkte').addEventListener('click', () => schaltePunkte());
$('k-punkte-weg').addEventListener('click', () => {
  const k = koerper(); if (!k) return;
  punkteModus = false;
  aendereKoerper(k.id, (x) => ({ ...x, spanten: x.spanten.map(({ p, ...t }) => t) }));
  zeigeMeldungKurz('Umriss zurückgesetzt — wieder Rechteck mit Rundung und Fase');
});
$('k-skizze').addEventListener('click', starteSkizze);
$('k-probeflug').addEventListener('click', probeflug);
$('k-gefecht').addEventListener('click', gefechtstest);
$('k-symmetrie').addEventListener('click', () => {
  symmetrie = !symmetrie; try { localStorage.setItem(SYM, symmetrie ? 'an' : 'aus'); } catch { /* egal */ }
  zeigeTafeln(); zeigeMeldungKurz(symmetrie ? 'Symmetrie an — neue Körper bekommen ihre Spiegelkopie (links ↔ rechts)' : 'Symmetrie aus — neue Körper ohne Spiegelkopie');
});
$('k-mehr').addEventListener('click', () => { mehrOffen = !mehrOffen; zeigeTafeln(); });
for (const b of document.querySelectorAll('#am-teil button')) b.addEventListener('click', () => leistenKnopf(b.dataset.t));
function leistenKnopf(t) {
  const k = koerper(); if (!k) return;
  if (t === 'fase' || t === 'rundung') { kantenStart(t); return; }
  if (kantenWerkzeug.aktiv()) { kantenWerkzeug.abbrechen(); kantenArt = null; }
  if (['ziehen', 'schieben', 'drehen', 'groesse'].includes(t)) setzeModus(modus === t && t !== 'ziehen' ? 'ziehen' : t);
  else if (t === 'kopie') dupliziere();
  else if (t === 'minus') { if (k.fest) zeigeMeldungKurz('Körper ist fixiert'); else aendereKoerper(k.id, (x) => ({ ...x, op: x.op === 'minus' ? 'plus' : 'minus' })); }
  else if (t === 'spiegel') schalteSpiegel('x');
  else if (t === 'fest') { schalteFest(); setzeModus('ziehen'); }
  else if (t === 'loeschen') loescheKoerper();
  else if (t === 'mehr') { mehrOffen = !mehrOffen; zeigeTafeln(); }
  zeigeLeiste();
}
/** Leiste am Teil: Zustand der Knöpfe. Lage setzt die Schleife (folgt der Kamera). */
function zeigeLeiste() {
  const k = koerper(), l = $('am-teil');
  l.classList.toggle('versteckt', !k || skizze?.aktiv());
  if (!k) return;
  for (const b of l.querySelectorAll('button')) {
    const t = b.dataset.t;
    const kw = !!kantenWerkzeug?.aktiv();
    b.classList.toggle('an', (t === modus && !kw) || (kw && t === kantenArt) || (t === 'mehr' && mehrOffen) || (t === 'fest' && !!k.fest) || (t === 'spiegel' && k.spiegel.includes('x')) || (t === 'minus' && k.op === 'minus'));
    b.disabled = !!k.fest && ['schieben', 'drehen', 'groesse', 'minus', 'loeschen'].includes(t);
  }
  l.querySelector('[data-t="fest"]').textContent = k.fest ? '🔒 Gelöst?' : '🔓 Fixieren';
  l.querySelector('[data-t="minus"]').textContent = k.op === 'minus' ? '◐ Material' : '◐ Ausschneiden';
}
// Leiste am Teil liegt fest unten in der Mitte (CSS #am-teil). WARUM nicht schwebend über dem Körper (Spieltest R18, Muss):
// sie rutschte über den Ansichtswürfel — ein Klick auf VORNE traf „Löschen“ — und verdeckte die Oberseite.
$('w-home').addEventListener('click', () => fokus());
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
  const neu = b ? Object.fromEntries(Object.keys(a).map((f) => [f, f === 'p' ? a.p.map((q, j) => [(q[0] + b.p[j][0]) / 2, (q[1] + b.p[j][1]) / 2]) : (a[f] + b[f]) / 2]))
    : { ...a, z: a.z + 5 };
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
function neuAnfangen() {
  bedienung.abbrechen(); if (punkteModus) schaltePunkte(false); setzeModus('ziehen');
  aendere({ name: 'Neue Form', art: 'rumpf', koerper: [], andock: [], bauteile: [] }); waehle(null);
  zeigeMeldungKurz('Leere Werkstatt — links eine Vorlage setzen, Skizze zeichnen oder den Generator nutzen (Strg+Z holt die alte Form zurück)');
}
$('k-neu').addEventListener('click', neuAnfangen);
$('k-neu-gross').addEventListener('click', neuAnfangen);
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
  if (k.fest) { zeigeMeldungKurz('Körper ist fixiert — erst lösen, dann löschen'); return; }
  aendere({ ...form, koerper: form.koerper.filter((x) => x.id !== k.id) }); waehle(null);
  zeigeMeldungKurz('Körper gelöscht — Strg+Z holt ihn zurück');
}
function fokus(ganz = false) {
  wuerfel?.halt(); wuerfel?.normal(); // WARUM normal(): fokus rechnet den Abstand für den normalen Bildwinkel
  const box = new THREE.Box3(); rohGruppe.traverse((o) => { if (o.isMesh) box.expandByObject(o); });
  const m = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const r = box.isEmpty() ? 30 : Math.max(12, box.getSize(new THREE.Vector3()).length());
  // WARUM 1,7 statt 1,1 (Spieltest R18, Soll): zu nah — Flächen und Griffe am Rand schwer zu treffen
  let d = r * 1.7;
  if (ganz) {
    // R20 (Spieltest, Soll): ganze Form einpassen — Kugel um die Form in den freien Bildteil zwischen den Tafeln
    // (links ~240 px, rechts ~330 px). WARUM aus Bildwinkel statt fester Faktor: bei 1,7 füllte ein langes Schiff nur ein
    // Drittel, ein fester kleinerer Faktor schnitt es in schmalen Fenstern ab.
    const w = $('leinwand').clientWidth || innerWidth, frei = Math.max(0.35, (w - 570) / w);
    const halbV = camera.fov * RAD / 2, halbH = Math.atan(Math.tan(halbV) * camera.aspect * frei);
    d = (r / 2) / Math.sin(Math.min(halbV, halbH)) * 1.05;
  }
  steuer.target.copy(m); camera.position.copy(m).add(new THREE.Vector3(0.7, 0.45, 0.8).normalize().multiplyScalar(d));
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  // Skizze hat Vorrang: Enter/Esc/Rücktaste gehören ihr, die übrigen Werkstatt-Tasten ruhen
  if (skizze.aktiv()) { if (skizze.taste(e)) { e.preventDefault(); e.stopPropagation(); } return; }
  // R21: Kanten-Werkzeug (Zahl + Enter, Esc) hat Vorrang, solange es aktiv ist
  if (kantenWerkzeug.aktiv()) {
    if (kantenWerkzeug.taste(e)) { e.preventDefault(); e.stopPropagation(); if (!kantenWerkzeug.aktiv()) { kantenArt = null; zeigeLeiste(); } return; }
  }
  // Push/Pull und Setzen: Zahl + Enter, Esc
  if (bedienung.taste(e)) { e.preventDefault(); e.stopPropagation(); return; }
  const strg = e.ctrlKey || e.metaKey, t = e.key.toLowerCase();
  if (e.key === 'Escape' && punkteModus) { schaltePunkte(false); e.preventDefault(); return; }
  if (e.key === 'Escape' && modus !== 'ziehen') { setzeModus('ziehen'); e.preventDefault(); return; }
  if (e.key === 'Escape' && bauteilWahl !== null) { waehleBauteil(null); e.preventDefault(); return; }
  if (e.key === 'Escape' && gewaehlt !== null) { waehle(null); e.preventDefault(); return; }
  if (strg && t === 'z') { e.preventDefault(); e.shiftKey ? wiederholen() : rueckgaengig(); return; }
  if (strg && t === 'y') { e.preventDefault(); wiederholen(); return; }
  if (strg && t === 's') { e.preventDefault(); speichern(); return; }
  if (strg && t === 'd') { e.preventDefault(); dupliziere(); return; }
  if (strg) { griff.setTranslationSnap(null); griff.setRotationSnap(null); return; } // Strg halten = ohne Raster
  if (t === 'w') setzeModus('schieben');
  else if (t === 'e') setzeModus('drehen');
  else if (t === 's') setzeModus('groesse');
  else if (t === 'q') setzeModus('ziehen');
  else if (t === 'v') schalteSchweissen();
  else if (t === 'm') { if (!spiegleBauteil()) schalteSpiegel('x'); }
  else if (t === 'k') starteSkizze();
  else if (t === 'p') schaltePunkte();
  else if (t === 'l') schalteFest();
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (!loescheBauteil()) loescheKoerper(); }
  else if (t === 'f') fokus();
  else if (t === 'h') $('hilfe').classList.toggle('versteckt');
  else if (t === 'g' && generator.offen()) generator.wuerfeln();
  else if (t === 'r') kantenStart('fase');    // R21: Fase (wie Inventor „Fase“)
  else if (t === 't') kantenStart('rundung'); // R21: Rundung // R20: nur bei offenem Generator (sonst ungewollt neue Form)
}, { capture: true });
addEventListener('keyup', (e) => { if (e.key === 'Control' || e.key === 'Meta') { griff.setTranslationSnap(0.5); griff.setRotationSnap(15 * RAD); } });

// ---------------- Ansichtswürfel und Skizze (Runde 17) ----------------
wuerfel = erstelleAnsichtswuerfel({ renderer: bild.renderer, camera, steuer, leinwand: $('leinwand'), rechtsFrei: 330 });
skizze = erstelleSkizze({ scene, camera, leinwand: $('leinwand'), steuer, wuerfel, meldung: zeigeMeldungKurz,
  fertig(daten) {
    const id = naechsteId();
    aendere({ ...form, koerper: [...form.koerper, mitSymmetrie({ ...daten, id })] });
    waehle(id);
    zeigeMeldungKurz(`Körper aus der Skizze erstellt (${daten.spanten[0].p.length} Punkte) — W schieben, P Punkte ziehen, rechts Spanten formen`);
  } });
function starteSkizze() {
  if (punkteModus) punkteModus = false;
  bedienung.abbrechen(); griff.detach(); punktGruppe.clear();
  skizze.start(); zeigeLeiste();
}
bedienung = erstelleBedienung({ scene, camera, leinwand: $('leinwand'), steuer, rohGruppe, wuerfel, griff,
  holeForm: () => form, koerper, waehle, meldung: zeigeMeldungKurz, platziere,
  darf: () => !skizze.aktiv() && !punkteModus && modus === 'ziehen' && !kantenWerkzeug?.aktiv(),
  klickVerbraucht() { gedrueckt = null; },
  // R21: gerade Ansicht (Kantengriffe), Bauteile anfassen (umsetzen) und wählen
  gerade: geradeAnsicht, bauteilGruppe, waehleBauteil,
  spiegelFuer: (typ, p) => (symmetrie && Math.abs(p[0]) >= halbBreite(typ) ? ['x'] : []), // R22: wie platziereBauteil
  // R19: Bauteile setzen
  passtAuf, flaechenText, bauteilName: (typ) => BAUTEILE[typ]?.name ?? typ, platziereBauteil, rasteBauteil,
  // Triebwerke gehören ans Heck: Kamera schräg von hinten, sonst sieht man die Fläche nicht (Spieltest R19, Soll)
  zeigeFlaecheFuer(typ) { if ((BAUTEILE[typ]?.flaeche ?? []).includes('hinten') && camera.position.z > steuer.target.z) wuerfel.drehNach([0.55, 0.45, -1]); },
  bauteilGeist(typ, p, n) { try { return bauteilGrafik({ b: { id: -1, typ, p, n, spiegel: [] }, p, n, spiegel: null, kopie: 0 }, mats, form); } catch { return null; } },
  vorschau(id, k) { ziehen = true; form = normalisiere({ ...form, koerper: form.koerper.map((x) => (x.id === id ? k : x)) }); schnellZeichnen(id); },
  uebernehme(merk) { ziehen = false; zurueck.push(merk); if (zurueck.length > 150) zurueck.shift(); vor.length = 0; aendere(form, { merken: false }); },
  setzeForm(f, merk) { ziehen = false; if (merk) { zurueck.push(merk); vor.length = 0; } aendere(f, { merken: false }); },
});

// ---------------- Kanten: Fase / Rundung wie Inventor (Runde 21) ----------------
kantenWerkzeug = erstelleKantenWerkzeug({ scene, camera, leinwand: $('leinwand'), rohGruppe, steuer, wuerfel,
  holeForm: () => form, koerper, meldung: zeigeMeldungKurz,
  darf: () => !skizze.aktiv() && !punkteModus,
  ersetzeKoerper(id, k) { aendereKoerper(id, () => k); } });
/** Werkzeug Fase/Rundung starten oder (gleicher Knopf erneut) beenden. */
function kantenStart(art) {
  const k = koerper(); if (!k) { zeigeMeldungKurz('Erst einen Körper wählen — dann Kanten anklicken'); return; }
  if (kantenWerkzeug.aktiv() && kantenArt === art) { kantenWerkzeug.abbrechen(); kantenArt = null; zeigeLeiste(); return; }
  bedienung.abbrechen(); if (punkteModus) schaltePunkte(false); if (modus !== 'ziehen') setzeModus('ziehen');
  kantenArt = kantenWerkzeug.start(art) ? art : null; zeigeLeiste();
}

// ---------------- Hintergrund Weltall ↔ Studio (Runde 21) ----------------
const stimmung = stimmungsKnopf($('k-stimmung'), bild, (n) => { baueRaster(n); sichtbarkeit(); });

// ---------------- Schiffsgenerator (Runde 20) ----------------
// WARUM aendere statt eigener Weg: das Ergebnis ist eine ganz normale Form (Nutzer) — Rückgängig, Zwischenstand,
// Prüfliste, Speichern und Probeflug gelten sofort. Kamera nur beim ersten Schritt nachführen (beim Regler-Ziehen ruhig).
const generator = erstelleGeneratorTafel({ meldung: zeigeMeldungKurz,
  uebernimm(f, merken) {
    bedienung.abbrechen(); if (punkteModus) schaltePunkte(false); setzeModus('ziehen');
    aendere(f, { merken }); waehle(null);
    // WARUM einpassen (Spieltest R20, Soll): beim Generator geht es ums Ansehen der ganzen Form, nicht ums Greifen von Flächen
    if (merken) fokus(true);
    const p = schiffPruefung;
    // WARUM echte Zahl (Schiffbauer R20): ist das Schiff zu schwer, setzt der Generator mehr Triebwerke als eingestellt
    const tw = bauteilListe(form).filter((e) => (BAUTEILE[e.b.typ]?.flaeche ?? []).includes('hinten')).length;
    return `${tw} Triebwerk${tw === 1 ? '' : 'e'} · ` + (p ? (p.flugtauglich ? 'FLUGTAUGLICH' : 'NICHT FLUGTAUGLICH') : '');
  } });

// ---------------- Start ----------------
neuZeichnen(); fokus(); waehle(gewaehlt);
$('laden').remove();
let letzteKamera = '', punkteUhr = 0;
const NORMAL_FOV = camera.fov;
/**
 * Bildschirmfeste Sprites (Schwerpunkt, Schubpunkt, Punkte, Plus-Marken, Skizzenpunkte) an den Bildwinkel anpassen.
 * WARUM (Nutzer R21: „bei jeder Ansicht kommt ein Punkt ganz groß, der alles verdeckt“): Sprites ohne Größenabnahme sind
 * fest relativ zur PROJEKTION — die Würfel-Ansichten schalten auf Tele (3° statt 55°), dann wurden sie ~20× größer.
 * userData.groesse merkt die gewollte Größe; je Bild gilt groesse · tan(fov/2) / tan(55°/2).
 */
function spriteGroessen() {
  const f = Math.tan(camera.fov * RAD / 2) / Math.tan(NORMAL_FOV * RAD / 2);
  scene.traverse((o) => {
    if (!o.isSprite || o.material.sizeAttenuation !== false) return;
    if (o.userData.groesse === undefined) o.userData.groesse = o.scale.x;
    o.scale.setScalar(o.userData.groesse * f);
  });
}
function schleife() {
  wuerfel.schritt(); steuer.update(); spriteGroessen(); bedienung.jedesBild();
  // R22: Esc im Maß-Feld beendet das Kanten-Werkzeug selbst (das Feld schluckt die Taste) — Leiste nachziehen
  if (kantenArt && !kantenWerkzeug.aktiv()) { kantenArt = null; zeigeLeiste(); }
  // WARUM: Freigabe (gerade Ansicht) und Plus-Marken hängen an der Blickrichtung → nach Kamerabewegung neu legen (≤ 10×/s)
  if (punkteModus && !punktZug) {
    const kam = camera.matrixWorld.elements.map((v) => v.toFixed(3)).join();
    if (kam !== letzteKamera && performance.now() - punkteUhr > 100) { letzteKamera = kam; punkteUhr = performance.now(); zeigePunkte(); }
  }
  bild.zeichnen(); wuerfel.zeichne(); requestAnimationFrame(schleife);
}
requestAnimationFrame(schleife);

// CLAUDE.md Regel 6: Debug-Zugang
window.spiel = {
  get form() { return kopie(form); },
  get info() { return schweissInfo; },
  lade(f) { aendere(kopie(f)); fokus(); },
  setze: setzeVorlage, waehle, rueckgaengig, wiederholen, fokus, speichern,
  spant(feld, wert) { const k = koerper(); if (k) setzeSpantFeld(k.id, feld, wert, true); },
  skizze, wuerfel, bedienung, modus: setzeModus, get pruefung() { return schiffPruefung; }, setzeBauteil: (typ, p, n) => platziereBauteil({ typ, p, n }), waehleBauteil, probeflug, kamera: camera, steuer, get symmetrie() { return symmetrie; }, punkte: schaltePunkte, spiegeln: schalteSpiegel, spiegelKopie, klappe, fest: schalteFest, get punkteAnsicht() { return punkteAnsicht; },
  get spantNr() { return spantNr; }, set spantNr(n) { spantNr = n; zeigeHilfen(); const k = koerper(); if (k) zeigeSpant(k); },
  /** Bildpunkt (clientX/Y) eines Punktes oder einer Plus-Marke im Punkte-Modus — für Mausprüfungen */
  punktBild(art, j, i) { const o = punktGruppe.children.find((x) => x.userData.art === art && x.userData.j === j && (i === undefined || x.userData.i === i)); if (!o) return null;
    const v = o.position.clone().project(camera), r = $('leinwand').getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
  ansicht(r = [0.7, 0.45, 0.8]) { wuerfel.normal(); const m = steuer.target.clone(), d = camera.position.distanceTo(m); camera.position.copy(m).add(new THREE.Vector3(...r).normalize().multiplyScalar(d)); steuer.update(); bild.zeichnen(); },
  messwerte: () => { bild.zeichnen(); return bild.messwerte(); },
  generator, // R20: generator.wuerfeln(), generator.einstellung()
  bild, stimmung, // R21: stimmung.setze('studio' | 'weltall'), bild.renderer.info.programs
};
