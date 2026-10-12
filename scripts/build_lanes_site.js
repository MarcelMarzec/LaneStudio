/* eslint-disable no-console */
// Packages Lane Studio as a static site in dist-lanes/, ready to upload to any web host
// (e.g. a cPanel document root). Run `npm run all` first so dist/ holds the built assets.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { styleText } from 'node:util';

const out = 'dist-lanes';
const copy = (from, to = from) => {
  if (!fs.existsSync(from)) return false;
  fs.cpSync(from, path.join(out, to), { recursive: true });
  return true;
};

console.log(styleText('yellow', 'Building minified Lane Studio...'));
execFileSync(process.execPath, ['config/esbuild.config.min.js'], { stdio: 'inherit' });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'dist'), { recursive: true });

// the page itself, served as the folder index (iD's login redirect expects that)
const page = fs.readFileSync('lanes.html', 'utf8').replace('\'dist/lanes.js\'', '\'dist/lanes.min.js\'');
if (!page.includes('dist/lanes.min.js')) throw new Error('lanes.html no longer loads dist/lanes.js');
fs.writeFileSync(path.join(out, 'index.html'), page);
copy('land.html');

// built assets Lane Studio loads at runtime
for (const file of ['iD.css', 'lanes.css', 'lanes.min.js']) {
  if (!copy(path.join('dist', file))) throw new Error(`dist/${file} is missing: run npm run all first`);
}
for (const dir of ['img', 'locales', 'data', 'mapillary-js', 'pannellum']) {
  copy(path.join('dist', dir));
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
