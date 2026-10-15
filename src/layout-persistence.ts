import { getService } from '@codingame/monaco-vscode-api';
import { StorageScope, WillSaveStateReason } from '@codingame/monaco-vscode-api/vscode/vs/platform/storage/common/storage';
import { IStorageService } from '@codingame/monaco-vscode-api/vscode/vs/platform/storage/common/storage.service';
import { IWorkbenchLayoutService } from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/layout/browser/layoutService.service';
import { Parts } from '@codingame/monaco-vscode-api/vscode/vs/workbench/services/layout/browser/layoutService';
import type { ProfileState } from './profile-state';
import { DisposableStore } from '@codingame/monaco-vscode-api/vscode/vs/base/common/lifecycle';

export async function persistWorkbenchLayout(root: HTMLElement, state: ProfileState, reportError: () => void) {
  const storage = await getService(IStorageService);
  const layout = await getService(IWorkbenchLayoutService);
  await layout.whenRestored;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false, warned = false;
  const fail = () => { if (!warned) { warned = true; reportError(); } };
  const checkpoint = () => { try { state.checkpoint(); } catch { fail(); } };
  const save = (reason = WillSaveStateReason.NONE) => {
    clearTimeout(timer);
    if (saving) return;
    saving = true;
    // flush synchronously emits onWillSaveState. VS Code captures panel sizes,
    // editor groups, open tabs and view state before any asynchronous DB work.
    void storage.flush(reason).catch(fail);
    checkpoint(); saving = false;
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => save(), 150); };
  const disposables = new DisposableStore();
  for (const scope of [StorageScope.APPLICATION, StorageScope.PROFILE, StorageScope.WORKSPACE]) storage.onDidChangeValue(scope, undefined, disposables)(checkpoint);
  const observer = new ResizeObserver(schedule);
  for (const part of [Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART, Parts.EDITOR_PART]) {
    const element = layout.getContainer(window, part); if (element) observer.observe(element);
  }
  layout.onDidChangePartVisibility(schedule);
  layout.onDidChangePanelPosition(schedule);
  layout.onDidChangePanelAlignment(schedule);
  // A sash uses mouse/pointer input; native part resize doesn't necessarily emit
  // onDidLayoutMainContainer. Save after release, and before an immediate reload.
  const afterInteraction = () => { queueMicrotask(() => save()); };
  root.addEventListener('pointerup', afterInteraction, true);
  root.addEventListener('mouseup', afterInteraction, true);
  root.addEventListener('keyup', schedule, true);
  root.addEventListener('focusout', schedule, true);
  const leaving = () => save(WillSaveStateReason.SHUTDOWN);
  window.addEventListener('beforeunload', leaving);
  window.addEventListener('pagehide', leaving);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leaving(); });
  save();
}
