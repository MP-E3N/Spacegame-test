// ZWECK: Vite mit zwei Seiten — Spiel (index.html) und Flak-Labor (flak.html, Runde 6).
// WARUM eigene Konfiguration: im Entwicklungsmodus liefert Vite jede HTML-Datei aus, für `npm run build` muss die
// zweite Seite aber als Eingang genannt sein.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: { spiel: resolve(import.meta.dirname, 'index.html'), flak: resolve(import.meta.dirname, 'flak.html') },
    },
  },
});
