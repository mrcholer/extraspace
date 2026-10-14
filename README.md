# Code — OSS for C

A **Next.js 16.4.0** static web application running the real open-source VS Code workbench through **monaco-vscode-api 37.6.0**, containing **VS Code 1.138.0** source (commit `7debcd0e2acdea1c52de81bf9ee1620444407dda`). It uses Microsoft's workbench implementation and styles for the explorer, editor groups, tabs, menus, command palette, settings, activity bar, terminal, output, problems, notifications, and extension UI.

The C compiler is a local web extension integrated into the workbench. It calls [Wandbox](https://wandbox.org) directly from the browser. No application server, API key, or compiler installation is required.

The reference appearance uses VS Code's native **Modern UI** mode, rounded floating panels, **One Dark Pro 3.20.3**, and **Material Icon Theme 5.39.0**. Declarative theme/icon assets are bundled locally; their extension JavaScript is not run. This matches the supplied desktop screenshot's appearance rather than the default Dark Modern theme. The integrated core remains **1.138.0**; it is not VS Code 1.141.2. Native desktop window controls and process-based third-party extensions cannot be supplied by a static browser app.

Run `node scripts/prepare-appearance.mjs` to refresh the pinned, licensed theme assets from Open VSX.

## Development

Requires Node.js 22.12+ or 24+.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The first compilation takes time because this bundles the actual VS Code workbench.

## Static deployment

```sh
npm run build
npm run preview
```

Next.js uses `output: 'export'`. Deploy the generated `out/` directory to any static HTTPS host. There are no route handlers, server actions, or server-side authentication. Node is used only for development and builds. A separate vendor build bundles VS Code and its workers into `public/workbench/`; the Next.js client loads it after login. VS Code's original CSS is injected into its shadow root. `npm run build` runs both stages automatically. After editing workbench sources during development, run `npm run build:workbench` and reload.

## C compiler

- Open a `.c` file and click Run in the editor toolbar or press **Ctrl+Enter**.
- Use the original command palette (**Ctrl+Shift+P**) and type **C Compiler** for compiler selection, standards, examples, imports, ZIP export, and session controls.
- Edit `stdin.txt` to supply input. **C Compiler: Edit Standard Input** opens it.
- Output appears in the native **C Compiler** terminal. Compiler logs appear in **Output → C Compiler**. Diagnostics populate **Problems** and editor markers.
- Configure `cCompiler.compiler`, `cCompiler.standard`, and `cCompiler.stdinFile` in the original Settings UI.
- C completions include standard functions, snippets, document variables, signatures, hover help, and an outline. This is lightweight browser language support, not a Clang language server.

Run compiles the active C file, falling back to `main.c` when a non-C editor is active. Headers and C helper files are included. Other C files with a `main()` definition run separately. Entry-point detection uses a source pattern rather than a full C parser; keep one entry point for complex macro/conditional-compilation cases.

The browser calls `https://wandbox.org/api/list.json` and `https://wandbox.org/api/compile.json`. Source and stdin are transmitted on Run; `save: false` requests no saved permalink. Public-service availability and limits can change. Cancellation stops the browser waiting; remote execution may still complete.

## Files and session

The first screen creates a local profile. A random token is saved in a SameSite=Lax cookie for seven days, with Secure on HTTPS. **This is local session persistence, not secure account authentication.** No passwords are collected, and no private API credentials are stored in cookies.

Files are stored in a per-profile IndexedDB filesystem through the original VS Code file service. Files autosave after 500 ms. Settings/layout use browser VS Code storage services. Original explorer actions support files, folders, renaming, deletion, and editor groups. ZIP export provides a portable backup. Sign out retains files; sign in with the same local name/email to reopen them.

## Browser capabilities

The interface is the actual Code — OSS workbench. Open VSX offers browser-compatible extensions. Desktop/native extension hosts, arbitrary OS processes, a native C debugger, and local Git executables require a backend; this static app does not provide those services. The browser terminal supports workspace commands (`run`, `ls`, `cat`, `clear`, `help`) and the compiler uses a VS Code pseudoterminal.

## Source and licenses

- [Microsoft workbench source](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/workbench.ts)
- [Browser workbench integration](https://github.com/CodinGame/monaco-vscode-api/blob/main/src/service-override/workbench/classic.ts)
- [Official full-workbench example](https://github.com/CodinGame/monaco-vscode-api/blob/main/demo/src/setup.workbench.classic.ts)
- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)

Redistributed MIT notices are in `public/licenses/`. This is an independent Code — OSS integration, not the proprietary Microsoft VS Code distribution.

## Compiler verification

```sh
node scripts/verify-api.mjs
```

With Node 24, this verifies real C execution, stdin, linking multiple sources/headers, and compiler errors against the public API.
