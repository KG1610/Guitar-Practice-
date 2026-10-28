import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function alphaTabFonts() {
  const src = path.resolve('node_modules/@coderline/alphatab/dist/font');
  const types = {
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.eot': 'application/vnd.ms-fontobject',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
  };
  function serve(req, res, next) {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/alphatab/font/')) return next();
    const file = path.resolve(src, path.basename(url));
    if (!file.startsWith(src) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(file).pipe(res);
  }
  return {
    name: 'alphatab-fonts',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
    writeBundle(options) {
      const dest = path.resolve(options.dir || 'dist', 'alphatab/font');
      fs.mkdirSync(dest, { recursive: true });
      if (!fs.existsSync(src)) return;
      for (const file of fs.readdirSync(src)) {
        const from = path.join(src, file);
        if (fs.statSync(from).isFile()) fs.copyFileSync(from, path.join(dest, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [alphaTabFonts()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/media': 'http://127.0.0.1:8787',
    },
  },
});
