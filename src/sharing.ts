import type {ProjectFile} from './projects';
import {validateProjectFiles} from './archives.ts';
export type ShareSettings={mode:'view'|'edit';allowClone:boolean;audience:'everyone'|'emails';emails:string[]};
export type Snapshot={version:1;id:string;name:string;createdAt:number;settings:ShareSettings;files:{name:string;data:string}[]};
function base64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out);}
function unbase64(text:string){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
export async function shareLink(name:string,files:ProjectFile[],settings:ShareSettings) {
  validateProjectFiles(files);
  if(settings.audience==='emails' && !settings.emails.length)throw new Error('Add at least one recipient email.');
  if(settings.emails.some(email=>!/^\S+@\S+\.\S+$/.test(email)))throw new Error('Enter valid recipient email addresses.');
  const snapshot:Snapshot={version:1,id:crypto.randomUUID(),name,createdAt:Date.now(),settings,files:files.map(f=>({name:f.name,data:base64(f.bytes)}))};
  const json=new TextEncoder().encode(JSON.stringify(snapshot));
  const compressed=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const data=base64(new Uint8Array(compressed)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if(data.length>180000)throw new Error('This project is too large for a snapshot link. Download ZIP or TAR instead (link limit: 180 KB compressed).');
  return `${location.origin}/#share=${data}`;
}
export async function readShare(fragment:string):Promise<{snapshot:Snapshot;files:ProjectFile[]}> {
  const encoded=fragment.replace(/^#share=/,'');if(encoded.length>180000)throw new Error('Snapshot link is too large.');
  const bytes=unbase64(encoded.replace(/-/g,'+').replace(/_/g,'/'));
  const reader=new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>28*1024*1024){await reader.cancel();throw new Error('Snapshot exceeds the project size limit.');}chunks.push(result.value);}
  const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
  const snapshot=JSON.parse(new TextDecoder().decode(all)) as Snapshot;
  if(snapshot.version!==1 || typeof snapshot.name!=='string' || typeof snapshot.id!=='string' || !Array.isArray(snapshot.files) || !['view','edit'].includes(snapshot.settings?.mode) || !['everyone','emails'].includes(snapshot.settings?.audience) || typeof snapshot.settings.allowClone!=='boolean' || !Array.isArray(snapshot.settings.emails))throw new Error('Invalid project snapshot.');
  const files=snapshot.files.map(f=>{if(typeof f.name!=='string'||typeof f.data!=='string')throw new Error('Invalid snapshot file.');return {name:f.name,bytes:unbase64(f.data)};});validateProjectFiles(files);return {snapshot,files};
}
