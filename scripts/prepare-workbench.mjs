import {existsSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const output='public/workbench/workbench.js';
const inputs=['src/workbench.ts','src/compiler.ts','src/workspace.ts','src/terminal-input.ts','src/browser-only-node.ts','workbench.vite.config.ts','package-lock.json'];
if(!existsSync(output)||inputs.some(p=>statSync(p).mtimeMs>statSync(output).mtimeMs)){const r=spawnSync(process.execPath,['--max-old-space-size=8192','node_modules/vite/bin/vite.js','build','--config','workbench.vite.config.ts'],{stdio:'inherit'});process.exit(r.status??1);}
