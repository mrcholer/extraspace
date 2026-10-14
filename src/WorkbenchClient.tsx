'use client';
import {useEffect,useRef,useState} from 'react';
import type {Session} from './workspace';
import {openWorkbench} from './loadWorkbench';
export default function WorkbenchClient({session}:{session:Session}){
  const root=useRef<HTMLDivElement>(null);const started=useRef(false);const [done,setDone]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{if(!root.current||started.current)return;started.current=true;void openWorkbench(root.current!,session).then(()=>setDone(true)).catch(e=>{console.error(e);setError((e as Error).message);});},[session]);
  return <><div id="root" ref={root}/>{!done&&<div className="boot-screen workbench-loading"><div className="code-logo">&lt;&gt;</div><p>{error?'Unable to open the workbench':'Opening Extraspace…'}</p>{error?<><p id="boot-error">{error}</p><button onClick={()=>location.reload()}>Reload</button></>:<progress aria-label="Loading VS Code workbench"/>}</div>}</>;
}
