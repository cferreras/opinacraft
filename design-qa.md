# Design QA — `/servers/[slug]`

## Evidence

- Source visual truth: [mockup-server-detail-04.png](./mockup-server-detail-04.png)
- Source pixels: 1536 × 1024 PNG; comparison density normalized to 1×.
- Desktop implementation: [design-qa-implementation-desktop.png](./design-qa-implementation-desktop.png)
- Mobile implementation: [design-qa-implementation-mobile.png](./design-qa-implementation-mobile.png)
- Combined comparison: [design-qa-comparison.png](./design-qa-comparison.png)
- CSS viewports: 1536 × 1024 desktop and 390 × 844 mobile.
- Browser capture pixels: 1521 × 1014 desktop and 375 × 812 mobile; the in-app browser excludes scrollbar/chrome pixels. The combined comparison downsamples both desktop artifacts to 768 × 512 content regions before judging.
- State: light theme, `/servers/browser-qa-16096605`, local published server data, unknown health, no published reviews, owner session state.

## Comparison evidence

- Full view: the desktop composition keeps the same hierarchy as the source — navigation, server identity hero, dominant copy CTA, utility actions, two-column content, connection panel and reviews area.
- Focused regions: the hero/CTA alignment, metrics row, endpoint rows, status block and 390px mobile reflow were checked separately. The mobile capture keeps the compact logo, centered identity, metrics, copy action and connection card visible without horizontal overflow.
- The source board includes a separate phone preview; the implementation expresses that view as the route's responsive mobile layout rather than rendering a second decorative phone frame.

## Findings

- No actionable P0, P1 or P2 differences remain.
- P3 / expected: the local fixture uses its real uploaded Minecraft logo and empty review state, while the reference uses NovaCraft artwork, online metrics and populated reviews. The live route consumes the corresponding server media and review data when present.
- P3 / expected: the brand mark uses the existing Tabler cube icon because no standalone OpinaCraft logo asset exists in the workspace.

## Comparison history

1. Initial pass: mobile logo was too large and the unknown health dot was green. Fixed the responsive logo scale/alignment and made status indicators semantic.
2. Second pass: the primary action label was shorter than the source. Updated it to “Copiar dirección”.
3. Final pass: restarted the local development server after a stale HMR CSS cache, captured a fresh browser session, and confirmed no console errors.

## Functional verification

- `pnpm build`: passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm lint`: passed; only four pre-existing `@next/next/no-img-element` warnings remain outside this route.
- `pnpm test`: passed.
- Browser interactions: copy action reaches the “Copiada” state; mobile menu opens/closes; mobile search control opens; primary route and connection links render; no horizontal overflow observed.
- Fresh browser console: no errors or warnings on desktop or mobile capture.

final result: passed
