import JSZip from 'jszip';
import type { ProjectFile } from './projects';
const enc=new TextEncoder();
export function safeProjectPath(name:string) {
  if (!name || name.startsWith('/') || name.includes('\\') || /[\x00-\x1f]/.test(name) || name.split('/').some(p=>!p||p==='.'||p==='..') || /^[A-Za-z]:/.test(name)) throw new Error(`Unsafe project path: ${name}`);
  return name;
}
export function validateProjectFiles(files:ProjectFile[]) {
  if(files.length>2000)throw new Error('Projects can contain up to 2,000 files.');
  const seen=new Set<string>();let size=0;
  for(const f of files){safeProjectPath(f.name);if(seen.has(f.name))throw new Error(`Duplicate file: ${f.name}`);seen.add(f.name);size+=f.bytes.length;}
  if(size>20*1024*1024)throw new Error('Choose a project smaller than 20 MB.');
}
function header(name:string,size:number,type='0') {
  const bytes=new Uint8Array(512);
  const text=(offset:number,length:number,value:string)=>bytes.set(enc.encode(value).slice(0,length),offset);
  const oct=(offset:number,length:number,value:number)=>text(offset,length,value.toString(8).padStart(length-1,'0')+'\0');
  text(0,100,name);oct(100,8,420);oct(108,8,0);oct(116,8,0);oct(124,12,size);oct(136,12,Math.floor(Date.now()/1000));bytes.fill(32,148,156);text(156,1,type);text(257,6,'ustar\0');text(263,2,'00');text(265,32,'extraspace');
  const sum=bytes.reduce((a,b)=>a+b,0);text(148,8,sum.toString(8).padStart(6,'0')+'\0 ');return bytes;
}
export function tarArchive(files:ProjectFile[]) {
  validateProjectFiles(files);const blocks:Uint8Array[]=[];
  const add=(name:string,bytes:Uint8Array,type='0')=>{blocks.push(header(name,bytes.length,type),bytes);if(bytes.length%512)blocks.push(new Uint8Array(512-bytes.length%512));};
  files.forEach((file,index)=>{
    if(enc.encode(file.name).length>100 || /[^\x20-\x7e]/.test(file.name)) {
      const body=`path=${file.name}\n`;let length=enc.encode(body).length+3;
      while(enc.encode(`${length} ${body}`).length!==length)length=enc.encode(`${length} ${body}`).length;
      add(`PaxHeaders/${index}`,enc.encode(`${length} ${body}`),'x');add(`file-${index}`,file.bytes);
    } else add(file.name,file.bytes);
  });
  blocks.push(new Uint8Array(1024));const out=new Uint8Array(blocks.reduce((n,b)=>n+b.length,0));let pos=0;for(const block of blocks){out.set(block,pos);pos+=block.length;}return out;
}
export async function projectArchive(files:ProjectFile[],format:'zip'|'tar'):Promise<Blob> {
  validateProjectFiles(files);
  if(format==='tar'){const bytes=tarArchive(files);return new Blob([bytes.buffer as ArrayBuffer],{type:'application/x-tar'});}
  const zip=new JSZip();for(const f of files)zip.file(f.name,f.bytes);return zip.generateAsync({type:'blob',compression:'DEFLATE'});
}
export function downloadBlob(blob:Blob,name:string) {const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function archiveName(name:string) {return name.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'extraspace-project';}
export async function importZip(blob:Blob):Promise<ProjectFile[]> {
  if(blob.size>20*1024*1024)throw new Error('Choose a ZIP smaller than 20 MB.');
  const zip=await JSZip.loadAsync(blob);const entries=Object.values(zip.files).filter(f=>!f.dir);
  if(entries.length>2000)throw new Error('ZIP contains more than 2,000 files.');
  const files:ProjectFile[]=[];let size=0;
  for(const entry of entries){
    safeProjectPath((entry as typeof entry&{unsafeOriginalName?:string}).unsafeOriginalName||entry.name);
    const chunks:Uint8Array[]=[];let length=0;
    // JSZip 3.10 exposes this same chunk stream behind async(), but omits the
    // method from JSZipObject's declarations. Bound expansion before accumulating.
    const stream=(entry as typeof entry & {internalStream(type:'uint8array'):JSZip.JSZipStreamHelper<Uint8Array>}).internalStream('uint8array');
    await new Promise<void>((resolve,reject)=>{stream.on('data',(chunk:Uint8Array)=>{size+=chunk.length;length+=chunk.length;if(size>20*1024*1024){stream.pause();reject(new Error('Expanded ZIP exceeds 20 MB.'));return;}chunks.push(chunk);});stream.on('error',reject);stream.on('end',resolve);stream.resume();});
    const bytes=new Uint8Array(length);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}files.push({name:safeProjectPath(entry.name),bytes});
  }
  validateProjectFiles(files);return files;
}
