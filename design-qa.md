# Liquid Glass Design QA

## Comparison target

- Source visual truth: OpenDesign project `relay-cache-apple-liquid-glass-codex-official-v1`.
- Source captures: `/path/to/local-captures/relay-od-source-390x844.png` and `/path/to/local-captures/relay-od-source-1280x720.png`.
- Rendered implementation: production build served locally from `dist` and tested with ego-lite.
- Implementation captures: `/path/to/local-captures/relay-liquid-production-mobile-light-final.png` and `/path/to/local-captures/relay-liquid-production-desktop-novice-light-final.png`.
- Focused captures: `/path/to/local-captures/relay-liquid-production-eye-hidden-light-final.png`, `/path/to/local-captures/relay-liquid-production-manual-disclosure-light.png`, and `/path/to/local-captures/relay-liquid-production-mobile-dark.png`.

## Normalization

- Mobile comparison: both images are 390 x 844 pixels, CSS viewport 390 x 844, device scale factor 1.
- Desktop comparison: both images are 1280 x 720 pixels, CSS viewport 1280 x 720, device scale factor 1.
- State: light theme, novice mode, single-station calculation, initial/empty result state.
- No browser chrome or device frame is included.

## Full-view comparison

The implementation retains the source composition: heavy floating header, one compact two-row mode island, quiet explanatory line, large cost-comparison heading, rounded content material, and a separate results surface. The production screen intentionally contains the real progress rail and complete station-reading form instead of the prototype's explanatory placeholder panel.

The 390 px implementation preserves the source hierarchy and card start position. The 1280 px implementation keeps the same two-column balance while allowing the production result empty state to remain visible. No horizontal overflow is present at 375, 390, 768, 1280, or 1440 px, and the results column uses the shared page scroll rather than an independent scroll container.

## Focused comparison

- API Key eye: 44 x 44 px hit target, transparent background, zero border and shadow in light mode, visually contained inside the input. Clearing the value restores `type=password` and the `显示 API Key` label.
- Theme chooser: three icon-only states remain available and mutually exclusive: day, night, and follow system.
- Manual fallback: `自动读取缺失时手动补充` is a 64 px-high disclosure with a visible boundary, supporting text, chevron, and grouped inset fields.
- Dark mode: navy background, muted specular highlights, readable buttons and body copy, without pure-white glare.
- Images/assets: the target has no photographic or illustrative assets. Existing iconography is consistent and sharp at device scale factor 1.

## Required fidelity surfaces

- Fonts and typography: system/PingFang stack, matching display/body hierarchy, stable Chinese wrapping, and readable compact labels.
- Spacing and layout rhythm: source-aligned top controls, card radii, grouped fields, and consistent 44 px minimum controls; the real progress rail was moved into the connection card to remove excess vertical drift.
- Colors and tokens: pale cyan/indigo light environment and deep navy dark environment; teal is reserved for active controls and key results.
- Image quality and asset fidelity: no raster assets are required; icons render cleanly without placeholder artwork.
- Copy and content: production copy reflects actual New API/Sub2API/One API behavior and the browser-only API Key path rather than prototype-only claims.
- Interaction/accessibility: semantic radios, visible labels, keyboard-compatible controls, three-state theme behavior, and no console exceptions in the tested states.

## Comparison history

1. P1: the light-theme eye control rendered as a separate white tail. Fixed by using one transparent 44 px overlay button inside the input, with hover/focus feedback confined to a circular pseudo-layer. Post-fix evidence: `/path/to/local-captures/relay-liquid-production-eye-hidden-light-final.png`.
2. P2: the fixed exchange rate looked like an editable field and occupied a separate column. Fixed by removing the input entirely and placing the fixed `1 USD = ¥7.20` explanation under the budget field.
3. P2: the novice progress rail sat outside the first card and pushed production content below the OpenDesign target. Fixed by moving the rail into the single- and multi-station setup cards. Post-fix evidence: the final 390 x 844 and 1280 x 720 implementation captures above.
4. P2: the manual fallback read like plain text. Fixed with a bounded disclosure surface, clear title/subtitle, chevron, and inset grouped fields. Post-fix evidence: `/path/to/local-captures/relay-liquid-production-manual-disclosure-light.png`.

## Verification

- ego-lite production-build rendering at 375, 390, 768, 1280, and 1440 px: no horizontal overflow.
- ego-lite screenshot capture: viewport-level CDP path completed in 132 ms, replacing the slow full-page capture path.
- ego-lite key flow: the inspect request contained only `baseUrl`; the API Key went only to the target station log endpoint, was cleared afterward, was not found in browser storage, and produced the expected `¥23.0727` fixture result with a 25% cache rate.
- Vitest: 12 files, 96 tests passed.
- Production build: passed.

## Remaining differences

The implementation keeps production-only progress, capability, fallback, and security content that the OpenDesign prototype does not model. These are intentional product constraints, not unresolved visual defects. No actionable P0, P1, or P2 findings remain.

final result: passed
