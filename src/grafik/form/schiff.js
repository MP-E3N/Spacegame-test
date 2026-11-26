// ZWECK: Freiflug-Modell eines selbst gebauten Schiffs (Runde 19, Probeflug): Hülle aus der Form (formGeometrie, CSG),
//        Haupttriebwerke und Manöverdüsen-Blöcke als feste Geometrie, Geschütze über turm(), Düsen-Glut und
//        Steuer-Puffs über ausstattung() — und die Grafik eines einzelnen Bauteils für die Werkstatt-Vorschau.
// LIEFERT: erstelleFormSchiff(scene, schiff, { mats, effekte }) → { name, kennung, laenge, gruppe, tuerme,
//          darstellen(pos, rot, z, zeit, dt), drawCalls } (wie erstelleBollwerk) · bauteilGrafik(eintrag, mats, form)
//          → THREE.Group in FORM-Koordinaten · steuerNamen(duesen) (Puff-Namen nach Lage) · STEUER_NAMEN
// REGEL (Protokoll R19, Entscheidungen 7–11):
//   - schiff = formZuSchiff(form): { name, kennung, laenge, kugeln, tuerme, duesen, werte, form, versatz, schwerpunkt }.
//     Ursprung = Schwerpunkt: tuerme/duesen kommen schon verschoben; Hülle und Bauteile verschiebt HIER `versatz`
//     (Schiff = Form + versatz).
//   - Hülle + alle festen Bauteile je Material EIN Netz (fuegeZusammen); nur die Türme bleiben eigene Gruppen, weil sie
//     sich drehen (Index = id wie schiff.tuerme). Haupttriebwerke nur mit n = −Z (sonst gemeldet, ohne Glut).
//   - Gehäuse der Haupttriebwerke höchstens so lang, wie das Material hinter der Heckfläche tief ist (tiefeLaengs) —
//     WARUM: auf einer dünnen Stufe stäche es sonst vorn wieder heraus.
//   - Ein Licht je Schiff (ausstattung): der Freiflug baut das Schiff vor dem ersten Bild (E9) → Lichtanzahl fest.
//     effekte: false baut ohne ausstattung (ohne document, für Node-Messungen und Vorschauen).
import * as THREE from 'three';
import { nur, kiste, materialien, leereEimer, fuegeZusammen, turm, duese, ausstattung, LICHT } from '../schiff/bauteile.js';
import { formGeometrie } from './schweissen.js';
import { normalisiere, bauteilListe } from '../../sim/form/form.js';
import { tiefeLaengs } from '../../sim/form/kugeln.js';
import { BAUTEILE } from '../../sim/form/bauteile.js';
import { turmAusBauteil } from '../../sim/form/geschuetze.js';

/** Puff-Namen, die ausstattung() kennt (Zuordnung zu Drehwunsch und Querschub dort). */
export const STEUER_NAMEN = ['bugL', 'bugR', 'bugO', 'bugU', 'heckL', 'heckR', 'heckO', 'heckU', 'podLO', 'podLU', 'podRO', 'podRU'];

const ablageHuelle = new Map(); // WARUM: CSG dauert 20–100 ms — eine Form wird je Sitzung nur einmal verschweißt

// ---------------- Bauteile als Geometrie ----------------
/** Drehung, die (0, 0, −1) auf n legt (Triebwerke) bzw. (0, 1, 0) auf n (Blöcke, Geschütze). */
const auf = (von, n) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...von), new THREE.Vector3(...n).normalize());

/** Haupttriebwerk: Glocke (achteckig), Gehäuse, Stellzylinder, Montagerahmen. Lokal: Fuß im Ursprung, Düse nach −Z. */
function triebwerkLokal(eimer, r, gehaeuseLaenge) {
  const d = duese(eimer, 0, 0, 0, r, { seg: 8, gehaeuse: 1.18, gehaeuseLaenge });
  // Montagerahmen: kantiger Flansch auf der Heckfläche (verdeckt die Fuge zwischen Gehäuse und Hülle)
  const f = r * 1.32;
  eimer.dunkel.push(kiste(2 * f, 0.35 * r, 0.4, 0, f - 0.175 * r, -0.05), kiste(2 * f, 0.35 * r, 0.4, 0, -f + 0.175 * r, -0.05),
    kiste(0.35 * r, 2 * f, 0.4, f - 0.175 * r, 0, -0.05), kiste(0.35 * r, 2 * f, 0.4, -f + 0.175 * r, 0, -0.05));
  return d;
}
/** Manöverdüsen-Block: kantiges Gehäuse mit drei Auslässen. Lokal: Fuß im Ursprung, +Y = Flächennormale. */
function steuerLokal(eimer, r) {
  const s = Math.max(0.4, r);
  eimer.dunkel.push(kiste(2.6 * s, 0.4 * s, 2.6 * s, 0, 0.2 * s, 0));            // Grundplatte
  eimer.rumpf.push(kiste(1.8 * s, 1.2 * s, 1.8 * s, 0, 1.0 * s, 0));             // Gehäuse
  eimer.schacht.push(kiste(0.9 * s, 0.12 * s, 0.9 * s, 0, 1.62 * s, 0),          // Auslass nach außen
    kiste(0.12 * s, 0.6 * s, 0.6 * s, 0.92 * s, 1.0 * s, 0), kiste(0.12 * s, 0.6 * s, 0.6 * s, -0.92 * s, 1.0 * s, 0));
  eimer.warn.push(kiste(1.84 * s, 0.14 * s, 1.84 * s, 0, 0.5 * s, 0));          // Warnstreifen
}
/** Geometrie eines Bauteils (Lokal → Form/Schiff) in die Eimer; versatz verschiebt zusätzlich. Gibt Düsen-Info zurück. */
function bauteilInEimer(eintrag, eimer, form, versatz = [0, 0, 0]) {
  const kat = BAUTEILE[eintrag.b.typ];
  if (!kat || kat.art !== 'antrieb') return null;
  const lokal = leereEimer(), n = eintrag.n, haupt = eintrag.b.typ !== 'steuer'; // Katalog R19: triebwerk_s/m/l, steuer
  let info = null;
  if (haupt) {
    const r = kat.r ?? 2;
    // Gehäuse-Länge aus der Materialtiefe hinter der Fläche (mindestens 0,5 m, höchstens 6 m)
    const tiefe = form ? tiefeLaengs(form, eintrag.p, n, 6) : 5;
    info = { ...triebwerkLokal(lokal, r, Math.max(0.5, Math.min(6, tiefe))), tiefe };
  } else steuerLokal(lokal, kat.r ?? 0.8);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...eintrag.p.map((v, i) => v + versatz[i])),
    haupt ? auf([0, 0, -1], n) : auf([0, 1, 0], n), new THREE.Vector3(1, 1, 1));
  for (const [name, l] of Object.entries(lokal)) for (const g of l) eimer[name].push(g.applyMatrix4(m));
  return info;
}

/**
 * Grafik eines einzelnen Bauteils für die Werkstatt (Lage fertig, FORM-Koordinaten). eintrag aus bauteilListe(form).
 * Geschütze über turmAusBauteil + turm() (eigene Gruppen); unmontierbar (Seite) → roter Platzhalter.
 */
export function bauteilGrafik(eintrag, mats = materialien(), form = null) {
  const g = new THREE.Group(); g.name = 'bauteil-' + eintrag.b.id + (eintrag.kopie ? '-' + eintrag.kopie : '');
  const kat = BAUTEILE[eintrag.b.typ];
  if (kat?.art === 'geschuetz') {
    const t = form ? turmAusBauteil(eintrag, 0, form) : null;
    if (t) turm(g, mats, t);
    else { // Platzhalter: Turm passt hier nicht (Seitenmontage) — sichtbar machen, nicht verstecken
      const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats.warn); m.position.set(...eintrag.p); g.add(m);
    }
    return g;
  }
  const eimer = leereEimer();
  bauteilInEimer(eintrag, eimer, form);
  fuegeZusammen(eimer, mats, g, 'bauteil');
  return g;
}

// ---------------- Manöver-Puffs ----------------
/**
 * Steuerdüsen auf die festen Puff-Namen verteilen (E8). Lage relativ zum Schwerpunkt (= Ursprung): vor/hinter → bug/heck,
 * n ±X → L/R (+X = Backbord = L), n ±Y → O/U; liegt ein O/U-Block weit außen (|x| > 40 % der halben Breite), dient er dem
 * Rollen → pod{L|R}{O|U}. Mehrere Blöcke auf einem Namen: Puff an ihrer gemittelten Lage. n = ±Z wird nicht gezeigt.
 * → { name: [x, y, z, dx, dy, dz] } wie ausstattung() es erwartet.
 */
export function steuerNamen(duesen, halbeBreite = 1) {
  const sammel = {};
  for (const d of duesen) {
    if (d.art !== 'steuer') continue;
    const [nx, ny] = d.n, vorn = d.z >= 0 ? 'bug' : 'heck';
    let name = null;
    if (Math.abs(nx) > 0.5) name = vorn + (nx > 0 ? 'L' : 'R');
    else if (Math.abs(ny) > 0.5) name = Math.abs(d.x) > 0.4 * halbeBreite ? 'pod' + (d.x > 0 ? 'L' : 'R') + (ny > 0 ? 'O' : 'U') : vorn + (ny > 0 ? 'O' : 'U');
    if (!name) continue;
    (sammel[name] ??= []).push(d);
  }
  const aus = {};
  for (const [name, l] of Object.entries(sammel)) {
    const m = (f) => l.reduce((s, d) => s + f(d), 0) / l.length, h = Math.max(0.4, m((d) => d.r ?? 0.8));
    // Puff vor dem Auslass: Fuß + n · Blockhöhe
    aus[name] = [m((d) => d.x + d.n[0] * 1.7 * h), m((d) => d.y + d.n[1] * 1.7 * h), m((d) => d.z + d.n[2] * 1.7 * h), l[0].n[0], l[0].n[1], l[0].n[2]];
  }
  return aus;
}

// ---------------- Schiff ----------------
/** Freiflug-Modell (siehe Kopf). */
export function erstelleFormSchiff(scene, schiff, { mats = materialien(), effekte = true } = {}) {
  const form = normalisiere(schiff.form), v = schiff.versatz ?? [0, 0, 0];
  const gruppe = new THREE.Group(); gruppe.name = 'form-schiff';
  const eimer = leereEimer();

  // Hülle (CSG, einmal je Form) — UVs fallen weg, fuegeZusammen rechnet sie in Schiffskoordinaten neu
  const schluessel = JSON.stringify(form.koerper);
  let huelle = ablageHuelle.get(schluessel);
  if (!huelle) { huelle = formGeometrie(form, { pruefen: false }); ablageHuelle.set(schluessel, huelle); }
  const m4 = new THREE.Matrix4().makeTranslation(v[0], v[1], v[2]);
  for (const [name, g] of Object.entries(huelle)) (eimer[name] ?? eimer.rumpf).push(nur(g.clone()).applyMatrix4(m4));

  // Feste Bauteile (Haupttriebwerke, Manöverblöcke) aus der Bauteilliste der Form
  const meldungen = [];
  const liste = form.bauteile?.length ? bauteilListe(form) : [];
  for (const e of liste) {
    const kat = BAUTEILE[e.b.typ];
    if (kat?.art !== 'antrieb') continue;
    const info = bauteilInEimer(e, eimer, form, v);
    if (info && !(e.n[2] === -1 && e.n[0] === 0 && e.n[1] === 0)) meldungen.push({ code: 'antrieb_flaeche', stufe: 'warnung', text: 'Triebwerk zeigt nicht nach hinten — ohne Glut', bauteil: e.b.id });
  }
  fuegeZusammen(eimer, mats, gruppe, 'form');

  // Geschütze (eigene Gruppen, Index = id)
  const tuerme = (schiff.tuerme ?? []).map((t) => turm(gruppe, mats, t));

  // Lampen: rot Backbord (+X), grün Steuerbord, weiß oben — an den Rändern der Hülle (Box der zusammengefügten Netze)
  const box = new THREE.Box3().setFromObject(gruppe), mitteZ = (box.min.z + box.max.z) / 2;
  const lampen = [[box.max.x + 0.3, 0, mitteZ, LICHT.rot, 1.3, 0, 0.5], [box.min.x - 0.3, 0, mitteZ, LICHT.gruen, 1.3, 0, 0.5],
    [0, box.max.y + 0.3, box.min.z + (box.max.z - box.min.z) * 0.3, LICHT.weiss, 1.8, 0.2, 0.45]];

  const laenge = schiff.laenge ?? (box.max.z - box.min.z);
  let darstellen = (pos, rot) => { gruppe.position.copy(pos); gruppe.quaternion.copy(rot); };
  if (effekte) {
    // Haupt-Düsen für die Glut: nur n = −Z (ausstattung kennt nur Flammen nach hinten)
    const duesen = (schiff.duesen ?? []).filter((d) => d.art === 'haupt' && d.n?.[2] === -1)
      .map((d) => ({ x: d.x, y: d.y, z: d.z, r: d.r, ende: d.z - 1.68 * d.r, seg: 8 }));
    const heckZ = duesen.length ? Math.min(...duesen.map((d) => d.ende)) - 10 : box.min.z - 10;
    const steuer = steuerNamen(schiff.duesen ?? [], (box.max.x - box.min.x) / 2);
    darstellen = ausstattung(gruppe, { duesen, steuer, lampen, arbeit: [], heckZ, puffGroesse: Math.min(1.6, Math.max(0.3, laenge / 160)) });
  }
  scene?.add(gruppe);
  let netze = 0; gruppe.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSprite) netze += o.castShadow ? 2 : 1; });
  return { name: schiff.name ?? form.name, kennung: schiff.kennung ?? '', laenge, gruppe, tuerme, darstellen, meldungen, drawCalls: netze };
}

