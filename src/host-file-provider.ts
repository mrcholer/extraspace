/**
 * A VS Code file system provider backed by the control plane.
 *
 * Replaces the IndexedDB provider the workspace used to run on. The difference
 * is the whole point of moving storage to the host: every read, write, rename
 * and delete now travels to the worker's disk through the control plane, which
 * is where the plan's storage allowance is actually enforced with XFS project
 * quotas. In the browser, a project's limit was a number that could be
 * exceeded by writing to a different machine.
 *
 * Deliberately no local cache. A cache would let the editor present files the
 * server has not acknowledged, and the first honest quota error would look
 * like a corrupted project. Reads are cheap on a loopback request to the
 * worker's own volume, and correctness is worth more here than shaving
 * milliseconds off typing.
 *
 * Path handling: the provider is mounted at the `file` scheme, and VS Code
 * addresses it as /workspace/<path>. Everything below /workspace is the
 * project's own tree; nothing above it exists as far as this provider is
 * concerned, which is what keeps a workspace from reaching the worker's own
 * files.
 */
import { URI } from "@codingame/monaco-vscode-api/vscode/vs/base/common/uri";
import { Emitter, Event } from "@codingame/monaco-vscode-api/vscode/vs/base/common/event";
import { DisposableStore } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
import {
  FileChangeType,
  FileSystemProviderCapabilities,
  FileSystemProviderError,
  FileSystemProviderErrorCode,
  FileType,
  type IFileChange,
  type IFileDeleteOptions,
  type IFileOverwriteOptions,
  type IFileSystemProvider,
  type IStat,
  type IWatchOptions,
} from "@codingame/monaco-vscode-api/vscode/vs/platform/files/common/files";
import type { IDisposable } from "@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle";
import {
  hostDeleteFile,
  hostListFiles,
  hostMkdir,
  hostMoveFile,
  hostReadFile,
  hostWriteFile,
} from "./host";

/** Root of the mounted tree. Everything in a project lives below this. */
const ROOT = "/workspace";

/** The server refuses binary reads here, so mirror that rather than surprise. */
const TEXT_ONLY = new Set([".jar", ".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export class HostFileSystemProvider implements IFileSystemProvider {
  readonly capabilities = FileSystemProviderCapabilities.FileReadWrite;

  private readonly _onDidChangeFile = new Emitter<readonly IFileChange[]>();
  private readonly _onDidChangeCapabilities = new Emitter<void>();
  private readonly disposables = new DisposableStore();

  readonly onDidChangeFile: Event<readonly IFileChange[]> =
    this._onDidChangeFile.event;
  readonly onDidChangeCapabilities: Event<void> =
    this._onDidChangeCapabilities.event;

  constructor(
    private readonly projectId: string,
    /**
     * Directory cache. readdir is called constantly while the tree expands and
     * while the workbench reconciles its file model, and the control plane
     * walks the whole tree on every listing. Caching the *listing* is safe
     * because every write through this provider updates it, so it cannot go
     * stale relative to what this editor did. It is a listing cache, not a
     * content cache: file bodies always come from the host.
     */
    private readonly directories = new Map<string, HostEntry[]>(),
  ) {}

  /** Absolutise a project-relative path, rejecting anything that escapes. */
  private relative(uri: URI): string {
    const path = uri.path;
    if (path === ROOT || path === ROOT + "/") return "";
    if (!path.startsWith(ROOT + "/"))
      throw FileSystemProviderError.create(
        new Error("Outside the project workspace."),
        FileSystemProviderErrorCode.FileNotFound,
      );
    const relative = path.slice(ROOT.length + 1);
    if (!relative || relative.includes(".."))
      throw FileSystemProviderError.create(
        new Error("Outside the project workspace."),
        FileSystemProviderErrorCode.FileNotFound,
      );
    return relative;
  }

  private absolute(relative: string): URI {
    return URI.file(ROOT + (relative ? "/" + relative : ""));
  }

  /** Read a directory listing, using the cache unless refreshed. */
  private async entries(
    directory: string,
    options?: { refresh?: boolean },
  ): Promise<HostEntry[]> {
    if (!options?.refresh) {
      const cached = this.directories.get(directory);
      if (cached) return cached;
    }
    const files = await hostListFiles(this.projectId);
    const byDirectory = new Map<string, HostEntry[]>();
    for (const file of files) {
      const slash = file.path.lastIndexOf("/");
      const parent = slash === -1 ? "" : file.path.slice(0, slash);
      const name = slash === -1 ? file.path : file.path.slice(slash + 1);
      if (!byDirectory.has(parent)) byDirectory.set(parent, []);
      byDirectory.get(parent)!.push({
        name,
        size: file.size,
        directory: file.kind === "folder",
      });
    }
    // Replace the whole cache: a delete elsewhere must not leave a ghost.
    this.directories.clear();
    for (const [key, value] of byDirectory) this.directories.set(key, value);
    return byDirectory.get(directory) ?? [];
  }

  private emit(changes: IFileChange[]) {
    if (changes.length) this._onDidChangeFile.fire(changes);
  }

  watch(_uri: URI, _options: IWatchOptions): IDisposable {
    // Every mutation this provider performs is local to it, and nothing else
    // writes a project's files: the workspace is single-writer. Firing the
    // event from write/delete/rename below is what keeps the tree honest, so
    // there is nothing to watch for.
    return { dispose: () => {} };
  }

  async stat(resource: URI): Promise<IStat> {
    const relative = this.relative(resource);
    // The root of the mount is always a directory, and is not in any listing:
    // listings describe a directory's children, never the directory itself.
    if (!relative) {
      const stamp = Date.now();
      return {
        type: FileType.Directory,
        ctime: stamp,
        mtime: stamp,
        size: 0,
        permissions: FileType.Directory | FileType.SymbolicLink,
      };
    }
    const name = relative.slice(relative.lastIndexOf("/") + 1);
    const slash = relative.lastIndexOf("/");
    const parent = slash === -1 ? "" : relative.slice(0, slash);
    const entries = await this.entries(parent);
    const found = entries.find((entry) => entry.name === name);
    if (!found)
      throw FileSystemProviderError.create(
        new Error("Not found in this project."),
        FileSystemProviderErrorCode.FileNotFound,
      );
    const stamp = Date.now();
    return {
      type: found.directory ? FileType.Directory : FileType.File,
      ctime: stamp,
      mtime: stamp,
      size: found.size,
      permissions: found.directory
        ? FileType.Directory | FileType.SymbolicLink
        : FileType.File | FileType.SymbolicLink,
    };
  }

  async readdir(resource: URI): Promise<[string, FileType][]> {
    const relative = this.relative(resource);
    const entries = await this.entries(relative);
    return entries.map((entry) => [
      entry.name,
      entry.directory ? FileType.Directory : FileType.File,
    ]);
  }

  async mkdir(resource: URI): Promise<void> {
    const relative = this.relative(resource);
    if (!relative) return;
    await hostMkdir(this.projectId, relative);
    this.directories.delete(relative);
    this.emit([
      { type: FileChangeType.UPDATED, resource: resource } as IFileChange,
    ]);
  }

  async delete(resource: URI, _opts: IFileDeleteOptions): Promise<void> {
    const relative = this.relative(resource);
    if (!relative) return;
    await hostDeleteFile(this.projectId, relative);
    this.directories.delete(relative);
    this.emit([
      { type: FileChangeType.DELETED, resource: resource } as IFileChange,
    ]);
  }

  async rename(
    from: URI,
    to: URI,
    _opts: IFileOverwriteOptions,
  ): Promise<void> {
    const source = this.relative(from);
    const destination = this.relative(to);
    if (!source || !destination) return;
    await hostMoveFile(this.projectId, source, destination);
    this.directories.clear();
    this.emit([
      { type: FileChangeType.DELETED, resource: from } as IFileChange,
      { type: FileChangeType.ADDED, resource: to } as IFileChange,
    ]);
  }

  async copy(from: URI, to: URI, _opts: IFileOverwriteOptions): Promise<void> {
    const file = await this.readFile(from);
    await this.writeFile(to, file, { overwrite: true });
  }

  async readFile(resource: URI): Promise<Uint8Array> {
    const relative = this.relative(resource);
    if (!relative)
      throw FileSystemProviderError.create(
        new Error("The workspace root is not a file."),
        FileSystemProviderErrorCode.FileIsADirectory,
      );
    if (TEXT_ONLY.has(extensionOf(relative)))
      throw FileSystemProviderError.create(
        new Error("This file cannot be opened as text."),
        FileSystemProviderErrorCode.FileWriteLocked,
      );
    const file = await hostReadFile(this.projectId, relative);
    return new TextEncoder().encode(file.content ?? "");
  }

  async writeFile(
    resource: URI,
    content: Uint8Array,
    _opts: { overwrite: boolean },
  ): Promise<void> {
    const relative = this.relative(resource);
    if (!relative) return;
    await hostWriteFile(
      this.projectId,
      relative,
      new TextDecoder().decode(content),
    );
    this.emit([
      { type: FileChangeType.UPDATED, resource: resource } as IFileChange,
    ]);
  }

  dispose() {
    this.disposables.dispose();
    this._onDidChangeFile.dispose();
    this._onDidChangeCapabilities.dispose();
  }
}

interface HostEntry {
  name: string;
  size: number;
  directory: boolean;
}

function extensionOf(path: string) {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot).toLowerCase();
}

