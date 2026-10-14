import assert from 'node:assert/strict';
import { TerminalInput, terminalPrompt } from '../src/terminal-input.ts';

const commands = [];
let output = '';
let interrupted = false;
const terminal = new TerminalInput(text => { output += text; }, async command => {
  commands.push(command);
  if (command === 'fail') throw new Error('expected command error');
  return `result:${command}`;
}, () => { interrupted = true; });

terminal.input('hepl\x7f\x7flp\r');
terminal.input('one\r\ntwo\n');
terminal.input('discard\x15cat stdin.txt\r');
terminal.input('cancel\x03ls\r');
terminal.input('fail\rafter\r');
await terminal.whenIdle();
assert.deepEqual(commands, ['help','one','two','cat stdin.txt','ls','fail','after']);
assert.equal(interrupted, true);
assert.match(output, /result:help/);
assert.match(output, /expected command error/);
assert.match(output, /result:after/);
assert.ok(output.endsWith(terminalPrompt));
terminal.input('pasted\b\b\b\b\b\bhelp\x0c\r');
await terminal.whenIdle();
assert.equal(commands.at(-1), 'help');
assert.ok(output.includes('\x1b[2J\x1b[H' + terminalPrompt + 'help'));
console.log('Terminal input checks passed: echo, deletion, paste line endings, queued commands, interrupts, clear, and error recovery.');
