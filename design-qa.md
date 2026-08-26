# OpenDesign Liquid Glass Design QA

## Visual source of truth

- OpenDesign project: `relay-cache-apple-liquid-glass-codex-official-v1`.
- Source and implementation captures are generated locally during visual QA and are intentionally not committed.
- Every visual comparison used the same mode, theme, state, and CSS viewport for the source and implementation.

## Fidelity result

- Desktop shell matches the source geometry: header `50,18,1180x68`; control island `354,100,572x62`; two-column workspace begins at `y=211`; novice primary card is `666x370`; result HUD is `482x253` in its empty state.
- Mobile shell matches the 390 x 844 source composition: header `10,10,370x118.5`; control dock `10,142.5,370x143.5`; page heading starts at `y=308`; persistent bottom HUD is `10,758,370x76`.
- Novice mode now uses the approved `01 · 安全读取边界` introduction, separate `02 · 站点连接` section, persistent result HUD, and separate read-boundary note.
- Simple mode uses the approved model / budget / exchange row, four-price snapshot, station section, and source-aligned result HUD.
- Advanced mode no longer uses the former stacked wizard. It reuses the approved shared price panel, exposes complete price and exact-usage controls in the same workspace, then renders station parameters below it.
- Heavy Glass hierarchy is preserved on the header, control island, result HUD, and mobile summary; content cards remain non-backdrop content material.
- Dark mode uses opaque navy inset surfaces for controls and notes; no pale light-mode panel leaks into the dark theme.

## Browser QA (ego-lite)

- 375 x 812, 390 x 844, 768 x 1024, 1280 x 700, and 1440 x 900: horizontal overflow `0`.
- Results column at every tested viewport: `position: static`, `overflow: visible`; no independent left/right scrolling.
- 390 px toolbar matches source order and sizing: three-theme control, reset, and a 44 px copy icon button.
- Theme control exposes and preserves all three states: light, dark, and system.
- Same-row control-top delta is `0px` for both simple and advanced shared fields.
- API Key reveal control is 44 x 44 and vertically aligned with the key input in light mode.
- `prefers-reduced-transparency: reduce` removes backdrop filters; reduced motion removes visual morph transitions.
- Browser event queue reported no console errors or runtime exceptions during the mode/theme/responsive pass.
- Viewport screenshot calls completed normally after reusing one ego-lite task space and avoiding full-page captures of the long calculator document.

## Automated verification

- Production build: passed.
- Vitest: 12 files / 104 tests passed.
- Business calculation types, formulas, API response types, browser-only API Key path, and state isolation were not changed.

## Intentional production-only additions

- The production UI retains real model/provider provenance, complete calculator controls, inspection capability details, validation messages, and local-data settings below the OpenDesign-aligned primary composition.
- The OpenDesign demo's simulated success/toast states are not copied as fake production behavior.

final result: passed
