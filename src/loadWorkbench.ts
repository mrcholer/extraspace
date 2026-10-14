import type {Session} from './workspace';
export async function openWorkbench(root:HTMLElement,session:Session){
  const moduleUrl='/workbench/workbench.js';
  const module:typeof import('./workbench')=await import(/* webpackIgnore: true */ moduleUrl);
  return module.startWorkbench(root,session);
}
