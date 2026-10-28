// Builds the published site for GitHub Pages: node tools/build-site.cjs <outDir> <version>
//
// Why: GitHub Pages tells browsers to keep files for 10 minutes, so right after a merge a refresh
// could load the new page with the old game modules. Each published version therefore lives in its
// own folder, v/<version>/, whose files never change. The root index.html loads that folder, and
// first checks version.json (never cached): if a newer version exists, it reloads once to get it.
//
// The repo's index.html stays the plain development page; only the published copy is rewritten.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const [outArg, versionArg] = process.argv.slice(2);
if (!outArg || !versionArg || !/^[A-Za-z0-9._-]+$/.test(versionArg)) {
  console.error('usage: node tools/build-site.cjs <outDir> <version>   (version: letters, digits, . _ -)');
  process.exit(1);
}
const OUT = path.resolve(outArg);
const V = versionArg;

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, ent.name), b = path.join(to, ent.name);
    if (ent.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(path.join(ROOT, 'src'), path.join(OUT, 'v', V, 'src'));

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPT = '<script type="module" src="src/main.js"></script>';
const STYLE = 'href="src/ui/style.css"';
for (const s of [SCRIPT, STYLE]) {
  if (html.split(s).length !== 2) { console.error(`index.html must contain exactly one ${s} (the publisher rewrites it)`); process.exit(1); }
}
html = html.replace(STYLE, `href="v/${V}/src/ui/style.css"`);
html = html.replace(SCRIPT, `<script type="module">
// Published version ${V}. If a newer version was published after this page was cached, reload once to get it.
const BUILD = ${JSON.stringify(V)}, KEY = 'smelter-yard:reloaded-for';
let latest = null, tried = null;
try { latest = (await (await fetch('version.json?t=' + Date.now(), { cache: 'no-store' })).json()).version; } catch { /* offline: play this version */ }
try { tried = sessionStorage.getItem(KEY); } catch { /* storage blocked */ }
if (latest && latest !== BUILD && tried !== latest) {
  try { sessionStorage.setItem(KEY, latest); } catch { /* storage blocked */ }
  location.reload();
} else {
  await import(${JSON.stringify(`./v/${V}/src/main.js`)});
}
</script>`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ version: V }) + '\n');
// a stale link to an old version folder lands on the newest version instead of a 404
fs.writeFileSync(path.join(OUT, '404.html'), `<!doctype html><meta charset="utf-8"><title>Smelter Yard</title>
<script>var p = location.pathname, i = p.indexOf('/v/'); location.replace(i >= 0 ? p.slice(0, i + 1) : '/');</script>
`);
console.log(`built ${path.relative(ROOT, OUT) || OUT} for version ${V}`);
