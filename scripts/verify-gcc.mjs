import assert from 'node:assert/strict';
import { CShell } from '../src/c-shell.ts';
import { gcc } from '../src/compiler.ts';

const files = new Map([
  ['main.c', '#include <stdio.h>\n#include "helper.h"\nint main(int argc,char **argv){int a,b;if(scanf("%d%d",&a,&b)!=2)return 9; printf("%d %s\\n",add(a,b),argc>1?argv[1]:"none");return 0;}'],
  ['helper.h', 'int add(int,int);'],
  ['helper.c', 'int add(int a,int b){return a+b;}'],
  ['stdin.txt', '12 30\n']
]);
let saved = {}; let requests = 0;
const io = {
  files: async () => [...files].map(([name,content])=>({id:name,name,content})),
  read: async name => {if(!files.has(name))throw new Error(`${name}: file not found`);return files.get(name);},
  write: async (name,content) => {files.set(name,content);},
  settings: () => ({compiler:'gcc-13.2.0-c',standard:'c17',stdinFile:'stdin.txt',active:'main.c'}),
  request: async (...args) => {requests++;return gcc(...args,AbortSignal.timeout(45000));},
  loadBuilds: () => saved,
  saveBuilds: builds => {saved=JSON.parse(JSON.stringify(builds));}
};
const shell = new CShell(io);
let output=await shell.execute('gcc main.c helper.c -std=c17 -Wall -Wextra -O2 -o app');
assert.match(output,/Built app/);assert.doesNotMatch(output,/42|none/);
console.log('PASS: real GCC build/link without running the program');
output=await shell.execute('./app "two words"');assert.match(output,/42 two words/);
console.log('PASS: saved target, default stdin and quoted runtime arguments');
output=await shell.execute('echo "8 9" | ./app piped > result.txt && cat result.txt');assert.match(output,/17 piped/);assert.equal(files.get('result.txt'),'17 piped\n');
console.log('PASS: batch stdin pipe, stdout redirection and chaining');
files.set('main.c','int main(void){invalid syntax}');
output=await shell.execute('gcc main.c -o broken && echo SHOULD_NOT_RUN');assert.match(output,/error:/);assert.doesNotMatch(output,/SHOULD_NOT_RUN/);assert.ok(!saved.broken);
console.log('PASS: real syntax failure stops && and does not create a target');
output=await new CShell(io).execute('./app restored < stdin.txt');assert.match(output,/42 restored/);
console.log('PASS: build snapshot survives source edits and session restoration');
files.set('link.c','int missing(void);int main(void){return missing();}');
output=await shell.execute('gcc link.c -o broken');assert.match(output,/undefined reference/);assert.ok(!saved.broken);
console.log('PASS: real linker errors reject the build');
files.set('exit.c','int main(void){return 7;}');
output=await shell.execute('c exit.c && echo SHOULD_NOT_RUN');assert.match(output,/code 7/);assert.doesNotMatch(output,/SHOULD_NOT_RUN/);
console.log('PASS: c shorthand reports real exit code and stops &&');
const before=requests;
output=await shell.execute('gcc helper.c -c');assert.match(output,/artifact-only/);assert.equal(requests,before);
output=await shell.execute('./not-built');assert.match(output,/build target not found/);
output=await shell.execute('gcc helper.c -o helper.c');assert.match(output,/overwrite/);
assert.equal(requests,before);
console.log('PASS: unsupported artifacts, missing targets and source overwrite rejected locally');
