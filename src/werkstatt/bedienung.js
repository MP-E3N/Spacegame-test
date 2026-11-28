// ZWECK: Bedienung der Form-Werkstatt „Anfassen statt Einstellen“ (Runde 18, Nutzer: „Editor nicht intuitiv, Bearbeitung
//        fummelig“; Vorbilder nach Recherche: SketchUp/Shapr3D Push/Pull, Tinkercad Arbeitsebene).
//        1) PUSH/PULL: Fläche des GEWÄHLTEN Körpers leuchtet unter der Maus; linke Maus ziehen = Fläche heraus/hinein.
//           Maß am Mauszeiger, Raster 0,5 m (Strg = frei), rastet bündig an Flächen anderer Körper ein. Zahl tippen +
//           Enter = genaue Zugweite (auch direkt nach dem Loslassen: der letzte Zug wird auf die Zahl gesetzt).
//        2) SETZEN: Vorlage gewählt → Geist folgt der Maus und liegt bündig auf der Fläche darunter (ohne Fläche auf dem
//           Boden-Raster) → Klick setzt, Esc/Rechtsklick bricht ab.
// LIEFERT: erstelleBedienung(ctx) → { setzen(vorlage), setzeBauteil(typ), abbrechen(), aktiv(), taste(e) → bool, setztGerade(), zieht() }
//        3) BAUTEIL SETZEN (Runde 19): Geschütz/Antrieb gewählt → Geist sitzt auf der Fläche unter der Maus, Ring grün
//           (passt) oder rot (falsche Fläche, z. B. Triebwerk nicht am Heck) → Klick setzt. ctx.bauteilGeist(typ, p, n),
//           ctx.platziereBauteil({ typ, p, n }), ctx.passtAuf(typ, n), ctx.flaechenText(typ).
//          ctx = { scene, camera, leinwand, steuer, rohGruppe, wuerfel, griff, holeForm(), koerper(), waehle(id),
//                  vorschau(id, k), uebernehme(merk), setzeForm(form, merk), platziere(k), meldung(t), darf(), klickVerbraucht() }
//          + fremd() (Werkstatt ruft es bei JEDER Änderung; eigene Änderungen der Bedienung zählen nicht)
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

  // ---------- Pfeil-Griffe (Runde 21) ----------
  // WARUM (Nutzer R21: „ich kann keine Objekte mehr verschieben, weil ich dann immer die Flächen bearbeite“): seit R18
  // war Linksziehen auf dem gewählten Körper IMMER Push/Pull. Jetzt wie Tinkercad/Shapr3D: Körper ziehen = verschieben,
  // die Fläche zieht man am blauen Pfeil-Griff in ihrer Mitte. In gerader Ansicht (Würfel-Fläche) bekommen zusätzlich die
  // Seiten, die man von der Kante sieht, einen Pfeil am Rand → „Seite in einer Ansicht länger/kürzer machen“ (R21, 4b).
  const GRIFF_PX = 64;                 // Pfeillänge im Bild
  const griffMat = new THREE.MeshBasicMaterial({ color: 0x4aa8ff, depthTest: false, toneMapped: false, transparent: true, opacity: 0.9 });
  const griffHellMat = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, depthTest: false, toneMapped: false });
  const griffFangMat = new THREE.MeshBasicMaterial({ visible: false }); // dicke unsichtbare Fangröhre — leichter zu treffen
  const schaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.72, 10).translate(0, 0.36, 0);
  const spitzeGeo = new THREE.ConeGeometry(0.11, 0.28, 16).translate(0, 0.86, 0);
  const fangGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.05, 8).translate(0, 0.52, 0);
  const griffGruppe = new THREE.Group(); scene.add(griffGruppe);
  let griffe = [];      // [{ obj, f, netz, o (Welt), r (Welt), id }]
  let griffHover = null;
  function neuerGriff(o, r, f, netz, id) {
    const obj = new THREE.Group();
    const schaft = new THREE.Mesh(schaftGeo, griffMat), spitze = new THREE.Mesh(spitzeGeo, griffMat), fang = new THREE.Mesh(fangGeo, griffFangMat);
    for (const m of [schaft, spitze]) m.renderOrder = 40;
    obj.add(schaft, spitze, fang); obj.position.copy(o);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), r);
    griffGruppe.add(obj);
    const g = { obj, f, netz, o: o.clone(), r: r.clone(), id, teile: [schaft, spitze] };
    griffe.push(g); return g;
  }
  function leereGriffe() { griffGruppe.clear(); griffe = []; griffHover = null; }
  /** Griffe je Bild auf feste Bildgröße bringen (wie die Marker: auch in der Tele-Ansicht). */
  function griffGroesse() {
    const r = leinwand.getBoundingClientRect();
    for (const g of griffe) {
      const abst = camera.position.distanceTo(g.o);
      const mProPx = 2 * abst * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, r.height);
      g.obj.scale.setScalar(GRIFF_PX * mProPx);
    }
  }
  function griffTreffer(cx, cy) {
    if (!griffe.length) return null;
    const t = strahlVon(cx, cy).intersectObjects(griffe.map((g) => g.obj), true)[0];
    return t ? griffe.find((g) => g.obj === t.object.parent) : null;
  }
  function markiereGriff(g) {
    if (griffHover === g) return;
    if (griffHover) for (const m of griffHover.teile) m.material = griffMat;
    griffHover = g; if (g) for (const m of g.teile) m.material = griffHellMat;
  }
  /** Mitte (flächengewichtet) und Dreiecke einer Fläche im Netz-Raum — für Leuchtfläche und Griff-Lage. */
  function flaechenDreiecke(netz, k, f) {
    const g = netz.geometry, pos = g.attributes.position, ix = g.index, schl = schluesselVon(f), punkte = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
    const mitte = new THREE.Vector3(); let summe = 0;
    const anzahl = (ix ? ix.count : pos.count) / 3;
    for (let t = 0; t < anzahl; t++) {
      const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      m.copy(a).add(b).add(c).multiplyScalar(1 / 3); n.subVectors(b, a).cross(e.subVectors(c, a));
      const fl = n.length() / 2; n.normalize();
      if (schluesselVon(flaecheVon(k, m.toArray(), n.toArray(), t)) !== schl) continue;
      punkte.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); mitte.addScaledVector(m, fl); summe += fl;
    }
    return { punkte, mitte: summe > 0 ? mitte.multiplyScalar(1 / summe) : null };
  }
  /** Griff an die Mitte einer Fläche (Welt), Richtung = Zugrichtung der Fläche. */
  function griffAnFlaeche(netz, k, f, mitteLokal) {
    netz.updateWorldMatrix(true, false);
    const o = mitteLokal.clone().applyMatrix4(netz.matrixWorld);
    const r = new THREE.Vector3(...f.richtung).transformDirection(netz.matrixWorld).normalize();
    return neuerGriff(o, r, f, netz, k.id);
  }
  /**
   * Gerade Ansicht: Griffe an allen Flächen des gewählten Körpers, die man von der Kante sieht (Normale quer zum Blick) —
   * so lässt sich in der Seitenansicht die Oberseite hoch/runter ziehen oder in der Draufsicht die Kappe vor/zurück.
   */
  let kantenSchl = '';
  function zeigeKantenGriffe() {
    const k = ctx.koerper(), blick = ctx.gerade?.();
    const schl = k && blick && !k.fest && ctx.darf() && !zug && !schieb ? k.id + JSON.stringify(k.spanten) + JSON.stringify(k.pos) + JSON.stringify(k.dreh) + blick.toArray().join() : '';
    if (schl === kantenSchl) return;
    // WARUM nur beim Wechsel leeren: in normaler Ansicht gehört der eine Griff der Fläche unter der Maus (hoverAn)
    const warKanten = !!kantenSchl; kantenSchl = schl;
    if (warKanten || schl) { leereGriffe(); hell.visible = false; hover = null; }
    if (!schl) return;
    for (const netz of alleNetze(k.id)) {
      netz.updateWorldMatrix(true, false);
      const g = netz.geometry, pos = g.attributes.position, ix = g.index, gesehen = new Set();
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3();
      const anzahl = (ix ? ix.count : pos.count) / 3;
      for (let t = 0; t < anzahl; t++) {
        const i0 = ix ? ix.getX(t * 3) : t * 3, i1 = ix ? ix.getX(t * 3 + 1) : t * 3 + 1, i2 = ix ? ix.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
        m.copy(a).add(b).add(c).multiplyScalar(1 / 3); n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
        const f = flaecheVon(k, m.toArray(), n.toArray(), t); if (!f) continue;
        const s = schluesselVon(f); if (gesehen.has(s)) continue; gesehen.add(s);
        const r = new THREE.Vector3(...f.richtung).transformDirection(netz.matrixWorld).normalize();
        if (Math.abs(r.dot(blick)) > 0.05) continue; // nur Flächen, die man von der Kante sieht
        const { mitte } = flaechenDreiecke(netz, k, f); if (mitte) griffAnFlaeche(netz, k, f, mitte);
      }
    }
  }

  let hover = null;   // { id, netz, f, schluessel }
  let unten = null;   // { x, y, art: 'flaeche' | 'setzen' | 'koerper' | 'bauteil', … } — gedrückt, noch nicht entschieden: Klick oder Zug
  let schieb = null;  // R21: laufendes Verschieben { id, basis, merk, ebene, p0, vz (Spiegel-Vorzeichen), d }
  let zug = null;     // laufender Push/Pull: { id, netz, f, basis, merk, o (Welt), r (Welt), d, buendig }
  let letzter = null; // letzter fertiger Zug (für Zahl + Enter danach): { id, f, basis, merk }
  let eingabe = '';   // getippte Zahl
  let eigen = false;  // true, während die Bedienung selbst ändert (dann ist es keine „fremde“ Änderung)
  const selbst = (fn) => { eigen = true; try { fn(); } finally { eigen = false; } };
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
    const { punkte, mitte } = flaechenDreiecke(netz, k, f);
    hell.geometry.dispose();
    hell.geometry = new THREE.BufferGeometry(); hell.geometry.setAttribute('position', new THREE.Float32BufferAttribute(punkte, 3));
    hell.matrix.copy(netz.matrixWorld); hell.matrixWorld.copy(netz.matrixWorld); hell.visible = punkte.length > 0;
    return mitte;
  }

  // ---------- Hover ----------
  /** Erster Körper-Treffer unter der Maus (Minus-Körper zählen, Bauteile davor verdecken). */
  function koerperTreffer(cx, cy) {
    const st = strahlVon(cx, cy);
    const t = st.intersectObjects(rohGruppe.children, true).find((x) => x.object.isMesh && x.object.userData.id !== undefined);
    if (!t) return null;
    const tb = ctx.bauteilGruppe ? st.intersectObjects(ctx.bauteilGruppe.children, true).find((x) => x.object.isMesh && x.object.userData.bauteil !== undefined) : null;
    if (tb && tb.distance <= t.distance + 0.5) return null; // Bauteil liegt davor — die Werkstatt wählt es
    return t;
  }
  function bauteilTreffer(cx, cy) {
    if (!ctx.bauteilGruppe) return null;
    const st = strahlVon(cx, cy);
    const tb = st.intersectObjects(ctx.bauteilGruppe.children, true).find((x) => x.object.isMesh && x.object.userData.bauteil !== undefined);
    if (!tb) return null;
    const t = st.intersectObjects(rohGruppe.children, true).find((x) => x.object.isMesh);
    return !t || tb.distance <= t.distance + 0.5 ? tb : null;
  }
  function hoverAn(cx, cy) {
    if (!ctx.darf()) { aus(); leereGriffe(); kantenSchl = ''; return; }
    zeigeKantenGriffe();
    // 1) Pfeil-Griff unter der Maus? (hat Vorrang — er ragt aus der Fläche heraus)
    const g = griffTreffer(cx, cy);
    if (g) { markiereGriff(g); leinwand.style.cursor = 'grab'; return; }
    markiereGriff(null);
    const k = ctx.koerper();
    // 2) Fläche des gewählten Körpers: leuchtet + bekommt ihren Pfeil (nicht in gerader Ansicht — dort stehen die Kantengriffe)
    if (k && !k.fest && !ctx.gerade?.()) {
      const t = strahlVon(cx, cy).intersectObjects(alleNetze(k.id), false)[0];
      // Verdeckt? Erster Treffer aller rohen Netze (auch in der verschweißten Ansicht da) — Minus-Körper verdecken nicht
      const form = ctx.holeForm();
      const vorne = t && strahlVon(cx, cy).intersectObjects(rohGruppe.children, true).find((x) => x.object.userData.id === k.id || form.koerper.find((y) => y.id === x.object.userData.id)?.op !== 'minus');
      const f = t && !(vorne && vorne.object.userData.id !== k.id && vorne.distance < t.distance - 0.01) ? flaecheAus(t, k) : null;
      if (f) {
        const schl = k.id + '#' + t.object.uuid + '#' + schluesselVon(f) + '#' + JSON.stringify(k.spanten) + JSON.stringify(k.pos);
        if (hover?.schl !== schl) {
          hover = { id: k.id, netz: t.object, f, schl };
          const mitte = zeigeHell(t.object, k, f);
          leereGriffe(); if (mitte) griffAnFlaeche(t.object, k, f, mitte);
        }
        leinwand.style.cursor = 'move'; return;
      }
    }
    // 3) irgendein Körper / Bauteil: Ziehen verschiebt ihn
    if (hover) { hover = null; hell.visible = false; if (!ctx.gerade?.()) leereGriffe(); }
    const t = koerperTreffer(cx, cy);
    const fest = t && ctx.holeForm().koerper.find((x) => x.id === t.object.userData.id)?.fest;
    leinwand.style.cursor = (t && !fest) || bauteilTreffer(cx, cy) ? 'move' : '';
  }
  // WARUM Griffe beim Verlassen stehen lassen: man fährt von der Fläche zum Pfeil — dabei verlässt die Maus kurz die Fläche
  function aus() { if (hover) { hover = null; hell.visible = false; leinwand.style.cursor = ''; } }

  // ---------- Verschieben (Runde 21) ----------
  /** Körper auf der Ebene der angefassten Fläche verschieben (Oberseite angefasst → waagerecht; Seite → in der Seitenebene). */
  function startSchieben(e) {
    const form = ctx.holeForm(), k = form.koerper.find((x) => x.id === unten.id); if (!k || k.fest) { unten = null; return; }
    if (ctx.koerper()?.id !== k.id) ctx.waehle(k.id);
    const n = unten.n.clone(), p0 = unten.punkt.clone();
    // WARUM Spiegel-Vorzeichen: wer die Spiegelkopie anfasst, bewegt das Original gespiegelt (Kopie folgt der Maus)
    schieb = { id: k.id, basis: JSON.parse(JSON.stringify(k)), merk: JSON.parse(JSON.stringify(form)), ebene: new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0), p0, vz: unten.vz, d: [0, 0, 0] };
    leereGriffe(); hell.visible = false; hover = null;
    ctx.steuer.enabled = false; leinwand.style.cursor = 'grabbing';
    try { leinwand.setPointerCapture(e.pointerId); } catch { /* egal */ }
    bewegeSchieben(e);
  }
  function bewegeSchieben(e) {
    const p = new THREE.Vector3();
    if (!strahlVon(e.clientX, e.clientY).ray.intersectPlane(schieb.ebene, p)) return;
    const raster = (v) => (e.ctrlKey ? Math.round(v * 100) / 100 : Math.round(v * 2) / 2) + 0;
    const d = p.sub(schieb.p0).toArray().map((v, i) => raster(v * schieb.vz[i]));
    schieb.d = d;
    const neu = { ...schieb.basis, pos: schieb.basis.pos.map((v, i) => Math.round((v + d[i]) * 1000) / 1000 + 0) };
    ctx.vorschau(schieb.id, neu);
    const r = leinwand.getBoundingClientRect();
    mass.innerHTML = `<b>verschieben</b> · x ${zahl(d[0])} · y ${zahl(d[1])} · z ${zahl(d[2])} m<br><span>Strg = ohne Raster · Esc = abbrechen</span>`;
    mass.style.left = (e.clientX - r.left + 18) + 'px'; mass.style.top = (e.clientY - r.top + 14) + 'px'; mass.classList.add('sichtbar');
  }
  function endeSchieben(abbrechen = false) {
    const s = schieb; schieb = null; ctx.steuer.enabled = true; leinwand.style.cursor = ''; versteckeMass(); kantenSchl = '';
    if (abbrechen || s.d.every((v) => v === 0)) { selbst(() => ctx.setzeForm(s.merk, null)); return; }
    selbst(() => ctx.uebernehme(s.merk));
    ctx.meldung(`Körper ${s.id} verschoben (${s.d.map((v) => zahl(v)).join(' / ')} m) — Strg+Z = zurück`);
  }

  // ---------- Bauteil umsetzen (Runde 21; R19 offen: „Bauteile verschieben — heute löschen + neu setzen“) ----------
  function startUmsetzen(e) {
    const form = ctx.holeForm(), b = form.bauteile.find((x) => x.id === unten.bauteil); if (!b) { unten = null; return; }
    const merk = JSON.parse(JSON.stringify(form));
    // Bauteil vorübergehend herausnehmen; der Geist zeigt die neue Lage (gleicher Weg wie beim Setzen)
    selbst(() => ctx.setzeForm({ ...form, bauteile: form.bauteile.filter((x) => x.id !== b.id) }, null));
    setzen = { art: 'bauteil', typ: b.typ, p: null, n: null, gut: false, umsetzen: { b, merk } };
    try { leinwand.setPointerCapture(e.pointerId); } catch { /* egal */ }
    ctx.steuer.enabled = false;
    bewegeBauteil(e.clientX, e.clientY);
  }
  function endeUmsetzen(abbrechen = false) {
    const { b, merk } = setzen.umsetzen, ok = !abbrechen && setzen.p && setzen.gut;
    const neu = ok ? { ...b, p: setzen.p, n: setzen.n } : b;
    setzen = null; ring.visible = false; ctx.steuer.enabled = true;
    if (bauteilGeist) { scene.remove(bauteilGeist); bauteilGeist.traverse((x) => x.geometry?.dispose()); bauteilGeist = null; }
    if (!ok) { selbst(() => ctx.setzeForm(merk, null)); if (!abbrechen) ctx.meldung('Hier passt das Bauteil nicht — zurück an seinen Platz'); return; }
    selbst(() => ctx.setzeForm({ ...merk, bauteile: merk.bauteile.map((x) => (x.id === b.id ? neu : x)) }, merk));
    ctx.meldung(`${ctx.bauteilName(b.typ)} umgesetzt — Strg+Z = zurück`);
  }

  // ---------- Push/Pull ----------
  /** Push/Pull am Pfeil-Griff g (R21: nur noch am Griff — Ziehen am Körper verschiebt). Zuggerade = Griff-Fuß + Richtung. */
  function startZug(e) {
    const g = unten.griff, k = ctx.holeForm().koerper.find((x) => x.id === g.id); if (!k || k.fest) { unten = null; return; }
    zug = { id: k.id, netz: g.netz, f: g.f, basis: JSON.parse(JSON.stringify(k)), merk: JSON.parse(JSON.stringify(ctx.holeForm())), o: g.o.clone(), r: g.r.clone(), d: 0, buendig: null };
    letzter = null; eingabe = ''; leereGriffe(); kantenSchl = '';
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
    if (abbrechen || !z.d) { selbst(() => ctx.setzeForm(z.merk, null)); versteckeMass(); return; }
    selbst(() => ctx.uebernehme(z.merk));
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
    selbst(() => ctx.setzeForm({ ...form, koerper: form.koerper.map((k) => (k.id === letzter.id ? neu : k)) }, null));
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

  // ---------- Bauteil setzen (Runde 19) ----------
  const ringGut = new THREE.MeshBasicMaterial({ color: 0x9ad27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false, toneMapped: false });
  const ringSchlecht = new THREE.MeshBasicMaterial({ color: 0xe06040, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 3.4, 40), ringGut); // breiter (Spieltest R19, Kann: im kleinen Bild kaum zu sehen) ring.renderOrder = 35; ring.visible = false; scene.add(ring);
  let bauteilGeist = null;
  function startBauteil(typ) {
    abbrechen();
    setzen = { art: 'bauteil', typ, p: null, n: null, gut: false };
    ctx.zeigeFlaecheFuer?.(typ); // WARUM: Triebwerke gehören ans Heck — das sah man in der Startansicht nicht (Spieltest R19)
    ctx.meldung(`${ctx.bauteilName(typ)}: auf die ${ctx.flaechenText(typ)} zeigen und klicken (Esc = abbrechen)`);
  }
  function bewegeBauteil(cx, cy) {
    // WARUM Minus-Körper überspringen: auf einen Ausschnitt kann man nichts montieren
    const form = ctx.holeForm();
    const t = strahlVon(cx, cy).intersectObjects(rohGruppe.children, true)
      .find((x) => x.object.isMesh && form.koerper.find((k) => k.id === x.object.userData.id)?.op !== 'minus');
    if (!t) { ring.visible = false; if (bauteilGeist) bauteilGeist.visible = false; setzen.p = null; return; }
    const nw = t.face.normal.clone().transformDirection(t.object.matrixWorld).toArray();
    const i = [0, 1, 2].reduce((b, a) => (Math.abs(nw[a]) > Math.abs(nw[b]) ? a : b), 0), n = [0, 0, 0]; n[i] = Math.sign(nw[i]) || 1;
    // quer zur Normalen auf 0,5 m rasten (Strg-frei kommt später), längs n genau auf der Fläche (0,1 mm)
    let p = t.point.toArray().map((v, j) => (j === i ? Math.round(v * 1e4) / 1e4 : Math.round(v * 2) / 2) + 0);
    // Einrasten (Spieltest R19, Muss): Haupttriebwerke auf die Schwerpunkt-Achse, alles nahe der Mitte auf x = 0
    p = ctx.rasteBauteil?.(setzen.typ, p, n) ?? p;
    const schl = p.join() + '|' + n.join();
    if (setzen.schl !== schl) {
      const warGut = setzen.gut;
      setzen.schl = schl; setzen.p = p; setzen.n = n; setzen.gut = ctx.passtAuf(setzen.typ, n);
      if (warGut !== false && !setzen.gut) ctx.meldung(`Hier nicht — ${ctx.bauteilName(setzen.typ)} nur auf die ${ctx.flaechenText(setzen.typ)}`);
      if (bauteilGeist) { scene.remove(bauteilGeist); bauteilGeist.traverse((x) => x.geometry?.dispose()); } // Prüfer R19: sonst Leck je Mausschritt
      bauteilGeist = ctx.bauteilGeist(setzen.typ, p, n); if (bauteilGeist) scene.add(bauteilGeist);
      ring.material = setzen.gut ? ringGut : ringSchlecht;
      ring.position.set(...p).addScaledVector(new THREE.Vector3(...n), 0.05);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...n));
    }
    ring.visible = true; if (bauteilGeist) bauteilGeist.visible = true;
  }
  function setzeBauteilAb() {
    if (!setzen?.p) return;
    if (!setzen.gut) { ctx.meldung(`${ctx.bauteilName(setzen.typ)} passt nur auf die ${ctx.flaechenText(setzen.typ)}`); return; }
    const b = { typ: setzen.typ, p: setzen.p, n: setzen.n };
    ctx.platziereBauteil(b); setzen.schl = null; // WARUM im Modus bleiben: man setzt meist mehrere (Triebwerke, Türme)
  }

  // ---------- Setzen (Tinkercad-Arbeitsebene) ----------
  function startSetzen(vorlage) {
    abbrechen();
    const k = normalisiere({ koerper: [neuerKoerper(vorlage, -1, { pos: [0, 0, 0] })] }).koerper[0];
    setzen = { vorlage, k, h: huelle(k), pos: null };
    geist.geometry = koerperGeometrie(k); geist.visible = false;
    ctx.meldung(`${NAMEN[vorlage] ?? vorlage}: auf eine Fläche zeigen und klicken (Esc = abbrechen)`);
  }
  function bewegeSetzen(cx, cy) {
    if (setzen.art === 'bauteil') { bewegeBauteil(cx, cy); return; }
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
    if (setzen?.art === 'bauteil') { setzeBauteilAb(); return; }
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
    if (e.button !== 0 || ctx.griff.axis || !ctx.darf()) return;
    // WARUM beim Drücken neu bestimmen (Spieltest R18, Muss): ohne Mausbewegung davor gälte noch der alte Zustand
    hoverAn(e.clientX, e.clientY);
    // 1) Pfeil-Griff → Push/Pull (Seite/Kappe länger, kürzer)
    const g = griffTreffer(e.clientX, e.clientY);
    if (g) { unten = { x: e.clientX, y: e.clientY, art: 'flaeche', griff: g, id: g.id }; ctx.klickVerbraucht(); e.stopPropagation(); return; }
    // 2) Bauteil → Ziehen setzt es um (Klick wählt es weiter über die Werkstatt)
    const tb = bauteilTreffer(e.clientX, e.clientY);
    if (tb) { unten = { x: e.clientX, y: e.clientY, art: 'bauteil', bauteil: tb.object.userData.bauteil }; ctx.klickVerbraucht(); e.stopPropagation(); return; }
    // 3) Körper → Ziehen verschiebt (Klick wählt)
    const t = koerperTreffer(e.clientX, e.clientY);
    if (!t) return; // ins Leere: Kamera dreht
    const id = t.object.userData.id, k = ctx.holeForm().koerper.find((x) => x.id === id);
    if (!k) return;
    // Ebene der angefassten Fläche (auf die Hauptachse gerastet) und Spiegel-Vorzeichen des getroffenen Netzes
    const nw = t.face.normal.clone().transformDirection(t.object.matrixWorld);
    const i = [0, 1, 2].reduce((b, a) => (Math.abs(nw.getComponent(a)) > Math.abs(nw.getComponent(b)) ? a : b), 0), n = new THREE.Vector3(); n.setComponent(i, 1);
    const sp = t.object.parent?.isGroup && t.object.parent !== rohGruppe ? t.object.parent.scale.toArray() : [1, 1, 1];
    unten = { x: e.clientX, y: e.clientY, art: 'koerper', id, punkt: t.point.clone(), n, vz: sp.map((v) => Math.sign(v) || 1), fest: !!k.fest };
    ctx.klickVerbraucht();
    if (k.fest) return; // fixiert: Ziehen dreht die Kamera, Klick wählt (pointerup)
    e.stopPropagation(); // WARUM: dieser Druck gehört dem Körper (Verschieben), nicht der Kamera
  }, { capture: true });
  addEventListener('pointermove', (e) => {
    if (zug) { bewegeZug(e); return; }
    if (schieb) { bewegeSchieben(e); return; }
    if (setzen?.umsetzen) { bewegeBauteil(e.clientX, e.clientY); return; }
    const weit = unten && Math.hypot(e.clientX - unten.x, e.clientY - unten.y) > KLICK_PX;
    if (weit && unten.art === 'flaeche') { startZug(e); return; }
    if (weit && unten.art === 'koerper' && !unten.fest) { startSchieben(e); return; }
    if (weit && unten.art === 'bauteil') { startUmsetzen(e); return; }
    if (!aufLeinwand(e)) return;
    if (setzen) { bewegeSetzen(e.clientX, e.clientY); return; }
    if (!unten) hoverAn(e.clientX, e.clientY);
  }, { capture: true });
  addEventListener('pointerup', (e) => {
    const u = unten; unten = null;
    if (zug) { endeZug(); e.stopPropagation(); return; }
    if (schieb) { endeSchieben(); e.stopPropagation(); return; }
    if (setzen?.umsetzen) { endeUmsetzen(); e.stopPropagation(); ctx.klickVerbraucht(); return; }
    if (!u) return;
    const klick = Math.hypot(e.clientX - u.x, e.clientY - u.y) <= KLICK_PX;
    // WARUM hier KEIN stopPropagation (Prüfer R18, Muss): der Druck lief beim Setzen zu OrbitControls durch; ohne dessen
    // Pointerup bliebe der Zeiger dort registriert (Kamera dreht ohne Taste weiter). Die Auswahl der Werkstatt schlucken wir.
    if (u.art === 'setzen' && klick) { bewegeSetzen(e.clientX, e.clientY); setzeAb(); ctx.klickVerbraucht(); return; }
    if ((u.art === 'flaeche' || u.art === 'koerper') && klick) { ctx.waehle(u.id); if (!u.fest) e.stopPropagation(); } // Klick = Körper wählen
    if (u.art === 'bauteil' && klick) { ctx.waehleBauteil(u.bauteil); e.stopPropagation(); }
  }, { capture: true });

  // Prüfer R18: bricht der Browser den Zeiger ab (Fokuswechsel, Touch), Zug sauber beenden statt Kamera gesperrt zu lassen
  addEventListener('pointercancel', () => { unten = null; if (zug) endeZug(true); if (schieb) endeSchieben(true); if (setzen?.umsetzen) endeUmsetzen(true); }, { capture: true });
  leinwand.addEventListener('lostpointercapture', () => { if (zug && !unten) endeZug(true); });

  function taste(e) {
    if (schieb && e.key === 'Escape') { endeSchieben(true); ctx.meldung('Verschieben abgebrochen'); return true; }
    if (setzen?.umsetzen && e.key === 'Escape') { endeUmsetzen(true); ctx.meldung('Umsetzen abgebrochen'); return true; }
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
  function vergiss() { letzter = null; eingabe = ''; if (!zug && !schieb) versteckeMass(); aus(); if (!zug && !schieb) { leereGriffe(); kantenSchl = ''; } }
  /** Je Bild (Werkstatt-Schleife): Griffe auf feste Bildgröße, Kantengriffe nach Würfel-Fahrten/Zoom nachziehen. */
  function jedesBild() { if (!zug && !schieb && !setzen) zeigeKantenGriffe(); griffGroesse(); }
  function abbrechen() {
    if (zug) endeZug(true);
    setzen = null; geist.visible = false; unten = null; vergiss();
    ring.visible = false; if (bauteilGeist) { scene.remove(bauteilGeist); bauteilGeist.traverse((x) => x.geometry?.dispose()); bauteilGeist = null; }
  }

  return { setzen: startSetzen, setzeBauteil: startBauteil, abbrechen, vergiss, fremd: () => { if (!eigen && !zug && !schieb) vergiss(); }, taste, aktiv: () => !!(zug || setzen || schieb), setztGerade: () => !!setzen, zieht: () => !!(zug || schieb), jedesBild,
    get griffe() { return griffe.map((g) => ({ id: g.id, f: g.f, o: g.o.toArray(), r: g.r.toArray() })); },
    /** Bildpunkt (clientX/Y) der Griffspitze i — für Mausprüfungen */
    griffBild(i) { const g = griffe[i]; if (!g) return null; const v = g.o.clone().addScaledVector(g.r, g.obj.scale.x * 0.8).project(camera), r = leinwand.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
    // Debug/Prüfung: Fläche unter einem Bildpunkt und Zug ohne Maus
    flaecheBei(cx, cy) { hoverAn(cx, cy); return hover && { id: hover.id, ...hover.f }; },
    get hover() { return hover; } };
}
