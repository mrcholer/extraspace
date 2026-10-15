'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { login, readSession, type Session } from '../workspace';
import Logo from '../Logo';
import ProjectsPage from '../ProjectsPage';
import SharedProject from '../SharedProject';
import {listProjects, type Project} from '../projects';
const Workbench=dynamic(()=>import('../WorkbenchClient'),{ssr:false,loading:()=> <main className="boot-screen"><p>Opening Extraspace…</p></main>});
export default function Page(){
  const [session,setSession]=useState<Session|null>(null);const [ready,setReady]=useState(false);const [name,setName]=useState('');const [email,setEmail]=useState('');const [error,setError]=useState('');const [project,setProject]=useState<Project|null>(null);const [shared,setShared]=useState('');
  useEffect(()=>{const current=readSession();setSession(current);const readHash=()=>setShared(location.hash.startsWith('#share=')?location.hash:'');readHash();window.addEventListener('hashchange',readHash);if(current){try{const id=new URLSearchParams(location.search).get('project');if(id){const selected=listProjects(current).find(p=>p.id===id);if(selected)setProject(selected);else setError('Project not found in this profile.');}}catch(e){setError((e as Error).message);}}setReady(true);return()=>window.removeEventListener('hashchange',readHash);},[]);
  if(!ready)return <main className="boot-screen"><Logo size={48}/><p>Loading…</p></main>;
  if(session&&shared)return <SharedProject key={shared} session={session}/>;
  if(session&&project)return <Workbench session={{...session,projectId:project.id,projectName:project.name}}/>;
  if(session)return <ProjectsPage session={session}/>;
  return <main className="signin"><div className="signin-card"><div className="signin-mark"><Logo size={64}/></div><h1>Extraspace</h1><p>Your projects. Your space to build.</p><form onSubmit={e=>{e.preventDefault();try{login(name,email);location.reload();}catch{setError('Allow cookies and browser storage to remember your session.');}}}><label htmlFor="name">Profile name</label><input id="name" autoComplete="nickname" placeholder="Your name" required maxLength={40} pattern=".*\S.*" value={name} onChange={e=>setName(e.target.value)}/><label htmlFor="email">Email (optional)</label><input id="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={100} value={email} onChange={e=>setEmail(e.target.value)}/><button type="submit">Open my projects</button>{error&&<p id="login-error" role="alert">{error}</p>}</form><p className="session-note">Workspace access is controlled by the site’s approved-account policy. This profile selects your files and preferences in this browser.</p><a href="https://github.com/microsoft/vscode" target="_blank" rel="noreferrer">Built from the open-source VS Code workbench</a></div></main>;
}
