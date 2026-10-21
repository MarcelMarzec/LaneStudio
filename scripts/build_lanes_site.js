/* eslint-disable no-console */
// Packages Lane Studio as a static site in dist-lanes/, ready to upload to any web host
// (e.g. a cPanel document root). `npm run all` runs this last, once dist/ holds every built asset
// (the icon sprites, minified code, data and locales); on its own it needs a finished `npm run all`.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { styleText } from 'node:util';

const out = 'dist-lanes';
const copy = (from, to = from) => {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, path.join(out, to), { recursive: true });
  return true;
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'dist'), { recursive: true });

// the page itself, served as the folder index (iD's login redirect expects that). The code and styles it loads
// carry a stamp of their contents, so browsers fetch them again after a deploy rather than using a cached copy
const stamp = file => createHash('sha256').update(fs.readFileSync(path.join('dist', file))).digest('hex').slice(0, 10);
let page = fs.readFileSync('lanes.html', 'utf8');
for (const [from, to] of [['dist/lanes.js', 'lanes.min.js'], ['dist/iD.css', 'iD.css'], ['dist/lanes.css', 'lanes.css']]) {
  if (!fs.existsSync(path.join('dist', to))) throw new Error(`dist/${to} is missing: run npm run all first`);
  if (!page.includes(`'${from}'`)) throw new Error(`lanes.html no longer loads ${from}`);
  page = page.replace(`'${from}'`, `'dist/${to}?v=${stamp(to)}'`);
}
fs.writeFileSync(path.join(out, 'index.html'), page);
copy('land.html');

// built assets Lane Studio loads at runtime
for (const file of ['iD.css', 'lanes.css', 'lanes.min.js']) {
  if (!copy(path.join('dist', file))) throw new Error(`dist/${file} is missing: run npm run all first`);
}
for (const dir of ['img', 'locales', 'data', 'mapillary-js', 'pannellum']) {
  if (!copy(path.join('dist', dir))) throw new Error(`dist/${dir} is missing: run npm run all first`);
}
// the icon sprites are built by npm run dist; without them every button is blank
for (const sprite of ['iD-sprite.svg', 'fa-sprite.svg', 'maki-sprite.svg', 'temaki-sprite.svg']) {
  if (!fs.existsSync(path.join(out, 'dist', 'img', sprite))) throw new Error(`dist/img/${sprite} is missing: run npm run all first`);
}

// Apache settings for cPanel hosts: JSON and SVG types, compression, and caching
fs.writeFileSync(path.join(out, '.htaccess'), `# Lane Studio
AddType application/json .json
AddType image/svg+xml .svg
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>
<IfModule mod_headers.c>
  <FilesMatch "\\.(html)$">
    Header set Cache-Control "no-cache"
  </FilesMatch>
  <FilesMatch "\\.(js|css|json|svg|png|gif)$">
    Header set Cache-Control "max-age=3600"
  </FilesMatch>
</IfModule>
`);

const size = dir => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((sum, e) => sum + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.log(styleText('green', `Lane Studio site written to ${out}/ (${(size(out) / 1e6).toFixed(1)} MB). Upload its contents to the web root.`));
