# Extraspace

App author: [Adobe Choler](https://github.com/mrcholer). Source repository: [mrcholer/extraspace](https://github.com/mrcholer/extraspace).

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

## GCC terminal commands

Both native terminals now accept real GCC builds through the free, keyless Wandbox API:

```sh
gcc main.c -o main
./main
gcc main.c helper.c -std=c17 -Wall -Wextra -O2 -o app && ./app
./app "argument with spaces" < stdin.txt
echo "12 30" | ./app
./app > output.txt
cat output.txt
c main.c
c main.c -- first "second argument"
```

`cc` aliases `gcc`. `c` compiles and runs in one request; `run` chooses the active entry point and helper sources. `gcc` accepts explicit C source lists, `*.c`, `-o`, standard/warning/optimization/debug flags, defines, include paths, libraries and `-pthread`. Unsupported flags fail explicitly. `help` lists commands; `pwd`, `ls`, `cat`, `echo`, `stdin`, `clear`, `&&` and `;` operate on the browser workspace. Only `echo` and `cat` can pipe batch input to a C program. Output redirection writes stdout; diagnostics stay in the terminal and Problems panel. Requests time out after 45 seconds; Ctrl+C cancels waiting.

**Build targets are saved source snapshots and flags, not native executable files.** GCC validates compilation and linking remotely with output directed to `/dev/null`, so a build never executes the user's program. The adapter recognizes only the verified missing-runner response as a successful build; other service responses fail explicitly. `./main` recompiles that snapshot and runs it remotely. Source edits take effect only after rebuilding. Snapshots persist per browser profile when storage is available. They are listed as `[API build]` by `ls`, and cannot overwrite a source file. Separate GCC object/assembly/preprocessor artifacts (`-c`, `-S`, `-E`) and arbitrary OS commands are unavailable. There is no remote persistent shell or downloadable binary.

C/header/include files, compiler flags, runtime arguments and stdin are sent to Wandbox. Input is supplied before execution through `stdin.txt`, `< file`, or an `echo`/`cat` pipe; keystrokes cannot be streamed to an already running C program. Files created by a remote C program are not synced back; terminal stdout redirection creates a local workspace file. The API uses a fresh sandbox per request. See [Wandbox's request handler](https://github.com/melpon/wandbox/blob/develop/feline/src/api_compile_json.rs).

## Files and session

The first screen creates a local profile. A random token is saved in a SameSite=Lax cookie for seven days, with Secure on HTTPS. **This is local session persistence, not secure account authentication.** No passwords are collected, and no private API credentials are stored in cookies.

Files are stored in a per-profile IndexedDB filesystem through the original VS Code file service. Files autosave after 500 ms. Settings/layout use browser VS Code storage services. Original explorer actions support files, folders, renaming, deletion, and editor groups. ZIP export provides a portable backup. Sign out retains files; sign in with the same local name/email to reopen them.

## Browser capabilities

Sidebar widths, terminal/panel dimensions, visibility, editor groups, open tabs and native workbench preferences are saved per Extraspace profile in this browser. Resizing triggers a native state checkpoint; mouse release, focus changes, tab hiding and page exit also save state. Native application/profile/workspace storage uses profile-specific localStorage snapshots so immediate reload does not lose a pending asynchronous write. Settings and files remain in each profile's IndexedDB filesystem. The first profile to upgrade retains the previous shared workbench state; other profiles start separately. An intentionally empty editor stays empty on reload. Storage failures show a warning.

This preserves the frontend-only design. These are browser-local profile preferences, not cloud account sync across devices. Validate reload and profile isolation with `node --experimental-transform-types scripts/verify-layout.mjs` and browser resizing checks.

Use **Accounts → Change Avatar** or **Manage Extraspace Profile** to upload, replace, or remove your avatar. PNG, JPEG, and WebP images up to 2 MB are cropped to 96×96 and stored per browser profile. Images are not uploaded to a server.

The hosted site uses **Sites access policies** to restrict visitors. Approved users authenticate through the hosting provider. Configure the allowlist in site sharing settings or through the assistant; browser profile names and cookies do not grant site access. A custom email/password authentication service is not implemented by this frontend-only app.

Extension search uses the compatible textarea input mode. Public Open VSX asset requests omit VS Code's marketplace/client headers, because its CDN does not allow those headers in browser CORS preflights. Other requests retain their original headers. Extension installation remains restricted to browser-compatible extensions.

The interface is the actual Code — OSS workbench. Open VSX offers browser-compatible extensions. Desktop/native extension hosts, arbitrary OS processes, a native C debugger, and local Git executables require a backend; this static app does not provide those services. The browser terminal supports GCC/API build commands and workspace commands, and the compiler uses a VS Code pseudoterminal.

Both the workspace and C Compiler terminals accept keyboard input, paste, Enter, Backspace, Ctrl+U, Ctrl+L, and Ctrl+C. Type `help` to see commands. `stdin 12 30` saves program input; `run` compiles with that input. Wandbox accepts stdin before execution, so live input into an already running program is unavailable; use `stdin.txt` for multiline input. Browser terminal process IDs are nonzero logical identifiers so VS Code dispatches typed characters immediately.

## Source and licenses

- [Microsoft workbench source](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/browser/workbench.ts)
- [Browser workbench integration](https://github.com/CodinGame/monaco-vscode-api/blob/main/src/service-override/workbench/classic.ts)
- [Official full-workbench example](https://github.com/CodinGame/monaco-vscode-api/blob/main/demo/src/setup.workbench.classic.ts)
- [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports)

Redistributed MIT notices are in `public/licenses/`. This is an independent Code — OSS integration, not the proprietary Microsoft VS Code distribution.

## Compiler verification

```sh
node scripts/verify-api.mjs
node scripts/verify-terminal.mjs
node scripts/verify-gcc.mjs
```

With Node 24, this verifies real C execution, stdin, linking multiple sources/headers, and compiler errors against the public API.
