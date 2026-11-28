// ZWECK: Flak-Simulation der Prüfstand-Batterie: Türme richten (Grenzen, Richtgeschwindigkeit), Zwillingsrohre im
//        Wechsel feuern, Streuung mit festem Startwert, Streukugel je Granate (Runde 8), Geschoss-Pool, Zeitzünder
//        (Annäherungszünder abschaltbar), Flächenschaden + Splitterwolke an ALLEN Zielen im Wirkradius.
// LIEFERT: FLAK (Zahlen) · erstelleFlak({ startwert, lafetten, schiff? }) → { tuerme, geschosse, splitter, ereignisse, schritt(dt, befehle, ziele),
//          zuruecksetzen(), pruefsumme(), einstellen(waffe), einstellung, setzeRahmen(r), rahmen (nur lesen), erreichbar(i, g, n) } — Felder siehe Protokoll Runde 6, Entscheidung 3.
//          WAFFEN_REGLER (Export, R11): { deckelQuer, deckelTiefe: { min, max, standard, schritt, text } } — die Seite setzt
//          befehl.waffe, flaklabor.js ruft je Takt flak.einstellen(befehl.waffe) (fehlt/NaN → Standard aus FLAK, geklemmt).
// REGEL: fester Schritt 1/60 s, kein Math.random (zufall je Turm), keine neuen Objekte im Schritt (Pools, Ereignis-Vorrat).
//        Winkel wie turm.js: gier 0 = Rohr nach Welt +Z, gier > 0 zu +X; nick > 0 = nach oben (Turm-Rahmen = Welt-Rahmen).
//        Die HP zieht das Drohnen-Modul ab — hier entstehen nur Ereignisse. Neue Granaten fliegen mit turm.v0
//        (Seite/Labor schalten um), fliegende behalten ihr Tempo.
//        befehle[i].streuKugel (m, fehlt/0 = aus): jede Granate fliegt auf einen eigenen Punkt, gleichverteilt in der
//        Kugel um befehl.punkt, Zeitzünder auf genau diesen Punkt (Runde 8, Nutzer: „Luft sättigen statt treffen“).
//        Seit R10 ein ELLIPSOID: streuKugel = Halbachse quer zur Schusslinie, befehle[i].streuTiefe = Halbachse längs
//        (fehlt → = streuKugel). Deckel FLAK.deckelQuer/-QuerLeucht/-Tiefe · d; jede Kürzung zählt geschosse.gedeckelt.
//        Sperr-Schutz (R12): versetzte Granaten nie unter den Mindest-Nick der Nachbar-Sperre (zählt geschosse.unterSperre).
//        Detonations-Ereignis trägt `streu` (m) = größere benutzte Halbachse (Grafik streut die Zusatz-Explosionen damit).
// AM SCHIFF (R14, Entscheidungen 3–5): erstelleFlak({ startwert, lafetten, schiff: { hindernisse, rumpf, mitte,
//        mindestAbstand } }) — lafetten = Flaktürme des Schiffs in SCHIFFS-LOKALKOORDINATEN (turmDaten, oben/unten),
//        hindernisse = ALLE Türme (schwere als Hindernis), rumpf(lafette) → Mindest-Nick je Gier-Sektor im Turm-Rahmen
//        (Sektor k deckt gier ∈ [−π + k·2π/n, −π + (k+1)·2π/n)), mitte = Schiffs-Lokalpunkt für den Mindestabstand.
//        flak.setzeRahmen({ pos, rot: {x,y,z,w}, vel }) je Schritt NACH dem Schiffsschritt, VOR KI und flak.schritt.
//        Befehls-`punkt` in Schiffs-Lokal; t.muendung lokal (für die KI), t.muendungWelt in Welt. Granaten, Ereignisse,
//        Splitter in WELT; neue Granate = R·Rohr·v0 + Schiffstempo, vorPos aus dem vorigen Rahmen (Interpolation).
//        Mit Rahmen keine Detonation näher als mindestAbstand (150 m) an der Schiffsmitte (Zünder verlängert).
//        Die Flak schadet nur `ziele` — das eigene Schiff gehört nicht hinein (Gefecht-Welt).
//        Ohne schiff/Rahmen läuft der Prüfstand-Zweig bitgleich zu R13 (gleiche Werte vorausgesetzt).
//        erreichbar(turmIndex, gier, nick) (Turm-Rahmen): Grenzen + Nachbar- + Rumpf-Sperre — für die Turm-KI.
// R23 (E2, Nutzer: „die Türme alle funktionsfähig“, „Flak zu Gatlings, große Batteriegeschütze mit zwei Munitionstypen“):
//        lafetten enthalten jetzt auch typ 'schwer'. Je Turm zusätzlich t.typ ('flak' | 'schwer'), t.munition (geladen:
//        'flak' | 'panzer'), t.v0 + t.reichweite (zur geladenen Munition), t.nachladen (0 = geladen, 1 = Wechsel beginnt
//        gerade — verbleibender Anteil), t.spin (0..1 Gatling-Drehzahl, Grafik). Zahlen + WARUM in WAFFEN_TYP.
//        · typ 'flak' AM SCHIFF = Zwillings-Gatling: spin steigt bei befehl.feuer, fällt in der Pause; Kadenz
//          kadenzMax · spin (ab spinMin), Bündel abwechselnd; Schaden/Splitter je Granate × schadenFaktor (Sorten 2/3).
//          OHNE schiff (Prüfstand/Labor) bleibt der alte Zwilling (10 Schuss/s, Sorten 0/1) — bitgleich zu R22.
//        · typ 'schwer' = Hauptbatterie: befehle[i].munition 'flak' (fehlt) | 'panzer'. Wechsel → Nachladen (kein Feuer).
//          Salve beider Rohre im selben Schritt. 'flak' = Großgranate mit Zeitzünder (Sorte 4, großer Wirk-/Splitterradius),
//          'panzer' = Panzergranate (Sorte 5): kein Zünder, keine Streukugel, Strecke-Kugel-Test gegen ziele (r) je
//          Schritt, voller Schaden über treffe(), Ereignis ereignisse.einschlaege { pos, zielId, richtung }; endet still
//          nach WAFFEN_TYP.schwer.panzer.reichweite.
//        · Panzerung ziel.panzer (0..1, fehlt = 0): Detonations- und Splitterschaden × (1 − panzer); Panzergranate voll.
//        · Ereignisse tragen zusätzlich `sorte` (Schuss, Detonation) und `gewicht` (Detonation: Größe für die Grafik).
import { zufall } from '../zufall.js';
import { LAFETTEN } from './lafetten.js';
import { TURM } from '../schiffe/turm.js';

export const FLAK = {
  v0: 1100,                   // m/s Standard (R9, Nutzer: „die höchste“ = Nahbereichsabwehr); je Turm über turm.v0 umschaltbar
  reichweite: 2500,           // m
  schussAbstand: 6,           // Schritte zwischen zwei Schüssen eines Zwillings (10 Schuss/s je Turm)
  streuung: 0.25 * Math.PI / 180, // rad, größte Abweichung je Achse (Dreiecksverteilung); seit R8 streut v. a. die Streukugel
  zuenderMinStrecke: 60, zuenderMax: 4.0, // m bzw. s — WARUM Strecke: bei 1100 m/s wären 0,1 s schon 110 m
  zuenderStreu: 0.04,         // ±4 % Zielgranaten ohne Streukugel
  zuenderStreuKugel: 0.01,    // ±1 % sobald eine Kugel gesetzt ist, auch Sperrgranaten (die Kugel liefert die Tiefe, R8/2, R10/1)
  zuenderStreuSperr: 0.08,    // ±8 % Sperrgranaten ohne Kugel → Schirm ~120 m tief bei 800 m (Runde 7)
  // Deckel der Streuung (R10, Entscheidung 1) — die KI liest sie von HIER (nicht doppelt führen). Anteil der Entfernung d.
  // quer: Seitenversatz kostet Winkel am Rohr. WARUM 0,10 mit Leuchtspur: darüber fliegt die Spur sichtbar schief aus dem
  //       Rohr (≈ 5,7°). WARUM 0,60 ohne (R12, Nutzer: „die Area um die feindlichen Objekte größer machen“; R10: 0,18):
  //       ohne Spur sieht niemand den Abgangswinkel (≈ 31°); die Zielkugel 320 m bleibt so ab d ≈ 530 m ungekürzt.
  //       Versetzte Granaten fliegen nie unter die Nachbar-Sperre (Sperr-Schutz im Schuss).
  // längs: Tiefe entsteht nur über die Zünderzeit (kein Winkel) → großzügig, Tiefenstaffel in Anflugrichtung.
  //       WARUM 0,80 (R10: 0,35): Tiefe 320 m ab d = 400 m; höchstens 0,9, sonst liegt der Punkt an der Mündung und der
  //       Mindestzünder (60 m) zündet die Granate direkt vor der Batterie.
  // R14 (Nutzer: „Nimm die Konfig T1“): 1,0 / 0,9 = die Reglerenden. Folgen: ohne Leuchtspur bis 45° neben dem Rohr
  //       (die Grafik blendet die dauerhafte Spur deshalb erst nach einer Strecke ein); längs liegt der Punkt bei d < 600 m
  //       am Mindestzünder — am Schiff hält der Mindestabstand (150 m zur Schiffsmitte) die Detonationen vom Rumpf fern.
  deckelQuerLeucht: 0.10,
  deckelQuer: 1.00,
  deckelTiefe: 0.90,
  // Annäherungszünder (R8 aus, Code bleibt): er war der eigentliche „Direkttreffer“ — zündete bei r + 12 m an jedem Ziel.
  annaeherung: false,
  naheZuender: 12,            // m über dem Zielradius
  scharfStrecke: 60,          // m: WARUM: kein Annäherungszünder direkt vor dem Rohr
  // Zwei Granatsorten, gewählt nach dem Befehl, je eigener Hebel (Lehre R6: ein Hebel pro Modus):
  //   0 ZIELGRANATE (befehl.zielId gesetzt): Flächenschaden 3 / 30 m + Splitterwolke 42 m · 0,5 s · 15 HP/s (R10-Balance).
  //   1 SPERRGRANATE (zielId null): Flächenschaden 1,5 / 25 m + Splitterwolke 45 m · 0,9 s · 45 HP/s (R10-Balance).
  // WARUM Splitter jetzt auch im Zielfeuer: ohne Annäherungszünder liegt die Detonation im Mittel ~16 m neben dem Ziel.
  // WARUM Sperr-Splitter stärker als R7 (40 m / 0,7 s / 350): die Werte waren MIT Annäherungszünder gemessen; ohne ihn
  //        fiel der Schirm-Durchflug von 75 auf 21 HP. Mit 45 / 0,9 / 500 → 46 HP (tests/waffen.mjs 7); Labor misst nach.
  // Splitter: Schaden/s im Radius, linear mit dem Alter abnehmend, am Rand halb. Dauer in Schritten.
  sorte: [
    // WARUM 1,2 HP / 5 HP/s statt 22 / 120 (Balance R8, KI): 6 Türme × 10 Schuss/s gegen 100-HP-Drohnen — mit 22/120
    // fielen im 5-min-Labor 240 Drohnen im Zielfeuer (Ziel 20–60), Granaten auf schon tote Ziele trieben den
    // Detonationsabstand auf 70 m. 1,2/5 → 41/71/76 Abschüsse (620/1000/1100), Abstand 38/27/26 m. Viele Granaten je
    // Abschuss = „Flak sättigt die Luft“. Wirk- und Splitter-Radius bleiben (sichtbare Wolke um das Ziel).
    // R9 (KI, 1100 m/s, Kästen auf den Drohnen, Kugel 60 m): mit 1,2/5 und Sperr 14/500 fielen im Sperrfeuer 286 Drohnen
    // (Ziel 40–80), im Zielfeuer 26 (Ziel 30–80). Zielgranate 1,6/7, Sperrgranate 1/25 → Sperr 60, Ziel 44 Abschüsse.
    // WARUM die Sperrgranate so schwach: die Kästen sitzen jetzt AUF den Drohnen (Median 100 statt 260 m) — dieselbe
    // Wolke trifft viel öfter; Radien bleiben, damit die Wand sichtbar gleich groß ist.
    // R10 (KI, 1100 m/s, Sättigungsräume: Sperr-Detonation Median 165 m statt 100 m, Zielkugel 140 statt 60 m): mit den
    // R9-Zahlen fielen nur 31 (Sperr) bzw. 18 (Ziel) Drohnen in 5 min, 13–14 von 14 Vorstößen überlebten. Ziel 3 / 15 HP/s,
    // Sperr 1,5 / 45 HP/s (≈ Faktor 1,8–2: dieselbe Feuerrate verteilt sich auf ein ~10× größeres Volumen).
    // WARUM Ziel-Splitter 42 statt 30 m: = sichtbare Hauptwolke (42 m); die weit gestreuten Zielgranaten (Median 105 m)
    // treffen sonst kaum — 30 m: 19–30 Abschüsse, 42 m: 31–37 (2 Startwerte); nah (Kugel ≤ 35 m) ändert sich wenig.
    // Labor (Panzer 0,18), Startwerte 101 / 7 / 202: Sperr 54 / 47 / 46, Ziel 32 / 31 / 32 Abschüsse.
    // R12 (KI, Nutzer: „Explosionen viel mehr verteilen“; Sperr-Median 165 → 270 m, Zielkugel 140 → 320 m): mit den
    // R10-Zahlen nur Sperr 19, Ziel 29 Abschüsse (Startwert 101). Sperrgranate: Splitter 45 → 60 m, 45 → 90 HP/s.
    // WARUM 60 m (über der sichtbaren Hauptwolke 42 m × rauchGroesse): dasselbe Feuer verteilt sich auf ~4× Volumen;
    // ein Splitterfeld von 60 m fasst (60/45)³ ≈ 2,4× Volumen, den Rest trägt die Dauer-Wirkung (Dps). Der Splitter-
    // Kegel liegt um die Wolke, die man sieht — 60 m bleibt unter der Zusatz-Explosionen-Weite (bis 120 m, R12).
    // Zielgranate: Schaden 3 → 5,5, Splitter 15 → 18 HP/s, Radius bleibt 42 m. WARUM nicht der Radius: dieselbe Sorte
    // trifft im Nahbereich (Kugel ≤ 35 m) jeden Vorstoß — 55 m: 1 von 13 Vorstößen überlebt (Startwert 101).
    // Getestet (Labor, 1100 m/s, 5 min): 10 Varianten × 1–3 Startwerte; gewählt mit Panzer 0,13 (DROHNEN.vorstoss),
    // Startwerte 101 / 7 / 202: Sperr 44 / 44 / 45, Ziel 25 / 26 / 22 Abschüsse.
    // R14 (T1-Standard, KI-Messung angr14): mit 90 HP/s nur Sperr 32–36 Abschüsse → Sperr-Splitter 90 → 115 HP/s
    // ergibt 43–46 Abschüsse / 40–60 % Vorstöße (Entscheidung R14/1).
    { wirkRadius: 30, vollRadius: 4, schaden: 5.5, splitterRadius: 42, splitterDauer: 30, splitterDps: 18 },
    { wirkRadius: 25, vollRadius: 6, schaden: 1.5, splitterRadius: 60, splitterDauer: 54, splitterDps: 115 },
  ],
  // am Schiff (R14: 256 / 640 für 14 Zwillinge à 10 Schuss/s). R23: Gatling bis 36 Schuss/s je Turm → 14 × 36 × ~1,5 s
  // Flug ≈ 760 Granaten, Splitter 504 Det./s × 0,9 s ≈ 450 — Vorräte mit Reserve (ein voller Ring ersetzte lebende
  // Splitter = stiller Schadensverlust).
  poolSplitter: 96, poolSplitterSchiff: 1024, poolGeschosseSchiff: 2048,
  // Nachbar-Sperre: Rohre dürfen nicht flach über den Nachbarturm schießen (Turmhülle ~3,7 m, Oberkante ~5,2 m — Werte
  // für Größe s = 1 auf Sockel 1,4 m; am Schiff mit Größe/Sockel/Fußhöhe des Nachbarn umgerechnet, R14)
  nachbarHuelle: 3.7, nachbarHoehe: 5.2, nachbarWeite: 40,
  nachbarBezugSockel: 1.4, nachbarKranzJeS: 3.8, // Oberkante = nachbarHoehe + (sockel − 1,4) + (s − 1) · 3,8 + Fußhöhe
  mindestAbstandSchiff: 150, // m zur Schiffsmitte, nur mit Rahmen (Entscheidung R14/5)
  richtGeschw: [60 * Math.PI / 180, 50 * Math.PI / 180], // rad/s [gier, nick] (Nick 50°/s ab Runde 7)
  // Leuchtspur nur auf Befehl (Runde 7, Nutzer: bei BSG sieht man sie „so gut wie nie“). befehl.leuchtspur fehlt →
  // dieser Anteil, über einen Zähler je Turm. WARUM Zähler statt Zufall: die Zufallsfolge (Streuung/Zünder) bleibt gleich.
  leuchtAnteil: 0,
  poolGeschosse: 256,
  vorratEreignisse: 128,
};

// Regler der Waffe (R11, Nutzer: „die Area frei vergrößern“). Nur der Deckel OHNE Leuchtspur und der Längsdeckel —
// WARUM nicht deckelQuerLeucht: die Leuchtspur muss gerade aus dem Rohr kommen (0,10 · d bleibt fest).
// WARUM höchstens 1,0 quer (45°, R12; R11: 0,6): darüber schießt der Turm in eine ganz andere Richtung als das Rohr.
// WARUM höchstens 0,9 längs (R12; R11: 0,8): bei 1,0 · d läge der Punkt an der Mündung — der Mindestzünder (60 m) zündete
// dann direkt vor der Batterie.
export const WAFFEN_REGLER = {
  deckelQuer:  { min: 0.10, max: 1.00, standard: FLAK.deckelQuer,  schritt: 0.01, text: 'Deckel quer ohne Leuchtspur (× Entfernung)' },
  deckelTiefe: { min: 0.10, max: 0.90, standard: FLAK.deckelTiefe, schritt: 0.01, text: 'Deckel längs (× Entfernung)' },
};

/**
 * Waffentypen am Schiff (R23, E2). Der Prüfstand (ohne schiff) nutzt nur FLAK (alter Zwilling).
 * Sorten-Nummern je Granate (geschosse.sorte): 0/1 Ziel-/Sperrgranate (Prüfstand), 2/3 dieselben als Gatling-Granate
 * (Schaden × schadenFaktor), 4 Großgranate der Hauptbatterie, 5 Panzergranate (kein Zünder).
 */
export const WAFFEN_TYP = {
  flak: {
    // Zwillings-Gatling (PDC / Flak-Gatling). WARUM v0 = FLAK.v0: die Turm-KI rechnet Vorhalt und Sättigungsräume mit
    // 1100 m/s (R9, Nutzer „die höchste“) — die Gatling ändert die Kadenz, nicht die Ballistik.
    v0: FLAK.v0,
    // 36 Schuss/s je Turm bei voller Drehzahl (18 je Bündel, abwechselnd). WARUM nicht mehr: ≤ 1 Schuss je Schritt
    // (60 Hz) hält die Rechnung schlicht; 36/s ist das 3,6-Fache des alten Zwillings (10/s) und hörbar „Säge“.
    kadenzMax: 36,
    // Anlauf 0 → 1 in 0,8 s, Auslauf 1 → 0 in 1,5 s; unter spinMin 0,25 kein Schuss. WARUM: echte Gatlings brauchen
    // einige Zehntel bis zur Nenndrehzahl — der erste Feuerstoß beginnt mit ~9 Schuss/s und „sägt“ dann hoch; kurze
    // Feuerpausen (Raumwechsel ~0,2 s) kosten so kaum Drehzahl.
    anlauf: 0.8, auslauf: 1.5, spinMin: 0.25,
    // Schaden und Splitter-Dps je Granate × 0,34 (Sorten 2/3). WARUM: dieselbe Wirkung je Sekunde wie R22 (Bezug
    // Bollwerk 3 min: Sperr 12,0 / Ziel 10,3 Abschüsse/min) bei ~3× Granaten — gemessen, siehe Bericht R23.
    schadenFaktor: 0.2,
  },
  schwer: {
    // Hauptbatterie (s 1,1–1,3). WARUM langsamer richten (35°/25° statt 60°/50° s⁻¹): schwerer Turm, und die
    // Panzergranate trifft nur, wenn der Turm wirklich auf dem Ziel liegt — Feuern erst „ausgerichtet“ (wie bisher).
    richtGeschw: [35 * Math.PI / 180, 25 * Math.PI / 180],
    // Munitionswechsel 3 s (beide Rohre entladen/laden). WARUM spürbar: sonst wechselte die KI je Ziel frei hin und her.
    nachladen: 3.0,
    // Großgranate (Zeitzünder): Salve beider Rohre alle 2 s. WARUM v0 950: großes Kaliber, langsamer als die Gatling —
    // die KI nimmt t.v0 für den Vorhalt. Reichweite 3000 m (Zünder höchstens FLAK.zuenderMax = 4 s ≈ 3800 m).
    // Wirkung: Wirkradius 60 m (voll bis 10 m) 30 HP; Splitterwolke 90 m · 1,2 s · 70 HP/s. WARUM so groß: eine Salve
    // je 2 s muss sichtbar „ein Loch in den Schwarm reißen“; 2 Granaten/2 s × 3 Türme ≈ 3 Granaten/s gegen ~500/s der
    // Gatlings — die Gesamtbalance bleibt bei den Gatlings.
    flak: { v0: 950, salve: 2.0, reichweite: 3000,
      sorte: { wirkRadius: 60, vollRadius: 10, schaden: 30, splitterRadius: 90, splitterDauer: 72, splitterDps: 70 } },
    // Panzergranate: v0 1600 (flach, kurze Flugzeit → trifft mit Vorhalt), Salve alle 2,5 s, 220 HP je Treffer ohne
    // Panzer-Abzug. WARUM 220: Panzerboot (KI, hp ≈ 900, panzer 0,85) fällt nach 4–5 Treffern ≈ 10–15 s bei einem
    // Turm (Protokoll R23: „AP ~10–15 s“); ein Kanonenboot (100 HP) fällt mit einem Treffer.
    // Reichweite 3000 m: danach endet die Granate still (kein Zünder). toleranz: höchstens 0,004 rad Richtfehler beim
    // Abfeuern (4 m auf 1000 m) — WARUM: die KI gibt Flak-Toleranzen (bis 0,08 rad) für Streufeuer.
    panzer: { v0: 1600, salve: 2.5, reichweite: 3000, schaden: 220, toleranz: 0.004 },
  },
};

/** Wirkwerte der Sorte k (0..4). WARUM live aus FLAK/WAFFEN_TYP gelesen: Tests und Labor stellen Werte zur Laufzeit um. */
const sorteVon = (k) => (k < 2 ? FLAK.sorte[k] : k < 4 ? FLAK.sorte[k - 2] : WAFFEN_TYP.schwer.flak.sorte);
/** Schadensfaktor der Sorte: Gatling-Granaten (2/3) schwächer, sonst 1 (× 1 ist in Gleitkomma exakt → Prüfstand bitgleich). */
const faktorVon = (k) => (k === 2 || k === 3 ? WAFFEN_TYP.flak.schadenFaktor : 1);
/** Größe der Detonation für die Grafik (Ereignisfeld gewicht): Gatling klein, Großgranate groß. WARUM: ~3× mehr
 *  Detonationen dürfen das Rauch-/Glut-Budget der Grafik nicht sprengen (Wolken je Detonation ∝ gewicht). */
const gewichtVon = (k) => (k === 2 || k === 3 ? 0.35 : k === 4 ? 2.2 : 1);
const PANZER = 5;

const ZWEI_PI = Math.PI * 2;
const umbruch = (w) => w - ZWEI_PI * Math.floor((w + Math.PI) / ZWEI_PI); // → [−π, π)

/** Ereignisliste mit festem Objektvorrat: leeren() + neu() statt push({…}). */
function ereignisListe(n, bauer) {
  const liste = [];
  const vorrat = Array.from({ length: n }, bauer);
  liste.leeren = () => { liste.length = 0; };
  liste.neu = () => {
    if (liste.length >= vorrat.length) vorrat.push(bauer()); // Notfall: einmalig wachsen statt Ereignis verlieren
    const e = vorrat[liste.length]; liste.push(e); return e;
  };
  return liste;
}
const v3 = () => ({ x: 0, y: 0, z: 0 });

/** v um Quaternion q drehen (wie THREE.Vector3.applyQuaternion), Ergebnis in aus. Keine neuen Objekte. */
function drehe(q, x, y, z, aus) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  aus.x = x + qw * tx + qy * tz - qz * ty;
  aus.y = y + qw * ty + qz * tx - qx * tz;
  aus.z = z + qw * tz + qx * ty - qy * tx;
  return aus;
}
/** Turm-Rahmen → Schiff (nur Drehung): unten montiert (rotation.z = π) heißt (x, y, z) → (−x, −y, z) (turm.js). */
function turmZuSchiff(l, x, y, z, aus) {
  if (l.oben === false) { aus.x = -x; aus.y = -y; } else { aus.x = x; aus.y = y; }
  aus.z = z; return aus;
}

export function erstelleFlak({ startwert = 303, lafetten = LAFETTEN, schiff = null } = {}) {
  // WARUM ein eigener Schalter: jede Schiffs-Regel (Granate in Grenzen klemmen, Schwenk-Schutz) ändert die Zufalls- bzw.
  // Bahnfolge — der Prüfstand muss ohne `schiff` bitgleich zu R13 bleiben.
  const amSchiff = !!schiff;
  const hindernisse = schiff?.hindernisse ?? lafetten;
  const schiffMitte = schiff?.mitte ?? { x: 0, y: 0, z: 0 };
  const mindestAbstand = schiff?.mindestAbstand ?? FLAK.mindestAbstandSchiff;
  // WARUM größere Vorräte am Schiff: 14 Flaktürme × 10 Schuss/s × ~2 s Flug ≈ 280 Granaten > 256; Splitter 140/s × 0,9 s.
  // Der Prüfstand behält seine Größen (die Platzwahl geht in die Prüfsumme ein).
  const N = amSchiff ? (schiff.poolGeschosse ?? FLAK.poolGeschosseSchiff) : FLAK.poolGeschosse;
  const geschosse = {
    max: N, anzahlAktiv: 0, verworfen: 0,
    abstandVerlaengert: 0, // Granaten, deren Zünder der Mindestabstand zur Schiffsmitte verlängert hat (R14, nur Zähler)
    unterSperre: 0, // Granaten, die der Sperr-Schutz auf den Mindest-Nick angehoben hat (R12, nur Zähler)
    einschlaege: 0, // Panzergranaten-Treffer seit dem Start (R23, nur Zähler)
    gedeckelt: 0, // Schüsse, deren Streuung (quer oder längs) der Deckel gekürzt hat (R10: stumme Kürzung sichtbar machen)
    streu: new Float32Array(N), // benutzte Streuung je Granate (m), geht ans Detonations-Ereignis
    // sorte (R23; bis R22 „sperr“ 0/1): 0 Ziel, 1 Sperr, 2/3 Gatling Ziel/Sperr, 4 Großgranate, 5 Panzergranate
    aktiv: new Uint8Array(N), turm: new Uint8Array(N), sorte: new Uint8Array(N),
    leucht: new Uint8Array(N), // 1 = Leuchtspur-Granate (beim Abschuss festgelegt)
    anzahlLeucht: 0,
    pos: new Float64Array(N * 3), vorPos: new Float64Array(N * 3), vel: new Float64Array(N * 3),
    alter: new Uint16Array(N),  // Schritte seit dem Abschuss (Grafik: Leuchtspur wächst aus der Mündung)
    rest: new Uint16Array(N),   // Schritte bis zum Zeitzünder
    // Anteil des letzten Schritts bis zum Zünden (0..1]. WARUM: ganze Schritte wären bei 1000 m/s ±8 m ungenau;
    // so bleibt der Zähler ganzzahlig (Gleichlauf) und der Detonationsort trotzdem genau.
    bruch: new Float64Array(N),
  };
  geschosse.sperr = geschosse.sorte; // alter Name (R22), gleiche Werte 0/1 auf dem Prüfstand
  const ereignisse = {
    // turmIndex = Platz in tuerme[] (Grafik-Felder), turmId = Schiffs-Turm-id. vorPos = Mündung im vorigen Rahmen
    // (= pos ohne Rahmen), richtung = Rohrrichtung in Welt (ohne Schiffstempo), vel = Schiffstempo (Blitz/Rauch treiben mit).
    // sorte (R23) = Granatsorte (siehe WAFFEN_TYP) — die Grafik wählt danach Blitz und Wolke
    schuesse: ereignisListe(FLAK.vorratEreignisse, () => ({ turmId: 0, turmIndex: 0, rohr: 0, sorte: 0, pos: v3(), vorPos: v3(), richtung: v3(), vel: v3() })),
    detonationen: ereignisListe(FLAK.vorratEreignisse, () => ({ pos: v3(), radius: FLAK.sorte[1].wirkRadius, art: 'zeit', streu: 0, sorte: 1, gewicht: 1 })),
    treffer: ereignisListe(FLAK.vorratEreignisse, () => ({ zielId: 0, schaden: 0, pos: v3() })),
    // Panzergranaten-Treffer (R23, E2): pos = Einschlagort (Welt), richtung = Flugrichtung (Einheit, Welt)
    einschlaege: ereignisListe(32, () => ({ zielId: 0, pos: v3(), richtung: v3() })),
  };
  const gatlingAn = amSchiff; // WARUM eigener Name: Gatling NUR am Schiff (E2) — der Prüfstand bleibt der alte Zwilling
  const tuerme = lafetten.map((l, index) => ({
    id: l.id, index, lafette: l, typ: l.typ === 'schwer' ? 'schwer' : 'flak',
    gier: 0, nick: 0, vorGier: 0, vorNick: 0, sollGier: 0, sollNick: 0,
    imBereich: false, ausgerichtet: false, bereit: true, gesperrt: false,
    v0: FLAK.v0, reichweite: FLAK.reichweite, muendung: v3(), muendungWelt: v3(),
    richtGeschw: FLAK.richtGeschw.slice(), streuung: FLAK.streuung, leuchtZaehler: 0,
    abklingen: 0, rohr: 0, schuesse: 0, rnd: null, rumpf: null,
    // R23: geladene Munition, Nachladen (Rest in Schritten, Ziel, Anteil 0..1), Gatling-Drehzahl + Schusskonto
    munition: 'flak', nachladeRest: 0, nachladeZiel: 'flak', nachladen: 0, spin: 0, konto: 0,
  }));
  /** v0/Reichweite/Richttempo zur geladenen Munition (R23). Prüfstand-Zwilling: FLAK-Werte wie bisher. */
  function ladeWerte(t) {
    if (t.typ === 'schwer') {
      const M = WAFFEN_TYP.schwer[t.munition];
      t.v0 = M.v0; t.reichweite = M.reichweite;
      t.richtGeschw[0] = WAFFEN_TYP.schwer.richtGeschw[0]; t.richtGeschw[1] = WAFFEN_TYP.schwer.richtGeschw[1];
    } else { t.v0 = gatlingAn ? WAFFEN_TYP.flak.v0 : FLAK.v0; t.reichweite = FLAK.reichweite; }
  }
  let zeiger = 0, schrittNr = 0;
  const NS = amSchiff ? (schiff.poolSplitter ?? FLAK.poolSplitterSchiff) : FLAK.poolSplitter;
  const splitter = { max: NS, anzahlAktiv: 0, pos: new Float64Array(NS * 3), rest: new Uint16Array(NS), sorte: new Uint8Array(NS), zeiger: 0 };
  // Montage-Rahmen (R14): Lage des Schiffs nach dem Schiffsschritt + die des vorigen Schritts (Interpolation der Granaten)
  const rahmen = { aktiv: false, pos: v3(), rot: { x: 0, y: 0, z: 0, w: 1 }, vel: v3(), vorPos: v3(), vorRot: { x: 0, y: 0, z: 0, w: 1 } };
  // Nachbar-Sperrzonen je Turm: { gier, halb, nickMin } aus der Hindernis-Tabelle (einmal berechnet). Am Schiff (R14) nur
  // Nachbarn auf derselben Rumpfseite (die andere Seite verdeckt der Rumpf), Lage im Turm-Rahmen (unten: x gespiegelt),
  // Höhe aus Größe, Sockel und Fußhöhe des Nachbarn. WARUM die Umrechnung über Differenzen zum Bezug (s 1, Sockel 1,4):
  // auf dem Prüfstand ergeben sich exakt die alten Zahlen (1,4 + 3,8 wäre 5,199999… statt 5,2 → nicht mehr bitgleich).
  for (const t of tuerme) {
    const l = t.lafette, sx = l.oben === false ? -1 : 1;
    t.sperrzonen = [];
    for (const n of hindernisse) {
      if (n === l || (n.id === l.id && n.x === l.x && n.z === l.z)) continue;
      if ((n.oben === false) !== (l.oben === false)) continue;
      const dx = (n.x - l.x) * sx, dz = n.z - l.z, d = Math.hypot(dx, dz);
      if (d > FLAK.nachbarWeite) continue;
      const ns = n.s ?? 1, fuss = l.oben === false ? l.y - n.y : n.y - l.y; // Fuß des Nachbarn „vom Rumpf weg“
      const hoehe = FLAK.nachbarHoehe + ((n.sockel ?? FLAK.nachbarBezugSockel) - FLAK.nachbarBezugSockel) + (ns - 1) * FLAK.nachbarKranzJeS + fuss;
      const frei = Math.max(1, d - l.zapfen.z - TURM.fussR * ns); // waagrecht vom Zapfen bis zur Hülle des Nachbarn
      t.sperrzonen.push({ gier: Math.atan2(dx, dz), halb: Math.atan2(FLAK.nachbarHuelle * ns, d),
        nickMin: Math.atan2(hoehe - l.zapfen.y, frei) });
    }
    // Rumpf-Sperre (R14, Entscheidung 4): Mindest-Nick je Gier-Sektor im Turm-Rahmen, von schiff.rumpf geliefert
    if (amSchiff && schiff.rumpf) { const r = schiff.rumpf(l); t.rumpf = r ? Float64Array.from(r.nick ?? r) : null; }
  }
  /** Mindest-Nick für Gier g (−∞ = keine Sperre): Nachbar-Sperrzonen und (am Schiff) Rumpf-Sektoren. */
  function sperrNick(t, g) {
    let m = -Infinity;
    for (const z of t.sperrzonen) if (Math.abs(umbruch(g - z.gier)) < z.halb && z.nickMin > m) m = z.nickMin;
    const R = t.rumpf;
    if (R) {
      const n = R.length; let k = Math.floor((umbruch(g) + Math.PI) / ZWEI_PI * n);
      k = k < 0 ? 0 : k >= n ? n - 1 : k;
      if (R[k] > m) m = R[k];
    }
    return m;
  }
  /** Kann Turm i (Index in tuerme) die Richtung (gier, nick) im Turm-Rahmen erreichen und dort feuern? (für die Turm-KI) */
  function erreichbar(i, gier, nick) {
    const t = tuerme[i]; if (!t) return false;
    const l = t.lafette;
    if (l.gier[1] < Math.PI - 1e-6 && Math.abs(umbruch(gier - l.gier[0])) > l.gier[1]) return false;
    if (nick < l.nick[0] || nick > l.nick[1]) return false;
    return nick >= sperrNick(t, gier);
  }
  /** Montage-Rahmen des Schiffs setzen (je Schritt nach dem Schiffsschritt). null → Prüfstand (Turm-Rahmen = Welt). */
  function setzeRahmen(r) {
    if (!r) { rahmen.aktiv = false; return; }
    const war = rahmen.aktiv, q = rahmen.aktiv ? rahmen : r;
    rahmen.vorPos.x = q.pos.x; rahmen.vorPos.y = q.pos.y; rahmen.vorPos.z = q.pos.z;
    rahmen.vorRot.x = q.rot.x; rahmen.vorRot.y = q.rot.y; rahmen.vorRot.z = q.rot.z; rahmen.vorRot.w = q.rot.w;
    rahmen.pos.x = r.pos.x; rahmen.pos.y = r.pos.y; rahmen.pos.z = r.pos.z;
    rahmen.rot.x = r.rot.x; rahmen.rot.y = r.rot.y; rahmen.rot.z = r.rot.z; rahmen.rot.w = r.rot.w;
    rahmen.vel.x = r.vel?.x ?? 0; rahmen.vel.y = r.vel?.y ?? 0; rahmen.vel.z = r.vel?.z ?? 0;
    rahmen.aktiv = true;
    if (!war) for (const t of tuerme) weltMuendung(t);
  }
  /** t.muendung (lokal) → t.muendungWelt (ohne Rahmen: Kopie). */
  function weltMuendung(t) {
    const m = t.muendung, w = t.muendungWelt;
    if (!rahmen.aktiv) { w.x = m.x; w.y = m.y; w.z = m.z; return; }
    drehe(rahmen.rot, m.x, m.y, m.z, w); w.x += rahmen.pos.x; w.y += rahmen.pos.y; w.z += rahmen.pos.z;
  }
  const MITTE = []; // Mitte zwischen den Rohren je Lafette (einmal angelegt)
  // Eingestellte Deckel (R11). WARUM an der Instanz statt in FLAK: zwei Flak-Instanzen (Tests, später Koop) dürfen sich nicht
  // gegenseitig umstellen; ohne einstellen() gelten die FLAK-Werte (bitgleich zu R10).
  const einstellung = { deckelQuer: FLAK.deckelQuer, deckelTiefe: FLAK.deckelTiefe };
  /** Regler übernehmen (je Takt erlaubt, keine neuen Objekte): fehlt/NaN → Standard, sonst in [min, max] geklemmt. */
  function einstellen(waffe) {
    for (const k in WAFFEN_REGLER) {
      const R = WAFFEN_REGLER[k], w = waffe ? waffe[k] : undefined;
      einstellung[k] = Number.isFinite(w) ? Math.min(R.max, Math.max(R.min, w)) : R.standard;
    }
  }

  function zuruecksetzen() {
    geschosse.aktiv.fill(0); geschosse.anzahlAktiv = 0; geschosse.verworfen = 0; geschosse.leucht.fill(0); geschosse.anzahlLeucht = 0;
    geschosse.gedeckelt = 0; geschosse.einschlaege = 0; geschosse.unterSperre = 0; geschosse.abstandVerlaengert = 0; geschosse.streu.fill(0);
    // WARUM auch die inaktiven Plätze (Pflege R22): Neustart = frische Instanz bis ins letzte Feld (Koop: Host und Gast
    // starten neu und vergleichen Zustände) — gelesen werden sie nur hinter `aktiv`, aber Prüfungen sehen sie.
    geschosse.turm.fill(0); geschosse.sorte.fill(0); geschosse.alter.fill(0); geschosse.rest.fill(0); geschosse.bruch.fill(0);
    geschosse.pos.fill(0); geschosse.vorPos.fill(0); geschosse.vel.fill(0);
    rahmen.aktiv = false; // die Gefecht-Welt setzt ihn im nächsten Schritt neu
    for (const v of [rahmen.pos, rahmen.vel, rahmen.vorPos]) v.x = v.y = v.z = 0;
    for (const q of [rahmen.rot, rahmen.vorRot]) { q.x = q.y = q.z = 0; q.w = 1; }
    einstellung.deckelQuer = FLAK.deckelQuer; einstellung.deckelTiefe = FLAK.deckelTiefe; // Umschalter mit zurücksetzen (Lehre R8)
    splitter.rest.fill(0); splitter.anzahlAktiv = 0; splitter.zeiger = 0; splitter.pos.fill(0); splitter.sorte.fill(0);
    zeiger = 0; schrittNr = 0;
    for (const t of tuerme) {
      t.leuchtZaehler = 0; // Umschalter mit zurücksetzen (Befund Prüfer R8)
      t.munition = t.nachladeZiel = 'flak'; t.nachladeRest = 0; t.nachladen = 0; t.spin = 0; t.konto = 0; // R23
      ladeWerte(t); // v0 (Prüfstand: FLAK.v0 wie bisher), Reichweite, Richttempo der Hauptbatterie
      t.gier = t.vorGier = t.sollGier = t.lafette.gier[0];
      t.nick = t.vorNick = t.sollNick = 0.2;
      t.imBereich = t.ausgerichtet = t.gesperrt = false; t.bereit = true;
      t.abklingen = 0; t.rohr = 0; t.schuesse = 0;
      t.rnd = zufall((startwert + t.id * 7919) >>> 0);
      muendungLokal(t, -1, t.muendung); weltMuendung(t);
    }
    ereignisse.schuesse.leeren(); ereignisse.detonationen.leeren(); ereignisse.treffer.leeren(); ereignisse.einschlaege.leeren();
  }

  /** Mündung in Montage-Koord. (Prüfstand = Welt, am Schiff = Schiffs-Lokal; rohr −1 = Mitte zwischen beiden Rohren).
   *  Kette wie bauteile.js turm(); unten montiert: Turm-Rahmen (x, y, z) → (−x, −y, z). */
  const tv = v3();
  function muendungLokal(t, rohr, aus) {
    const l = t.lafette, sg = Math.sin(t.gier), cg = Math.cos(t.gier), sn = Math.sin(t.nick), cn = Math.cos(t.nick);
    const m = rohr < 0 ? MITTE[l.id] ??= { x: 0, z: l.muendungen[0].z } : l.muendungen[rohr];
    // Wiege: (m.x, mz·sin n, mz·cos n), dann Zapfen-Versatz, dann um Y gedreht (gier)
    const a = m.x, b = l.zapfen.y + m.z * sn, c = l.zapfen.z + m.z * cn;
    if (l.oben !== false) { aus.x = l.x + a * cg + c * sg; aus.y = l.y + b; aus.z = l.z - a * sg + c * cg; return aus; }
    turmZuSchiff(l, a * cg + c * sg, b, -a * sg + c * cg, tv);
    aus.x = l.x + tv.x; aus.y = l.y + tv.y; aus.z = l.z + tv.z;
    return aus;
  }

  // ---------- Detonation: Schaden mit Abfall auf alle aktiven Ziele ----------
  /** Panzerung (R23, E2): ziel.panzer 0..1 mindert Detonations- und Splitterschaden. Fehlt/0 → Wert unverändert. */
  const gepanzert = (ziel, schaden) => (ziel.panzer > 0 ? schaden * (1 - Math.min(1, ziel.panzer)) : schaden);
  function detoniere(x, y, z, art, ziele, sorte, streu) {
    const S = sorteVon(sorte), W = S.wirkRadius, V = S.vollRadius, fk = faktorVon(sorte);
    const d = ereignisse.detonationen.neu();
    d.pos.x = x; d.pos.y = y; d.pos.z = z; d.radius = W; d.art = art; d.streu = streu; d.sorte = sorte; d.gewicht = gewichtVon(sorte);
    for (let k = 0; k < ziele.length; k++) {
      const ziel = ziele[k];
      if (!ziel.aktiv) continue;
      const ab = Math.max(0, Math.hypot(ziel.pos.x - x, ziel.pos.y - y, ziel.pos.z - z) - ziel.r);
      if (ab >= W) continue;
      const f = ab <= V ? 1 : (1 - (ab - V) / (W - V)) ** 2; // voll bis V, dann quadratisch auf 0 am Wirkradius
      treffe(ziel, gepanzert(ziel, S.schaden * fk * f));
    }
    // Splitterwolke: Ring fester Größe, ist er voll, wird die älteste ersetzt (deterministisch)
    const i = splitter.zeiger; splitter.zeiger = (i + 1) % NS;
    if (splitter.rest[i] === 0) splitter.anzahlAktiv++;
    splitter.pos[i * 3] = x; splitter.pos[i * 3 + 1] = y; splitter.pos[i * 3 + 2] = z;
    splitter.sorte[i] = sorte; splitter.rest[i] = S.splitterDauer;
  }

  /** Höchstens EIN Treffer-Ereignis je Ziel und Schritt (Schaden summiert). */
  function treffe(ziel, schaden) {
    const liste = ereignisse.treffer;
    for (let k = 0; k < liste.length; k++) if (liste[k].zielId === ziel.id) { liste[k].schaden += schaden; return; }
    const tr = liste.neu();
    tr.zielId = ziel.id; tr.schaden = schaden; tr.pos.x = ziel.pos.x; tr.pos.y = ziel.pos.y; tr.pos.z = ziel.pos.z;
  }

  /** Splitterwolken wirken nach: Schaden/s im Radius, linear mit dem Alter abnehmend. Vor den neuen Detonationen. */
  function splitterSchritt(dt, ziele) {
    if (!splitter.anzahlAktiv) return;
    for (let i = 0; i < NS; i++) {
      if (!splitter.rest[i]) continue;
      const so = splitter.sorte[i], S = sorteVon(so), R = S.splitterRadius, fk = faktorVon(so);
      const staerke = splitter.rest[i] / S.splitterDauer; // 1 → 0
      const sx = splitter.pos[i * 3], sy = splitter.pos[i * 3 + 1], sz = splitter.pos[i * 3 + 2];
      for (let k = 0; k < ziele.length; k++) {
        const ziel = ziele[k];
        if (!ziel.aktiv) continue;
        const ab = Math.hypot(ziel.pos.x - sx, ziel.pos.y - sy, ziel.pos.z - sz) - ziel.r;
        if (ab < R) treffe(ziel, gepanzert(ziel, S.splitterDps * fk * staerke * dt * (1 - Math.max(0, ab) / R * 0.5)));
      }
      if (--splitter.rest[i] === 0) splitter.anzahlAktiv--;
    }
  }

  // ---------- Geschosse bewegen, Zünder ----------
  function geschosseSchritt(dt, ziele) {
    const { aktiv, pos, vorPos, vel, alter, rest } = geschosse;
    for (let i = 0; i < N; i++) {
      if (!aktiv[i]) continue;
      const j = i * 3;
      const x0 = pos[j], y0 = pos[j + 1], z0 = pos[j + 2];
      vorPos[j] = x0; vorPos[j + 1] = y0; vorPos[j + 2] = z0;
      const dx = vel[j] * dt, dy = vel[j + 1] * dt, dz = vel[j + 2] * dt;
      pos[j] = x0 + dx; pos[j + 1] = y0 + dy; pos[j + 2] = z0 + dz;
      alter[i]++;
      if (geschosse.sorte[i] === PANZER) { panzerSchritt(i, x0, y0, z0, dx, dy, dz, ziele); continue; }
      // Annäherungszünder (nur mit FLAK.annaeherung): Strecke in RELATIVBEWEGUNG gegen Kugel r + 12
      // (WARUM: ~17 m/Schritt → Punkttest tunnelt)
      let bestS = 2, bestZiel = -1;
      if (FLAK.annaeherung && alter[i] * dt * Math.hypot(vel[j], vel[j + 1], vel[j + 2]) > FLAK.scharfStrecke) {
        for (let k = 0; k < ziele.length; k++) {
          const zl = ziele[k];
          if (!zl.aktiv) continue;
          const vp = zl.vorPos ?? zl.pos;
          const ax = x0 - vp.x, ay = y0 - vp.y, az = z0 - vp.z;               // relativ am Schrittanfang
          const ex = pos[j] - zl.pos.x, ey = pos[j + 1] - zl.pos.y, ez = pos[j + 2] - zl.pos.z; // am Ende
          const ux = ex - ax, uy = ey - ay, uz = ez - az;
          const uu = ux * ux + uy * uy + uz * uz;
          let s = uu > 1e-9 ? -(ax * ux + ay * uy + az * uz) / uu : 0;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const cx = ax + ux * s, cy = ay + uy * s, cz = az + uz * s;
          const rr = zl.r + FLAK.naheZuender;
          if (cx * cx + cy * cy + cz * cz <= rr * rr && s < bestS) { bestS = s; bestZiel = k; }
        }
      }
      if (bestZiel >= 0) {
        aktiv[i] = 0; geschosse.anzahlAktiv--; geschosse.anzahlLeucht -= geschosse.leucht[i];
        detoniere(x0 + dx * bestS, y0 + dy * bestS, z0 + dz * bestS, 'nah', ziele, geschosse.sorte[i], geschosse.streu[i]);
      } else if (--rest[i] === 0) {
        aktiv[i] = 0; geschosse.anzahlAktiv--; geschosse.anzahlLeucht -= geschosse.leucht[i];
        const b = geschosse.bruch[i]; // genauer Zündort innerhalb des letzten Schritts
        detoniere(x0 + dx * b, y0 + dy * b, z0 + dz * b, 'zeit', ziele, geschosse.sorte[i], geschosse.streu[i]);
      }
    }
  }

  /** Panzergranate (R23, E2): Strecke dieses Schritts in RELATIVBEWEGUNG gegen die Trefferkugel r jedes Ziels (bei
   *  1600 m/s ≈ 27 m je Schritt — ein Punkttest tunnelte durch 6-m-Boote). Erster Treffer längs der Strecke zählt:
   *  voller Schaden (keine Panzerung), Einschlag-Ereignis. Ohne Treffer endet sie nach der Reichweite still. */
  function panzerSchritt(i, x0, y0, z0, dx, dy, dz, ziele) {
    let bestS = 2, bestK = -1;
    for (let k = 0; k < ziele.length; k++) {
      const zl = ziele[k];
      if (!zl.aktiv) continue;
      const vp = zl.vorPos ?? zl.pos;
      const ax = x0 - vp.x, ay = y0 - vp.y, az = z0 - vp.z;
      const ux = x0 + dx - zl.pos.x - ax, uy = y0 + dy - zl.pos.y - ay, uz = z0 + dz - zl.pos.z - az;
      const uu = ux * ux + uy * uy + uz * uz;
      let s = uu > 1e-9 ? -(ax * ux + ay * uy + az * uz) / uu : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      const cx = ax + ux * s, cy = ay + uy * s, cz = az + uz * s, r = zl.r ?? 0;
      if (cx * cx + cy * cy + cz * cz <= r * r && s < bestS) { bestS = s; bestK = k; }
    }
    if (bestK < 0) {
      if (--geschosse.rest[i] === 0) { geschosse.aktiv[i] = 0; geschosse.anzahlAktiv--; geschosse.anzahlLeucht -= geschosse.leucht[i]; }
      return;
    }
    geschosse.aktiv[i] = 0; geschosse.anzahlAktiv--; geschosse.anzahlLeucht -= geschosse.leucht[i];
    const zl = ziele[bestK], e = ereignisse.einschlaege.neu(), j = i * 3;
    treffe(zl, WAFFEN_TYP.schwer.panzer.schaden);
    e.zielId = zl.id; e.pos.x = x0 + dx * bestS; e.pos.y = y0 + dy * bestS; e.pos.z = z0 + dz * bestS;
    const v = Math.hypot(geschosse.vel[j], geschosse.vel[j + 1], geschosse.vel[j + 2]) || 1;
    e.richtung.x = geschosse.vel[j] / v; e.richtung.y = geschosse.vel[j + 1] / v; e.richtung.z = geschosse.vel[j + 2] / v;
    geschosse.einschlaege++;
  }

  function freiesGeschoss() {
    for (let n = 0; n < N; n++) {
      const i = (zeiger + n) % N;
      if (!geschosse.aktiv[i]) { zeiger = (i + 1) % N; return i; }
    }
    return -1;
  }

  // ---------- Turm richten + feuern ----------
  const tmp = v3();
  /** Hauptbatterie (R23): gewünschte Munition (befehl.munition, fehlt → 'flak') laden. Wechsel = nachladen Sekunden
   *  ohne Feuer; zurück zur geladenen Munition bricht den Wechsel ab. t.nachladen = verbleibender Anteil (1 → 0). */
  function munitionSchritt(t, dt, b) {
    const soll = b ? (b.munition === 'panzer' ? 'panzer' : 'flak') : (t.nachladeRest > 0 ? t.nachladeZiel : t.munition);
    const N = Math.max(1, Math.round(WAFFEN_TYP.schwer.nachladen / dt));
    if (t.nachladeRest > 0) {
      if (soll === t.munition) t.nachladeRest = 0; // Wechsel abgebrochen, die geladene Munition bleibt
      else if (--t.nachladeRest === 0) { t.munition = soll; ladeWerte(t); }
    } else if (soll !== t.munition) { t.nachladeZiel = soll; t.nachladeRest = N; }
    t.nachladen = t.nachladeRest / N;
  }
  /** Gatling (R23, nur am Schiff): Drehzahl folgt dem Abzug (befehl.feuer), Schusskonto füllt sich mit kadenzMax · spin.
   *  WARUM Deckel 1 + Zuwachs: im Dauerfeuer geht kein Bruchteil verloren, nach einer Pause gibt es keinen Feuerstoß. */
  function gatlingSchritt(t, dt, b) {
    const G = WAFFEN_TYP.flak, will = !!(b && b.punkt && b.feuer);
    t.spin = will ? Math.min(1, t.spin + dt / G.anlauf) : Math.max(0, t.spin - dt / G.auslauf);
    if (t.spin >= G.spinMin) { const a = G.kadenzMax * t.spin * dt; t.konto = Math.min(1 + a, t.konto + a); } else t.konto = 0;
    t.bereit = t.konto >= 1;
  }
  function turmSchritt(t, dt, b) {
    const l = t.lafette;
    t.vorGier = t.gier; t.vorNick = t.nick;
    if (t.abklingen > 0) t.abklingen--;
    t.bereit = t.abklingen === 0;
    const schwer = t.typ === 'schwer', gatling = gatlingAn && !schwer;
    if (schwer) munitionSchritt(t, dt, b); else if (gatling) gatlingSchritt(t, dt, b);
    const p = b && b.punkt;
    if (!p) { t.imBereich = t.ausgerichtet = t.gesperrt = false; return; }

    // Sollwinkel vom Zapfen aus (Gier um die Kranzachse, Nick vom Wiegen-Drehpunkt), im TURM-Rahmen
    // (unten montiert: x und y gespiegelt, turm.js — der Prüfstand rechnet unverändert)
    let dx = p.x - l.x, dy;
    const dz = p.z - l.z;
    if (l.oben === false) { dx = -dx; dy = (l.y - p.y) - l.zapfen.y; } else dy = p.y - (l.y + l.zapfen.y);
    const h = Math.max(0.1, Math.hypot(dx, dz) - l.zapfen.z);
    const entf = Math.hypot(h, dy);
    let sollG = Math.atan2(dx, dz), sollN = Math.atan2(dy, h);
    const gMitte = l.gier[0], gHalb = l.gier[1], nMin = l.nick[0], nMax = l.nick[1];
    const volleDrehung = gHalb >= Math.PI - 1e-6;
    let relSoll = umbruch(sollG - gMitte);
    let gesperrt = false;
    if (!volleDrehung && Math.abs(relSoll) > gHalb) { relSoll = Math.sign(relSoll) * gHalb; gesperrt = true; }
    if (sollN < nMin) { sollN = nMin; gesperrt = true; } else if (sollN > nMax) { sollN = nMax; gesperrt = true; }
    // Nachbar-Sperre (am Schiff auch Rumpf-Sperre): Soll zeigt flach auf ein Hindernis → Nick klemmen, nicht feuern
    const nSperr = sperrNick(t, gMitte + relSoll);
    if (sollN < nSperr) { sollN = nSperr; gesperrt = true; }
    t.sollGier = gMitte + relSoll; t.sollNick = sollN; t.gesperrt = gesperrt;
    t.imBereich = !gesperrt && entf <= t.reichweite; // R23: Reichweite der geladenen Munition (Prüfstand = FLAK.reichweite)

    // Richten mit begrenzter Geschwindigkeit. WARUM ohne Umbruch bei Grenzen: der Turm darf nicht durch die Sperrzone drehen.
    const dG = volleDrehung ? umbruch(t.sollGier - t.gier) : relSoll - umbruch(t.gier - gMitte);
    const mg = t.richtGeschw[0] * dt, mn = t.richtGeschw[1] * dt;
    const neuG = umbruch(t.gier + Math.max(-mg, Math.min(mg, dG)));
    let nZiel = t.sollNick;
    if (amSchiff) {
      // Schwenk-Schutz (R14): liegt die nächste Gier über Rumpf/Nachbar, erst das Rohr heben, dann weiterdrehen.
      // WARUM: sonst streicht das Rohr beim Schwenken sichtbar durch den eigenen Rumpf. Kann der Nick nicht weiter
      // (Grenze), dreht der Turm trotzdem (kein Festhängen); gefeuert wird dort ohnehin nicht (Ist-Prüfung unten).
      const nNeu = sperrNick(t, neuG);
      if (nNeu > nZiel) nZiel = Math.min(nMax, nNeu);
      if (t.nick >= nNeu - 1e-9 || t.nick >= nMax - 1e-9) t.gier = neuG;
    } else t.gier = neuG;
    const dN = nZiel - t.nick;
    t.nick += Math.max(-mn, Math.min(mn, dN));

    const fehlG = umbruch(sollG - t.gier) * Math.cos(t.nick), fehlN = Math.atan2(dy, h) - t.nick;
    const fehl = Math.hypot(fehlG, fehlN);
    t.ausgerichtet = fehl <= (b.toleranz ?? 0.01);
    muendungLokal(t, -1, t.muendung);

    // WARUM auch die IST-Lage prüfen: beim Schwenken streicht das Rohr evtl. flach über den Nachbarn
    if (t.nick < sperrNick(t, t.gier)) { t.gesperrt = true; t.imBereich = false; }
    if (schwer) {
      // Hauptbatterie (R23): Salve beider Rohre im selben Schritt, nur geladen (kein Wechsel läuft).
      // WARUM eigene Toleranz für die Panzergranate: sie hat keine Streukugel und keinen Zünder — sie trifft nur,
      // wenn das Rohr wirklich auf dem Vorhaltepunkt liegt.
      const pz = t.munition === 'panzer';
      if (!(b.feuer && t.imBereich && t.bereit && t.nachladeRest === 0)) return;
      if (pz ? !(fehl <= Math.min(b.toleranz ?? 0.01, WAFFEN_TYP.schwer.panzer.toleranz)) : !t.ausgerichtet) return;
      const sorte = pz ? PANZER : 4;
      const a = feuere(t, b, 0, sorte, entf, dt), c = feuere(t, b, 1, sorte, entf, dt);
      if (a || c) { t.abklingen = Math.max(1, Math.round(WAFFEN_TYP.schwer[t.munition].salve / dt)); t.bereit = false; }
      return;
    }
    if (gatling) {
      if (!(b.feuer && t.imBereich && t.ausgerichtet && t.konto >= 1)) return;
      if (feuere(t, b, t.rohr, b.zielId == null ? 3 : 2, entf, dt)) { t.rohr ^= 1; t.konto -= 1; t.bereit = false; }
      return;
    }
    if (!(b.feuer && t.imBereich && t.ausgerichtet && t.bereit)) return;
    const rohr = t.rohr;
    if (!feuere(t, b, rohr, b.zielId == null ? 1 : 0, entf, dt)) return;
    t.rohr ^= 1; t.abklingen = FLAK.schussAbstand; t.bereit = false;
  }

  /** Eine Granate der Sorte `sorte` aus Rohr `rohr` (false = Vorrat voll, verworfen). Prüfstand-Folge wie bis R22:
   *  dieselben Rechenschritte und Zufallsaufrufe in derselben Reihenfolge (Panzergranate: nur die Rohrstreuung). */
  function feuere(t, b, rohr, sorte, entf, dt) {
    const l = t.lafette, p = b.punkt;
    const gMitte = l.gier[0], gHalb = l.gier[1], nMin = l.nick[0], nMax = l.nick[1];
    const volleDrehung = gHalb >= Math.PI - 1e-6;
    const i = freiesGeschoss();
    if (i < 0) { geschosse.verworfen++; return false; }
    t.schuesse++;
    muendungLokal(t, rohr, tmp);
    const v0 = t.v0, panzer = sorte === PANZER;
    // Leuchtspur VOR der Streuung festlegen: sie bestimmt den Querdeckel (R10). Der Zähler nutzt keinen Zufall.
    let leucht = b.leuchtspur;
    if (leucht == null) { t.leuchtZaehler += FLAK.leuchtAnteil; leucht = t.leuchtZaehler >= 1; if (leucht) t.leuchtZaehler -= 1; }
    // Streu-Ellipsoid (R8 Kugel, R10 Ellipsoid): Punkt gleichverteilt in der Einheitskugel — genau 3 Zufallszahlen
    // (Richtung + Kubikwurzel-Radius) —, dann längs der Schusslinie mit rt, quer mit rq gestreckt. rq = rt → alte Kugel.
    // WARUM Versatz als Winkeldifferenz auf die Rohrrichtung: der Turm richtet nur auf p (Richttempo), jede Granate
    // bekommt ihren eigenen Punkt, der Richtfehler des Turms bleibt erhalten. Alles im Turm-Rahmen (unten gespiegelt).
    // R23: die Panzergranate streut nicht (gezielter Einzelschuss; die Streukugel des Befehls gilt der Flak).
    let kG = 0, kN = 0, zuender = 0, zStreu = 0;
    if (panzer) geschosse.streu[i] = 0;
    else {
      let qx0 = p.x - tmp.x, qy0 = p.y - tmp.y;
      const qz0 = p.z - tmp.z, dp = Math.hypot(qx0, qy0, qz0);
      if (l.oben === false) { qx0 = -qx0; qy0 = -qy0; }
      const wunschQ = b.streuKugel || 0, wunschT = b.streuTiefe ?? wunschQ;
      const rq = Math.min(wunschQ, (leucht ? FLAK.deckelQuerLeucht : einstellung.deckelQuer) * dp);
      const rt = Math.min(wunschT || 0, einstellung.deckelTiefe * dp);
      if (rq < wunschQ || rt < wunschT) geschosse.gedeckelt++;
      geschosse.streu[i] = Math.max(rq, rt);
      if ((rq > 0 || rt > 0) && dp > 1e-6) {
        const cz = 2 * t.rnd() - 1, phi = ZWEI_PI * t.rnd(), r = Math.cbrt(t.rnd()), sz = Math.sqrt(1 - cz * cz);
        const ux = r * sz * Math.cos(phi), uy = r * sz * Math.sin(phi), uz = r * cz;
        const ex = qx0 / dp, ey = qy0 / dp, ez = qz0 / dp, l = ux * ex + uy * ey + uz * ez; // Anteil längs der Schusslinie
        const qx = qx0 + rq * (ux - l * ex) + rt * l * ex, qy = qy0 + rq * (uy - l * ey) + rt * l * ey, qz = qz0 + rq * (uz - l * ez) + rt * l * ez;
        kG = umbruch(Math.atan2(qx, qz) - Math.atan2(qx0, qz0));
        kN = Math.atan2(qy, Math.hypot(qx, qz)) - Math.atan2(qy0, Math.hypot(qx0, qz0));
        zuender = Math.hypot(qx, qy, qz) / v0; zStreu = FLAK.zuenderStreuKugel;
      } else {
        zuender = b.zuender ?? entf / v0; zStreu = b.zielId == null ? FLAK.zuenderStreuSperr : FLAK.zuenderStreu;
      }
    }
    // Streuung: zwei Achsen, je Dreiecksverteilung (Summe zweier Zufallszahlen) → dichte Mitte, weicher Rand
    let g = t.gier + kG + (t.rnd() + t.rnd() - 1) * t.streuung / Math.max(0.2, Math.cos(t.nick));
    let n = t.nick + kN + (t.rnd() + t.rnd() - 1) * t.streuung;
    if (amSchiff) {
      // Am Schiff (R14): auch die versetzte Granate bleibt in den Grenzen der Lafette (sie stehen für den Rumpf).
      if (!volleDrehung) { const rel = umbruch(g - gMitte); if (rel > gHalb) g = gMitte + gHalb; else if (rel < -gHalb) g = gMitte - gHalb; }
      if (n < nMin) n = nMin; else if (n > nMax) n = nMax;
    }
    // Sperr-Schutz (R12): der Ellipsoid-Versatz lenkt die Granate bis zu 45° vom Rohr ab, die Sperre prüft aber nur das
    // Rohr. WARUM: sonst fliegt eine nach unten versetzte Granate durch den Nachbarturm. Kein Zufall → Folge bleibt gleich.
    // WARUM immer (Prüfer R12, vorher nur bei kN < 0): auch der Gier-Versatz kG und die Rohrstreuung legen die Granate
    // seitlich in die Sperrzone des Nachbarn — maßgeblich ist die tatsächliche Gier g der Granate, nicht die des Rohrs.
    // Am Schiff gilt dieselbe Regel für die Rumpf-Sperre (sperrNick enthält sie).
    const sperrMin = sperrNick(t, g);
    if (n < sperrMin) { n = sperrMin; geschosse.unterSperre++; }
    const cn = Math.cos(n);
    let rx = Math.sin(g) * cn, ry = Math.sin(n);
    const rz = Math.cos(g) * cn;
    if (l.oben === false) { rx = -rx; ry = -ry; } // Turm-Rahmen → Schiff
    if (!panzer) {
      zuender = Math.min(FLAK.zuenderMax, Math.max(FLAK.zuenderMinStrecke / v0, zuender)) * (1 + (t.rnd() + t.rnd() - 1) * zStreu);
      if (rahmen.aktiv) {
        // Mindestabstand (R14/5): im Schiffsrahmen fliegt die Granate geradlinig mit v0 (das Schiffstempo erbt sie).
        // Liegt der Zündort näher als mindestAbstand an der Schiffsmitte, zündet sie erst beim Austritt aus der Kugel.
        const wx = tmp.x - schiffMitte.x, wy = tmp.y - schiffMitte.y, wz = tmp.z - schiffMitte.z;
        const st = zuender * v0, px = wx + rx * st, py = wy + ry * st, pz = wz + rz * st, R2 = mindestAbstand * mindestAbstand;
        if (px * px + py * py + pz * pz < R2) {
          const bb = wx * rx + wy * ry + wz * rz, c = wx * wx + wy * wy + wz * wz - R2;
          zuender = (-bb + Math.sqrt(Math.max(0, bb * bb - c))) / v0; geschosse.abstandVerlaengert++;
        }
      }
    } else zuender = WAFFEN_TYP.schwer.panzer.reichweite / v0; // Lebensdauer: danach endet sie still (kein Zünder)
    const j = i * 3;
    geschosse.aktiv[i] = 1; geschosse.anzahlAktiv++; geschosse.turm[i] = t.id;
    geschosse.sorte[i] = sorte;
    geschosse.leucht[i] = leucht ? 1 : 0;
    if (leucht) geschosse.anzahlLeucht++;
    const s = ereignisse.schuesse.neu();
    if (rahmen.aktiv) {
      // Schiffs-Lokal → Welt: Mündung mit dem aktuellen Rahmen, vorPos mit dem vorigen (die Grafik interpoliert die
      // Granate dann genau wie das Schiffsmodell), Tempo = gedrehtes Rohr · v0 + Schiffstempo.
      drehe(rahmen.rot, tmp.x, tmp.y, tmp.z, s.pos); s.pos.x += rahmen.pos.x; s.pos.y += rahmen.pos.y; s.pos.z += rahmen.pos.z;
      drehe(rahmen.vorRot, tmp.x, tmp.y, tmp.z, s.vorPos); s.vorPos.x += rahmen.vorPos.x; s.vorPos.y += rahmen.vorPos.y; s.vorPos.z += rahmen.vorPos.z;
      drehe(rahmen.rot, rx, ry, rz, s.richtung);
      s.vel.x = rahmen.vel.x; s.vel.y = rahmen.vel.y; s.vel.z = rahmen.vel.z;
      geschosse.pos[j] = s.pos.x; geschosse.pos[j + 1] = s.pos.y; geschosse.pos[j + 2] = s.pos.z;
      geschosse.vorPos[j] = s.vorPos.x; geschosse.vorPos[j + 1] = s.vorPos.y; geschosse.vorPos[j + 2] = s.vorPos.z;
      geschosse.vel[j] = s.richtung.x * v0 + rahmen.vel.x; geschosse.vel[j + 1] = s.richtung.y * v0 + rahmen.vel.y; geschosse.vel[j + 2] = s.richtung.z * v0 + rahmen.vel.z;
    } else {
      geschosse.pos[j] = geschosse.vorPos[j] = tmp.x;
      geschosse.pos[j + 1] = geschosse.vorPos[j + 1] = tmp.y;
      geschosse.pos[j + 2] = geschosse.vorPos[j + 2] = tmp.z;
      geschosse.vel[j] = rx * v0; geschosse.vel[j + 1] = ry * v0; geschosse.vel[j + 2] = rz * v0;
      s.pos.x = s.vorPos.x = tmp.x; s.pos.y = s.vorPos.y = tmp.y; s.pos.z = s.vorPos.z = tmp.z;
      s.richtung.x = rx; s.richtung.y = ry; s.richtung.z = rz;
      s.vel.x = s.vel.y = s.vel.z = 0;
    }
    geschosse.alter[i] = 0;
    // WARUM ganze Schritte + Bruch: Zähler ohne Zeitrundung (Gleichlauf), Zündort trotzdem auf den Meter genau
    const schritte = zuender / dt, rest = Math.max(1, Math.ceil(schritte - 1e-9));
    geschosse.rest[i] = rest; geschosse.bruch[i] = Math.min(1, Math.max(0, schritte - (rest - 1)));
    s.turmId = t.id; s.turmIndex = t.index; s.rohr = rohr; s.sorte = sorte;
    return true;
  }

  /** befehle[i] gehört zu tuerme[i] (Turm-Reihenfolge); fehlt er, hält der Turm still. */
  function schritt(dt, befehle, ziele) {
    schrittNr++;
    ereignisse.schuesse.leeren(); ereignisse.detonationen.leeren(); ereignisse.treffer.leeren(); ereignisse.einschlaege.leeren();
    splitterSchritt(dt, ziele);           // Nachwirkung älterer Detonationen (die neue wirkt in diesem Schritt sofort)
    geschosseSchritt(dt, ziele);          // erst fliegen (neue Geschosse starten an der Mündung, sichtbar ab diesem Bild)
    for (let i = 0; i < tuerme.length; i++) turmSchritt(tuerme[i], dt, befehle ? befehle[i] : null);
    for (let i = 0; i < tuerme.length; i++) weltMuendung(tuerme[i]); // auch stillstehende Türme fahren mit dem Schiff
  }

  /** FNV-1a über Turmwinkel, Geschosse und Ereigniszahlen (Gleichlauf-Prüfung). */
  function pruefsumme() {
    let h = 2166136261 >>> 0;
    const mische = (v) => { h ^= (Math.round(v * 1000) | 0); h = Math.imul(h, 16777619) >>> 0; };
    mische(schrittNr);
    for (const t of tuerme) { mische(t.gier); mische(t.nick); mische(t.schuesse); }
    // R23: Zustand der Gatlings/Hauptbatterie nur am Schiff (WARUM: Prüfstand-Prüfsumme bleibt wie R22)
    if (amSchiff) for (const t of tuerme) { mische(t.spin); mische(t.konto); mische(t.nachladeRest); mische(t.munition === 'panzer' ? 1 : 0); }
    for (let i = 0; i < N; i++) if (geschosse.aktiv[i]) { mische(i); mische(geschosse.pos[i * 3]); mische(geschosse.pos[i * 3 + 1]); mische(geschosse.pos[i * 3 + 2]); }
    mische(ereignisse.detonationen.length); mische(ereignisse.treffer.length); mische(splitter.anzahlAktiv);
    return h.toString(16);
  }

  zuruecksetzen();
  return { tuerme, geschosse, splitter, ereignisse, schritt, zuruecksetzen, pruefsumme, einstellen, einstellung, setzeRahmen, rahmen,
    erreichbar, amSchiff, get schrittNr() { return schrittNr; } };
}
