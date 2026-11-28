# Lernbuch netzarchitekt

## Regeln
(noch keine — werden jede 3. Runde verdichtet)

## Einträge
- 2026-11-28 Runde 23 (Gefechtszentrale) — Beobachtung: im 90-s-Gefecht schalteten 4 Streifschüsse mittschiffs schon 2 von
  14 Türmen ab. Ursache: lineare Wirkung ab 100 % + floor() bei der Turmversorgung. Änderung: Totzone wirkSchwelle 0,6.
  Messung: 70 % Schaden → keine Wirkung; unbediente Zentrale neutral (Gefecht bitgleich). Lehre: Spielwirkungen aus Schaden
  brauchen eine Totzone, sonst wird jeder Einbau zur Balance-Änderung. Befehle als reine Daten mit pruefeBefehl() —
  Grundlage fürs Netz.
