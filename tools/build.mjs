// Builds the published site from src/ into index.html + assets/.
//
//   src/shell.html      page markup (with <!--CORE_CSS--> and <!--CORE_JS--> markers)
//   src/core.js/.css    everything needed for the first screen
//   src/m/<name>.js/.css parts that load the first time they're used (Ask, Compare, ...)
//
// Each module automatically imports whatever it uses from core. Output files are named by
// content hash so browsers can keep them forever; only changed pieces re-download.
//
// Run:  NODE_PATH=<dir with acorn, acorn-walk, esbuild> node tools/build.mjs
//       (one-time: npm i --prefix /tmp/fc-tools acorn acorn-walk esbuild)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const require = createRequire(path.join(process.env.NODE_PATH || '.', 'x.js'));
const acorn = require('acorn');
const walk = require('acorn-walk');
const esbuild = require('esbuild');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'assets');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
const parse = code => acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

function topNames(ast) {
  const s = new Set();
  const pat = p => { if (!p) return; if (p.type === 'Identifier') s.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => pat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(pat); else if (p.type === 'AssignmentPattern') pat(p.left); else if (p.type === 'RestElement') pat(p.argument); };
  for (const n of ast.body) {
    if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') s.add(n.id.name);
    if (n.type === 'VariableDeclaration') n.declarations.forEach(d => pat(d.id));
  }
  return s;
}
function usedNames(ast) {
  const used = new Set(), writes = new Set();
  walk.fullAncestor(ast, (node, st, anc) => {
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') writes.add(node.left.name);
    if (node.type === 'UpdateExpression' && node.argument.type === 'Identifier') writes.add(node.argument.name);
    if (node.type !== 'Identifier') return;
    const p = anc[anc.length - 2];
    if (p && p.type === 'MemberExpression' && p.property === node && !p.computed) return;
    if (p && (p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === node && !p.computed && !p.shorthand) return;
    used.add(node.name);
  });
  return { used, writes };
}
const minJS = async code => (await esbuild.transform(code, { loader: 'js', format: 'esm', minify: true, target: 'es2020', legalComments: 'none' })).code;
const minCSS = async code => (await esbuild.transform(code, { loader: 'css', minify: true, target: ['chrome100', 'safari15', 'firefox100'] })).code;

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const write = (name, ext, code) => { const f = `${name}.${hash(code)}.${ext}`; fs.writeFileSync(path.join(OUT, f), code); return `/assets/${f}`; };

const coreSrc = read('core.js');
{ // the "What's new" dot compares against this id, so the two must match
  const latest = /NEWS_LATEST = '([^']+)'/.exec(coreSrc)?.[1], first = /\{ id: '([^']+)'/.exec(read('m/news.js'))?.[1];
  if (latest !== first) throw new Error(`NEWS_LATEST (${latest}) in core.js must match the first entry in m/news.js (${first})`);
}
const coreTop = topNames(parse(coreSrc));
const coreUse = usedNames(parse(coreSrc)).used;

const manifest = {};
const report = [];
for (const f of fs.readdirSync(path.join(SRC, 'm')).filter(f => f.endsWith('.js')).sort()) {
  const name = f.slice(0, -3);
  const code = read(`m/${f}`);
  const ast = parse(code);
  const top = topNames(ast);
  const { used, writes } = usedNames(ast);
  const imports = [...used].filter(n => coreTop.has(n) && !top.has(n)).sort();
  const bad = imports.filter(n => writes.has(n));
  if (bad.length) throw new Error(`${name} assigns to core variables (${bad.join(', ')}); give core a setter instead`);
  const leak = [...top].filter(n => coreUse.has(n) && !coreTop.has(n));
  if (leak.length) throw new Error(`core uses ${leak.join(', ')} from ${name} without a stub`);
  const full = `import { ${imports.join(', ')} } from 'core';\n${code}\nexport { ${[...top].sort().join(', ')} };\n`;
  manifest[name] = { js: write(`m-${name}`, 'js', await minJS(full)) };
  if (fs.existsSync(path.join(SRC, `m/${name}.css`))) manifest[name].css = write(`m-${name}`, 'css', await minCSS(read(`m/${name}.css`)));
  report.push(`${name}: ${fs.statSync(path.join(ROOT, manifest[name].js)).size} B js${manifest[name].css ? `, ${fs.statSync(path.join(ROOT, manifest[name].css)).size} B css` : ''} (${imports.length} imports)`);
}

if (!coreSrc.includes('/*__MODS__*/{}')) throw new Error('core.js is missing the /*__MODS__*/{} marker');
const coreFull = coreSrc.replace('/*__MODS__*/{}', JSON.stringify(manifest)) + `\nexport { ${[...coreTop].sort().join(', ')} };\n`;
const coreJS = write('core', 'js', await minJS(coreFull));
const coreCSS = write('core', 'css', await minCSS(read('core.css')));

let shell = read('shell.html');
for (const m of ['<!--CORE_CSS-->', '<!--CORE_JS-->']) if (shell.split(m).length !== 2) throw new Error(`shell.html needs exactly one ${m}`);
shell = shell
  .replace('<!--CORE_CSS-->', `<script type="importmap">{"imports":{"core":"${coreJS}"}}</script>\n<link rel="modulepreload" href="${coreJS}">\n<link rel="stylesheet" href="${coreCSS}">`)
  .replace('<!--CORE_JS-->', `<script type="module" src="${coreJS}"></script>`);
fs.writeFileSync(path.join(ROOT, 'index.html'), shell);

const size = p => fs.statSync(path.join(ROOT, p)).size;
console.log(`core: ${size(coreJS)} B js, ${size(coreCSS)} B css; index.html ${fs.statSync(path.join(ROOT, 'index.html')).size} B`);
report.forEach(r => console.log('  ' + r));
