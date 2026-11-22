// ZWECK: Werft (Runde 15) — Schiffs-Baukasten mit Andockpunkten: Module wählen, an freien Punkten ansetzen (Geist zeigt
//        Lage und ob es passt), drehen, löschen, rückgängig, Werte + Meldungen, Speichern/Laden als Datei.
// ABLAUF: Entwurf (Daten) → baue() (Sim, rein) → schiffNetz() (Grafik, je Material ein Netz) + Andock-Marken + Geist.
//         Jede Änderung = neuer Entwurf auf dem Rückgängig-Stapel (ganze Schnappschüsse, Prüfer R15).
// REGEL: Rechnen nur über src/sim/werft/*. Zwischenstand liegt im localStorage (Weglaufen verliert nichts),
//        Speichern schreibt konfig/schiffe/<name>.json (Dev-Server, server/ablage.js) — die KI kann es lesen.
// LEHREN aus der Recherche (Starfield-Schiffsbau): Punkt per Klick wählen statt „nächster rastet“, Vorschau-Geist,
//        Speichern jederzeit (auch mit Fehlern), Andockpunkte ausblendbar, Fehlerliste mit Sprung zum Teil.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { erstelleRenderer } from '../grafik/renderer.js';
import { materialien } from '../grafik/schiff/bauteile.js';
import { schiffNetz, modulGeometrie, lageMatrix } from '../grafik/schiff/module.js';
import { MODULE, KATALOG as GRUND_KATALOG } from '../sim/werft/module.js';
import { formZuModul } from '../sim/form/form.js';
import { formGeometrie } from '../grafik/form/schweissen.js';
import { registriereForm } from '../grafik/schiff/module.js';
import { BEISPIEL } from '../sim/werft/beispiel.js';
import { baue, andockLage, kandidaten, loesche, naechsteNr, wende, migriere, erlaubteDreh } from '../sim/werft/zusammenbau.js';

const $ = (id) => document.getElementById(id);
const ZWISCHEN = 'schwarmfront-werft-entwurf';
const GRUPPEN = [['eigen', 'Eigene Formen'], ['kommando', 'Kommando'], ['bug', 'Bug'], ['rumpf', 'Rumpf'], ['uebergang', 'Übergang'], ['heck', 'Heck'],
  ['hangar', 'Hangar'], ['anbau', 'Anbauten'], ['turm', 'Türme & Masten']];
const FARBE = { rumpf: 0x4aa8ff, anbau: 0x6ad27a, turm: 0xf2c070 };
const MARKE_R = { S: 1.4, M: 2.6, L: 3.6 };

// ---------------- Szene ----------------
const bild = erstelleRenderer($('leinwand'));
const { scene, camera } = bild;
camera.position.set(140, 70, 160);
const steuer = new OrbitControls(camera, $('leinwand'));
steuer.enableDamping = true; steuer.dampingFactor = 0.12; steuer.minDistance = 15; steuer.maxDistance = 1500;
steuer.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null }; // rechts = Auswahl ab
const mats = materialien();

const schiffGruppe = new THREE.Group(); scene.add(schiffGruppe);
const markenGruppe = new THREE.Group(); scene.add(markenGruppe);
const geistGruppe = new THREE.Group(); geistGruppe.visible = false; scene.add(geistGruppe);
const auswahlKasten = new THREE.Box3Helper(new THREE.Box3(), 0xf2c070); auswahlKasten.visible = false; scene.add(auswahlKasten);
const geistGut = new THREE.MeshBasicMaterial({ color: 0x6ad27a, transparent: true, opacity: 0.35, depthWrite: false });
const geistSchlecht = new THREE.MeshBasicMaterial({ color: 0xe06040, transparent: true, opacity: 0.4, depthWrite: false });
const markenGeo = new THREE.CircleGeometry(1, 20);
const markenRing = new THREE.RingGeometry(1.15, 1.35, 24);

// ---------------- Zustand ----------------
let entwurf = ladeZwischenstand() ?? kopie(BEISPIEL);
// Runde 16: Katalog = feste Module + eigene Formen aus der Form-Werkstatt (konfig/formen/*.json, beim Start geladen)
const KATALOG = { ...GRUND_KATALOG };
const EIGENE = [];
let bau = baue(entwurf, KATALOG);
const zurueck = [], vor = [];
let gewaehlt = null;      // Modul-Id aus der Palette (Platzier-Modus)
let auswahl = null;       // nr eines Teils am Schiff
let ziel = null;          // { kandidaten: [...], k: index Seite, d: index Drehung } am überfahrenen Punkt
let seite = 0, drehung = 0;
let punkteSichtbar = true;
const zeiger = new THREE.Vector2(), strahl = new THREE.Raycaster();
let pickKaesten = [];     // [{ nr, box: Box3 }]

function kopie(x) { return JSON.parse(JSON.stringify(x)); }
function ladeZwischenstand() {
  try { const e = JSON.parse(localStorage.getItem(ZWISCHEN)); return e && Array.isArray(e.teile) ? e : null; } catch { return null; }
}

// ---------------- Ändern ----------------
function aendere(neu, { merken = true } = {}) {
  if (merken) { zurueck.push(kopie(entwurf)); if (zurueck.length > 100) zurueck.shift(); vor.length = 0; }
  entwurf = neu;
  try { localStorage.setItem(ZWISCHEN, JSON.stringify(entwurf)); } catch { /* voll/gesperrt: dann eben ohne Zwischenstand */ }
  neuBauen();
}
function rueckgaengig() { if (!zurueck.length) return; vor.push(kopie(entwurf)); aendere(zurueck.pop(), { merken: false }); }
function wiederholen() { if (!vor.length) return; zurueck.push(kopie(entwurf)); aendere(vor.pop(), { merken: false }); }

function neuBauen() {
  bau = baue(entwurf, KATALOG);
  if (auswahl !== null && !bau.teile.some((t) => t.nr === auswahl)) auswahl = null;
  // Schiff: je Material ein Netz (Schiffbauer, E7) — alte Geometrien freigeben (Zusammenfügen erzeugt neue)
  schiffGruppe.traverse((o) => o.geometry?.dispose());
  schiffGruppe.clear();
  if (bau.teile.length) schiffGruppe.add(schiffNetz(bau.teile, mats));
  // Auswahl-Kästen aus den Hüllquadern des Katalogs (ungeschrumpft)
  pickKaesten = bau.teile.map((t) => {
    const box = new THREE.Box3();
    for (const q of KATALOG[t.modul]?.quader ?? []) {
      box.expandByPoint(new THREE.Vector3(...wende(t.lage, q.min))); box.expandByPoint(new THREE.Vector3(...wende(t.lage, q.max)));
    }
    return { nr: t.nr, box };
  });
  baueMarken();
  zeigeAuswahl();
  zeigeTafel();
  const r = Math.max(60, Math.max(bau.laenge, bau.breite, bau.hoehe) * 0.62);
  bild.setzeSchattenRadius(r);
  bild.folgeSchatten(mitte());
}

function mitte() {
  const b = new THREE.Box3(); for (const k of pickKaesten) b.union(k.box);
  return b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());
}

// ---------------- Andock-Marken ----------------
function baueMarken() {
  markenGruppe.clear();
  const passend = gewaehlt ? new Set(kandidaten(bau, KATALOG, gewaehlt).map((k) => k.an.nr + '.' + k.an.punkt)) : null;
  for (const f of bau.freiePunkte) {
    const schluessel = f.nr + '.' + f.punkt;
    const aktiv = !passend || passend.has(schluessel);
    if (passend && !aktiv) continue; // WARUM ausblenden: nur Punkte zeigen, an die das gewählte Modul passt
    const n = new THREE.Vector3(...f.n), p = new THREE.Vector3(...f.p).addScaledVector(n, 0.25);
    const r = MARKE_R[f.groesse] ?? 2;
    // WARUM beim Setzen ohne Tiefentest: Spieltest R15 — aus der Startansicht waren die Punkte verdeckt/zu klein
    const durch = !!passend;
    const mat = new THREE.MeshBasicMaterial({ color: FARBE[f.art] ?? 0xffffff, transparent: true, opacity: passend ? 0.6 : 0.45, side: THREE.DoubleSide, depthWrite: false, depthTest: !durch });
    const scheibe = new THREE.Mesh(markenGeo, mat);
    const ring = new THREE.Mesh(markenRing, new THREE.MeshBasicMaterial({ color: FARBE[f.art] ?? 0xffffff, side: THREE.DoubleSide, depthTest: !durch, transparent: durch }));
    for (const m of [scheibe, ring]) {
      m.position.copy(p); m.userData.r = r * (passend ? 1.6 : 1); m.scale.setScalar(m.userData.r);
      if (durch) m.renderOrder = 10;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      m.userData.frei = f;
      markenGruppe.add(m);
    }
  }
  markenGruppe.visible = punkteSichtbar || !!gewaehlt;
}

// ---------------- Geist ----------------
const geistNetze = new Map(); // modulId → Group (Modul-Koordinaten), einmal gebaut
function geistVon(id, gut) {
  if (!geistNetze.has(id)) {
    const g = new THREE.Group();
    for (const geo of Object.values(modulGeometrie(id))) if (geo) g.add(new THREE.Mesh(geo, geistGut));
    geistNetze.set(id, g);
  }
  const g = geistNetze.get(id);
  g.traverse((o) => { if (o.isMesh) o.material = gut ? geistGut : geistSchlecht; });
  return g;
}
/** Entwurf mit dem Modul am aktuellen Ziel (oder null). */
function vorschlag() {
  if (!gewaehlt) return null;
  if (!bau.teile.length) return { ...entwurf, teile: [{ nr: 0, modul: gewaehlt }] }; // leere Werft: erstes Teil = Startteil
  if (!ziel) return null;
  const k = ziel.kandidaten[seite % ziel.kandidaten.length];
  const dreh = k.dreh[drehung % k.dreh.length];
  return { ...entwurf, teile: [...entwurf.teile, { nr: naechsteNr(entwurf), modul: gewaehlt, an: k.an, punkt: k.punkt, dreh }] };
}
function zeigeGeist() {
  geistGruppe.clear(); geistGruppe.visible = false;
  const neu = vorschlag();
  if (!neu) return;
  const probe = baue(neu, KATALOG);
  const nr = neu.teile.at(-1).nr;
  const teil = probe.teile.find((t) => t.nr === nr);
  if (!teil) return;
  // WARUM nur neue Fehler zählen: der Entwurf darf schon vorher Fehler haben, der Geist bewertet nur sein Teil
  const alt = new Set(bau.meldungen.filter((m) => m.stufe === 'fehler').map((m) => m.code + m.nr));
  const neuFehler = probe.meldungen.filter((m) => m.stufe === 'fehler' && !alt.has(m.code + m.nr) && !['kein_kommando', 'kein_heck'].includes(m.code));
  const g = geistVon(gewaehlt, neuFehler.length === 0);
  lageMatrix(teil.lage, geistGruppe.matrix); geistGruppe.matrixAutoUpdate = false;
  geistGruppe.add(g); geistGruppe.visible = true;
  zeigeMeldungKurz(neuFehler[0]?.text ?? '');
}

// ---------------- Eingabe ----------------
function strahlAus(e) {
  const r = $('leinwand').getBoundingClientRect();
  zeiger.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  strahl.setFromCamera(zeiger, camera);
}
function markeUnterZeiger() {
  if (!markenGruppe.visible) return null;
  const treffer = strahl.intersectObjects(markenGruppe.children, false);
  return treffer[0]?.object.userData.frei ?? null;
}
function teilUnterZeiger() {
  let best = null, d = Infinity; const p = new THREE.Vector3();
  for (const k of pickKaesten) if (strahl.ray.intersectBox(k.box, p)) { const a = p.distanceTo(strahl.ray.origin); if (a < d) { d = a; best = k.nr; } }
  return best;
}

let gedrueckt = null;
$('leinwand').addEventListener('pointerdown', (e) => { gedrueckt = { x: e.clientX, y: e.clientY }; });
$('leinwand').addEventListener('pointermove', (e) => {
  if (!gewaehlt) return;
  strahlAus(e);
  const f = markeUnterZeiger();
  const schluessel = f ? f.nr + '.' + f.punkt : null;
  if (schluessel !== ziel?.schluessel) {
    ziel = f ? { schluessel, kandidaten: kandidaten(bau, KATALOG, gewaehlt).filter((k) => k.an.nr === f.nr && k.an.punkt === f.punkt) } : null;
    if (ziel && !ziel.kandidaten.length) ziel = null;
    zeigeGeist();
  }
});
$('leinwand').addEventListener('pointerup', (e) => {
  // WARUM Wegschwelle: Ziehen dreht die Kamera und soll nichts setzen
  if (!gedrueckt || Math.hypot(e.clientX - gedrueckt.x, e.clientY - gedrueckt.y) > 5) return;
  if (e.button === 2) { abwaehlen(); return; }
  if (e.button !== 0) return;
  strahlAus(e);
  if (gewaehlt) {
    if (!bau.teile.length || ziel) { const neu = vorschlag(); if (neu) { aendere(neu); ziel = null; zeigeGeist(); } }
    return;
  }
  auswahl = teilUnterZeiger();
  zeigeAuswahl();
  const t = bau.teile.find((x) => x.nr === auswahl);
  zeigeMeldungKurz(t ? `${KATALOG[t.modul].name} (Teil ${t.nr}) gewählt — Entf löscht, R dreht, Esc hebt auf` : '');
});
$('leinwand').addEventListener('contextmenu', (e) => e.preventDefault());

function abwaehlen() {
  gewaehlt = null; ziel = null; seite = 0; drehung = 0;
  zeigeGeist(); baueMarken(); zeigePalette();
}
function waehleModul(id) {
  gewaehlt = gewaehlt === id ? null : id; auswahl = null; ziel = null; seite = 0; drehung = 0;
  zeigeAuswahl(); zeigeGeist(); baueMarken(); zeigePalette();
  if (!gewaehlt) return;
  const name = KATALOG[gewaehlt].name;
  if (!bau.teile.length) { zeigeMeldungKurz(`${name}: irgendwo ins Bild klicken — wird das Startteil`); return; }
  const n = new Set(kandidaten(bau, KATALOG, gewaehlt).map((k) => k.an.nr + '.' + k.an.punkt)).size;
  zeigeMeldungKurz(n ? `${name}: ${n} passende Punkt${n > 1 ? 'e' : ''} leuchten — darüberfahren, klicken` : `${name}: kein freier Punkt am Schiff passt`);
}
function dreheAuswahl() {
  const t = entwurf.teile.find((x) => x.nr === auswahl);
  if (!t?.an) return;
  const eltern = entwurf.teile.find((x) => x.nr === t.an.nr);
  const pK = KATALOG[t.modul]?.andock.find((a) => a.id === t.punkt);
  const pE = KATALOG[eltern?.modul]?.andock.find((a) => a.id === t.an.punkt);
  const erlaubt = pK && pE ? erlaubteDreh(pE, pK) : [0];
  if (erlaubt.length < 2) { zeigeMeldungKurz('Dieses Teil lässt sich hier nicht drehen'); return; }
  const i = erlaubt.indexOf(t.dreh ?? 0);
  aendere({ ...entwurf, teile: entwurf.teile.map((x) => x.nr === auswahl ? { ...x, dreh: erlaubt[(i + 1) % erlaubt.length] } : x) });
}
function loescheAuswahl() {
  if (auswahl === null) return;
  const weg = entwurf.teile.length - loesche(entwurf, auswahl).teile.length;
  aendere(loesche(entwurf, auswahl)); auswahl = null; zeigeAuswahl();
  zeigeMeldungKurz(weg > 1 ? `${weg} Teile entfernt (mit Anbauten) — Strg+Z holt sie zurück` : 'Teil entfernt — Strg+Z holt es zurück');
}

// WARUM Erfassungsphase: Esc soll zuerst die Auswahl aufheben, erst dann zurück ins Menü (zurueck.js prüft defaultPrevented)
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  const strg = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === 'Escape' && (gewaehlt || auswahl !== null)) { abwaehlen(); auswahl = null; zeigeAuswahl(); e.preventDefault(); return; }
  if (strg && k === 'z') { e.preventDefault(); e.shiftKey ? wiederholen() : rueckgaengig(); return; }
  if (strg && k === 'y') { e.preventDefault(); wiederholen(); return; }
  if (strg && k === 's') { e.preventDefault(); speichern(); return; }
  if (strg) return;
  if (k === 'r') { if (gewaehlt) { drehung++; zeigeGeist(); } else dreheAuswahl(); }
  else if (k === 't' && gewaehlt) { seite++; drehung = 0; zeigeGeist(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); loescheAuswahl(); }
  else if (k === 'p') { punkteSichtbar = !punkteSichtbar; baueMarken(); zeigeMeldungKurz(punkteSichtbar ? 'Andockpunkte sichtbar' : 'Andockpunkte aus (beim Setzen immer sichtbar)'); }
  else if (k === 'f') fokus();
  else if (k === 'h') $('hilfe').classList.toggle('versteckt');
}, { capture: true });

function fokus() {
  const m = mitte(), r = Math.max(40, Math.max(bau.laenge, bau.breite, bau.hoehe));
  steuer.target.copy(m);
  camera.position.copy(m).add(new THREE.Vector3(0.75, 0.4, 0.85).normalize().multiplyScalar(r * 1.3));
}

// ---------------- Tafeln ----------------
function zeigeAuswahl() {
  const k = pickKaesten.find((x) => x.nr === auswahl);
  auswahlKasten.visible = !!k;
  if (k) auswahlKasten.box.copy(k.box).expandByScalar(0.6);
}

function zeigePalette() {
  const alle = [...MODULE, ...EIGENE];
  const passend = bau.teile.length ? new Set(alle.filter((m) => kandidaten(bau, KATALOG, m.id).length).map((m) => m.id)) : null;
  const liste = $('modulliste'); liste.innerHTML = '';
  for (const [art, titel] of GRUPPEN) {
    const module = art === 'eigen' ? EIGENE : MODULE.filter((m) => m.art === art);
    if (!module.length) continue;
    const kopf = document.createElement('div'); kopf.className = 'gruppe'; kopf.textContent = titel.toUpperCase(); liste.append(kopf);
    for (const m of module) {
      const z = document.createElement('div');
      z.className = 'modul' + (m.id === gewaehlt ? ' aktiv' : '') + (passend && !passend.has(m.id) ? ' passt-nicht' : '');
      const groesse = m.andock.find((a) => a.art === 'rumpf')?.groesse ?? m.andock[0]?.groesse ?? '';
      z.innerHTML = `<span><span class="groesse">${groesse}</span>${m.name}</span><small>${m.werte?.masse ?? 0} t</small>`;
      z.title = passend && !passend.has(m.id) ? 'Kein freier Punkt am Schiff passt zu diesem Modul' : 'Wählen, dann leuchtenden Punkt am Schiff anklicken';
      z.addEventListener('click', () => waehleModul(m.id));
      liste.append(z);
    }
  }
}

const zahl = (x, n = 0) => x.toLocaleString('de-DE', { maximumFractionDigits: n, minimumFractionDigits: n });
function zeigeTafel() {
  $('e-name').value = entwurf.name ?? '';
  $('e-kennung').value = entwurf.kennung ?? '';
  const w = bau.werte;
  const reihen = [
    ['Teile', zahl(w.teile)], ['Länge · Breite · Höhe', `${zahl(bau.laenge)} · ${zahl(bau.breite)} · ${zahl(bau.hoehe)} m`],
    ['Masse', zahl(w.masse) + ' t'], ['Panzerung', zahl(w.panzer)], ['Schub', zahl(w.schub)],
    ['Schub je 1000 t', w.masse ? zahl(w.schub / w.masse * 1000, 1) : '–'], ['Besatzung', zahl(w.besatzung)],
    ['Türme', zahl(bau.tuerme.length)], ['Freie Punkte', zahl(bau.freiePunkte.length)],
  ];
  $('werte').innerHTML = reihen.map(([a, b]) => `<div class="reihe"><span>${a}</span><b>${b}</b></div>`).join('');
  const st = $('status');
  st.className = bau.flugfaehig ? 'gut' : 'schlecht';
  st.textContent = !bau.teile.length ? 'LEER — MODUL WÄHLEN' : bau.flugfaehig ? 'FLUGFÄHIG' : 'NICHT FLUGFÄHIG';
  const liste = $('meldungen'); liste.innerHTML = '';
  // WARUM gruppiert: viele offene Flächen erzeugen sonst eine lange Liste gleicher Warnungen
  const offen = bau.meldungen.filter((m) => m.code === 'offen_rumpf');
  for (const m of [...bau.meldungen.filter((m) => m.stufe === 'fehler'), ...bau.meldungen.filter((m) => m.stufe === 'warnung' && m.code !== 'offen_rumpf')]) {
    const z = document.createElement('div'); z.className = 'm ' + m.stufe; z.textContent = m.text;
    if (m.nr !== undefined) { z.dataset.nr = m.nr; z.title = 'Klick: Teil am Schiff zeigen'; z.addEventListener('click', () => { abwaehlen(); auswahl = m.nr; zeigeAuswahl(); }); }
    liste.append(z);
  }
  if (offen.length) {
    const z = document.createElement('div'); z.className = 'm warnung';
    z.textContent = `${offen.length} offene Rumpf-Andockfläche${offen.length > 1 ? 'n' : ''} (blaue Punkte) — mit Bug/Heck abschließen`;
    liste.append(z);
  }
  zeigePalette();
}

let meldungsUhr = 0;
function zeigeMeldungKurz(text) {
  const el = $('meldung'); el.textContent = text; el.classList.toggle('sichtbar', !!text);
  clearTimeout(meldungsUhr); if (text) meldungsUhr = setTimeout(() => el.classList.remove('sichtbar'), 2500);
}

// ---------------- Datei ----------------
$('e-name').addEventListener('change', (e) => aendere({ ...entwurf, name: e.target.value.trim() }));
$('e-kennung').addEventListener('change', (e) => aendere({ ...entwurf, kennung: e.target.value.trim().toUpperCase() }));
$('k-speichern').addEventListener('click', speichern);
$('k-neu').addEventListener('click', () => { abwaehlen(); aendere({ name: 'Neu', kennung: '', version: 1, teile: [] }); zeigeMeldungKurz('Leere Werft — erst ein Kommandomodul wählen und klicken'); });
$('k-beispiel').addEventListener('click', () => { abwaehlen(); aendere(kopie(BEISPIEL)); fokus(); });
$('k-laden').addEventListener('focus', fuelleListe);
$('k-laden').addEventListener('change', async (e) => {
  const name = e.target.value; e.target.value = '';
  if (!name) return;
  try {
    const r = await fetch('/api/schiffe/' + encodeURIComponent(name));
    const d = await r.json();
    if (!r.ok) throw new Error(d.fehler);
    const { name: n, kennung, version, teile } = d; // WARUM auswählen: fremde Felder (gespeichert …) überlesen
    const m = migriere({ name: n, kennung, version, teile });
    abwaehlen(); aendere(m.entwurf); fokus();
    zeigeMeldungKurz(m.fehler ?? `„${n}“ geladen`);
  } catch (f) { zeigeMeldungKurz('Laden fehlgeschlagen: ' + (f.message || 'Dev-Server?')); }
});
async function fuelleListe() {
  const sel = $('k-laden');
  try {
    const namen = await (await fetch('/api/schiffe')).json();
    sel.innerHTML = '<option value="">Laden …</option>' + namen.map((n) => `<option>${n.replace(/</g, '&lt;')}</option>`).join('');
  } catch { /* ohne Dev-Server keine Liste */ }
}
async function speichern() {
  const name = (entwurf.name || '').trim();
  if (!name) { zeigeMeldungKurz('Erst einen Namen eingeben'); $('e-name').focus(); return; }
  try {
    const r = await fetch('/api/schiffe/' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, kennung: entwurf.kennung ?? '', version: entwurf.version ?? 1, teile: entwurf.teile }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.fehler);
    $('e-datei').textContent = 'gespeichert: ' + d.datei;
    zeigeMeldungKurz(bau.flugfaehig ? `Gespeichert: ${d.datei}` : `Gespeichert (noch nicht flugfähig): ${d.datei}`);
  } catch (f) { zeigeMeldungKurz('Speichern fehlgeschlagen: ' + (f.message || 'Dev-Server?')); }
}

// ---------------- Schleife + Debug ----------------
/** Eigene Formen laden, in Modul + Geometrie umwandeln und registrieren (vor dem ersten Bau: Entwürfe nutzen sie evtl.). */
async function ladeEigeneFormen() {
  try {
    const namen = await (await fetch('/api/formen')).json();
    for (const name of namen) {
      try {
        const form = await (await fetch('/api/formen/' + encodeURIComponent(name))).json();
        const modul = formZuModul(form);
        // WARUM: feste Module nie überschreiben; zwei Dateien mit gleicher Id („Rumpf A“/„Rumpf-A“, Prüfer R16) → erste gilt
        if (KATALOG[modul.id]) { console.warn('Form übersprungen (Id schon vergeben):', name, modul.id); continue; }
        registriereForm(modul, formGeometrie(form, { schweissen: true }));
        KATALOG[modul.id] = modul;
        EIGENE.push(modul);
      } catch (f) { console.warn('Form nicht geladen:', name, f); }
    }
  } catch { /* ohne Dev-Server keine eigenen Formen */ }
}
// WARUM Promise statt top-level await: der Produktions-Build soll ohne TLA-Ziel auskommen
ladeEigeneFormen().then(() => {
  neuBauen();
  fokus();
  $('laden').remove();
  if (EIGENE.length) zeigeMeldungKurz(`${EIGENE.length} eigene Form${EIGENE.length > 1 ? 'en' : ''} aus der Werkstatt geladen — links ganz oben`);
});
let bildzeitSumme = 0, bilder = 0;
function schleife() {
  const t0 = performance.now();
  steuer.update();
  if (gewaehlt) { const puls = 1 + 0.18 * Math.sin(t0 * 0.006); for (const m of markenGruppe.children) m.scale.setScalar(m.userData.r * puls); }
  bild.zeichnen();
  bildzeitSumme += performance.now() - t0; bilder++;
  requestAnimationFrame(schleife);
}
requestAnimationFrame(schleife);

// CLAUDE.md Regel 6: Debug-Zugang
window.spiel = {
  get entwurf() { return kopie(entwurf); },
  get bau() { return bau; },
  get auswahl() { return auswahl; },
  /** Bildschirmpunkt (CSS-Pixel) der Mitte von Teil nr — für Klicktests. */
  bildpunkt(nr) {
    const k = pickKaesten.find((x) => x.nr === nr); if (!k) return null;
    const v = k.box.getCenter(new THREE.Vector3()).project(camera), r = $('leinwand').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  },
  lade(e) { abwaehlen(); aendere(kopie(e)); fokus(); },
  waehle: waehleModul,
  /** Modul ohne Maus ansetzen: an = { nr, punkt }, punkt = eigener Punkt. */
  setze(modul, an, punkt, dreh = 0) { aendere({ ...entwurf, teile: [...entwurf.teile, { nr: naechsteNr(entwurf), modul, an, punkt, dreh }] }); return bau.meldungen; },
  loesche(nr) { auswahl = nr; loescheAuswahl(); },
  rueckgaengig, wiederholen, fokus,
  ansicht(r = [0.75, 0.4, 0.85]) { const m = mitte(), d = Math.max(40, bau.laenge) * 1.3; steuer.target.copy(m); camera.position.copy(m).add(new THREE.Vector3(...r).normalize().multiplyScalar(d)); steuer.update(); bild.zeichnen(); },
  messwerte: () => { bild.zeichnen(); return bild.messwerte(); },
  bildzeit() { const z = bilder ? bildzeitSumme / bilder : 0; bildzeitSumme = 0; bilder = 0; return z; },
  andockLage,
};
