import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DOCS = join(ROOT, 'docs');

const styles = [
  'broadcast.css', 'dynasty.css', 'espn.css', 'cinematic.css', 'prime.css', 'game27.css',
];
const scripts = [
  'teams.js', 'logos.js', 'recorder.js', 'cloud.js', 'app.js', 'dynasty.js',
  'pickem.js', 'export.js', 'ui-dynasty.js', 'show.js', 'experience.js',
];

const readJoined = async (folder, files) => (await Promise.all(
  files.map(async name => `/* ${name} */\n${await readFile(join(DOCS, folder, name), 'utf8')}`),
)).join('\n');

const [cssSource, jsSource] = await Promise.all([
  readJoined('css', styles),
  readJoined('js', scripts),
]);

const [cssResult, jsResult] = await Promise.all([
  transform(cssSource, {
    loader: 'css', minify: true, charset: 'utf8', legalComments: 'none',
  }),
  transform(jsSource, {
    loader: 'js', format: 'iife', target: 'es2020', minify: true,
    charset: 'utf8', legalComments: 'none',
  }),
]);

const cssOut = 'app.bundle.css';
const jsOut = 'app.bundle.js';
await Promise.all([
  writeFile(join(DOCS, 'css', cssOut), cssResult.code),
  writeFile(join(DOCS, 'js', jsOut), jsResult.code),
]);

const escapeRx = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tagBlock = (tag, folder, files) => new RegExp(
  files.map(name => tag(folder, escapeRx(name))).join('\\s*'),
  'm',
);
const cssBlock = tagBlock(
  (folder, name) => `<link rel="stylesheet" href="${folder}\\/${name}(?:\\?v=[^"]+)?">`,
  'css', styles,
);
const jsBlock = tagBlock(
  (folder, name) => `<script src="${folder}\\/${name}(?:\\?v=[^"]+)?"><\\/script>`,
  'js', scripts,
);

const digest = value => createHash('sha1').update(value).digest('hex').slice(0, 8);
let html = await readFile(join(DOCS, 'index.html'), 'utf8');
if (!cssBlock.test(html) || !jsBlock.test(html)) {
  throw new Error('Published index no longer contains the expected CSS/JS sequence');
}
html = html
  .replace(cssBlock, `<link rel="stylesheet" href="css/${cssOut}?v=${digest(cssResult.code)}">`)
  .replace(jsBlock, `<script src="js/${jsOut}?v=${digest(jsResult.code)}"></script>`);
await writeFile(join(DOCS, 'index.html'), html);

/* The source files stay readable in the repository; only the generated site
   drops them. This also prevents an old, unreferenced file from being served
   forever after a rename. */
await Promise.all([
  ...styles.map(name => unlink(join(DOCS, 'css', name))),
  ...scripts.map(name => unlink(join(DOCS, 'js', name))),
]);

console.log(`Bundled ${styles.length} stylesheets -> css/${cssOut}`);
console.log(`Bundled ${scripts.length} scripts -> js/${jsOut}`);
