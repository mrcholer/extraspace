export const terminalPrompt = '\x1b[32m/workspace $ \x1b[0m';

/** Line input shared by the workspace process and compiler pseudoterminal. */
export class TerminalInput {
  private buffer = '';
  private queue: Promise<void> = Promise.resolve();
  private write: (text: string) => void;
  private execute: (command: string) => Promise<string>;
  private interrupt: () => void;

  constructor(write: (text: string) => void, execute: (command: string) => Promise<string>, interrupt = () => {}) {
    this.write = write; this.execute = execute; this.interrupt = interrupt;
  }

  input(data: string) {
    // Normalize pasted line endings and ignore terminal navigation escape sequences.
    const text = data.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\r\n/g, '\r').replace(/\n/g, '\r');
    for (const char of text) {
      if (char === '\r') {
        const command = this.buffer; this.buffer = ''; this.write('\r\n');
        this.queue = this.queue.then(async () => {
          try {
            const result = await this.execute(command);
            if (result) this.write(result.replace(/\r?\n/g, '\r\n') + '\r\n');
          } catch (error) {
            this.write(`\x1b[31m${error instanceof Error ? error.message : 'Command failed.'}\x1b[0m\r\n`);
          }
          this.write(terminalPrompt);
        });
      } else if (char === '\x7f' || char === '\b') {
        if (this.buffer) { this.buffer = Array.from(this.buffer).slice(0, -1).join(''); this.write('\b \b'); }
      } else if (char === '\x03') {
        this.buffer = ''; this.interrupt(); this.write('^C\r\n' + terminalPrompt);
      } else if (char === '\x15') {
        this.write('\b \b'.repeat(Array.from(this.buffer).length)); this.buffer = '';
      } else if (char === '\x0c') {
        this.write('\x1b[2J\x1b[H' + terminalPrompt + this.buffer);
      } else if (char >= ' ' && char !== '\x1b') {
        this.buffer += char; this.write(char);
      }
    }
  }

  whenIdle() { return this.queue; }
}
