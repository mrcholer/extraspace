/**
 * On-screen keyboard handling for the pages outside the workbench.
 *
 * iOS shrinks the visual viewport when the keyboard opens but leaves the
 * layout viewport alone, and then scrolls the page under it. A full-height
 * shell therefore leaves the field being typed underneath the keyboard with no
 * way to scroll it into view.
 *
 * Publishing the hidden height as a custom property lets the stylesheet cap
 * the app to what is actually visible:
 *
 *     max-height: calc(100dvh - var(--cs-kb, 0px));
 *
 * Nothing to do where there is no keyboard. Browsers that report a full-size
 * visual viewport publish 0px and the rule collapses to `100dvh`, which is
 * what it already was.
 */
export function watchVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};

  let frame = 0;
  const publish = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const hidden = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      document.documentElement.style.setProperty(
        "--cs-kb",
        `${Math.round(hidden)}px`,
      );
    });
  };

  publish();
  viewport.addEventListener("resize", publish);
  viewport.addEventListener("scroll", publish);

  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", publish);
    viewport.removeEventListener("scroll", publish);
    document.documentElement.style.removeProperty("--cs-kb");
  };
}