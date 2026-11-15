// ZWECK: WebGL-Renderer, Kamera, Licht (eine harte Sonne mit Schatten), Weltraum-Hintergrund, Spiegel-Umgebung,
//        Nachbearbeitung (HDR → Bloom → AgX-Tonemapping).
// LIEFERT: erstelleRenderer(leinwand) → { renderer, scene, camera, sonne, himmel, folgeSchatten(pos), zeichnen(),
//          messwerte(), groesse() }
// REGEL: Lichtanzahl bleibt fest (Shader-Neukompilierung = Ruckler). Hintergrund folgt der Kamera (weltraum.js).
// WARUM harte Sonne + wenig Fülllicht: im All gibt es keine Luft, die Licht streut → starke Kontraste wie im Film.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { erstelleHimmel, SONNE_RICHTUNG } from './weltraum.js';

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
  umgebungsSzene.add(erstelleHimmel({ sterne: false }).gruppe);
  const umgebung = pmrem.fromScene(umgebungsSzene, 0.04, 1, 60000);
  scene.environment = umgebung.texture;
  scene.environmentIntensity = 0.9;

  // Licht: Sonne (hart, mit Schatten) + sehr schwaches Streulicht vom Nebel/Planeten
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

  function zeichnen() {
    groesse();
    renderer.info.reset();
    himmel.folge(camera.position);
    komponist.render();
  }

  return {
    renderer, scene, camera, sonne, himmel, bloom, folgeSchatten, zeichnen, groesse,
    messwerte: () => ({ drawCalls: renderer.info.render.calls, dreiecke: renderer.info.render.triangles, breite: breite * renderer.getPixelRatio(), hoehe: hoehe * renderer.getPixelRatio() }),
  };
}
