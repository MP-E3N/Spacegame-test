// ZWECK: Raumstaub um die Kamera — winzige Teilchen, die bei Fahrt zu Strichen werden.
// LIEFERT: erstelleStaub(scene) → { aktualisiere(kameraPos, geschw) }
// WARUM: im leeren All sieht man sonst nicht, dass man sich bewegt (Sterne sind unendlich weit weg).
// REGEL: Die Teilchen liegen in einem Würfel, der mit der Kamera mitwandert (Modulo im Shader). Der Versatz wird
//        in JS (64 Bit) berechnet — WARUM: Weltkoordinaten nach vielen km sind in GPU-Floats zu ungenau.
import * as THREE from 'three';
import { zufall } from './zufall.js';

const N = 1200; // Spieltest R1: 60 % weniger
const GROESSE = 700; // m Kantenlänge des Staubwürfels

export function erstelleStaub(scene) {
  const rnd = zufall(99);
  const pos = new Float32Array(N * 2 * 3), ende = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = rnd() * GROESSE, y = rnd() * GROESSE, z = rnd() * GROESSE;
    pos.set([x, y, z, x, y, z], i * 6);
    ende[i * 2] = 0; ende[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('ende', new THREE.BufferAttribute(ende, 1));
  const uniforms = { versatz: { value: new THREE.Vector3() }, geschw: { value: new THREE.Vector3() }, groesse: { value: GROESSE } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float ende; uniform vec3 versatz; uniform vec3 geschw; uniform float groesse; varying float vA;
      void main(){
        vec3 p = mod(position - versatz, groesse) - 0.5 * groesse; // relativ zur Kamera
        float d = length(p);
        vA = smoothstep(groesse * 0.5, groesse * 0.15, d) * smoothstep(4.0, 30.0, d);
        // Schweif zeigt dorthin, wo das Teilchen (relativ zur Kamera) eben noch war; Mindestlänge = sichtbarer Punkt
        p += (geschw * 0.045 + vec3(0.0, 0.35, 0.0)) * ende;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`varying float vA; void main(){ gl_FragColor = vec4(vec3(0.55, 0.57, 0.6) * vA, 1.0); }`,
  });
  const linien = new THREE.LineSegments(g, mat);
  linien.frustumCulled = false;
  linien.name = 'staub';
  scene.add(linien);
  const m = (a) => ((a % GROESSE) + GROESSE) % GROESSE;
  return {
    aktualisiere(kameraPos, geschw) {
      linien.position.copy(kameraPos);
      uniforms.versatz.value.set(m(kameraPos.x), m(kameraPos.y), m(kameraPos.z));
      uniforms.geschw.value.copy(geschw);
    },
  };
}
