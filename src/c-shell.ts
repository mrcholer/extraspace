import { gcc, type GccBuild, type RunResult } from './compiler.ts';
import type { SourceFile } from './workspace';

type Token = { value: string; operator?: boolean };
type Result = { stdout: string; stderr: string; status: number };
export type ShellIO = {
  files(): Promise<SourceFile[]>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  settings(): { compiler: string; standard: string; stdinFile: string; active: string };
  request(build: GccBuild, check: boolean, stdin: string, args: string[]): Promise<RunResult>;
  loadBuilds?(): Record<string, GccBuild>;
  saveBuilds?(builds: Record<string, GccBuild>): void;
};

function tokenize(line: string): Token[] {
  const tokens: Token[] = []; let word = '', started = false, quote = '';
  const flush = () => { if (started) tokens.push({ value: word }); word = ''; started = false; };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && quote !== "'") { if (++i === line.length) throw new Error('Incomplete escape.'); word += line[i]; started = true; }
    else if (quote) { if (ch === quote) quote = ''; else word += ch; }
    else if (ch === '"' || ch === "'") { quote = ch; started = true; }
    else if (/\s/.test(ch)) flush();
    else if (';&|<>'.includes(ch)) { flush(); let value = ch; if (line[i + 1] === ch && '&|>'.includes(ch)) value += line[++i]; tokens.push({ value, operator: true }); }
    else { word += ch; started = true; }
  }
  if (quote) throw new Error('Unclosed quote.'); flush(); return tokens;
}
function path(name: string) {
  if (name.startsWith('/workspace/')) name = name.slice(11);
  if (name.startsWith('/')) throw new Error('Paths must stay inside /workspace.');
  const parts: string[] = [];
  for (const part of name.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!parts.length) throw new Error('Paths must stay inside /workspace.'); parts.pop(); } else parts.push(part); }
  if (!parts.length) throw new Error('Expected a file name.');
  return parts.join('/');
}
const ok = (stdout = ''): Result => ({ stdout, stderr: '', status: 0 });
const help = `C terminal · GCC on Wandbox (free public API; no API key)
  gcc main.c -o main          Compile and link without running
  ./main                     Execute the saved build
  gcc main.c helper.c -Wall -std=c17 -O2 -o app && ./app
  ./app first "second arg" < stdin.txt
  echo "12 30" | ./app        Supply batch stdin
  ./app > output.txt          Save stdout in your workspace
  c main.c                   Compile and run in one request
  run                        Run the active C file with helpers
  stdin 12 30                Set default input (stdin.txt)
  ls, pwd, cat <file>, echo, clear, help
Build targets are browser recipes, not downloadable binaries. Execution
recompiles the saved source snapshot remotely. Source, arguments and input
are sent to Wandbox. Input is batch-only; this is not a full OS shell.
Flags: -std=, -W*, -O*, -g, -D, -U, -I, -l, -L, -pthread, -pedantic.
Object files (-c), assembly (-S), preprocessing (-E), packages and OS commands
are unavailable because this API does not return build artifacts.`;

export class CShell {
  private io: ShellIO;
  private builds: Record<string, GccBuild>;
  constructor(io: ShellIO) { this.io = io; this.builds = Object.assign(Object.create(null), io.loadBuilds?.() || {}); }
  async execute(line: string): Promise<string> {
    const tokens = tokenize(line); if (!tokens.length) return '';
    const groups: { tokens: Token[]; after: string }[] = []; let pending: Token[] = [];
    for (const token of tokens) {
      if (token.operator && ['&&', ';'].includes(token.value)) { if (!pending.length) throw new Error('Expected a command.'); groups.push({ tokens: pending, after: token.value }); pending = []; }
      else pending.push(token);
    }
    if (!pending.length) throw new Error('Expected a command after operator.'); groups.push({ tokens: pending, after: '' });
    let text = '', previous = 0, connector = '';
    for (const group of groups) {
      if (connector !== '&&' || previous === 0) {
        let result: Result;
        try { result = await this.pipeline(group.tokens); } catch (e) { result = { stdout: '', stderr: (e as Error).message + '\n', status: 1 }; }
        text += result.stdout + (result.stderr ? '\x1b[31m' + result.stderr + '\x1b[0m' : ''); previous = result.status;
      }
      connector = group.after;
    }
    return text.replace(/\n$/, '');
  }
  private async pipeline(tokens: Token[]): Promise<Result> {
    const pipe = tokens.findIndex(t => t.operator && t.value === '|');
    let supplied: string | undefined;
    if (pipe !== -1) {
      const left = tokens.slice(0, pipe);
      if (!left.length || !['echo', 'cat'].includes(left[0].value) || left.some(t => t.operator)) throw new Error('Pipes support echo or cat into one C program.');
      const input = await this.command(left.map(t => t.value)); if (input.status) return input;
      supplied = input.stdout; tokens = tokens.slice(pipe + 1);
    }
    const args: string[] = []; let output: string | undefined, append = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.operator) { args.push(token.value); continue; }
      if (!['<', '>', '>>'].includes(token.value)) throw new Error(`Unsupported shell operator: ${token.value}`);
      const next = tokens[++i]; if (!next || next.operator) throw new Error('Redirection needs a file name.');
      const file = path(next.value);
      if (token.value === '<') supplied = await this.io.read(file);
      else { output = file; append = token.value === '>>'; }
    }
    if (!args.length) throw new Error('Expected a command.');
    const result = await this.command(args, supplied);
    if (output) {
      let before = ''; if (append) try { before = await this.io.read(output); } catch { /* new file */ }
      await this.io.write(output, before + result.stdout); result.stdout = '';
    }
    return result;
  }
  private async command([op, ...args]: string[], supplied?: string): Promise<Result> {
    const settings = this.io.settings();
    if (op === 'help') return ok(help + '\n');
    if (op === 'clear') return ok('\x1b[2J\x1b[H');
    if (op === 'pwd') return ok('/workspace\n');
    if (op === 'echo') { const noNewline = args[0] === '-n'; return ok((noNewline ? args.slice(1) : args).join(' ') + (noNewline ? '' : '\n')); }
    if (op === 'ls') return ok([...new Set([...(await this.io.files()).map(f => f.name), ...Object.keys(this.builds).map(name => `${name} [API build]`)])].join('\n') + '\n');
    if (op === 'cat') { if (!args.length) throw new Error('Usage: cat <file>'); return ok((await Promise.all(args.map(name => this.io.read(path(name))))).join('')); }
    if (op === 'stdin') { if (!args.length) return ok(`Default input (${settings.stdinFile}):\n${await this.io.read(settings.stdinFile)}`); await this.io.write(path(settings.stdinFile), args.join(' ') + '\n'); return ok(`Input saved to ${settings.stdinFile}.\n`); }
    let stdin = supplied;
    const input = async () => { if (stdin !== undefined) return stdin; try { return await this.io.read(settings.stdinFile); } catch { return ''; } };
    if (op.startsWith('./') || op.startsWith('/workspace/')) {
      const target = path(op); const build = this.builds[target];
      if (!build) throw new Error(`${op}: build target not found. First use gcc main.c -o ${target}`);
      return this.result(await this.io.request(build, false, await input(), args), build);
    }
    if (!['gcc', 'cc', 'c', 'run'].includes(op)) throw new Error(`${op}: command not found. Type help for C commands.`);
    const files = await this.io.files();
    const compiler = settings.compiler.startsWith('gcc-') ? settings.compiler : 'gcc-13.2.0-c';
    if (op === 'gcc' || op === 'cc') {
      if (args.length === 1 && args[0] === '--version') {
        const r = await this.io.request({ files: [{ id: 'version', name: 'version.c', content: 'int main(void){return 0;}' }], sources: ['version.c'], flags: ['--version'], compiler }, false, '', []);
        return ok(r.compiler_message || r.compiler_output || r.compiler_error || `Wandbox ${compiler}\n`);
      }
    }
    let target = 'a.out'; const flags: string[] = []; const sources: string[] = []; const runtime: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--' && (op === 'c' || op === 'run')) { runtime.push(...args.slice(i + 1)); break; }
      if (arg === '-o') { if (!args[i + 1]) throw new Error('gcc: missing output file after -o'); target = path(args[++i]); }
      else if (arg.startsWith('-o') && arg.length > 2) target = path(arg.slice(2));
      else if (['-c', '-S', '-E', '-fsyntax-only'].includes(arg)) throw new Error(`${arg}: artifact-only modes are unavailable. Use gcc file.c -o app to create an API build target.`);
      else if (['-I', '-D', '-U', '-l', '-L', '-include'].includes(arg)) { if (args[i + 1] === undefined) throw new Error(`gcc: missing argument after ${arg}`); flags.push(arg, args[++i]); }
      else if (/^-(?:std=\S+|W[A-Za-z0-9_=+-]*|O(?:[0-3gsz]|fast)?|g\d*|[DIUlL].+|pthread|pedantic(?:-errors)?|ansi|f(?:no-)?(?:common|signed-char|unsigned-char))$/.test(arg)) flags.push(arg);
      else if (arg.startsWith('-')) throw new Error(`gcc: ${arg} is not supported by this API terminal. Type help for supported flags.`);
      else { const name = path(arg); const matches = arg.includes('*') ? files.filter(f => f.name.endsWith('.c') && new RegExp('^' + name.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(f.name)).map(f => f.name) : [name]; if (!matches.length) throw new Error(`gcc: ${arg}: no matching sources`); sources.push(...matches); }
    }
    if (op === 'run') {
      const main = files.find(f => f.id === settings.active && f.name.endsWith('.c')) || files.find(f => f.name === 'main.c') || files.find(f => f.name.endsWith('.c'));
      if (!sources.length && main) sources.push(main.name, ...files.filter(f => f.name.endsWith('.c') && f.name !== main.name && !/\bmain\s*\([^;{}]*\)\s*\{/.test(f.content)).map(f => f.name));
    }
    if (!sources.length) throw new Error(`${op}: no input files. Try ${op} main.c`);
    for (const name of sources) if (!name.endsWith('.c') || !files.some(f => f.name === name)) throw new Error(`gcc: ${name}: C source file not found`);
    if (files.some(f => f.name === target)) throw new Error(`gcc: output ${target} would overwrite a workspace file. Choose another name.`);
    if ((op === 'c' || op === 'run') && !flags.some(f => f.startsWith('-std='))) flags.push(`-std=${settings.standard}`);
    if (flags.some(f => /[\r\n\0]/.test(f)) || runtime.some(f => /[\r\n\0]/.test(f))) throw new Error('API arguments cannot contain newlines or NUL.');
    const build: GccBuild = { files: files.filter(f => /\.(c|h|inc)$/.test(f.name)), sources: [...new Set(sources)], flags, compiler };
    const check = op === 'gcc' || op === 'cc';
    const r = await this.io.request(build, check, check ? '' : await input(), runtime);
    const result = this.result(r, build);
    if (check && result.status === 0) { this.builds[target] = build; this.io.saveBuilds?.(this.builds); result.stdout += `Built ${target} [API build]. Run ./${target}\n`; }
    return result;
  }
  private result(r: RunResult, build: GccBuild): Result {
    const compiler = (r.compiler_message || [r.compiler_output, r.compiler_error].filter(Boolean).join('\n')).replace(/\bprog\.c(?=:)/g, build.sources[0]);
    let stderr = compiler + (r.program_error || '');
    const status = Number(r.status) || (r.signal ? 1 : 0);
    if (status || r.signal) stderr += `Process exited with code ${r.status}${r.signal ? ' · ' + r.signal : ''}\n`;
    return { stdout: r.program_output || '', stderr, status };
  }
}
