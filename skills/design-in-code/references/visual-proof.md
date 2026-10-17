# Before a UI card or PR

Show the current product state first. Capture it from the app or Storybook with
synthetic data, at the width being discussed. Label it Today. If a fixture is
missing, name the blocker and show the nearest real state. Do not substitute a
mockup without saying so.

Render alternatives from the same real component package, provider, tokens,
fonts and stylesheet as the product. For states that already exist, prefer
captures of the running app. A static preview is useful for layout proposals,
but [React's static renderer](https://react.dev/reference/react-dom/server/renderToStaticMarkup)
does not produce an interactive application. Test open/closed and focus states
in the running product when those interactions matter.

## Measurement and inspection

Start with the six configurable widths in the visual policy. Use the real
content area with the sidebar open, not just a bare 1280 px card. Add other
sidebar states when the view supports them. Assert each fixture before measuring.

- Measure `scrollWidth - clientWidth`, clipped height, ellipsis and control
  bounds. A four-pixel overrun matters. Inspect the screenshots as well.
- Use long labels, large values, realistic lists and the affected empty,
  loading, error and refusal states. Missing states are blockers, not passes.
- Check keyboard order, focus visibility, dismissal, errors and every changed
  action against its backend and permission map.
- Test actual 200% browser zoom. Scaling a preview with CSS or changing device
  pixel ratio is not that test.
- Verify computed foreground/background contrast. The common 4.5:1 threshold
  has large-text and other exceptions; follow the applicable
  [contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- The default 44 px target policy is configurable. It corresponds to the
  [enhanced target-size criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html),
  which has exceptions and is not a blanket AA requirement. Record narrow,
  owned exceptions instead of suppressing every small link.

The supplied measurement helper is diagnostic. It does not traverse shadow
DOM or cross-origin frames, resolve occlusion, validate all inline text,
calculate contrast or exercise keyboard/zoom. Add project-owned tests for these
and keep their evidence separate. Never mark the complete visual gate passed
because a static renderer or one layout sample returned success.

## Decision presentation

Put Today, then the alternatives, above the option controls. Never place a
rendered button or input inside a choice button. Use isolated frames or image
captures to avoid application CSS affecting the decision UI. Scale only the
presentation, not the measured source. Include the original render width.

The starting budgets are 40 KiB for a Today JPEG and 150 KiB per card set.
Measure actual bytes and retain needed detail. If the capture cannot fit,
crop the affected region, split the set or link a full-resolution artifact;
do not hide unreadable text behind a claimed budget pass. These budgets belong
to the project policy, not a universal design rule.

Policy, money and permission choices can remain text-only when appearance is
irrelevant. Use the repository's decision interface if present; this kit does
not require a particular widget or design vendor.
