import type { Metadata, Viewport } from 'next';
import '../entry.css';
import '../codespace-mobile.css';
export const metadata: Metadata = { title:'CodeSpace', description:'CodeSpace is a browser workbench with a public C compiler. Projects, editor and terminal, on any device.', authors:[{name:'Adobe Choler',url:'https://github.com/mrcholer'}], icons:{icon:'/favicon.svg'} };
/**
 * `viewport-fit=cover` lets the layout reach under a notch and the home
 * indicator, which is what the `env(safe-area-inset-*)` padding in entry.css
 * and in the workbench sheet is written against. Without it those insets are
 * always 0 on iOS and the toolbar sits under the home bar.
 *
 * No `maximumScale` and no `user-scalable=no`: this is an editor, and pinning
 * zoom is an accessibility failure. Inputs keep iOS from zooming on focus by
 * being 16px, which costs nobody their eyesight.
 */
export const viewport: Viewport = { width:'device-width', initialScale:1, viewportFit:'cover', themeColor:'#0b0b10' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
