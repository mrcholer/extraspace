import type { SourceFile } from './workspace';
export type Compiler = { name: string; version: string; language: string };
export type RunResult = { status: string; signal?: string; compiler_output?: string; compiler_error?: string; compiler_message?: string; program_output?: string; program_error?: string; program_message?: string };
const API = 'https://wandbox.org/api';
export async function compilers(signal?: AbortSignal): Promise<Compiler[]> {
  const r = await fetch(`${API}/list.json`, { signal });
  if (!r.ok) throw new Error(`Compiler service returned HTTP ${r.status}.`);
  const data: Compiler[] = await r.json();
  return data.filter(c => c.language === 'C');
}
export async function compile(files: SourceFile[], active: string, compiler: string, standard: string, stdin: string, signal: AbortSignal): Promise<RunResult> {
  const sources = files.filter(f => f.name.endsWith('.c'));
  const main = sources.find(f => f.id === active) || sources.find(f => f.name === 'main.c') || sources[0];
  if (!main) throw new Error('Create a .c file before running your workspace.');
  // Entry points are separate runnable programs; helper sources are linked together.
  const extra = files.filter(f => f.id !== main.id && (f.name.endsWith('.h') || (f.name.endsWith('.c') && !/\bmain\s*\([^;{}]*\)\s*\{/.test(f.content))));
  const r = await fetch(`${API}/compile.json`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ compiler, code: main.content, codes: extra.map(f => ({ file: f.name, code: f.content })), options: 'warning', 'compiler-option-raw': [`-std=${standard}`, '-I.', ...(main.name.includes('/') ? ['-I' + main.name.slice(0,main.name.lastIndexOf('/'))] : []), ...extra.filter(f => f.name.endsWith('.c')).map(f => './' + f.name)].join('\n'), stdin, save: false }) });
  if (!r.ok) throw new Error(r.status === 429 ? 'Wandbox is busy or rate-limiting requests. Wait a moment and try again.' : `Compiler service returned HTTP ${r.status}. Try again shortly.`);
  const result = await r.json();
  if (result.error) throw new Error(String(result.error));
  if (typeof result.status === 'undefined') throw new Error('The compiler returned an unexpected response. Please retry.');
  return result;
}
