import type { Metadata } from 'next';
import '../entry.css';
export const metadata: Metadata = { title:'Code — OSS for C', description:'The open-source VS Code workbench in a frontend-only Next.js app, with local sessions and public C compilation.', icons:{icon:'/favicon.svg'} };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
