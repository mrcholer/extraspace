import { profileKey, hello, type Session } from './workspace.ts';
import {validateProjectFiles} from './archives.ts';
export type Project = { id: string; name: string; description: string; createdAt: number; updatedAt: number; starred: boolean };
export type ProjectFile = { name: string; bytes: Uint8Array };
const catalogKey = (session: Session) => `${profileKey(session)}.projects-v1`;
export function listProjects(session: Session): Project[] {
  const stored = localStorage.getItem(catalogKey(session));
  if (stored) {
    const data = JSON.parse(stored) as Project[];
    if (!Array.isArray(data) || !data.every(p => typeof p.id === 'string' && typeof p.name === 'string')) throw new Error('Your project list could not be read. Browser data has been preserved.');
    return data;
  }
  const now = Date.now();
  const first: Project = {id:'legacy',name:'My workspace',description:'Your existing files, settings and compiler workspace.',createdAt:now,updatedAt:now,starred:false};
  saveProjects(session,[first]); return [first];
}
export function saveProjects(session: Session, projects: Project[]) { localStorage.setItem(catalogKey(session),JSON.stringify(projects)); }
export function updateProject(session: Session, id: string, changes: Partial<Pick<Project,'name'|'description'|'starred'|'updatedAt'>>) {
  const projects = listProjects(session).map(p => p.id === id ? {...p,...changes} : p); saveProjects(session,projects); return projects;
}
function seedDatabase(session: Session): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    const request=indexedDB.open(`extraspace-project-seeds-${profileKey(session)}`,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('seeds');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function projectSeed(session: Session, id: string): Promise<ProjectFile[] | undefined> {
  const db=await seedDatabase(session);
  try { return await new Promise((resolve,reject)=>{const request=db.transaction('seeds','readonly').objectStore('seeds').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
  finally {db.close();}
}
export async function storeProjectSeed(session: Session, id: string, files: ProjectFile[]) {
  const db=await seedDatabase(session);
  try { await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('seeds','readwrite');transaction.objectStore('seeds').put(files,id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);}); }
  finally {db.close();}
}
export async function clearProjectSeed(session: Session, id: string) {
  const db=await seedDatabase(session);
  try { await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('seeds','readwrite');transaction.objectStore('seeds').delete(id);transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);}); }
  finally {db.close();}
}
export async function createProject(session: Session, name: string, description = '', files?: ProjectFile[]): Promise<Project> {
  name=name.trim();if(!name || name.length>60)throw new Error('Choose a project name between 1 and 60 characters.');
  if(files)validateProjectFiles(files);
  const now=Date.now();const project:Project={id:crypto.randomUUID(),name,description:description.trim().slice(0,160),createdAt:now,updatedAt:now,starred:false};
  const enc=new TextEncoder();
  await storeProjectSeed(session,project.id,files || [{name:'main.c',bytes:enc.encode(hello)},{name:'stdin.txt',bytes:enc.encode('')},{name:'README.md',bytes:enc.encode(`# ${name}\n\nBuild: gcc main.c -o main\nRun: ./main\n\nOpen Downloads & Sharing to export ZIP or TAR archives.\n`)}]);
  saveProjects(session,[...listProjects(session),project]);return project;
}
export function openProject(project: Project) { location.assign(`/?project=${encodeURIComponent(project.id)}`); }
