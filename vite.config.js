// ZWECK: Vite mit zwei Seiten — Spiel (index.html) und Flak-Labor (flak.html, Runde 6) — plus Konfig-Ablage für das
//        Flak-Labor (Runde 12, Nutzer: „Konfig speichern mit Benennung, damit du sie direkt abrufen kannst“).
// WARUM eigene Konfiguration: im Entwicklungsmodus liefert Vite jede HTML-Datei aus, für `npm run build` muss die
// zweite Seite aber als Eingang genannt sein.
// KONFIG-ABLAGE (nur Dev-Server): GET /api/flak-konfig → Liste · GET /api/flak-konfig/<name> → JSON ·
//   POST /api/flak-konfig/<name> (JSON-Objekt, ≤ 64 KB) → schreibt konfig/flak/<name>.json.
//   WARUM Datei statt localStorage: der Browser des Nutzers ist für die KI nicht lesbar, eine Datei im Projekt schon.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const ORDNER = resolve(import.meta.dirname, 'konfig', 'flak');
// Name: Buchstaben (auch Umlaute), Ziffern, Leerzeichen, - und _; 1–40 Zeichen. WARUM so streng: der Name wird zum
// Dateinamen — kein Punkt, kein Schrägstrich, also kein Ausbruch aus dem Ordner.
const NAME = /^[\p{L}\p{N} _-]{1,40}$/u;
const dateiname = (name) => name.trim().replace(/\s+/g, '_') + '.json';

function konfigAblage() {
  return {
    name: 'flak-konfig-ablage',
    configureServer(server) {
      server.middlewares.use('/api/flak-konfig', async (req, res) => {
        const antwort = (code, daten) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(daten)); };
        try {
          const name = decodeURIComponent((req.url || '/').replace(/^\/+/, '').split('?')[0]);
          if (!name) {
            if (req.method !== 'GET') return antwort(405, { fehler: 'nur GET' });
            await mkdir(ORDNER, { recursive: true });
            const dateien = (await readdir(ORDNER)).filter((d) => d.endsWith('.json')).sort();
            return antwort(200, dateien.map((d) => d.slice(0, -5).replace(/_/g, ' ')));
          }
          if (!NAME.test(name.trim())) return antwort(400, { fehler: 'Name: nur Buchstaben, Ziffern, Leerzeichen, - und _ (max. 40)' });
          const pfad = resolve(ORDNER, dateiname(name));
          if (req.method === 'GET') return antwort(200, JSON.parse(await readFile(pfad, 'utf8')));
          if (req.method !== 'POST') return antwort(405, { fehler: 'nur GET/POST' });
          let text = '';
          for await (const stueck of req) { text += stueck; if (text.length > 65536) return antwort(413, { fehler: 'zu groß' }); }
          const daten = JSON.parse(text);
          if (!daten || typeof daten !== 'object' || Array.isArray(daten)) return antwort(400, { fehler: 'kein JSON-Objekt' });
          await mkdir(ORDNER, { recursive: true });
          await writeFile(pfad, JSON.stringify({ name: name.trim(), gespeichert: new Date().toISOString(), ...daten }, null, 2) + '\n', 'utf8');
          return antwort(200, { ok: true, datei: 'konfig/flak/' + dateiname(name) });
        } catch (f) {
          return antwort(f?.code === 'ENOENT' ? 404 : 500, { fehler: String(f?.message || f) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [konfigAblage()],
  build: {
    rollupOptions: {
      input: { spiel: resolve(import.meta.dirname, 'index.html'), flak: resolve(import.meta.dirname, 'flak.html') },
    },
  },
});
