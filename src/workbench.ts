import { initialize, LogLevel } from '@codingame/monaco-vscode-api';
import { registerExtension, type IExtensionManifest } from '@codingame/monaco-vscode-api/extensions';
import { URI } from '@codingame/monaco-vscode-api/vscode/vs/base/common/uri';
import { Emitter } from '@codingame/monaco-vscode-api/vscode/vs/base/common/event';
import { parse } from '@codingame/monaco-vscode-api/vscode/vs/base/common/json';
import { ProcessPropertyType, type IProcessPropertyMap } from '@codingame/monaco-vscode-api/vscode/vs/platform/terminal/common/terminal';
import getWorkbenchOverride from '@codingame/monaco-vscode-workbench-service-override';
import getFilesOverride, { createIndexedDBProviders, IndexedDB, IndexedDBFileSystemProvider, registerCustomProvider } from '@codingame/monaco-vscode-files-service-override';
import getConfigurationOverride from '@codingame/monaco-vscode-configuration-service-override';
import { initUserConfiguration, defaultUserConfigurationFile } from '@codingame/monaco-vscode-configuration-service-override/common';
import getExtensionsOverride, { ExtensionHostKind } from '@codingame/monaco-vscode-extensions-service-override';
import getThemeOverride from '@codingame/monaco-vscode-theme-service-override';
import getTextmateOverride from '@codingame/monaco-vscode-textmate-service-override';
import getLanguagesOverride from '@codingame/monaco-vscode-languages-service-override';
import getStorageOverride, { StorageScope } from '@codingame/monaco-vscode-storage-service-override';
import { IndexedDBStorageDatabase } from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/storage/browser/storageService';
import { ILogService } from '@codingame/monaco-vscode-api/vscode/vs/platform/log/common/log.service';
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
import { compile, compilers, type Compiler } from './compiler';
import { examples, loadWorkspace, logout, workspaceKey, profileKey, type Session, type SourceFile } from './workspace';
import {projectSeed,clearProjectSeed,updateProject} from './projects';
import {registerDownloadsEditor} from './downloads-editor';
import { TerminalInput, terminalPrompt } from './terminal-input';
import { CShell } from './c-shell';
import { ProfileState } from './profile-state';
import { persistWorkbenchLayout } from './layout-persistence';
import { gcc, type GccBuild, type RunResult } from './compiler';
import {getAvatar,pickAvatar,removeAvatar} from './avatar';
import { applyMobileWorkbenchCss } from './workbench-mobile';
import {getExtensionNetworkingOverride} from './extension-network';
import {MenuRegistry,MenuId} from '@codingame/monaco-vscode-api/vscode/vs/platform/actions/common/actions';

type FileRecord = { name: string; bytes: Uint8Array; uri: VSCode.Uri };
let terminalCommand: (command: string) => Promise<string> = async () => 'The workspace is still loading.';
let interruptTerminalCommand = () => {};
let nextTerminalId = 1;
class BrowserTerminalBackend extends SimpleTerminalBackend {
  constructor(){super();this.setReady();}
  getProfiles = async () => [{profileName:'Browser workspace',path:'browser-workspace',isDefault:true}];
  getDefaultSystemShell = async () => 'Browser workspace';
  createProcess = async () => {
    const emitter = new Emitter<string>();
    class BrowserTerminalProcess extends SimpleTerminalProcess {
      private closed = false;
      private lineInput = new TerminalInput(text=>{if(!this.closed)emitter.fire(text);},command=>terminalCommand(command),()=>interruptTerminalCommand());
      async start() { emitter.fire('Extraspace C terminal · GCC / Wandbox API\r\nTry: gcc main.c -o main && ./main\r\nType help for flags, arguments and input redirection.\r\n'+terminalPrompt); return undefined; }
      shutdown() { this.closed = true; emitter.dispose(); }
      input(data: string) {
        if(!this.closed)this.lineInput.input(data);
      }
      resize() {}
      clearBuffer() { emitter.fire('\x1b[2J\x1b[H'); }
      sendSignal() { this.lineInput.input('\x03'); }
    }
    // VS Code queues keyboard input while pid is falsy. This is a logical browser
    // process identifier, not an operating-system process or shell.
    const id = nextTerminalId++;
    const properties: IProcessPropertyMap = {
      cwd:'/workspace',initialCwd:'/workspace',title:'Browser workspace',shellType:undefined,
      fixedDimensions:{},hasChildProcesses:false,resolvedShellLaunchConfig:{executable:'browser-workspace',cwd:'/workspace'},
      overrideDimensions:undefined,failedShellIntegrationActivation:false,usedShellIntegrationInjection:false,
      shellIntegrationInjectionFailureReason:undefined
    };
    // The base implementation returns undefined; VS Code refreshes cwd after input.
    return Object.assign(new BrowserTerminalProcess(id, id, '/workspace', emitter.event), {
      refreshProperty: async <T extends ProcessPropertyType>(property:T):Promise<IProcessPropertyMap[T]> => properties[property]
    });
  };
}

export async function startWorkbench(root: HTMLElement, session: Session) {
  // Load the real declarative theme packages, without their executable extension code.
  await Promise.all(['one-dark-pro','material-icons'].map(async folder => {
    const base = new URL(`/appearance/${folder}/`, location.href);
    const response = await fetch(new URL('manifest.json', base));
    if (!response.ok) throw new Error(`Could not load ${folder} appearance assets.`);
    const {manifest, files} = await response.json() as {manifest:IExtensionManifest;files:string[]};
    const appearance = registerExtension(manifest, ExtensionHostKind.LocalProcess);
    for (const file of files) appearance.registerFileUrl(file, new URL(file, base).href);
  }));
  const identity = session.email || session.name.toLowerCase();
  // Extension caches and profile preferences belong to the account once;
  // only workspace state (tabs, panels and layout) varies by project.
  const profileState = new ProfileState(localStorage, profileKey(session));
  await createIndexedDBProviders();
  const userDb = await IndexedDB.create(`cstudio-workspace-${identity}`, 2, ['files','userdata']);
  const db = !session.projectId || session.projectId==='legacy' ? userDb : await IndexedDB.create(`cstudio-workspace-${identity}-project-${session.projectId}`, 2, ['files','userdata']);
  const fileProvider = new IndexedDBFileSystemProvider('file', db, 'files', true);
  registerCustomProvider('file', fileProvider);
  const userDataProvider = new IndexedDBFileSystemProvider('vscode-userdata',userDb,'userdata',true);
  registerCustomProvider('vscode-userdata', userDataProvider);
  const appearanceKey = `${profileKey(session)}.modern-layout-v1`;
  const brandingKey = `${profileKey(session)}.extraspace-brand-v1`;
  const inputCompatibilityKey = `${profileKey(session)}.browser-input-v1`;
  const enc = new TextEncoder();
  const workspaceUri = URI.file('/workspace');
  const seedKey = `${workspaceKey(session)}.vscode-seeded`;
  let initialFile='main.c';
  if (!localStorage.getItem(seedKey)) {
    const legacy = loadWorkspace(session);
    const seed = session.projectId && session.projectId!=='legacy' ? await projectSeed(session,session.projectId) : undefined;
    const files = seed || legacy.files.map(f=>({name:f.name,bytes:enc.encode(f.content)}));
    initialFile=files.find(f=>f.name==='main.c')?.name || files.find(f=>f.name.endsWith('.c'))?.name || files[0]?.name || 'stdin.txt';
    for(const f of files){
      const pieces=f.name.split('/');pieces.pop();let parent='/workspace';
      for(const part of pieces){parent+='/'+part;await fileProvider.mkdir(URI.file(parent));}
      const uri=URI.file(`/workspace/${f.name}`);let exists=false;try{await fileProvider.stat(uri);exists=true;}catch{}
      if(!exists)await fileProvider.writeFile(uri,f.bytes,{create:true,overwrite:false,atomic:false,unlock:false});
    }
    if (!files.some(f=>f.name==='stdin.txt')) await fileProvider.writeFile(URI.file('/workspace/stdin.txt'), enc.encode(legacy.stdin), { create:true,overwrite:false,atomic:false,unlock:false });
    localStorage.setItem(seedKey,'1');
    if(seed && session.projectId)await clearProjectSeed(session,session.projectId);
  }
  if(session.projectId)updateProject(session,session.projectId,{updatedAt:Date.now()});
  const downloads = registerDownloadsEditor();
  const workers: Record<string,string> = {editorWorkerService:editorWorkerUrl,TextEditorWorker:editorWorkerUrl,TextMateWorker:textmateWorkerUrl,LocalFileSearchWorker:searchWorkerUrl,OutputLinkDetectionWorker:outputWorkerUrl,extensionHostWorkerMain:extensionWorkerUrl};
  window.MonacoEnvironment = {
    getWorkerUrl:(_,label)=>{const url=workers[label];if(!url)throw new Error(`Unknown VS Code worker: ${label}`);return new URL(url,location.href).href;},
    getWorkerOptions:()=>({type:'module'}),
    getWorker:(_,label)=>{const url=workers[label];if(!url)throw new Error(`Unknown VS Code worker: ${label}`);return new Worker(url,{type:'module'});}
  };
  const initialConfiguration = {
    'workbench.colorTheme':'One Dark Pro', 'workbench.iconTheme':'material-icon-theme',
    'workbench.experimental.modernUI':true, 'window.density.layout':'default',
    'workbench.experimental.modernUIUppercaseViewHeaders':false,
    'workbench.activityBar.location':'default', 'workbench.layoutControl.enabled':true,
    'workbench.colorCustomizations':{
      'modernUI.shellBackground':'#21252b', 'titleBar.activeBackground':'#21252b',
      'titleBar.inactiveBackground':'#21252b','activityBar.background':'#21252b',
      'sideBar.background':'#21252b','editor.background':'#282c34',
      'panel.background':'#282c34','terminal.background':'#282c34',
      'statusBar.background':'#21252b','statusBar.noFolderBackground':'#21252b',
      'statusBar.foreground':'#abb2bf','activityBar.foreground':'#abb2bf',
      'tab.activeBackground':'#282c34','tab.inactiveBackground':'#21252b',
      'editorGroupHeader.tabsBackground':'#21252b','commandCenter.background':'#21252b'
    },
    'window.menuBarVisibility':'classic', 'window.commandCenter':true,
    'window.title':'${activeEditorShort}${separator}${rootName}${separator}Extraspace',
    'workbench.startupEditor':'none', 'workbench.secondarySideBar.defaultVisibility':'hidden',
    'workbench.editor.enablePreview':false, 'files.autoSave':'afterDelay', 'files.autoSaveDelay':500,
    'editor.fontSize':16, 'editor.fontFamily':'Consolas, monospace',
    'editor.editContext':false,
    'editor.minimap.enabled':true, 'editor.stickyScroll.enabled':true,
    'editor.guides.bracketPairs':true,'breadcrumbs.enabled':true,
    'terminal.integrated.fontSize':16, 'telemetry.telemetryLevel':'off',
    'terminal.integrated.defaultProfile.windows':'Browser workspace', 'terminal.integrated.enablePersistentSessions':false
  };
  let existingConfiguration: Record<string,unknown> = {};
  try {
    existingConfiguration = parse(new TextDecoder().decode(await userDataProvider.readFile(defaultUserConfigurationFile))) || {};
  } catch { /* A new browser profile has no settings file yet. */ }
  const needsAppearance = !localStorage.getItem(appearanceKey);
  const needsBranding = !localStorage.getItem(brandingKey);
  const needsInputCompatibility = !localStorage.getItem(inputCompatibilityKey);
  const userConfiguration:Record<string,unknown> = needsAppearance ? {...existingConfiguration,...initialConfiguration} : {...initialConfiguration,...existingConfiguration};
  if(needsBranding) {
    const title = userConfiguration['window.title'];
    userConfiguration['window.title'] = typeof title === 'string' ? title.replace(/Code [—-] OSS(?: for C)?/g,'Extraspace') : initialConfiguration['window.title'];
  }
  if(needsInputCompatibility)userConfiguration['editor.editContext']=false;
  await initUserConfiguration(JSON.stringify(userConfiguration), {overwrite:needsAppearance || needsBranding || needsInputCompatibility});

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
        {command:'extraspace.downloads',title:'Downloads & Sharing',category:'Extraspace',icon:'$(cloud-download)'},
        {command:'extraspace.projects',title:'My Projects',category:'Extraspace',icon:'$(folder-opened)'},
        {command:'cCompiler.import',title:'Import Files',category:'C Compiler'},
        {command:'cCompiler.example',title:'Open C Example',category:'C Compiler'},
        {command:'cCompiler.profile',title:'Local Session',category:'C Compiler'},
        {command:'extraspace.avatar',title:'Change Avatar',category:'Extraspace'},
        {command:'extraspace.removeAvatar',title:'Remove Avatar',category:'Extraspace'},
        {command:'extraspace.access',title:'Workspace Access',category:'Extraspace'},
        {command:'cCompiler.signOut',title:'Sign Out',category:'C Compiler'},
        {command:'cCompiler.about',title:'About Browser Workbench',category:'C Compiler'}
      ],
      keybindings:[{command:'cCompiler.run',key:'ctrl+enter',mac:'cmd+enter',when:'editorTextFocus'},{command:'cCompiler.run',key:'ctrl+alt+r',mac:'cmd+alt+r'}],
      menus:{'editor/title':[{command:'cCompiler.run',when:'resourceExtname == .c',group:'navigation@1'},{command:'extraspace.downloads',group:'navigation@2'},{command:'extraspace.projects',group:'navigation@3'}]},
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
    ...getStorageOverride({ databaseFactories: {
      [StorageScope.APPLICATION]: (accessor, disposables) => {
        const log = accessor.get(ILogService);
        return profileState.database('application', async () => {
          const legacy = disposables.add(await IndexedDBStorageDatabase.createApplicationStorage(log));
          return legacy.getItems();
        });
      },
      [StorageScope.PROFILE]: (accessor, profile, disposables) => {
        const log = accessor.get(ILogService);
        return profileState.database(`profile-${profile.id}`, async () => {
          const legacy = disposables.add(await IndexedDBStorageDatabase.createProfileStorage(profile, log));
          return legacy.getItems();
        });
      },
      [StorageScope.WORKSPACE]: (accessor, workspace, disposables) => {
        const log = accessor.get(ILogService);
        const projectScope = session.projectId && session.projectId !== 'legacy' ? `project-${session.projectId}-` : '';
        return profileState.database(`${projectScope}workspace-${workspace.id}`, projectScope ? undefined : async () => {
          const legacy = disposables.add(await IndexedDBStorageDatabase.createWorkspaceStorage(workspace.id, log));
          return legacy.getItems();
        });
      }
    } }), ...getSearchOverride(), ...getOutputOverride(), ...getTerminalOverride(new BrowserTerminalBackend()),
    ...getExplorerOverride(), ...getScmOverride(), ...getDebugOverride(), ...getGalleryOverride({webOnly:true}),
    ...getOutlineOverride(), ...getSnippetsOverride(), ...getMarkersOverride(), ...getWelcomeOverride(),
    ...getWorkingCopyOverride(), ...getLifecycleOverride(), ...getLogOverride(), ...getAccessibilityOverride(), ...getUserDataProfileOverride(),
    ...getWorkbenchOverride(), ...getExtensionNetworkingOverride()
  },workbench,{
    workspaceProvider:{workspace:{folderUri:workspaceUri},trusted:true,async open(){return false;}},
    productConfiguration:{nameShort:'Extraspace',nameLong:'Extraspace',applicationName:'extraspace',
      extensionsGallery:{serviceUrl:'https://open-vsx.org/vscode/gallery',resourceUrlTemplate:'https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}',extensionUrlTemplate:'https://open-vsx.org/vscode/gallery/{publisher}/{name}/latest',controlUrl:'',nlsBaseUrl:''}},
    developmentOptions:{logLevel:LogLevel.Warning},
    defaultLayout:{editors:[{uri:URI.file('/workspace/'+initialFile)}],views:[{id:'workbench.explorer.fileView'}]}
  },{userHome:URI.file('/')});
  const api: typeof VSCode = await extension.getApi();
  await extension.setAsDefaultApi();
  await persistWorkbenchLayout(workbench, profileState, () => { void api.window.showWarningMessage('Browser storage is full or unavailable. Layout changes could not be saved. Free browser storage and reload.'); });
  localStorage.setItem(brandingKey,'1');
  localStorage.setItem(inputCompatibilityKey,'1');
  const avatarStyle=document.createElement('style');workbench.getRootNode().appendChild(avatarStyle);
  const applyAvatar=()=>{const avatar=getAvatar(session);avatarStyle.textContent=avatar ? `.monaco-workbench .activitybar .codicon-accounts-view-bar-icon::before{content:''!important;display:block;flex:none;width:1em;height:1em;border-radius:50%;background-image:url(${JSON.stringify(avatar)});background-size:cover;background-position:center;background-repeat:no-repeat}` : '';};
  applyAvatar();
  const brandStyle=document.createElement('style');brandStyle.textContent=`.monaco-workbench .part.titlebar .window-appicon{background-image:url('/extraspace.svg')!important;background-repeat:no-repeat!important;background-position:center!important;background-size:22px 22px!important;-webkit-mask-image:none!important;mask-image:none!important}.monaco-workbench .part.titlebar .window-appicon::before{content:''!important}`;workbench.getRootNode().appendChild(brandStyle);
  // The workbench is a desktop IDE and ships no phone layout. This sheet is
  // injected into the shadow root after initialize(), so it lands after the
  // workbench's own stylesheet; everything in it is breakpoint-scoped, which is
  // what keeps the desktop layout exactly as VS Code ships it.
  applyMobileWorkbenchCss(workbench.getRootNode() as ShadowRoot);
  if (!localStorage.getItem(appearanceKey)) {
    // Open a real workspace terminal on the first visit to the reference layout.
    try { await api.commands.executeCommand('workbench.action.terminal.new'); }
    catch (error) { console.warn('Workspace terminal could not be opened automatically.',error); }
    localStorage.setItem(appearanceKey,'1');
  }
  const output = api.window.createOutputChannel('C Compiler');
  const diagnostics = api.languages.createDiagnosticCollection('C Compiler');
  let compilerList: Compiler[] = [];
  let runController: AbortController | null = null;
  interruptTerminalCommand = () => runController?.abort();
  let compilerTerminal: VSCode.Terminal | undefined;
  let write = new api.EventEmitter<string>();
  api.window.onDidCloseTerminal(t=>{if(t===compilerTerminal){compilerTerminal=undefined;write.dispose();write=new api.EventEmitter<string>();}});
  const terminal = () => {
    if(!compilerTerminal) {
      const input = new TerminalInput(text=>write.fire(text),command=>terminalCommand(command),()=>interruptTerminalCommand());
      compilerTerminal=api.window.createTerminal({name:'C Compiler',pty:{onDidWrite:write.event,open(){write.fire('Extraspace C terminal · GCC / Wandbox API\r\nTry: gcc main.c -o main && ./main\r\nType help for flags, arguments and input redirection.\r\n\r\n'+terminalPrompt);},handleInput(data:string){input.input(data);},close(){}}});
    }
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
  const exportFiles = async () => {await downloads.open();};
  const openProjects=async()=>{await api.workspace.saveAll();location.assign('/');};
  downloads.connect({name:session.projectName||'My workspace',files:async()=>{await api.workspace.saveAll();return (await listFiles()).map(f=>({name:f.name,bytes:f.bytes}));},projects:openProjects});
  const projectStatus=api.window.createStatusBarItem(api.StatusBarAlignment.Left,110);projectStatus.text=`$(folder-opened) ${session.projectName||'My workspace'}`;projectStatus.tooltip='Open My Projects';projectStatus.command='extraspace.projects';projectStatus.show();
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
  command('cCompiler.export',()=>downloads.open());
  command('extraspace.downloads',()=>downloads.open());
  command('extraspace.projects',openProjects);
  command('cCompiler.import',()=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.c,.h,.txt,.md,.json';input.onchange=()=>{void(async()=>{for(const f of Array.from(input.files || [])){if(f.size>1024*1024){void api.window.showErrorMessage(`${f.name} is larger than 1 MB.`);continue;}const uri=api.Uri.joinPath(api.Uri.file('/workspace'),f.name);let exists=false;try{await api.workspace.fs.stat(uri);exists=true;}catch{}if(exists){const choice=await api.window.showWarningMessage(`${f.name} already exists. Overwrite it?`,{modal:true},'Overwrite');if(choice!=='Overwrite')continue;}await api.workspace.fs.writeFile(uri,new Uint8Array(await f.arrayBuffer()));await api.window.showTextDocument(uri);}})().catch(e=>api.window.showErrorMessage((e as Error).message));};input.click();});
  command('cCompiler.example',async()=>{const choice=await api.window.showQuickPick(examples.map((ex,i)=>({label:ex.name,description:ex.description,index:i})),{title:'Choose a C example'});if(!choice)return;const ex=examples[choice.index];const dir=api.Uri.file('/workspace/examples');await api.workspace.fs.createDirectory(dir);let name=`${['hello','input','fibonacci'][choice.index]}-${Date.now()}.c`;const uri=api.Uri.joinPath(dir,name);await api.workspace.fs.writeFile(uri,enc.encode(ex.code));await api.workspace.fs.writeFile(api.Uri.file('/workspace/stdin.txt'),enc.encode(ex.stdin));await api.window.showTextDocument(uri);});
  command('extraspace.avatar',async()=>{try{if(await pickAvatar(session))applyAvatar();}catch(error){void api.window.showErrorMessage((error as Error).message);}});
  command('extraspace.removeAvatar',()=>{removeAvatar(session);applyAvatar();});
  command('extraspace.access',()=>api.window.showInformationMessage('Workspace access is enforced by the private hosting policy. Approved visitors sign in through the hosting provider. The browser profile below chooses local files; it does not grant site access. Access changes must be made in site sharing settings or through your assistant.'));
  MenuRegistry.appendMenuItem(MenuId.AccountsContext,{command:{id:'extraspace.projects',title:'My Projects'},group:'extraspace',order:0});
  MenuRegistry.appendMenuItem(MenuId.AccountsContext,{command:{id:'cCompiler.profile',title:'Manage Extraspace Profile'},group:'extraspace',order:1});
  MenuRegistry.appendMenuItem(MenuId.AccountsContext,{command:{id:'extraspace.avatar',title:'Change Avatar…'},group:'extraspace',order:2});
  MenuRegistry.appendMenuItem(MenuId.AccountsContext,{command:{id:'extraspace.access',title:'Workspace Access'},group:'extraspace',order:3});
  command('cCompiler.profile',async()=>{const choice=await api.window.showQuickPick([{label:`$(account) ${session.name}`,description:'Local browser profile'},{label:'Change avatar',description:'Choose a local image, stored in this browser'},{label:'Remove avatar',description:'Restore the account icon'},{label:'Workspace access',description:'Approved visitors only'},{label:'Export workspace',description:'Download your files as ZIP'},{label:'Sign out',description:'Files remain saved in this browser'}],{title:'Extraspace profile · remembered for 7 days'});if(choice?.label==='Change avatar')await api.commands.executeCommand('extraspace.avatar');if(choice?.label==='Remove avatar')await api.commands.executeCommand('extraspace.removeAvatar');if(choice?.label==='Workspace access')await api.commands.executeCommand('extraspace.access');if(choice?.label==='Export workspace')await exportFiles();if(choice?.label==='Sign out')await api.commands.executeCommand('cCompiler.signOut');});
  command('cCompiler.signOut',async()=>{await api.workspace.saveAll();logout();location.reload();});
  command('cCompiler.about',()=>api.window.showInformationMessage('This is the open-source VS Code workbench, integrated through monaco-vscode-api. C runs through Wandbox. Files and the session stay in this browser. Desktop processes and native extensions need a server.','Open Source').then(choice=>{if(choice)void api.env.openExternal(api.Uri.parse('https://github.com/microsoft/vscode'));}));
  const buildStorageKey = workspaceKey(session) + ':gcc-builds-v1';
  const shell = new CShell({
    files: async () => { await api.workspace.saveAll(); return (await listFiles()).map(f => ({ id: f.uri.toString(), name: f.name, content: new TextDecoder().decode(f.bytes) })); },
    read: async path => new TextDecoder().decode(await api.workspace.fs.readFile(api.Uri.joinPath(api.Uri.file('/workspace'),path))),
    write: async (path,content) => { const uri=api.Uri.joinPath(api.Uri.file('/workspace'),path); const slash=path.lastIndexOf('/'); if(slash>=0)await api.workspace.fs.createDirectory(api.Uri.joinPath(api.Uri.file('/workspace'),path.slice(0,slash))); await api.workspace.fs.writeFile(uri,enc.encode(content)); },
    settings: () => { const config=api.workspace.getConfiguration('cCompiler'); return { compiler:config.get('compiler','gcc-13.2.0-c'), standard:config.get('standard','c11'), stdinFile:config.get('stdinFile','stdin.txt'), active:api.window.activeTextEditor?.document.uri.toString() || '' }; },
    loadBuilds: () => { try{return JSON.parse(localStorage.getItem(buildStorageKey)||'{}');}catch{return {};} },
    saveBuilds: builds => { try{localStorage.setItem(buildStorageKey,JSON.stringify(builds));}catch{output.appendLine('Browser storage is full. Build targets are available until reload.');} },
    request: async (build:GccBuild,check:boolean,stdin:string,args:string[]):Promise<RunResult> => {
      if(runController)throw new Error('A compiler request is running. Press Ctrl+C to cancel it first.');
      const controller=new AbortController();runController=controller;let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},45000);
      runStatus.text=check?'$(loading~spin) Compiling C':'$(loading~spin) Running C';runStatus.command='cCompiler.cancel';
      output.appendLine(`${check?'Build':'Run'} · ${build.compiler} ${build.flags.join(' ')} ${build.sources.join(' ')}`);
      try {
        const result=await gcc(build,check,stdin,args,controller.signal);
        const message=result.compiler_message || [result.compiler_output,result.compiler_error].filter(Boolean).join('\n');
        output.appendLine(message || `GCC ${check?'build':'execution'} status: ${result.status}`);
        diagnostics.clear();const byFile=new Map<string,VSCode.Diagnostic[]>();
        for(const line of message.split('\n')) {
          const m=line.match(/^(.+?):(\d+):(\d+):\s*(warning|error|fatal error|note):\s*(.*)$/);if(!m)continue;
          const name=m[1]==='prog.c'?build.sources[0]:m[1];const uri=api.Uri.joinPath(api.Uri.file('/workspace'),name.replace(/^\.\//,''));
          const d=new api.Diagnostic(new api.Range(Math.max(0,+m[2]-1),Math.max(0,+m[3]-1),Math.max(0,+m[2]-1),+m[3]),m[5],m[4]==='warning'?api.DiagnosticSeverity.Warning:m[4]==='note'?api.DiagnosticSeverity.Information:api.DiagnosticSeverity.Error);d.source='GCC / Wandbox';
          const key=uri.toString();byFile.set(key,[...(byFile.get(key)||[]),d]);
        }
        for(const [uri,ds] of byFile)diagnostics.set(api.Uri.parse(uri),ds);
        return result;
      } catch(error) {
        if(controller.signal.aborted)throw new Error(timedOut?'Compiler request timed out after 45 seconds.':'Request cancelled. Remote execution may finish independently.');
        throw error instanceof TypeError?new Error('Could not reach Wandbox. Check your connection and try again.'):error;
      } finally {clearTimeout(timer);runController=null;runStatus.text='$(play) Run C';runStatus.command='cCompiler.run';}
    }
  });
  terminalCommand = command => shell.execute(command);

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
  document.title='Extraspace';
}
