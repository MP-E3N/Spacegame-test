# Schwarmfront — Spielidee (vom Nutzer, 2026-11-15)

Kleines **Koop-Weltraumspiel für bis zu 4 Spieler**: Gemeinsam bedient man ein Kriegsschiff und hält gegen einen
kleineren **Schwarm von Alien-Schiffen** stand. Vorbild für das Spielgefühl: Brücken-Spiele (jeder hat eine Station),
Stimmung **industriell, rau, militärisch** (angelehnt an das Gefühl von „Battlestar Galactica“, aber eigene Entwürfe).
Nichts „Schönes“, kein Glanz; **keine Fenster** — die Brücke liegt gepanzert im Rumpf, nach draußen schaut man über
Bildschirme bzw. die **Außenansicht**.

## Bausteine
- **Raumschiff** der Spieler — ✅ „BT-12 Bollwerk“ (Schlachtträger, ~255 m, Runde 2); „FK-07 Ambos“ (Fregatte, ~150 m, U-Boot-Look) bleibt gesichert.
- **Alien-Schiffe**: ein paar kleinere, angriffslustige Schiffe (Schwarm) — offen.
- **Zentrale mit 4 Stationen** — offen. Vorschlag:
  1. **Steuer** (Helm): Schubhebel, Kurs, Ausweichen — ✅ als Tastatursteuerung vorhanden.
  2. **Waffen**: Geschütztürme richten, Feuerfreigabe, Flak gegen den Schwarm (4 Türme sind schon eigene Gruppen).
  3. **Maschine**: Energie verteilen (Antrieb / Waffen / Schilde-Panzer), Schäden reparieren, Hitze.
  4. **Taktik/Kommando**: Sensoren, Ziele markieren, Befehle, Überblick.
- **Außenansicht** — ✅ Verfolgerkamera, Übersicht, freie Kamera.

## Technischer Weg zum Koop (Vorschlag, nicht beauftragt)
1. Simulation strikt getrennt von der Grafik (ist so gebaut: `src/sim/` ohne DOM, fester 60-Hz-Schritt, Gleichlauf getestet).
2. Ein Spieler ist **Host** und rechnet die Simulation; die anderen schicken nur **Befehle ihrer Station** und bekommen
   den Zustand zurück (kleiner Node-Server mit WebSocket oder direkt WebRTC). Neue Bibliothek dafür nur mit Zustimmung.
3. Jede Station ist eine eigene Bildschirm-Ansicht im Browser; die Außenansicht kann jeder zuschalten.
