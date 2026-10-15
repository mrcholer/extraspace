import type { IStorageDatabase, IUpdateRequest } from '@codingame/monaco-vscode-api/vscode/vs/base/parts/storage/common/storage';

/** Native VS Code state, isolated by Extraspace profile. The map is shared with
 * VS Code's Storage cache so a synchronous checkpoint can survive page reload. */
export class ProfileStateDatabase implements IStorageDatabase {
  readonly onDidChangeItemsExternal = () => ({ dispose() {} });
  private items = new Map<string, string>();
  private ready?: Promise<Map<string, string>>;
  private loaded = false;
  private previous: string | null;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private key: string, private legacy?: () => Promise<Map<string, string>>) {
    this.previous = storage.getItem(key);
  }
  getItems() {
    return this.ready ??= this.load();
  }
  private async load() {
    if (this.previous !== null) {
      const entries: unknown = JSON.parse(this.previous);
      if (!Array.isArray(entries) || !entries.every(item => Array.isArray(item) && item.length === 2 && item.every(v => typeof v === 'string'))) throw new Error('Saved workspace state is invalid.');
      this.items = new Map(entries);
    } else if (this.legacy) this.items = new Map(await this.legacy());
    this.loaded = true; return this.items;
  }
  checkpoint() {
    if (!this.loaded) return;
    const next = JSON.stringify([...this.items]);
    if (next !== this.previous) { this.storage.setItem(this.key, next); this.previous = next; }
  }
  async updateItems(_request: IUpdateRequest) {
    await this.getItems();
    // Native Storage already changed this shared cache before queuing its DB
    // request. Reapplying a delayed request could overwrite a more recent resize.
    this.checkpoint();
  }
  async optimize() { this.checkpoint(); }
  async close() { this.checkpoint(); }
}

export class ProfileState {
  private databases = new Map<string, ProfileStateDatabase>();
  private migrateLegacy: boolean;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>, private namespace: string) {
    // Old versions used one global workbench state. Preserve it for the first
    // profile that upgrades, without copying another profile's state on sign-in.
    const claim = 'extraspace.workbench-state.legacy-owner';
    const owner = storage.getItem(claim);
    this.migrateLegacy = owner === null || owner === namespace;
    if (owner === null) storage.setItem(claim, namespace);
  }
  database(scope: string, legacy?: () => Promise<Map<string, string>>) {
    let database = this.databases.get(scope);
    if (!database) {
      database = new ProfileStateDatabase(this.storage, `${this.namespace}.workbench-state-v1.${scope}`, this.migrateLegacy ? legacy : undefined);
      this.databases.set(scope, database);
    }
    return database;
  }
  checkpoint() { for (const db of this.databases.values()) db.checkpoint(); }
}
