// ZWECK: WebGL-Renderer, Kamera, Licht (eine harte Sonne mit Schatten), Weltraum-Hintergrund, Spiegel-Umgebung,
//        Nachbearbeitung (HDR → Bloom → AgX-Tonemapping). Seit R21 umschaltbar: Weltall ↔ Designstudio.
// LIEFERT: erstelleRenderer(leinwand) → { renderer, scene, camera, sonne, streu, himmel, bloom, folgeSchatten(pos),
//          setzeSchattenRadius(r), zeichnen(), messwerte(), groesse(), setzeStimmung(name, { neu }), stimmung (lesbar) }
//          · STIMMUNGEN[name] = { himmel, sonne, streu, umgebung, bloom, belichtung, raster } (zum Auslesen, z. B.
//            STIMMUNGEN.studio.raster für die Bodenraster der Editoren) · name: 'weltall' (Standard) | 'studio'
//          · wendeStimmungAn(ziele, werte) (reine Wertzuweisung, für node-Tests ohne WebGL)
// REGEL: Lichtanzahl UND Lichttypen bleiben fest (Shader-Neukompilierung = Ruckler) — eine Stimmung ändert nur
//        Farben, Stärken, Uniforms, visible und die (gleich große) PMREM-Umgebung. Keine neuen Objekte je Bild.
//        Hintergrund folgt der Kamera (weltraum.js). 'weltall' ist exakt der Zustand vor R21 (bitgleiches Bild).
// WARUM harte Sonne + wenig Fülllicht: im All gibt es keine Luft, die Licht streut → starke Kontraste wie im Film.
// WARUM Studio heller und weicher: in den Editoren soll man Form, Kanten und Fasen prüfen — dafür braucht auch die
//        Schattenseite Zeichnung (Fülllicht ~1:3 statt Schwarz), wie bei Produktfotos in der Hohlkehle.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { erstelleHimmel, SONNE_RICHTUNG } from './weltraum.js';

/**
 * Stimmungen. Farben als sRGB-Hex (wie im Konstruktor von three), Stärken linear.
 * raster: Farben für GridHelper(…, mitte, linie) der Editoren + Deckkraft. Weltall = Werte aus werkstatt.js (R15),
 *   damit die Seite beim Zurückschalten exakt den alten Zustand herstellen kann.
 * WARUM Studio-Werte so: mit AgX nachgerechnet (Rumpf-Albedo ~0,08 nach Textur × Farbe × (1 − metalness)):
 *   Sonnenseite ~sRGB 164, Schlagschatten darauf ~123, Schattenflanke ~96, Unterseite ~56, Hintergrund 202–232
 *   → Rumpf hebt sich dunkel vom hellen Grund ab, jede Flächenrichtung hat eine eigene Helligkeit (Kanten lesbar).
 */
export const STIMMUNGEN = {
  weltall: {
    himmel: 'weltall',
    sonne: { farbe: 0xfff1e0, staerke: 4.2, schattenRadius: 2 },
    streu: { oben: 0x46526a, unten: 0x2a2119, staerke: 0.25 },
    umgebung: 0.9,                                  // scene.environmentIntensity
    bloom: { staerke: 0.55, radius: 0.6, schwelle: 1.1 },
    belichtung: 1.0,
    raster: { fein: 0x1c1810, feinMitte: 0x3a3020, feinDeckkraft: 0.5, grob: 0x3a2e1a, grobMitte: 0x6a5530, grobDeckkraft: 0.6 },
  },
  studio: {
    himmel: 'studio',
    // WARUM 9 statt 4,2: der Rumpf ist dunkel (Albedo ~0,08); vor hellem Grund braucht er mehr Licht, sonst wirkt er
    // wie ein Scherenschnitt. Neutral-weiß statt Sonnen-Warm; Schattenradius 3 → etwas weichere Schattenkante.
    sonne: { farbe: 0xfffaf5, staerke: 9.0, schattenRadius: 3 },
    // Halbkugel = helle Decke, hellgrauer Boden (Rückstrahlung der Hohlkehle) → Unterseiten nicht schwarz
    streu: { oben: 0xeef0f2, unten: 0x9a9894, staerke: 0.6 },
    umgebung: 1.0,                                  // Studio-PMREM (gedämpfter Verlauf + 3 Leuchtfelder)
    // WARUM Schwelle 5: der Hintergrund liegt bei bis zu ~3,2 (linear) — darunter darf nichts aufblühen, sonst
    // überstrahlt das Weiß die Rumpfkanten. Nur echte Glanzspitzen (> 5) bekommen einen Hauch Bloom.
    bloom: { staerke: 0.1, radius: 0.4, schwelle: 5.0 },
    belichtung: 1.0,
    // WARUM dunkle Linien mit wenig Deckkraft: auf Grund ~sRGB 202–224 ergibt das fein ~188–212, grob ~168–195
    // (nachgerechnet, Mischung linear vor AgX) — sichtbar, aber ruhiger als der Rumpf.
    raster: { fein: 0x5a5e64, feinMitte: 0x4a5058, feinDeckkraft: 0.35, grob: 0x3a3e44, grobMitte: 0x2a2e34, grobDeckkraft: 0.6 },
  },
};

/** Zahlenwerte einer Stimmung setzen (ohne Himmel/Umgebungstextur). Eigene Funktion, damit node-Tests ohne WebGL
 *  prüfen können, dass Hin- und Zurückschalten exakt die Ausgangswerte ergibt. */
export function wendeStimmungAn({ scene, sonne, streu, bloom, renderer }, s) {
  scene.environmentIntensity = s.umgebung;
  sonne.color.setHex(s.sonne.farbe);
  sonne.intensity = s.sonne.staerke;
  sonne.shadow.radius = s.sonne.schattenRadius;
  streu.color.setHex(s.streu.oben);
  streu.groundColor.setHex(s.streu.unten);
  streu.intensity = s.streu.staerke;
  bloom.strength = s.bloom.staerke;
  bloom.radius = s.bloom.radius;
  bloom.threshold = s.bloom.schwelle;
  renderer.toneMappingExposure = s.belichtung;
}

export function erstelleRenderer(leinwand) {
  const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 60000);

  // Hintergrund (folgt der Kamera) und eine sternlose Kopie für die Spiegel-Umgebung des Rumpfs
  const himmel = erstelleHimmel({ sterne: true });
  scene.add(himmel.gruppe);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const umgebungsSzene = new THREE.Scene();
  const umgebungsHimmel = erstelleHimmel({ sterne: false });
  umgebungsSzene.add(umgebungsHimmel.gruppe);
  const umgebung = pmrem.fromScene(umgebungsSzene, 0.04, 1, 60000);
  scene.environment = umgebung.texture;
  scene.environmentIntensity = 0.9;

  // Studio-Umgebung: erst beim ersten Umschalten gebacken, dann behalten (Freiflug/Gefecht zahlen nichts).
  // WARUM dieselbe Himmelskugel statt RoomEnvironment: deren Materialien (Standard + Punktlicht, Lambert) wären neue
  // Programme → Kompilierung beim Umschalten. Die Kugel ist schon übersetzt; gleiche Größe (256) → gleiche
  // envMap-Kennwerte → die Rumpf-Programme bleiben dieselben (nur neu verknüpft, nicht neu übersetzt).
  let studioUmgebung = null;
  function backeStudio() {
    umgebungsHimmel.stimmung('studio-umgebung');
    const ziel = pmrem.fromScene(umgebungsSzene, 0.04, 1, 60000);
    umgebungsHimmel.stimmung('weltall');
    return ziel;
  }

  // Licht: Sonne (hart, mit Schatten) + sehr schwaches Streulicht vom Nebel/Planeten. Werte setzt setzeStimmung.
  const sonne = new THREE.DirectionalLight(0xfff1e0, 4.2);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(4096, 4096);
  const sc = sonne.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 600;
  sonne.shadow.bias = -0.0004;
  sonne.shadow.normalBias = 0.06;
  sonne.shadow.radius = 2;
  scene.add(sonne, sonne.target);
  const streu = new THREE.HemisphereLight(0x46526a, 0x2a2119, 0.25);
  scene.add(streu);

  // Nachbearbeitung: HalfFloat-HDR mit MSAA → Bloom → Ausgabe (Tonemapping + sRGB)
  const ziel = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const komponist = new EffectComposer(renderer, ziel);
  komponist.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 1.1);
  komponist.addPass(bloom);
  komponist.addPass(new OutputPass());

  let stimmung = 'weltall';
  /**
   * Stimmung umschalten (außerhalb der Bildschleife aufrufen, z. B. per Knopf).
   * neu: Studio-Umgebung neu backen (nach Ändern von STUDIO_HIMMEL im Browser).
   * WARUM nur Werte setzen: Lichtanzahl/-typen, Materialien und Pässe bleiben → kein Shader wird neu übersetzt.
   */
  function setzeStimmung(name, { neu = false } = {}) {
    const s = STIMMUNGEN[name];
    if (!s) throw new Error(`Unbekannte Stimmung: ${name}`);
    himmel.stimmung(s.himmel);
    if (name === 'studio') {
      if (neu && studioUmgebung) { studioUmgebung.dispose(); studioUmgebung = null; }
      studioUmgebung ??= backeStudio();
      scene.environment = studioUmgebung.texture;
    } else {
      scene.environment = umgebung.texture;
    }
    wendeStimmungAn({ scene, sonne, streu, bloom, renderer }, s);
    stimmung = name;
  }

  let breite = 0, hoehe = 0;
  function groesse() {
    const w = leinwand.clientWidth || innerWidth, h = leinwand.clientHeight || innerHeight;
    const pr = Math.min(devicePixelRatio || 1, 1.5);
    if (w === breite && h === hoehe && renderer.getPixelRatio() === pr) return;
    breite = w; hoehe = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    komponist.setPixelRatio(pr);
    komponist.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    himmel.pixel(pr * Math.max(1, h / 900)); // Sterngröße wächst mit der Bildhöhe mit
  }

  const v = new THREE.Vector3();
  /** Schattenkamera mittig aufs Schiff; auf Texel eingerastet gegen Flimmern der Schattenkanten. */
  function folgeSchatten(pos) {
    const texel = (sc.right - sc.left) / sonne.shadow.mapSize.x;
    v.copy(pos);
    v.x = Math.round(v.x / texel) * texel; v.y = Math.round(v.y / texel) * texel; v.z = Math.round(v.z / texel) * texel;
    sonne.target.position.copy(v);
    sonne.position.copy(v).addScaledVector(SONNE_RICHTUNG, 300);
  }

  /** Schattenbereich an die Schiffsgröße anpassen (halbe Kantenlänge in m). */
  function setzeSchattenRadius(rad) {
    sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad; sc.updateProjectionMatrix();
  }

  function zeichnen() {
    groesse();
    renderer.info.reset();
    himmel.folge(camera.position);
    komponist.render();
  }

  return {
    renderer, scene, camera, sonne, streu, himmel, bloom, folgeSchatten, setzeSchattenRadius, zeichnen, groesse, setzeStimmung,
    get stimmung() { return stimmung; },
    messwerte: () => ({ drawCalls: renderer.info.render.calls, dreiecke: renderer.info.render.triangles, breite: breite * renderer.getPixelRatio(), hoehe: hoehe * renderer.getPixelRatio() }),
  };
}
