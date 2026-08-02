# Design QA — OpinaCraft

## Comparison target

- Source visual truth: `C:\Users\carlo\Desktop\image.png`.
- Implementation: `http://127.0.0.1:3000/servers`.
- Implementation screenshot: `C:\Users\carlo\.codex\visualizations\2026\08\02\019fc2e0-197b-7ab0-b205-d12451a52ee3\opinacraft-centered-desktop-1440.png`.
- Combined comparison: `C:\Users\carlo\.codex\visualizations\2026\08\02\019fc2e0-197b-7ab0-b205-d12451a52ee3\opinacraft-reference-comparison.png`.
- State: authenticated catalog, default filters, desktop light theme.

## Normalization

- Source image: 1200 × 1500 px at 1x. The mockup-only grid was excluded; the product frame was cropped from `(55, 364)` at 1090 × 775 px and normalized to 1180 × 839 px.
- Implementation viewport: 1440 × 900 CSS px at device scale factor 1. The browser screenshot is 1425 × 891 px because the native scrollbar occupies the remaining viewport area.
- Implementation frame: cropped from `(123, 0)` at 1180 × 891 px.
- Combined evidence: both normalized frames are presented together at native comparison scale in a 2384 × 891 px image.

## Fidelity review

- Fonts and typography: Manrope preserves the reference's modern geometric sans character. Page title, labels, table metadata and tabular values have distinct weights and compact line heights; no clipping or broken wrapping was observed.
- Spacing and layout: navbar and main content share the same 1180 px frame. At the 1425 px client width both have exactly 123 px left and right margins. Card radii, 16 px section rhythm and compact table rows reflect the reference density.
- Colors and tokens: warm `#F6F7F6` workspace, white surfaces, low-opacity borders and emerald green actions/active states match the source hierarchy. Semantic latency, status and warning colors remain differentiated.
- Image quality and assets: real server logos and the existing OpinaCraft brand asset are used. Interface icons come from the installed Tabler icon family; no emoji, CSS drawings or placeholder image art replace visible assets.
- Copy and content: financial content from the reference was correctly replaced with live OpinaCraft concepts—servers, editions, players, versions, latency, ratings and IP copy actions.
- Responsive behavior: no horizontal overflow at 1440, 1280, 1024, 768 or 390 px. The desktop navbar becomes a compact mobile navbar and accessible dropdown below 1024 px.
- Accessibility and states: active routes expose `aria-current="page"`; menu and search buttons expose expanded/controlled state; Escape closes mobile overlays; focus-visible rings and reduced-motion handling remain present.

## Full-view and focused evidence

- Full view: the combined comparison shows the shared neutral/emerald palette, white navbar, warm workspace, restrained elevation, compact controls and data-dense primary surface.
- A separate focused crop was not required: the combined image is saved at 2384 × 891 px, where navbar controls, type hierarchy, filters, rows, radii and icon treatment remain directly readable.

## Comparison history

1. P2 — A persistent sidebar contradicted the final requested direction and reduced horizontal focus. Fixed by removing it from the rendered shell and restoring all real navigation to the top navbar.
2. P2 — Main content and navbar used different large-screen width rules, which could feel left-weighted. Fixed by introducing one 1180 px frame token and identical auto margins; post-fix browser evidence reports `[123, 123]` for both regions at 1440 px.
3. P2 — Header search did not submit reliably with Enter in the browser test. Fixed by routing Enter through `requestSubmit()` on desktop and mobile. Post-fix evidence navigated to `/servers?q=Astral` and returned the single matching row.

## Verification

- Primary interactions tested: desktop route state, mobile menu open/close, mobile search open/focus, header search submission and filtered result rendering.
- Browser console errors: none.
- `pnpm lint`: passed with five pre-existing `no-img-element` warnings and no errors.
- TypeScript: passed with `tsc --noEmit`.
- Unit tests: 18 passed.
- `pnpm build`: passed; all 23 pages generated.
- Environment note: the repository requests Node 22; validation ran on Node 24.14.0.

## Findings

No actionable P0, P1 or P2 findings remain. The removed sidebar is an intentional final-direction change requested by the user, not fidelity drift.

## Follow-up polish

- P3: migrate the five existing raw `<img>` usages to the project's preferred optimized image path when their remote-source policy is finalized.

final result: passed
