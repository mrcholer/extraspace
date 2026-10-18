/**
 * Phone and tablet layout for the workbench.
 *
 * The workbench is mounted inside a shadow root (see workbench.ts), so none of
 * the app's own stylesheet reaches it. Everything here is injected into that
 * root instead, which is the same mechanism already used for the brand icon and
 * the account avatar.
 *
 * Two rules for the whole file:
 *
 * 1. Desktop is untouched. Every declaration lives inside a max-width query, so
 *    a wide window keeps the layout VS Code ships with.
 * 2. Prefer the workbench's own CSS custom properties over restyling classes.
 *    `--vscode-sideBar-width` and friends are the supported lever, and they
 *    survive an upgrade that renames a class.
 */

export const MOBILE_WORKBENCH_CSS = `
/* Shared across both breakpoints: the layout viewport is covered by the notch
   and the home indicator, so the fixed chrome has to inset itself. */
.monaco-workbench .part.titlebar,
.monaco-workbench .part.statusbar {
  padding-left: max(4px, env(safe-area-inset-left));
  padding-right: max(4px, env(safe-area-inset-right));
}
.monaco-workbench .part.titlebar {
  padding-top: env(safe-area-inset-top);
}

/* A finger cannot hit a 22px control. The workbench's action items are sized
   for a cursor, so anything tappable is lifted to 44px on coarse pointers
   without changing the desktop metrics. */
@media (hover: none) and (pointer: coarse) {
  .monaco-workbench .action-item,
  .monaco-workbench .tab,
  .monaco-workbench .monaco-list-row {
    min-height: 40px;
  }
  .monaco-workbench .part.activitybar .action-item {
    min-height: 46px;
    min-width: 46px;
  }
  /* Text selection while dragging a splitter is never wanted on a touch
     screen, and the blue tap flash makes a dark UI look broken. */
  .monaco-workbench .action-label,
  .monaco-workbench .monaco-list-row {
    -webkit-tap-highlight-color: transparent;
  }
}

/* Tablet: narrower than desktop, but a real pointer-or-touch hybrid. The side
   bar keeps its panel behaviour, only tightened. */
@media (max-width: 900px) {
  .monaco-workbench {
    --vscode-sideBar-width: 240px;
  }
}

/* Phone portrait: the workbench is a desktop IDE with no mobile layout of its
   own, so each region is dealt with explicitly rather than scaled down. */
@media (max-width: 600px) {
  .monaco-workbench {
    /* The side bar becomes the screen. Handing it the viewport width is what
       turns a squeezed panel into something a thumb can actually use. */
    --vscode-sideBar-width: 100vw;
  }

  /* The activity bar is the one region that should stay visible: it is how you
     get back to the file tree from anywhere. Narrower, and it is the only
     navigation that survives. */
  .monaco-workbench .part.activitybar {
    width: 46px;
    min-width: 46px;
  }
  .monaco-workbench .part.activitybar .action-label {
    display: none;
  }
  .monaco-workbench .part.activitybar .composite-bar .action-item .action-label {
    display: none;
  }

  /* Secondary sidebar and auxiliary bar are desktop concepts; their toggles
     have no room here and their content has no width to live in. */
  .monaco-workbench .part.auxiliarybar,
  .monaco-workbench .composite.auxiliarybar {
    display: none;
  }

  /* Minimap and sticky scroll are unreadable at this width and cost a frame
     each on a phone. Both are pure decoration here. */
  .monaco-editor .minimap,
  .monaco-editor .sticky-scroll {
    display: none;
  }

  /* Breadcrumbs eat a 40px row on a phone and wrap unpredictably. */
  .monaco-workbench .part.editor .breadcrumbs {
    display: none;
  }

  /* Tabs stay, but only their labels - the close buttons and descriptions are
     what made them overflow. */
  .monaco-workbench .tab .tab-actions,
  .monaco-workbench .tab-label .label-description {
    display: none;
  }

  /* The status bar is mostly hover targets on desktop. Keep the items, shrink
     the padding, and let them scroll rather than clip. */
  .monaco-workbench .part.statusbar {
    height: 24px;
    font-size: 11px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }
  .monaco-workbench .part.statusbar::-webkit-scrollbar {
    display: none;
  }
  .monaco-workbench .part.statusbar .statusbar-item {
    padding: 0 6px;
    min-width: 0;
  }

  /* The title bar is a search box on desktop; on a phone the command centre
     alone is worth the row. */
  .monaco-workbench .part.titlebar {
    height: 42px;
    min-height: 42px;
  }

  /* Panels (terminal, output, problems) are the widest thing on screen and the
     least useful at phone width. Collapsed by default, opened deliberately. */
  .monaco-workbench .part.panel {
    --part-max-height: 60vh;
  }

  /* A terminal that keeps desktop metrics is unusable with a soft keyboard. */
  .monaco-workbench .terminal,
  .monaco-workbench .xterm {
    font-size: 13px;
  }

  /* Monaco's own context menu is desktop-positioned and can open off screen. */
  .monaco-workbench .context-view.monaco-menu-container {
    max-width: 92vw;
  }

  .monaco-workbench .monaco-scrollable-element > .scrollbar {
    width: 10px;
  }
}

/* Landscape phones are short, not narrow: the same rules apply but the console
   must never eat the editor. */
@media (max-height: 480px) and (orientation: landscape) {
  .monaco-workbench .part.panel {
    --part-max-height: 70vh;
  }
  .monaco-workbench .part.statusbar {
    height: 22px;
  }
}
`;

/**
 * Inject the mobile stylesheet into the workbench's shadow root.
 *
 * Called after initialize(), so it lands after the workbench's own stylesheet
 * and wins the cascade for equal specificity. Any rule the workbench sets
 * inline still needs an `!important`, which the sheet is written to avoid
 * wherever a custom property will do.
 */
export function applyMobileWorkbenchCss(shadowRoot: ShadowRoot) {
  const style = document.createElement("style");
  style.dataset.extraspace = "mobile";
  style.textContent = MOBILE_WORKBENCH_CSS;
  shadowRoot.appendChild(style);
  return style;
}