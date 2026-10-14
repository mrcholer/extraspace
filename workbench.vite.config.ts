import {defineConfig} from 'vite';
import path from 'node:path';
export default defineConfig({
  base:'/workbench/',
  publicDir:false,
  build:{target:'esnext',outDir:'public/workbench',emptyOutDir:true,assetsInlineLimit:0,rollupOptions:{input:path.resolve('src/workbench.ts'),preserveEntrySignatures:'strict',treeshake:false,output:{format:'es',entryFileNames:'workbench.js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:'assets/[name]-[hash][extname]'}},minify:'esbuild'},
  worker:{format:'es'},
  plugins:[{name:'vscode-css-text',enforce:'pre',async resolveId(source,importer,options){if(!source.endsWith('.css')||source.includes('?'))return;const r=await this.resolve(source,importer,{...options,skipSelf:true});if(r&&/node_modules[\\/](@codingame[\\/]monaco-vscode|vscode|monaco-editor)/.test(r.id))return {...r,id:r.id+'?inline'};}}],
  resolve:{dedupe:['vscode','monaco-editor','@codingame/monaco-vscode-api'],alias:{'node:fs/promises':path.resolve('src/browser-only-node.ts'),'node:diagnostics_channel':path.resolve('src/browser-only-node.ts')}},
});
