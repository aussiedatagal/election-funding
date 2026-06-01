import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function saveLayoutPlugin() {
  return {
    name: 'save-layout',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-layout', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            JSON.parse(body); // validate JSON before writing
            writeFileSync(join(__dirname, 'src/data/network-layout-draft.json'), body);

            // Bake draft → network-layout.json so HMR picks it up immediately
            const result = spawnSync('node', ['scripts/bake_draft.mjs'], {
              cwd: __dirname,
              stdio: 'pipe',
            });
            if (result.status !== 0) {
              const err = result.stderr?.toString() || 'bake_draft failed';
              console.error('[save-layout]', err);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err }));
              return;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), saveLayoutPlugin()],
  // Change this to match your GitHub Pages repo name, e.g. '/aus-political-funding/'
  base: './',
});
