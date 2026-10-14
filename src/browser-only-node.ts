// The optional xterm ligature add-on includes Node-only font-loading branches.
// This static app uses browser font rendering. Native font file access is unavailable.
export async function readFile():Promise<never>{throw new Error('Native font file access is not available in this browser.');}
export const channel=()=>({hasSubscribers:false,publish(){},subscribe(){},unsubscribe(){}});
export const tracingChannel=()=>({start:channel(),end:channel(),asyncStart:channel(),asyncEnd:channel(),error:channel(),traceSync<T>(fn:()=>T){return fn();},tracePromise<T>(fn:()=>Promise<T>){return fn();}});
