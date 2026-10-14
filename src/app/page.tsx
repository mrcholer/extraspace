'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { login, readSession, type Session } from '../workspace';
const Workbench=dynamic(()=>import('../WorkbenchClient'),{ssr:false,loading:()=> <main className="boot-screen"><p>Opening Extraspace…</p></main>});
export default function Page(){
  const [session,setSession]=useState<Session|null>(null);const [ready,setReady]=useState(false);const [name,setName]=useState('');const [email,setEmail]=useState('');const [error,setError]=useState('');
  useEffect(()=>{setSession(readSession());setReady(true);},[]);
  if(!ready)return <main className="boot-screen"><div className="code-logo">&lt;&gt;</div><p>Loading…</p></main>;
  if(session)return <Workbench session={session}/>;
  return <main className="signin"><div className="signin-card"><div className="code-logo" aria-hidden="true">&lt;&gt;</div><h1>Extraspace</h1><p>The open-source VS Code workbench, in your browser.</p><form onSubmit={e=>{e.preventDefault();try{setSession(login(name,email));}catch{setError('Allow cookies and browser storage to remember your session.');}}}><label htmlFor="name">Profile name</label><input id="name" autoComplete="nickname" placeholder="Your name" required maxLength={40} pattern=".*\S.*" value={name} onChange={e=>setName(e.target.value)}/><label htmlFor="email">Email (optional)</label><input id="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={100} value={email} onChange={e=>setEmail(e.target.value)}/><button type="submit">Open workspace</button>{error&&<p id="login-error" role="alert">{error}</p>}</form><p className="session-note">Your session token is saved in a cookie for 7 days. This is a local browser profile, not an authenticated online account. Files stay in this browser.</p><a href="https://github.com/microsoft/vscode" target="_blank" rel="noreferrer">Built from the open-source VS Code workbench</a></div></main>;
}
