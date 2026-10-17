/** Import from an approved Playwright journey after reaching its synthetic state.
 * No browser launch, authentication changes, app mutation or screenshot capture.
 */
export async function measureLayout(page, { root = "body", tolerancePx = 1, minTargetPx = 44, allowOverflow = [], allowTruncation = [], allowSmallTargets = [] } = {}) {
  if (typeof root !== "string" || !root || !Number.isFinite(tolerancePx) || tolerancePx < 0 || tolerancePx > 10
    || !Number.isFinite(minTargetPx) || minTargetPx < 1 || ![allowOverflow, allowTruncation, allowSmallTargets].every((items) => Array.isArray(items) && items.every((item) => typeof item === "string" && item))) throw new Error("invalid-layout-policy");
  return page.evaluate(({ root, tolerancePx, minTargetPx, allowOverflow, allowTruncation, allowSmallTargets }) => {
    const container = document.querySelector(root);
    if (!container) throw new Error("design root not found");
    const elements = [container, ...container.querySelectorAll("*")];
    if (elements.length > 10000) throw new Error("design measurement scope too large");
    const overflow = [];
    const truncation = [];
    const smallTargets = [];
    const permitted = (element, selectors) => selectors.some((selector) => element.matches(selector));
    elements.forEach((element, index) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!box.width || !box.height || style.visibility === "hidden" || style.display === "none") return;
      const id = `${element.tagName.toLowerCase()}[${index}]`;
      const excessX = element.scrollWidth - element.clientWidth;
      const excessY = element.scrollHeight - element.clientHeight;
      const tooWide = element.clientWidth > 0 && excessX > tolerancePx;
      const tooTall = element.clientHeight > 0 && excessY > tolerancePx && ["hidden", "clip"].includes(style.overflowY);
      const intendedTruncation = tooWide && style.textOverflow === "ellipsis" && permitted(element, allowTruncation);
      if (((tooWide && !intendedTruncation) || tooTall) && !permitted(element, allowOverflow)) overflow.push({ id, excessX, excessY, overflowX: style.overflowX, overflowY: style.overflowY });
      if (tooWide && style.textOverflow === "ellipsis" && !intendedTruncation) truncation.push({ id, excessX });
      if (element.matches("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=radio]")
        && !element.disabled && !permitted(element, allowSmallTargets) && (box.width < minTargetPx || box.height < minTargetPx)) smallTargets.push({ id, width: box.width, height: box.height });
    });
    return {
      schemaVersion: 1,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      contentWidth: container.getBoundingClientRect().width,
      measuredElements: elements.length,
      overflow, truncation, smallTargets,
      pass: !overflow.length && !truncation.length && !smallTargets.length,
      scope: "layout and configured target-size diagnostics only; contrast, keyboard, zoom, data and interaction proof remain separate"
    };
  }, { root, tolerancePx, minTargetPx, allowOverflow, allowTruncation, allowSmallTargets });
}
