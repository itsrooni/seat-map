# Plan — Seating Map and Seat-Hold Assignment

## Scope and approach

Complete both independent take-home packages from the supplied archive. The frontend will be a strict TypeScript React application; the backend will remain the supplied TypeScript/Express in-memory API with a focused correctness repair rather than a database rewrite. Deliver one combined repository/ZIP with separate run commands and candidate-facing documentation for each exercise. Do not deploy or publish the app.

## Product and implementation decisions

### Frontend

- Build with React 18+, TypeScript strict mode, Vite and Canvas 2D. Copy the supplied `small.json`, `medium.json`, and `large.json` fixtures unchanged into `public/venues/` and load the chosen file by relative URL.
- Render the full irregular coordinate layout on one high-DPI Canvas, not as 15,000 React/DOM nodes. Use a spatial index for pointer hit-testing, provide fit/zoom/pan controls, and keep map-seat selection/inspection state in React.
- Expose the map as one keyboard stop with arrow-key spatial navigation, Enter/Space selection, visible focus, a polite live announcement, and a seat-ID finder as a complementary route to a seat. Explain the Canvas/accessibility compromise and how production virtualization or a richer accessible list could evolve.
- Keep the current venue selection and selected seat IDs in localStorage; on load, remove missing/unavailable IDs and cap to eight. Recompute subtotal from fixture price tiers.
- Use focused unit tests for pure selection, persistence-sanitization and navigation/price logic. Document actual large-fixture testing and known performance bounds.

### Backend

- Preserve the given Express endpoints, validation style, store API, seed fixtures and dependency set.
- Move the decisive availability check and write into one synchronous store claim operation, with no `await` between validation and insert, so concurrent requests in a single Node.js process cannot claim the same active seat. Validate the entire requested set before writing.
- Make idempotency scope `(customer, event, key)` and reject mismatched reuse; account for expiry using the provided time rather than relying on asynchronous cleanup for correctness.
- Enable the skipped concurrency test and cover all-or-nothing behavior, expiration, duplicate IDs and idempotent retries. Document that an in-memory process-local lock/atomic section is not safe across multiple API instances.

## Design direction

Three possible directions (the low probabilities are intentional tail-sampling values): **Box-Office Ledger — 0.06** (warm paper and ink), **Signal in the Seats — 0.08** (dark, precise, high-contrast instrumentation), and **After-Hours Marquee — 0.04** (plum and brass theatre cues). Choose **Signal in the Seats**.

- **Design Movement:** Contemporary instrument-panel minimalism, tempered by theatre signage.
- **Core Principles:** Dense information stays calm; status is encoded by both color and labels; the map remains the visual anchor; controls are unmistakably operable.
- **Color Philosophy:** Ink navy canvas and panels recede; bright sea-glass teal means selectable/selected; muted gold marks reserved seats; coral signals held seats; slate lowers emphasis for sold seats. Avoid relying on color alone.
- **Layout Paradigm:** A wide, flexible map stage with a compact vertical control rail on desktop; on mobile, the map leads and selection details stack below it.
- **Signature Elements:** Fine concentric stage arcs behind seats; seat-state dots with restrained glow only on focus/selection; small numbered section chips.
- **Interaction Philosophy:** Direct manipulation for pointer users; predictable arrow navigation for keyboard users; clear status messages when a seat cannot be selected.
- **Animation:** Short 120–180 ms color/opacity transitions for selection and panel changes; no idle motion; honor reduced-motion preferences.
- **Typography System:** IBM Plex Sans or system sans for controls and reading; tabular numerals for prices/counts; compact uppercase eyebrow labels with tracking.
- **Brand Essence:** A precise, low-friction seat picker for event-goers; **focused, legible, dependable**.
- **Brand Voice:** Headings are direct, microcopy is specific. Examples: “Choose your seats.” “Seat held by the venue — not available to select.”
- **Wordmark & Logo:** A custom compact mark made from three offset seat/dot rows inside a rounded rectangular ticket outline, paired with a restrained wordmark.
- **Signature Brand Color:** Sea-glass teal `#48D6B2`.

## Project structure

- `src/`: React app shell, typed venue model, canvas map, controls and selection summary.
- `src/domain/`: pure selection, totals, fixture-index and keyboard-navigation helpers.
- `src/styles/`: responsive theme and component styles.
- `src/__tests__/`: fast pure-function tests.
- `public/venues/`: the three original, validated venue fixtures; `public/manus-routes.json` declares `/` for Preview.
- `backend/`: the inherited API solution with its own package lock, tests and `CANDIDATE_NOTES.md`.
- Root `README.md`: combined setup, test and assignment-specific trade-offs; `plan.md` and `TODO.md` track the implementation.

## Runtime and limits

The Webdev project Preview runs only the frontend Vite development server on port 3000. The backend remains a separately launched local exercise (`cd backend && npm run dev`) and is not required for the seating-map client, which uses the supplied fixtures. No managed database or server capability is needed. Deliver source and fixtures as a ZIP; do not publish a public deployment.