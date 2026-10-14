import type { Metadata } from 'next';
import '../entry.css';
export const metadata: Metadata = { title:'Extraspace', description:'Extraspace is a frontend-only Next.js workspace using the open-source VS Code workbench, with local sessions and public C compilation.', authors:[{name:'Adobe Choler',url:'https://github.com/mrcholer'}], icons:{icon:'/favicon.svg'} };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
