// ZWECK: Kanten-Werkzeug der Form-Werkstatt (Runde 21, Nutzer: „Kanten auswählen und die Fase angeben, Rundung oder so —
//        Beispiel Inventor“). Ablauf wie Inventor: Werkzeug starten → Kanten des gewählten Körpers erscheinen als Linien
//        (Original + Spiegelkopien), die Kante unter der Maus leuchtet, Klick wählt (Umschalt = mehrere, erneut =
//        abwählen), Maß tippen (m) → Vorschau → Enter / „Übernehmen“; Esc beendet.
// LIEFERT: erstelleKantenWerkzeug(ctx) → { start('fase' | 'rundung') → bool, abbrechen(), aktiv() → bool, taste(e) → bool }
//          ctx = { scene, camera, leinwand, rohGruppe, steuer, holeForm(), koerper(), darf(), ersetzeKoerper(id, k),
//                  meldung(text), wuerfel }
// REGEL: Rechnung NUR über src/sim/form/kanten.js (kantenVon, fase, rundung) — hier Maus, Linien, Maß-Feld.
//        Pointer-Ereignisse auf window in der Einfang-Phase (wie bedienung.js); gestoppt wird nur, was das Werkzeug
//        verbraucht (Klick auf eine Kante) — Kamera drehen bleibt möglich. Das Maß-Feld legt das Modul selbst in #hud an
//        (ids mit Präfix kw-, Stil als eigenes <style>-Element).
//        Gepickt wird im Bild: Kanten aufs Bild projiziert, nächste innerhalb PICK_PX; verdeckte Kanten (ein Strahl zur
//        Kantenstelle trifft vorher etwas) zählen nicht. Linien je Netz (userData.id) mit dessen matrixWorld — WARUM: so
//        stimmen Spiegelkopien und gedrehte Körper ohne eigene Rechnung, und eine Kante der Kopie hat dieselbe id.
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { kantenVon, fase, rundung } from '../sim/form/kanten.js';

const PICK_PX = 12; // R21 Spieltest (Muss): 7 px verfehlte der Tester zweimal — Kante traf er nicht, nichts passierte
const FARBE = { normal: 0x8fb4d9, hover: 0x7fd3ff, gewaehlt: 0xffa040, vorschau: 0x9ad27a };
const NAME = { fase: 'Fase', rundung: 'Rundung' };
const zahl = (x) => (+x).toLocaleString('de-DE', { maximumFractionDigits: 3 });
const lies = (t) => { const v = parseFloat(String(t).trim().replace(',', '.')); return Number.isFinite(v) ? v : NaN; };

const STIL = `
#kw-feld { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); display: none; align-items: center; gap: 6px;
  padding: 6px 10px; background: rgba(18, 24, 32, 0.92); border: 1px solid #3c5a78; border-radius: 6px; color: #d8e4f0;
  font: 13px system-ui, sans-serif; pointer-events: auto; z-index: 20; }
#kw-feld input { width: 64px; padding: 2px 4px; background: #0d141c; color: #fff; border: 1px solid #4a6a8a; border-radius: 3px; font: inherit; }
#kw-feld button { padding: 2px 8px; background: #26405a; color: #e8f0f8; border: 1px solid #4a6a8a; border-radius: 3px; font: inherit; cursor: pointer; }
#kw-feld button:hover { background: #33557a; }
#kw-info { color: #9fb4c8; margin-left: 4px; }`;

export function erstelleKantenWerkzeug(ctx) {
  const { scene, camera, leinwand, rohGruppe } = ctx;
  const gruppe = new THREE.Group(); gruppe.visible = false; scene.add(gruppe);
  const vorGruppe = new THREE.Group(); scene.add(vorGruppe);
  // WARUM depthTest aus: die Kanten sollen auch auf der Rückseite zu sehen sein (blass) — gewählte/leuchtende kräftig
  const mat = (farbe, breite, opacity) => new LineMaterial({ color: farbe, linewidth: breite, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
  const M = { normal: mat(FARBE.normal, 2.5, 0.75), hover: mat(FARBE.hover, 4, 1), gewaehlt: mat(FARBE.gewaehlt, 4, 1), vorschau: mat(FARBE.vorschau, 2, 0.8) };
  const strahl = new THREE.Raycaster(), ndc = new THREE.Vector2();

  let modus = null, kid = null, schluessel = '', linien = [], auswahl = new Set(), hover = null, unten = null, verbraucht = false, rAF = 0;
  const letzteMasse = { fase: '1', rundung: '1' };

  // ---------- Maß-Feld ----------
  if (!document.getElementById('kw-stil')) { const s = document.createElement('style'); s.id = 'kw-stil'; s.textContent = STIL; document.head.appendChild(s); }
  const feld = document.createElement('div'); feld.id = 'kw-feld';
  feld.innerHTML = '<span id="kw-titel"></span><input id="kw-mass" inputmode="decimal" autocomplete="off"><span>m</span>'
    + '<button id="kw-ok" type="button">Übernehmen</button><button id="kw-weg" type="button" title="Beenden (Esc)">×</button><span id="kw-info"></span>';
  (document.getElementById('hud') ?? document.body).appendChild(feld);
  const eingabe = feld.querySelector('#kw-mass'), titel = feld.querySelector('#kw-titel'), info = feld.querySelector('#kw-info');
  feld.querySelector('#kw-ok').addEventListener('click', () => uebernehme());
  feld.querySelector('#kw-weg').addEventListener('click', () => abbrechen());
  eingabe.addEventListener('input', () => { letzteMasse[modus] = eingabe.value; vorschau(); });
  // WARUM Tasten im Feld nicht weiterreichen: Werkstatt-Kürzel (Entf, Buchstaben) sollen beim Tippen nichts auslösen
  eingabe.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); uebernehme(); } else if (e.key === 'Escape') { e.preventDefault(); abbrechen(); }
  });

  // ---------- Linien ----------
  const netzeVon = (id) => { const l = []; rohGruppe.traverse((o) => { if (o.isMesh && o.userData.id === id) l.push(o); }); return l; };
  const schluesselVon = (k, netze) => k.id + '|' + JSON.stringify(k.spanten) + '|' + k.pos + '|' + k.dreh + '|' + k.spiegel + '|' + netze.length
    + '|' + netze.map((n) => n.matrixWorld.elements.map((v) => v.toFixed(4)).join(',')).join(';');
  function leeren(liste, g) { for (const l of liste) { g.remove(l.line ?? l); (l.line ?? l).geometry.dispose(); } liste.length = 0; }
  function linie(welt, m, g) {
    const geo = new LineGeometry(); geo.setPositions(welt.flatMap((v) => [v.x, v.y, v.z]));
    const line = new Line2(geo, m); line.renderOrder = 26; line.computeLineDistances(); g.add(line); return line;
  }
  function weltPunkte(punkte, netz) { return punkte.map((p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(netz.matrixWorld)); }
  function baue() {
    leeren(linien, gruppe);
    const k = ctx.koerper(); if (!k) return;
    const netze = netzeVon(k.id);
    for (const n of netze) n.updateWorldMatrix(true, false);
    for (const netz of netze) for (const kt of kantenVon(k)) {
      const welt = weltPunkte(kt.punkte, netz);
      linien.push({ id: kt.id, welt, line: linie(welt, M.normal, gruppe) });
    }
    faerbe();
  }
  function faerbe() {
    for (const l of linien) l.line.material = auswahl.has(l.id) ? M.gewaehlt : l.id === hover ? M.hover : M.normal;
  }
  /** Pro Bild: Auflösung der Linien, Neubau wenn sich Körper/Lage geändert hat (fremde Änderung, Rückgängig, Auswahl). */
  function schleife() {
    rAF = requestAnimationFrame(schleife);
    const r = leinwand.getBoundingClientRect();
    for (const m of Object.values(M)) m.resolution.set(r.width, r.height);
    const k = ctx.koerper();
    if (!k) { if (linien.length) { leeren(linien, gruppe); leeren(vorGruppe.children.slice(), vorGruppe); } return; }
    const netze = netzeVon(k.id); for (const n of netze) n.updateWorldMatrix(true, false);
    const s = schluesselVon(k, netze);
    if (s === schluessel) return;
    if (k.id !== kid) { auswahl.clear(); hover = null; kid = k.id; }
    schluessel = s; baue(); vorschau(); zeigeInfo();
  }

  // ---------- Picken ----------
  function strahlZu(p) { strahl.set(camera.position, p.clone().sub(camera.position).normalize()); return strahl; }
  function verdeckt(p) {
    const d = p.distanceTo(camera.position), hit = strahlZu(p).intersectObjects(rohGruppe.children, true)[0];
    // WARUM Spiel: die Kante liegt selbst auf der Oberfläche; mit 12 px Trefferzone liegt der Punkt auf der Kante oft leicht
    // hinter der angrenzenden Fläche (streifender Blick) — 0,6 m + 2 % statt 0,3 m + 1 % (Spieltest R21)
    return !!hit && hit.distance < d - (0.6 + 0.02 * d);
  }
  function naechste(cx, cy) {
    const r = leinwand.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top, kand = [];
    for (const l of linien) {
      const s = l.welt.map((v) => { const q = v.clone().project(camera); return [(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height, q.z]; });
      for (let i = 0; i + 1 < s.length; i++) {
        const [ax, ay, az] = s[i], [bx, by, bz] = s[i + 1]; if (az > 1 && bz > 1) continue; // hinter der Kamera
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / l2)) : 0;
        const d = Math.hypot(mx - ax - t * dx, my - ay - t * dy);
        if (d < PICK_PX) kand.push({ id: l.id, d, p: l.welt[i].clone().lerp(l.welt[i + 1], t) });
      }
    }
    kand.sort((a, b) => a.d - b.d);
    return kand.find((c) => !verdeckt(c.p))?.id ?? null;
  }
  const ueberLeinwand = (e) => e.target === leinwand;
  const auf = (typ, fn) => addEventListener(typ, fn, { capture: true });
  auf('pointermove', (e) => {
    if (!modus || unten) return;
    const h = ueberLeinwand(e) ? naechste(e.clientX, e.clientY) : null;
    if (h !== hover) { hover = h; faerbe(); }
    if (ueberLeinwand(e)) leinwand.style.cursor = h ? 'pointer' : '';
  });
  auf('pointerdown', (e) => {
    if (!modus || e.button !== 0 || !ueberLeinwand(e)) return;
    const h = naechste(e.clientX, e.clientY); if (!h) return; // keine Kante → Kamera darf drehen
    e.stopPropagation(); e.preventDefault(); unten = { id: h, shift: e.shiftKey };
  });
  auf('pointerup', (e) => {
    if (!unten) return;
    e.stopPropagation(); e.preventDefault(); waehle(unten.id, unten.shift || e.shiftKey); unten = null; verbraucht = true;
  });
  auf('click', (e) => { if (verbraucht) { e.stopPropagation(); verbraucht = false; } });
  auf('pointercancel', () => { unten = null; });

  function waehle(id, mehr) {
    if (mehr) { if (auswahl.has(id)) auswahl.delete(id); else auswahl.add(id); }
    else if (auswahl.size === 1 && auswahl.has(id)) auswahl.clear();
    else { auswahl.clear(); auswahl.add(id); }
    // Maß der gewählten Kante ins Feld (bearbeiten wie Inventor), sonst das zuletzt getippte
    const k = ctx.koerper(), kt = k && kantenVon(k).find((x) => x.id === id);
    if (auswahl.size === 1 && kt?.jetzt) { eingabe.value = zahl(kt.jetzt.mass); letzteMasse[modus] = eingabe.value; }
    faerbe(); vorschau(); zeigeInfo();
  }

  // ---------- Rechnung, Vorschau, Übernehmen ----------
  function rechne() {
    const k = ctx.koerper(), a = lies(eingabe.value);
    if (!k || !auswahl.size || !Number.isFinite(a) || a < 0) return null;
    return { k, a, r: (modus === 'rundung' ? rundung : fase)(k, [...auswahl], a) };
  }
  function vorschau() {
    leeren(vorGruppe.children.slice(), vorGruppe);
    const x = modus && rechne(); if (!x || x.r.koerper === x.k) return;
    for (const netz of netzeVon(x.k.id)) for (const kt of kantenVon(x.r.koerper)) linie(weltPunkte(kt.punkte, netz), M.vorschau, vorGruppe);
  }
  function zeigeInfo() {
    if (!modus) return;
    const x = rechne(), n = auswahl.size;
    if (!n) { info.textContent = 'Kante anklicken (Umschalt = mehrere)'; return; }
    if (!x) { info.textContent = `${n} ${n === 1 ? 'Kante' : 'Kanten'} · Maß eingeben`; return; }
    const ges = x.a > 0 && x.r.mass > 0 && x.r.mass < x.a - 1e-9 ? ` (geklemmt auf ${zahl(x.r.mass)} m)` : '';
    info.textContent = `${n} ${n === 1 ? 'Kante' : 'Kanten'}` + (x.a === 0 ? ' · entfernen' : x.r.mass ? ges : ' · keine Wirkung');
  }
  eingabe.addEventListener('input', zeigeInfo);
  function uebernehme() {
    if (!modus) return;
    if (!auswahl.size) { ctx.meldung('Erst Kanten wählen — Klick auf eine Linie, Umschalt = mehrere'); return; }
    const x = rechne();
    if (!x) { ctx.meldung('Maß in Metern eingeben (z. B. 1,5)'); eingabe.focus(); return; }
    if (x.r.koerper === x.k) { ctx.meldung(`${NAME[modus]} geht hier nicht — Kante zu kurz oder keine Ecke`); return; }
    ctx.ersetzeKoerper(x.k.id, x.r.koerper);
    const n = auswahl.size, was = x.a === 0 ? `${NAME[modus]} entfernt` : `${NAME[modus]} ${zahl(x.r.mass)} m`;
    ctx.meldung(`${was} an ${n} ${n === 1 ? 'Kante' : 'Kanten'}` + (x.a > 0 && x.r.mass < x.a - 1e-9 ? ` (geklemmt, gewünscht ${zahl(x.a)} m)` : ''));
    // WARUM Auswahl leeren: bei eigenem Umriss rücken die Punkt-Nummern auf, die alte Auswahl wäre eine andere Kante
    auswahl.clear(); hover = null; schluessel = ''; leeren(vorGruppe.children.slice(), vorGruppe); zeigeInfo();
  }

  // ---------- Öffentlich ----------
  function start(m) {
    if (m !== 'fase' && m !== 'rundung') return false;
    const k = ctx.koerper();
    if (!k) { ctx.meldung('Erst einen Körper wählen, dann Fase/Rundung'); return false; }
    if (k.fest) { ctx.meldung('Körper ist fixiert — erst lösen'); return false; }
    if (modus) abbrechen();
    modus = m; kid = k.id; schluessel = ''; auswahl.clear(); hover = null;
    titel.textContent = m === 'fase' ? 'Fase · Abstand' : 'Rundung · Radius';
    eingabe.value = letzteMasse[m]; feld.style.display = 'flex'; gruppe.visible = true;
    schleife(); eingabe.focus(); eingabe.select(); zeigeInfo();
    ctx.meldung(`${NAME[m]}: Kanten anklicken (Umschalt = mehrere), Maß tippen, Enter — Esc beendet`);
    return true;
  }
  function abbrechen() {
    if (!modus) return;
    modus = null; cancelAnimationFrame(rAF); rAF = 0; unten = null; hover = null; auswahl.clear(); schluessel = '';
    leeren(linien, gruppe); leeren(vorGruppe.children.slice(), vorGruppe);
    gruppe.visible = false; feld.style.display = 'none'; leinwand.style.cursor = '';
    if (document.activeElement === eingabe) eingabe.blur();
  }
  /** Von der Werkstatt VOR ihren Tasten gerufen, solange aktiv() → true = verbraucht. */
  function taste(e) {
    if (!modus) return false;
    if (e.key === 'Escape') { abbrechen(); return true; }
    if (e.key === 'Enter') { uebernehme(); return true; }
    // Zahl tippen, ohne vorher ins Feld zu klicken
    if (/^[0-9.,]$/.test(e.key) && !e.ctrlKey && !e.metaKey && document.activeElement !== eingabe) {
      e.preventDefault(); eingabe.focus(); eingabe.value = e.key; letzteMasse[modus] = eingabe.value; vorschau(); zeigeInfo(); return true;
    }
    return document.activeElement === eingabe;
  }
  return { start, abbrechen, aktiv: () => !!modus, taste };
}
