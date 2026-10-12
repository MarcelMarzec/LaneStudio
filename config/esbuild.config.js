import esbuild from 'esbuild';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import envs from './envs.js';
import browserslistToEsbuild from 'browserslist-to-esbuild';
import { writeLanesStrings, watchLanesStrings } from '../scripts/build_lanes_strings.js';

let args = parseArgs({options: {
  watch: { type: 'boolean' },
  stats: { type: 'boolean' }
}}).values;

const context = await esbuild.context({
  define: envs,
  bundle: true,
  sourcemap: true,
  entryPoints: {
    iD: './modules/id.js',
    lanes: './modules/lanes/index.ts'
  },
  legalComments: 'none',
  logLevel: 'info',
  metafile: true,
  outdir: 'dist',
  target: browserslistToEsbuild(),
  loader: { '.DS_Store' : 'empty', '.swp' : 'empty' },
  treeShaking: false,
});

// Lane Studio's strings are built with the code that reads them
writeLanesStrings();

if (args.watch) {
  watchLanesStrings();
  await context.watch();
} else {
  const build = await context.rebuild();
  if (args.stats) {
    fs.writeFileSync('./dist/esbuild.json', JSON.stringify(build.metafile, null, 2));
  }
  await context.dispose();
}
