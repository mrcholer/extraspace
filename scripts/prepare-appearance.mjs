import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

// Copy only declarative themes and icons; no downloaded extension code executes.
const extensions = [
  { publisher: 'zhuangtongfa', name: 'material-theme', version: '3.20.3', folder: 'one-dark-pro', type: 'themes' },
  { publisher: 'PKief', name: 'material-icon-theme', version: '5.39.0', folder: 'material-icons', type: 'iconThemes' }
];
for (const ext of extensions) {
  const url = `https://open-vsx.org/api/${ext.publisher}/${ext.name}/${ext.version}/file/${ext.publisher}.${ext.name}-${ext.version}.vsix`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Theme download failed: ${response.status}`);
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const original = JSON.parse(await zip.file('extension/package.json').async('string'));
  const base = `public/appearance/${ext.folder}`;
  await mkdir(base, { recursive: true });
  const files = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    const relative = path.replace(/^extension\//, '');
    if (entry.dir || !path.startsWith('extension/') || relative.includes('..')) continue;
    if (!/^(themes\/.*\.json|dist\/material-icons\.json|icons\/.*\.svg|.*license.*|.*licence.*)$/i.test(relative)) continue;
    await mkdir(`${base}/${relative.split('/').slice(0, -1).join('/')}`, { recursive: true });
    await writeFile(`${base}/${relative}`, await entry.async('uint8array'));
    files.push(relative);
  }
  const manifest = {
    name: original.name, publisher: original.publisher, version: original.version,
    displayName: original.displayName, engines: { vscode: '*' },
    contributes: { [ext.type]: original.contributes[ext.type] }
  };
  await writeFile(`${base}/manifest.json`, JSON.stringify({ manifest, files }, null, 2) + '\n');
  console.log(`${original.displayName} ${original.version}: ${files.length} declarative assets`);
}
