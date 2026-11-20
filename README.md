# Seat Map Assignment — Completed Solutions

This repository contains completed solutions for both take-home tasks from the supplied archive: an interactive React/TypeScript seating map at the repository root, and the inherited seat-hold API in [`backend/`](backend/). The original frontend brief is preserved in [`docs/frontend-candidate-assignment.md`](docs/frontend-candidate-assignment.md); the backend task context remains in [`backend/README.md`](backend/README.md).

## Frontend: run and verify

Requires Node.js 20.19+ or 22.12+ and npm 10.9.9 (pinned in `package.json`). From the repository root:

```bash
npm install
npm run dev
```

Vite prints the local URL. Select the small, medium or large fixture in the page header; use `?venue=large` to open the stress fixture directly. To verify source and production output:

```bash
npm run typecheck
npm test
npm run build
```

The app loads the fixtures from `public/venues/`. It starts on the medium venue; select **Large · 15,000 seats** or open `/?venue=large` to exercise the stress fixture. Seat selection is stored per venue in `localStorage` and is revalidated against the loaded fixture on every load.

## Rendering Strategy

The map is drawn to a single high-DPI Canvas 2D surface. Venue coordinates are already absolute, so the renderer plots each seat at its supplied `x`/`y` without trying to reconstruct rows or regularize the geometry. Seat status is drawn in batches by state; selected and currently focused seats are then overlaid. React owns the fixture, selection and inspector; it does not create one DOM node per seat. Pointer hit-testing uses a uniform spatial grid, while zoom, fit and drag-to-pan are handled on the canvas.

Canvas was selected because the large fixture contains 15,000 seats and its geometry is irregular. Creating 15,000 React elements/SVG nodes would make the DOM and accessibility tree unnecessarily large and would require coordinating many individual updates. A virtualized DOM would improve the node count but is a poor fit for a two-dimensional irregular map. Canvas keeps rendering compact and lets pointer hit-testing be indexed, at the cost of having to provide accessibility separately and repainting the canvas when selection changes.

Selecting a seat updates the selection model and summary in React, then redraws the canvas. That redraw scans the fixture in four status batches and overlays selected/focused seats; at 15,000 seats the work is bounded and does not trigger 15,000 component renders. The spatial grid avoids scanning all seats on every pointer hit. Keyboard movement currently scans seat coordinates to find the closest seat in the requested direction; this is simple and adequate for 15,000 entries, but could be indexed if profiling shows key-repeat latency.

For 50,000+ seats, I would profile real hardware and consider section/viewport culling, spatially tiled draw lists, a worker-maintained spatial index, and an OffscreenCanvas/WebGL renderer if the measured frame budget requires it. For production mobile pinch-zoom/pan, I would add a gesture-aware camera with touch-action arbitration, bounds/clamping and inertia only if user testing justified it; the delivered map supports drag panning and explicit zoom controls, not pinch gestures.

## Performance Notes

The supplied small (144 seats), medium (2,500 seats) and large (15,000 seats) fixtures were validated with the included kit's venue validator before being copied unchanged into `public/venues/`. The large fixture was rendered in Preview at 1365×900 and the responsive page checked at 390×844. In the large fixture, the seat finder located available seat A-1-01, Enter selected it and displayed its tier and price, and a page reload preserved the selection. The project was type-checked, unit-tested and production-built. Canvas work is batched and pointer hit-testing uses a spatial index; there are no per-seat React components or tab stops.

This is not a formal benchmark: no target-device FPS, input latency or memory profile is claimed. The main costs are fixture JSON parsing and one full canvas repaint after a seat selection; keyboard neighbor search is linear in seat count. For a production release I would profile load/parse time, first map paint, pointer-to-inspector latency, keyboard-repeat latency and memory on representative low-end phones, then compare Canvas against an indexed/WebGL path at expected venue sizes.

## Accessibility Notes

The seating map is one focusable application surface rather than thousands of tab stops. Focus it with Tab; use the arrow keys to move spatially, Enter or Space to select/deselect, Home to focus the first seat and End to focus the last. A visible focus ring is drawn around the active seat, and the seat finder lets keyboard users jump directly to a seat ID before returning focus to the map. Zoom and fit controls, fixture selection, seat removal and clearing selection are ordinary labelled controls.

A polite live region announces the focused seat's section, row, seat number and status. The inspector also displays the tier, price and a text explanation of why reserved, sold or held seats cannot be selected. Color is reinforced by words and a legend; focus and selection have separate outlines.

Canvas does not expose each seat as a native DOM control, so screen-reader users rely on the map's instructions, live seat announcement and the explicit seat finder/inspector. This is a deliberate trade-off, not a claim of complete production accessibility. Production improvements would include user testing with screen readers, a structured section/row navigation mode and an optional searchable/virtualized accessible seat list synchronized with the canvas selection.

## Backend: run and verify

The backend is an independent package. From the `backend/` directory:

```bash
npm ci
npm test
npm run typecheck
npm run dev
```

The API listens on port 3000 by default. It retains `GET /health`, `GET /events/:eventId/seats`, `POST /events/:eventId/holds`, `GET /holds/:holdId` and `DELETE /holds/:holdId`.

The fix moves the decisive check-and-claim into one synchronous store operation. In a single Node.js process, no asynchronous yield occurs between checking all requested seats and inserting the hold, so concurrent requests cannot both claim the same active event seat; the whole set is checked before any claim is written. Expiration is checked against the request time, and expired holds are reported as cancelled through hold reads, seat listings and idempotent replays. Idempotency is scoped by customer, event and key; reusing a scoped key for a different ordered seat list returns a conflict rather than replaying an unrelated result. The backend tests cover concurrency, all-or-nothing behavior, expiry, conflicts and retry semantics; candidate findings and production notes are in [`backend/CANDIDATE_NOTES.md`](backend/CANDIDATE_NOTES.md).

This guarantee is process-local. It does not coordinate multiple Node workers or API instances and is not a substitute for a database transaction or uniqueness constraint; see the candidate notes for the production approach.

## Assumptions and TODOs

- The provided fixture's seat coordinates are absolute within map width/height; section transforms are retained in the typed schema but not applied to those coordinates.
- Price tiers within a venue use a consistent currency for the displayed subtotal.
- The seating-map client uses fixture data only; it is a selection exercise, not a checkout or live reservation system.
- The backend uses an in-memory store and mock customer header as the assignment specifies. It does not provide cross-instance durability, payment completion, realtime seat updates, or a production identity system.
- Touch drag and explicit zoom controls are included; pinch zoom, adjacent-seat search, live hold integration and production-grade screen-reader seat grids are intentionally out of scope.

## AI Usage

AI-assisted implementation and code review were used. The final source, tests, fixture behavior, concurrency boundary, and documented trade-offs were checked against the supplied requirements; both project test suites, both TypeScript checks and the frontend production build were run.
