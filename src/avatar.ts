import {profileKey as workspaceKey,type Session} from './workspace';

export function getAvatar(session:Session) {
  const value=localStorage.getItem(`${workspaceKey(session)}.avatar`);
  return value && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;
}
export function removeAvatar(session:Session) {localStorage.removeItem(`${workspaceKey(session)}.avatar`);}
export async function pickAvatar(session:Session):Promise<string|null> {
  const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
  const file=await new Promise<File|null>(resolve=>{input.onchange=()=>resolve(input.files?.[0]||null);input.oncancel=()=>resolve(null);input.click();});
  if(!file)return null;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPEG, or WebP image.');
  if(file.size>2*1024*1024)throw new Error('Choose an image smaller than 2 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image processing is unavailable.');
    const side=Math.min(bitmap.width,bitmap.height);
    context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,96,96);
    const avatar=canvas.toDataURL('image/png');localStorage.setItem(`${workspaceKey(session)}.avatar`,avatar);return avatar;
  } finally {bitmap.close();}
}
