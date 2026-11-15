# Lernbuch lichtsetzer

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-15 Runde 2 — Beobachtung: Sterne/Sonne sichtbar durch das Schiff. Ursache: `transparent: true` → Transparent-
  Liste wird NACH dem Opaken gezeichnet, `depthTest: false` → übermalt den Rumpf. Änderung: `transparent: false` (additive
  Mischung bleibt). Lehre: Hintergrund nie in die Transparent-Liste; renderOrder wirkt nur innerhalb einer Liste.
- 2026-11-15 Runde 4 (Bestandsaufnahme) — Schatten-Einrasten rundet Welt-x/y/z; Texelraster liegt aber im Licht-Raum.
  Lehre: Einrasten im Licht-Raum (über shadow.camera.matrixWorldInverse). Lichtanzahl bei V bleibt 1 — von der
  Projektleitung gemessen (info.programs 33 → 33). Waffen-Effekte: Vorrat + Instanzen, depthTest an, keine Lichter pro Treffer.
