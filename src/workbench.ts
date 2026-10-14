import { initialize, getService, IEditorService, LogLevel } from '@codingame/monaco-vscode-api';
import { registerExtension } from '@codingame/monaco-vscode-api/extensions';
import { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';
import { Emitter } from '@codingame/monaco-vscode-api/vscode/vs/base/common/event';
import getWorkbenchOverride from '@codingame/monaco-vscode-workbench-service-override';
import getFilesOverride, { createIndexedDBProviders, IndexedDB, IndexedDBFileSystemProvider, registerCustomProvider } from '@codingame/monaco-vscode-files-service-override';
import getConfigurationOverride from '@codingame/monaco-vscode-configuration-service-override';
import { initUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override/common';
import getExtensionsOverride, { ExtensionHostKind } from '@codingame/monaco-vscode-extensions-service-override';
import getThemeOverride from '@codingame/monaco-vscode-theme-service-override';
import getTextmateOverride from '@codingame/monaco-vscode-textmate-service-override';
import getLanguagesOverride from '@codingame/monaco-vscode-languages-service-override';
import getStorageOverride from '@codingame/monaco-vscode-storage-service-override';
import getNotificationsOverride from '@codingame/monaco-vscode-notifications-service-override';
import getDialogsOverride from '@codingame/monaco-vscode-dialogs-service-override';
import getPreferencesOverride from '@codingame/monaco-vscode-preferences-service-override';
import getSearchOverride from '@codingame/monaco-vscode-search-service-override';
import getOutputOverride from '@codingame/monaco-vscode-output-service-override';
import getTerminalOverride, { SimpleTerminalBackend, SimpleTerminalProcess } from '@codingame/monaco-vscode-terminal-service-override';
import getExplorerOverride from '@codingame/monaco-vscode-explorer-service-override';
import getModelOverride from '@codingame/monaco-vscode-model-service-override';
import getDebugOverride from '@codingame/monaco-vscode-debug-service-override';
import getScmOverride from '@codingame/monaco-vscode-scm-service-override';
import getGalleryOverride from '@codingame/monaco-vscode-extension-gallery-service-override';
import getOutlineOverride from '@codingame/monaco-vscode-outline-service-override';
import getSnippetsOverride from '@codingame/monaco-vscode-snippets-service-override';
import getMarkersOverride from '@codingame/monaco-vscode-markers-service-override';
import getWelcomeOverride from '@codingame/monaco-vscode-welcome-service-override';
import getWorkingCopyOverride from '@codingame/monaco-vscode-working-copy-service-override';
import getLifecycleOverride from '@codingame/monaco-vscode-lifecycle-service-override';
import getLogOverride from '@codingame/monaco-vscode-log-service-override';
import getAccessibilityOverride from '@codingame/monaco-vscode-accessibility-service-override';
import getUserDataProfileOverride from '@codingame/monaco-vscode-user-data-profile-service-override';
import '@codingame/monaco-vscode-cpp-default-extension';
import '@codingame/monaco-vscode-theme-defaults-default-extension';
import '@codingame/monaco-vscode-theme-seti-default-extension';
import '@codingame/monaco-vscode-markdown-basics-default-extension';
import '@codingame/monaco-vscode-json-default-extension';
import 'vscode/localExtensionHost';
import type * as VSCode from 'vscode';
import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker.js?worker&url';
import textmateWorkerUrl from '@codingame/monaco-vscode-textmate-service-override/worker?worker&url';
import searchWorkerUrl from '@codingame/monaco-vscode-search-service-override/worker?worker&url';
import outputWorkerUrl from '@codingame/monaco-vscode-output-service-override/worker?worker&url';
import extensionWorkerUrl from '@codingame/monaco-vscode-api/workers/extensionHost.worker?worker&url';
import JSZip from 'jszip';
import { compile, compilers, type Compiler } from './compiler';
import { examples, loadWorkspace, logout, workspaceKey, type Session, type SourceFile } from './workspace';

type FileRecord = { name: string; bytes: Uint8Array; uri: VSCode.Uri };
let terminalCommand: (command: string) => Promise<string> = async () => 'The workspace is still loading.';
let nextTerminalId = 1;
class BrowserTerminalBackend extends SimpleTerminalBackend {
  constructor(){super();this.setReady();}
  getDefaultSystemShell = async () => 'Browser workspace';
  createProcess = async () => {
    const emitter = new Emitter<string>();
    class BrowserTerminalProcess extends SimpleTerminalProcess {
      private buffer = '';
      private closed = false;
      async start() { emitter.fire('Browser workspace terminal\r\nCommands: run, ls, cat <file>, clear, help\r\n\x1b[32m/workspace $ \x1b[0m'); return undefined; }
      shutdown() { this.closed = true; emitter.dispose(); }
      input(data: string) {
        for (const c of data) {
          if (c === '\r') { const command = this.buffer; this.buffer = ''; emitter.fire('\r\n'); void terminalCommand(command).then(text => { if (!this.closed) emitter.fire(text.replace(/\r?\n/g,'\r\n') + (text ? '\r\n' : '') + '\x1b[32m/workspace $ \x1b[0m'); }); }
          else if (c === '\x7f') { if(this.buffer) {this.buffer=this.buffer.slice(0,-1);emitter.fire('\b \b');} }
          else if (c === '\x03') {this.buffer='';emitter.fire('^C\r\n\x1b[32m/workspace $ \x1b[0m');}
          else if (c >= ' ') {this.buffer+=c;emitter.fire(c);}
        }
      }
      resize() {}
      clearBuffer() { emitter.fire('\x1b[2J\x1b[H'); }
      sendSignal() { this.buffer=''; }
    }
    return new BrowserTerminalProcess(nextTerminalId++, 0, '/workspace', emitter.event);
  };
}

export async function startWorkbench(root: HTMLElement, session: Session) {
  const identity = session.email || session.name.toLowerCase();
  await createIndexedDBProviders();
  const db = await IndexedDB.create(`cstudio-workspace-${identity}`, 2, ['files','userdata']);
  const fileProvider = new IndexedDBFileSystemProvider('file', db, 'files', true);
  registerCustomProvider('file', fileProvider);
  registerCustomProvider('vscode-userdata', new IndexedDBFileSystemProvider('vscode-userdata',db,'userdata',true));
  const enc = new TextEncoder();
  const workspaceUri = URI.file('/workspace');
  const seedKey = `${workspaceKey(session)}.vscode-seeded`;
  if (!localStorage.getItem(seedKey)) {
    const legacy = loadWorkspace(session);
    for (const f of legacy.files) await fileProvider.writeFile(URI.file(`/workspace/${f.name}`), enc.encode(f.content), { create: true, overwrite: false, atomic: false, unlock: false });
    if (!legacy.files.some(f=>f.name==='stdin.txt')) await fileProvider.writeFile(URI.file('/workspace/stdin.txt'), enc.encode(legacy.stdin), { create:true,overwrite:false,atomic:false,unlock:false });
    localStorage.setItem(seedKey,'1');
  }
  const workers: Record<string,string> = {editorWorkerService:editorWorkerUrl,TextEditorWorker:editorWorkerUrl,TextMateWorker:textmateWorkerUrl,LocalFileSearchWorker:searchWorkerUrl,OutputLinkDetectionWorker:outputWorkerUrl,extensionHostWorkerMain:extensionWorkerUrl};
  window.MonacoEnvironment = {
    getWorkerUrl:(_,label)=>{const url=workers[label];if(!url)throw new Error(`Unknown VS Code worker: ${label}`);return new URL(url,location.href).href;},
    getWorkerOptions:()=>({type:'module'}),
    getWorker:(_,label)=>{const url=workers[label];if(!url)throw new Error(`Unknown VS Code worker: ${label}`);return new Worker(url,{type:'module'});}
  };
  await initUserConfiguration(JSON.stringify({
    'workbench.colorTheme':'Default Dark Modern', 'workbench.iconTheme':'vs-seti',
    'window.menuBarVisibility':'classic', 'window.commandCenter':true,
    'window.title':'${activeEditorShort}${separator}${rootName}${separator}Code — OSS',
    'workbench.startupEditor':'none', 'workbench.secondarySideBar.defaultVisibility':'hidden',
    'workbench.editor.enablePreview':false, 'files.autoSave':'afterDelay', 'files.autoSaveDelay':500,
    'editor.fontSize':14, 'editor.fontFamily':'Consolas, monospace', 'telemetry.telemetryLevel':'off',
    'terminal.integrated.defaultProfile.windows':'Browser workspace', 'terminal.integrated.enablePersistentSessions':false
  }));

  const extension = registerExtension({
    name:'c-compiler',publisher:'cstudio',version:'1.0.0',displayName:'Browser C Compiler',description:'Compile C with the public Wandbox API. No server or API key required.',engines:{vscode:'*'},
    contributes:{
      commands:[
        {command:'cCompiler.run',title:'Compile and Run',category:'C Compiler',icon:'$(play)'},
        {command:'cCompiler.cancel',title:'Cancel Request',category:'C Compiler',icon:'$(debug-stop)'},
        {command:'cCompiler.stdin',title:'Edit Standard Input',category:'C Compiler'},
        {command:'cCompiler.choose',title:'Select Compiler',category:'C Compiler'},
        {command:'cCompiler.standard',title:'Select C Standard',category:'C Compiler'},
        {command:'cCompiler.export',title:'Export Workspace as ZIP',category:'C Compiler'},
        {command:'cCompiler.import',title:'Import Files',category:'C Compiler'},
        {command:'cCompiler.example',title:'Open C Example',category:'C Compiler'},
        {command:'cCompiler.profile',title:'Local Session',category:'C Compiler'},
        {command:'cCompiler.signOut',title:'Sign Out',category:'C Compiler'},
        {command:'cCompiler.about',title:'About Browser Workbench',category:'C Compiler'}
      ],
      keybindings:[{command:'cCompiler.run',key:'ctrl+enter',mac:'cmd+enter',when:'editorTextFocus'},{command:'cCompiler.run',key:'ctrl+alt+r',mac:'cmd+alt+r'}],
      menus:{'editor/title':[{command:'cCompiler.run',when:'resourceExtname == .c',group:'navigation@1'}]},
      configuration:{title:'C Compiler',properties:{
        'cCompiler.compiler':{type:'string',default:'gcc-13.2.0-c',description:'Wandbox compiler identifier. Use C Compiler: Select Compiler to discover available versions.'},
        'cCompiler.standard':{type:'string',enum:['c89','c99','c11','c17','c23'],default:'c11',description:'C language standard.'},
        'cCompiler.stdinFile':{type:'string',default:'stdin.txt',description:'Workspace-relative file passed to the program as standard input.'}
      }}
    }
  }, ExtensionHostKind.LocalProcess);

  root.replaceChildren();
  const host = document.createElement('div');host.style.cssText='width:100%;height:100%';root.appendChild(host);
  const workbench = document.createElement('div');workbench.style.cssText='width:100%;height:100%';host.attachShadow({mode:'open'}).appendChild(workbench);
  await initialize({
    ...getFilesOverride(), ...getConfigurationOverride(), ...getExtensionsOverride({ enableWorkerExtensionHost:true }),
    ...getModelOverride(), ...getNotificationsOverride(), ...getDialogsOverride(),
    ...getThemeOverride(), ...getTextmateOverride(), ...getLanguagesOverride(), ...getPreferencesOverride(),
    ...getStorageOverride(), ...getSearchOverride(), ...getOutputOverride(), ...getTerminalOverride(new BrowserTerminalBackend()),
    ...getExplorerOverride(), ...getScmOverride(), ...getDebugOverride(), ...getGalleryOverride({webOnly:true}),
    ...getOutlineOverride(), ...getSnippetsOverride(), ...getMarkersOverride(), ...getWelcomeOverride(),
    ...getWorkingCopyOverride(), ...getLifecycleOverride(), ...getLogOverride(), ...getAccessibilityOverride(), ...getUserDataProfileOverride(),
    ...getWorkbenchOverride()
  },workbench,{
    workspaceProvider:{workspace:{folderUri:workspaceUri},trusted:true,async open(){return false;}},
    productConfiguration:{nameShort:'Code - OSS',nameLong:'Code - OSS for C',applicationName:'cstudio-web',
      extensionsGallery:{serviceUrl:'https://open-vsx.org/vscode/gallery',resourceUrlTemplate:'https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}',extensionUrlTemplate:'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',controlUrl:'',nlsBaseUrl:''}},
    developmentOptions:{logLevel:LogLevel.Warning},
    defaultLayout:{editors:[{uri:URI.file('/workspace/main.c')}],views:[{id:'workbench.explorer.fileView'}]}
  },{userHome:URI.file('/')});
  const api: typeof VSCode = await extension.getApi();
  await extension.setAsDefaultApi();
  const output = api.window.createOutputChannel('C Compiler');
  const diagnostics = api.languages.createDiagnosticCollection('C Compiler');
  let compilerList: Compiler[] = [];
  let runController: AbortController | null = null;
  let compilerTerminal: VSCode.Terminal | undefined;
  let write = new api.EventEmitter<string>();
  api.window.onDidCloseTerminal(t=>{if(t===compilerTerminal){compilerTerminal=undefined;write.dispose();write=new api.EventEmitter<string>();}});
  const terminal = () => {
    if(!compilerTerminal) compilerTerminal=api.window.createTerminal({name:'C Compiler',pty:{onDidWrite:write.event,open(){write.fire('C Compiler · Wandbox public API\r\nSource code and stdin are sent to Wandbox when you run.\r\n\r\n');},close(){}}});
    compilerTerminal.show(true);return compilerTerminal;
  };
  const emit = (text:string) => {write.fire(text.replace(/\r?\n/g,'\r\n'));};
  const runStatus = api.window.createStatusBarItem(api.StatusBarAlignment.Left,100);runStatus.text='$(play) Run C';runStatus.tooltip='Compile and run C (Ctrl+Enter)';runStatus.command='cCompiler.run';runStatus.show();
  const profileStatus = api.window.createStatusBarItem(api.StatusBarAlignment.Right,1);profileStatus.text=`$(account) ${session.name}`;profileStatus.tooltip='Local browser session';profileStatus.command='cCompiler.profile';profileStatus.show();
  const listFiles = async (uri=api.Uri.file('/workspace'),prefix=''):Promise<FileRecord[]> => {
    const records:FileRecord[]=[];
    for(const [name,type] of await api.workspace.fs.readDirectory(uri)) {
      const path=prefix+name;const child=api.Uri.joinPath(uri,name);
      if(type&api.FileType.Directory)records.push(...await listFiles(child,path+'/'));
      else if(type&api.FileType.File)records.push({name:path,uri:child,bytes:await api.workspace.fs.readFile(child)});
    }
    return records;
  };
  const exportFiles = async () => {await api.workspace.saveAll();const zip=new JSZip();for(const f of await listFiles())zip.file(f.name,f.bytes);const url=URL.createObjectURL(await zip.generateAsync({type:'blob'}));const a=document.createElement('a');a.href=url;a.download='c-workspace.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const run = async () => {
    if(runController){void api.window.showInformationMessage('A compilation is already running. Use C Compiler: Cancel Request to cancel.');return;}
    await api.workspace.saveAll();
    const records=await listFiles();const decoder=new TextDecoder();
    const sources:SourceFile[]=records.filter(f=>/\.(c|h)$/.test(f.name)).map(f=>({id:f.uri.toString(),name:f.name,content:decoder.decode(f.bytes)}));
    const active=api.window.activeTextEditor?.document.uri.toString() || '';
    const entry=sources.find(f=>f.id===active&&f.name.endsWith('.c')) || sources.find(f=>f.name==='main.c') || sources.find(f=>f.name.endsWith('.c'));
    if(!entry){void api.window.showErrorMessage('Create or open a .c file before compiling.');return;}
    const config=api.workspace.getConfiguration('cCompiler');const compiler=config.get('compiler','gcc-13.2.0-c');const standard=config.get('standard','c11');const stdinPath=config.get('stdinFile','stdin.txt');
    let stdin='';try{stdin=decoder.decode(await api.workspace.fs.readFile(api.Uri.joinPath(api.Uri.file('/workspace'),stdinPath)));}catch{/* No stdin file means no input. */}
    terminal();emit(`\r\n\x1b[36m$ ${compiler} -std=${standard} ${entry.name}\x1b[0m\r\nCompiling and running…\r\n`);
    output.clear();output.appendLine(`Wandbox compiler: ${compiler}\nStandard: ${standard}\nEntry: ${entry.name}`);diagnostics.clear();
    runController=new AbortController();let timedOut=false;const controller=runController;const start=performance.now();
    runStatus.text='$(loading~spin) Running C';runStatus.command='cCompiler.cancel';
    const timeout=setTimeout(()=>{timedOut=true;controller.abort();},45000);
    try {
      const result=await compile(sources,entry.id,compiler,standard,stdin,controller.signal);
      const compilerMessage=result.compiler_message || [result.compiler_output,result.compiler_error].filter(Boolean).join('\n');
      if(compilerMessage){output.appendLine(compilerMessage);emit(compilerMessage+'\r\n');}
      const byFile=new Map<string,VSCode.Diagnostic[]>();
      for(const line of compilerMessage.split('\n')){
        const m=line.match(/^(.+?):(\d+):(\d+):\s*(warning|error|fatal error|note):\s*(.*)$/);if(!m)continue;
        const name=m[1]==='prog.c'?entry.name:m[1];const uri=api.Uri.joinPath(api.Uri.file('/workspace'),name);
        const d=new api.Diagnostic(new api.Range(Math.max(0,+m[2]-1),Math.max(0,+m[3]-1),Math.max(0,+m[2]-1),+m[3]),m[5],m[4]==='warning'?api.DiagnosticSeverity.Warning:m[4]==='note'?api.DiagnosticSeverity.Information:api.DiagnosticSeverity.Error);d.source='Wandbox';
        const key=uri.toString();byFile.set(key,[...(byFile.get(key)||[]),d]);
      }
      for(const [uri,ds] of byFile)diagnostics.set(api.Uri.parse(uri),ds);
      emit(result.program_output || '');if(result.program_error)emit('\x1b[31m'+result.program_error+'\x1b[0m');
      emit(`\r\n\x1b[${String(result.status)==='0'&&!result.signal?'32':'31'}mProcess exited with code ${result.status}${result.signal?' · '+result.signal:''} (${((performance.now()-start)/1000).toFixed(2)}s)\x1b[0m\r\n`);
      output.appendLine(`Exit status: ${result.status}${result.signal?' · '+result.signal:''}`);
    }catch(error){const message=controller.signal.aborted?timedOut?'Request timed out after 45 seconds.':'Request cancelled. Remote execution may finish independently.':error instanceof TypeError?'Could not reach Wandbox. Check your connection and try again.':(error as Error).message;emit('\x1b[31m'+message+'\x1b[0m\r\n');output.appendLine(message);void api.window.showErrorMessage(message);}
    finally{clearTimeout(timeout);runController=null;runStatus.text='$(play) Run C';runStatus.command='cCompiler.run';}
  };
  const command=(id:string,handler:(...args:unknown[])=>unknown)=>api.commands.registerCommand(id,handler);
  command('cCompiler.run',run);
  command('cCompiler.cancel',()=>runController?.abort());
  command('cCompiler.stdin',async()=>{const name=api.workspace.getConfiguration('cCompiler').get('stdinFile','stdin.txt');const uri=api.Uri.joinPath(api.Uri.file('/workspace'),name);try{await api.workspace.fs.stat(uri);}catch{await api.workspace.fs.writeFile(uri,enc.encode(''));}await api.window.showTextDocument(uri);});
  command('cCompiler.choose',async()=>{try{if(!compilerList.length)compilerList=await compilers(AbortSignal.timeout(15000));const choice=await api.window.showQuickPick(compilerList.map(c=>({label:c.name,description:c.version})),{title:'Select a C compiler',placeHolder:'Wandbox public compiler'});if(choice)await api.workspace.getConfiguration('cCompiler').update('compiler',choice.label,api.ConfigurationTarget.Workspace);}catch{void api.window.showErrorMessage('Could not load the Wandbox compiler list. Try again shortly.');}});
  command('cCompiler.standard',async()=>{const choice=await api.window.showQuickPick(['c89','c99','c11','c17','c23'],{title:'Select C standard'});if(choice)await api.workspace.getConfiguration('cCompiler').update('standard',choice,api.ConfigurationTarget.Workspace);});
  command('cCompiler.export',exportFiles);
  command('cCompiler.import',()=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.c,.h,.txt,.md,.json';input.onchange=()=>{void(async()=>{for(const f of Array.from(input.files || [])){if(f.size>1024*1024){void api.window.showErrorMessage(`${f.name} is larger than 1 MB.`);continue;}const uri=api.Uri.joinPath(api.Uri.file('/workspace'),f.name);let exists=false;try{await api.workspace.fs.stat(uri);exists=true;}catch{}if(exists){const choice=await api.window.showWarningMessage(`${f.name} already exists. Overwrite it?`,{modal:true},'Overwrite');if(choice!=='Overwrite')continue;}await api.workspace.fs.writeFile(uri,new Uint8Array(await f.arrayBuffer()));await api.window.showTextDocument(uri);}})().catch(e=>api.window.showErrorMessage((e as Error).message));};input.click();});
  command('cCompiler.example',async()=>{const choice=await api.window.showQuickPick(examples.map((ex,i)=>({label:ex.name,description:ex.description,index:i})),{title:'Choose a C example'});if(!choice)return;const ex=examples[choice.index];const dir=api.Uri.file('/workspace/examples');await api.workspace.fs.createDirectory(dir);let name=`${['hello','input','fibonacci'][choice.index]}-${Date.now()}.c`;const uri=api.Uri.joinPath(dir,name);await api.workspace.fs.writeFile(uri,enc.encode(ex.code));await api.workspace.fs.writeFile(api.Uri.file('/workspace/stdin.txt'),enc.encode(ex.stdin));await api.window.showTextDocument(uri);});
  command('cCompiler.profile',async()=>{const choice=await api.window.showQuickPick([{label:`$(account) ${session.name}`,description:'Local browser profile'},{label:'Export workspace',description:'Download your files as ZIP'},{label:'Sign out',description:'Files remain saved in this browser'}],{title:'Local session · remembered for 7 days'});if(choice?.label==='Export workspace')await exportFiles();if(choice?.label==='Sign out')await api.commands.executeCommand('cCompiler.signOut');});
  command('cCompiler.signOut',async()=>{await api.workspace.saveAll();logout();location.reload();});
  command('cCompiler.about',()=>api.window.showInformationMessage('This is the open-source VS Code workbench, integrated through monaco-vscode-api. C runs through Wandbox. Files and the session stay in this browser. Desktop processes and native extensions need a server.','Open Source').then(choice=>{if(choice)void api.env.openExternal(api.Uri.parse('https://github.com/microsoft/vscode'));}));
  terminalCommand=async(command)=>{const [op,...args]=command.trim().split(/\s+/);if(!op)return '';if(op==='help')return 'Commands: run, ls, cat <file>, clear, help\nThis browser terminal operates on your workspace. It is not an OS shell.';if(op==='run'){await run();return 'Compiler output is in the C Compiler terminal.';}if(op==='ls')return (await listFiles()).map(f=>f.name).join('\n');if(op==='cat'){try{return new TextDecoder().decode(await api.workspace.fs.readFile(api.Uri.joinPath(api.Uri.file('/workspace'),args.join(' '))));}catch{return 'File not found.';}}if(op==='clear')return '\x1b[2J\x1b[H';return `Unknown command: ${op}. Type help for available commands.`;};
  api.languages.registerDocumentSymbolProvider({language:'c'}, {provideDocumentSymbols(document){const symbols:VSCode.DocumentSymbol[]=[];for(let i=0;i<document.lineCount;i++){const text=document.lineAt(i).text;const m=text.match(/^\s*(?:[\w*]+\s+)+([a-zA-Z_]\w*)\s*\([^;]*\)\s*\{/);if(m){const range=document.lineAt(i).range;symbols.push(new api.DocumentSymbol(m[1],'',api.SymbolKind.Function,range,range));}}return symbols;}});
  const cFunctions=[
    {name:'printf',signature:'int printf(const char *format, ...)',header:'stdio.h',description:'Write formatted output to stdout.',snippet:'printf("${1:message}\\n"${2:});'},
    {name:'scanf',signature:'int scanf(const char *format, ...)',header:'stdio.h',description:'Read formatted input from stdin. Check the return value for the number of successfully assigned items.',snippet:'scanf("${1:%d}", &${2:value});'},
    {name:'puts',signature:'int puts(const char *s)',header:'stdio.h',description:'Write a string followed by a newline to stdout.',snippet:'puts("${1:message}");'},
    {name:'fgets',signature:'char *fgets(char *s, int size, FILE *stream)',header:'stdio.h',description:'Read at most size - 1 characters into a null-terminated buffer.',snippet:'fgets(${1:buffer}, sizeof(${1:buffer}), stdin);'},
    {name:'malloc',signature:'void *malloc(size_t size)',header:'stdlib.h',description:'Allocate a block of memory. Check for NULL and release with free.',snippet:'malloc(sizeof(${1:int}) * ${2:count})'},
    {name:'free',signature:'void free(void *ptr)',header:'stdlib.h',description:'Release memory allocated by malloc, calloc, or realloc.',snippet:'free(${1:ptr});'},
    {name:'strlen',signature:'size_t strlen(const char *s)',header:'string.h',description:'Return the number of characters before the null terminator.',snippet:'strlen(${1:string})'},
    {name:'strcmp',signature:'int strcmp(const char *s1, const char *s2)',header:'string.h',description:'Compare strings lexicographically. Returns zero for equal strings.',snippet:'strcmp(${1:a}, ${2:b})'},
    {name:'memcpy',signature:'void *memcpy(void *dest, const void *src, size_t n)',header:'string.h',description:'Copy n bytes between non-overlapping memory regions.',snippet:'memcpy(${1:dest}, ${2:src}, ${3:size});'}
  ];
  api.languages.registerCompletionItemProvider({language:'c'},{provideCompletionItems(document){
    const items=cFunctions.map(f=>{const item=new api.CompletionItem(f.name,api.CompletionItemKind.Function);item.detail=f.signature;item.documentation=`${f.description}\n\n#include <${f.header}>`;item.insertText=new api.SnippetString(f.snippet);return item;});
    for(const word of ['int','char','float','double','void','return','const','struct','typedef','enum','static','sizeof','unsigned','long','short','NULL'])items.push(new api.CompletionItem(word,api.CompletionItemKind.Keyword));
    for(let line=0;line<document.lineCount;line++){const m=document.lineAt(line).text.match(/\b(?:int|char|float|double|size_t|long)\s+([A-Za-z_]\w*)/);if(m)items.push(new api.CompletionItem(m[1],api.CompletionItemKind.Variable));}
    const loop=new api.CompletionItem('for',api.CompletionItemKind.Snippet);loop.insertText=new api.SnippetString('for (int ${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t$0\n}');items.push(loop);
    return items;
  }});
  api.languages.registerHoverProvider({language:'c'},{provideHover(document,position){const range=document.getWordRangeAtPosition(position);if(!range)return;const word=document.getText(range);const f=cFunctions.find(f=>f.name===word);if(!f)return;const md=new api.MarkdownString();md.appendCodeblock(f.signature,'c');md.appendText(f.description);md.appendMarkdown(`\n\nHeader: \`<${f.header}>\``);return new api.Hover(md,range);}});
  await api.commands.executeCommand('setContext','cCompiler.ready',true);
  const editorService=await getService(IEditorService);
  if(!api.window.activeTextEditor)await editorService.openEditor({resource:URI.file('/workspace/main.c'),options:{pinned:true}});
  document.title='Code — OSS for C';
}
