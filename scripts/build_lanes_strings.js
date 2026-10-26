/* eslint-disable no-console */
import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';

/**
 * Writes Lane Studio's strings (`data/lanes.yaml`) to `dist/locales/lanes/`, where the app reads
 * them as `t('_lanes.…')`, and its changelog to `dist/lanes-changelog.md`. Run by the data build and by the JavaScript build (and its watcher), so
 * the strings never fall behind the code that uses them.
 */
export function writeLanesStrings() {
  const strings = loadYaml(fs.readFileSync('data/lanes.yaml', 'utf8'));
  fs.mkdirSync('dist/locales/lanes', { recursive: true });
  fs.writeFileSync('dist/locales/lanes/en.min.json', JSON.stringify(strings));
  fs.writeFileSync('dist/locales/lanes/index.min.json', JSON.stringify({ en: { rtl: false, pct: 1 } }));
  // the changelog, for the what's new menu shown after an update
  fs.copyFileSync('CHANGELOG.md', 'dist/lanes-changelog.md');
}

/** Rewrites the strings whenever `data/lanes.yaml` (or the changelog) changes */
export function watchLanesStrings() {
  const rewrite = () => {
    try {
      writeLanesStrings();
      console.log('Lane Studio strings rebuilt');
    } catch (err) {
      console.error('Lane Studio strings:', err.message);
    }
  };
  fs.watchFile('data/lanes.yaml', { interval: 500 }, rewrite);
  fs.watchFile('CHANGELOG.md', { interval: 500 }, rewrite);
}
