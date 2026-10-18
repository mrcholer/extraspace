'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { login, readSession, type Session } from '../workspace';
import Logo from '../Logo';
import ProjectsPage from '../ProjectsPage';
import SharedProject from '../SharedProject';
import {listProjects, type Project} from '../projects';
import { watchVisualViewport } from '../viewport-kb';
import { hostUser, hostSignIn } from '../host';
const Workbench=dynamic(()=>import('../WorkbenchClient'),{ssr:false,loading:()=> <main className="boot-screen"><p>Opening Extraspace…</p></main>});
export default function Page(){
  const [session,setSession]=useState<Session|null>(null);const [ready,setReady]=useState(false);const [name,setName]=useState('');const [email,setEmail]=useState('');const [error,setError]=useState('');const [project,setProject]=useState<Project|null>(null);const [shared,setShared]=useState('');
  // Keep the sign-in form and the project list above the on-screen keyboard.
  useEffect(()=>watchVisualViewport(),[]);
  /*
   * Identity comes from the control plane, not from this browser.
   *
   * The old sign-in asked for a name and kept a UUID in localStorage. Nothing
   * could tell who owned a project, so nothing could be limited - which is the
   * opposite of what a plan is for. `hostUser()` asks who is signed in; the
   * cookie is httpOnly so this can read the answer but never the token.
   *
   * A 401 here is not an error: it is the normal signed-out state, and the
   * screen below turns into the sign-in prompt.
   */
  useEffect(()=>{
    let cancelled=false;
    const readHash=()=>setShared(location.hash.startsWith('#share=')?location.hash:'');
    readHash();window.addEventListener('hashchange',readHash);
    void (async()=>{
      try{
        const user=await hostUser();
        if(cancelled)return;
        if(!user){setSession(null);setReady(true);return;}
        const current:Session={token:user._id,name:user.discordGlobalName||user.discordUsername,email:'',expires:Date.now()+7*86400000};
        setSession(current);
        try{
          const id=new URLSearchParams(location.search).get('project');
          if(id){const selected=listProjects(current).find(p=>p.id===id);if(selected)setProject(selected);else setError('That project is not on your account.');}
        }catch(e){setError((e as Error).message);}
      }catch(e){if(!cancelled)setError((e as Error).message);}
      finally{if(!cancelled)setReady(true);}
    })();
    return()=>{cancelled=true;window.removeEventListener('hashchange',readHash);};
  },[]);
  if(!ready)return <main className="boot-screen"><Logo size={48}/><p>Loading…</p></main>;
  if(session&&shared)return <SharedProject key={shared} session={session}/>;
  if(session&&project)return <Workbench session={{...session,projectId:project.id,projectName:project.name}}/>;
  if(session)return <ProjectsPage session={session}/>;
  return <main className="signin"><div className="signin-card"><div className="signin-mark"><Logo size={64}/></div><h1>CodeSpace</h1><p>Your projects. Your space to build.</p><button className="primary-button" type="button" onClick={()=>hostSignIn(`${location.pathname}${location.search}`)}>Continue with Discord</button>{error&&<p id="login-error" role="alert">{error}</p>}<p className="session-note">Workspace access follows the plan on your account. Files, storage and limits are kept with the workspace, not in this browser, so the same project opens on any device you sign in from.</p><a href="https://github.com/microsoft/vscode" target="_blank" rel="noreferrer">Built from the open-source VS Code workbench</a></div></main>;
}
