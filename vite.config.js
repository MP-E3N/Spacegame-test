// ZWECK: Vite mit mehreren Seiten — Startmenü (index.html), Freiflug, Flak-Labor, Gefechtstest, Werft — plus Datei-Ablagen
//        (nur Dev-Server, server/ablage.js): Flak-Konfigs (Runde 12) und Schiffsentwürfe der Werft (Runde 15).
// WARUM eigene Konfiguration: im Entwicklungsmodus liefert Vite jede HTML-Datei aus, für `npm run build` muss jede
// Seite aber als Eingang genannt sein.
// ABLAGEN: /api/flak-konfig → konfig/flak/<name>.json · /api/schiffe → konfig/schiffe/<name>.json
//   GET / → Liste · GET /<name> → JSON · POST /<name> (JSON-Objekt, ≤ 64 KB) → Datei.
//   WARUM Datei statt localStorage: der Browser des Nutzers ist für die KI nicht lesbar, eine Datei im Projekt schon.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { ablage } from './server/ablage.js';

const WURZEL = import.meta.dirname;
const ABLAGEN = { '/api/flak-konfig': 'flak', '/api/schiffe': 'schiffe' };

function dateiAblagen() {
  return {
    name: 'datei-ablagen',
    configureServer(server) {
      for (const [pfad, ordner] of Object.entries(ABLAGEN)) {
        server.middlewares.use(pfad, ablage({ ordner: resolve(WURZEL, 'konfig', ordner), wurzel: WURZEL }));
      }
    },
  };
}

export default defineConfig({
  plugins: [dateiAblagen()],
  build: {
    rollupOptions: {
      // Runde 14: index.html = Startmenü, Freiflug eigene Seite, Gefechtstest neu · Runde 15: Werft
      input: Object.fromEntries(['index', 'freiflug', 'flak', 'gefecht', 'werft'].map((n) => [n, resolve(WURZEL, n + '.html')])),
    },
  },
});
