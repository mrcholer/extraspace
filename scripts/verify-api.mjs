import assert from 'node:assert/strict';
import { compile, compilers } from '../src/compiler.ts';
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 120000);
try {
  const list = await compilers(controller.signal);
  assert(list.some(c => c.name === 'gcc-13.2.0-c'));
  const call = (files, stdin = '') => compile(files.map((f,i)=>({id:String(i),...f})), '0', 'gcc-13.2.0-c', 'c11', stdin, controller.signal);
  let result = await call([{name:'main.c',content:'#include <stdio.h>\nint main(void) { puts("C Studio API test"); return 0; }'}]);
  assert.equal(String(result.status),'0'); assert.equal(result.program_output,'C Studio API test\n');
  console.log('PASS: real C compilation and execution');
  result = await call([{name:'main.c',content:'#include <stdio.h>\nint main(void) { int a,b; if(scanf("%d %d", &a, &b)!=2) return 1; printf("%d\\n",a+b);return 0; }'}], '12 30');
  assert.equal(String(result.status),'0'); assert.equal(result.program_output,'42\n');
  console.log('PASS: stdin delivered to program');
  result = await call([{name:'main.c',content:'#include <stdio.h>\n#include "maths.h"\nint main(void) { printf("%d\\n", add(10,20)); return 0; }'},{name:'maths.h',content:'int add(int a, int b);'},{name:'maths.c',content:'#include "maths.h"\nint add(int a, int b) { return a+b; }'}]);
  assert.equal(String(result.status),'0'); assert.equal(result.program_output,'30\n');
  console.log('PASS: multiple C files and header');
  result = await call([{name:'main.c',content:'int main(void) { invalid syntax }'}]);
  assert.notEqual(String(result.status),'0'); assert.match(result.compiler_error || result.compiler_message, /error/);
  console.log('PASS: compilation errors reported');
} finally { clearTimeout(timer); }
