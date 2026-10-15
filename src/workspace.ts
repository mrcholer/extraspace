export type SourceFile = { id: string; name: string; content: string };
export type Workspace = { files: SourceFile[]; active: string; tabs: string[]; stdin: string; compiler: string; standard: string; fontSize: number; minimap: boolean; wrap: boolean; theme: 'dark' | 'light' };
export type Session = { token: string; name: string; email: string; expires: number; projectId?: string; projectName?: string };
export const hello = `#include <stdio.h>\n\n// A little code. A world of possibilities.\nint main(void) {\n    const char *name = "world";\n\n    printf("Hello, %s!\\n", name);\n    printf("Welcome to Extraspace.\\n");\n\n    // Try changing the message, then hit Run.\n    for (int i = 1; i <= 3; i++) {\n        printf("Let's build something great. %d\\n", i);\n    }\n\n    return 0;\n}\n`;
export const examples = [
  { name: 'Hello, world', description: 'Your first C program', code: hello, stdin: '' },
  { name: 'Read user input', description: 'Work with scanf and stdin', code: '#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    if (scanf("%d %d", &a, &b) != 2) {\n        fprintf(stderr, "Enter two integers.\\n");\n        return 1;\n    }\n    printf("%d + %d = %d\\n", a, b, a + b);\n    return 0;\n}\n', stdin: '12 30' },
  { name: 'Fibonacci sequence', description: 'Explore loops and numbers', code: '#include <stdio.h>\n\nint main(void) {\n    unsigned long a = 0, b = 1;\n    for (int i = 0; i < 15; i++) {\n        printf("%lu%s", a, i == 14 ? "\\n" : ", ");\n        unsigned long next = a + b;\n        a = b;\n        b = next;\n    }\n    return 0;\n}\n', stdin: '' }
];
export function freshWorkspace(): Workspace {
  return { files: [{ id: crypto.randomUUID(), name: 'main.c', content: hello }, { id: crypto.randomUUID(), name: 'README.md', content: '# Welcome to Extraspace\n\nA familiar workspace for your next C idea.\n\n## Quick start\n\n1. Open main.c and make it yours.\n2. Add input in the Stdin panel if your program needs it.\n3. Click Run or press Ctrl+Enter.\n\nYour workspace is automatically saved in this browser.\nUse Export workspace to keep a portable ZIP copy.\n\n## Compilation\n\nThe active C file runs using the public Wandbox API. Helper C files are linked alongside it; other files with main() run separately.\nHeaders are included alongside your source files.\nExecution needs an internet connection; no API key is required.\nSource code and stdin are sent to Wandbox when you click Run.\n\n## Session\n\nThis is a local browser profile, not an authenticated account.\nThe session token is stored in a cookie for seven days.\n' }], active: '', tabs: [], stdin: '', compiler: 'gcc-13.2.0-c', standard: 'c11', fontSize: 14, minimap: true, wrap: false, theme: 'dark' };
}
export function readSession(): Session | null {
  try { const token = document.cookie.split('; ').find(s => s.startsWith('cstudio_session='))?.split('=')[1]; const s = JSON.parse(localStorage.getItem('cstudio.profile') || 'null'); return s && s.token === token && s.expires > Date.now() ? s : null; } catch { return null; }
}
export function login(name: string, email: string): Session {
  const s = { token: crypto.randomUUID(), name: name.trim(), email: email.trim().toLowerCase(), expires: Date.now() + 7 * 86400000 };
  localStorage.setItem('cstudio.profile', JSON.stringify(s));
  document.cookie = `cstudio_session=${s.token}; Max-Age=604800; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  return s;
}
export function logout() { document.cookie = 'cstudio_session=; Max-Age=0; Path=/; SameSite=Lax'; localStorage.removeItem('cstudio.profile'); }
export function profileKey(s: Session) { return `cstudio.workspace.${s.email || s.name.toLowerCase()}`; }
export function workspaceKey(s: Session) { return profileKey(s) + (s.projectId && s.projectId !== 'legacy' ? `.project.${s.projectId}` : ''); }
export function loadWorkspace(s: Session): Workspace {
  const base = freshWorkspace();
  try { const saved = JSON.parse(localStorage.getItem(workspaceKey(s)) || 'null'); if (saved && Array.isArray(saved.files) && saved.files.every((f: SourceFile) => typeof f.id === 'string' && typeof f.name === 'string' && typeof f.content === 'string')) Object.assign(base, saved); } catch { /* Use a fresh workspace if browser data is damaged. */ }
  if (!base.files.some(f => f.id === base.active)) base.active = base.files[0]?.id || '';
  base.tabs = base.tabs.filter(id => base.files.some(f => f.id === id));
  if (base.active && !base.tabs.includes(base.active)) base.tabs.push(base.active);
  return base;
}
export function validName(name: string) { return /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*\.(c|h|md|txt)$/.test(name); }
