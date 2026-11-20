# Seat Map

A completed event-seating assignment with two independent deliverables: a React/TypeScript seating-map frontend and an inherited TypeScript seat-hold API. The frontend is a fixture-backed selection experience; it does **not** call or reserve seats through the API.

![Seatline logo](public/seatline-logo.svg)

## Quick start: seating map

**Requirements:** Node.js 20.19+ or 22.12+, with npm 10.9.9 (pinned in `package.json`). From the repository root:

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite (configured for `http://localhost:3000`). The app opens on the medium venue. Choose a fixture in the page header, or open `/?venue=large` to load the 15,000-seat stress fixture directly.

The browser stores the selection per venue in `localStorage`. On load, it removes stored seats that are missing from the fixture or no longer available.

## Quick start: seat-hold API

The API is a separate package under `backend/`; install and run it independently:

```bash
cd backend
npm ci
npm run dev
```

The API listens on port `3000` by default. If you want both apps running simultaneously, start the API on another port, for example `PORT=3001 npm run dev` from `backend/`. The frontend and API are separate assignment solutions; no live integration between them is included.

Check the API:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/events/arena-01/seats
```

Example hold request:

```bash
curl -X POST http://localhost:3000/events/arena-01/holds \
  -H 'content-type: application/json' \
  -H 'x-customer-id: customer-a' \
  -d '{"seatIds":["A-1-01","A-1-02"],"idempotencyKey":"checkout-attempt-001"}'
```

## Verify the solutions

From the repository root, verify the frontend:

```bash
npm run typecheck
npm test
npm run build
```

From `backend/`, verify the API:

```bash
npm run typecheck
npm test
```

The completed frontend suite has 5 unit tests; the backend suite has 15 tests, including concurrent claims, all-or-nothing behavior, idempotency scope, duplicate seats, and expiry handling.

## Frontend features

- Small (144 seats), medium (2,500 seats), and large (15,000 seats) venue fixtures.
- Seat inspection with section, row, seat number, price tier, price, and availability.
- Selection of up to 8 available seats, live subtotal, per-seat prices, and removal/clear controls.
- Seat finder, keyboard navigation, zoom, fit-to-map, and drag-to-pan.
- Per-venue persisted selection with stale/unavailable seat cleanup.
- Responsive layout with a compact inspector and selection summary.

## Rendering Strategy

The seating map is rendered on a single high-DPI Canvas 2D surface. Fixture coordinates are absolute, so seats are drawn at their supplied `x`/`y` positions instead of reconstructing rows or regularizing irregular geometry. Seat states are drawn in batches; selected and focused seats are overlaid. React owns the fixture, selection, inspector, and summary without creating one DOM node per seat.

A uniform spatial grid keeps pointer hit-testing local. Zoom, fit-to-map, and drag-to-pan operate on the canvas. Selecting a seat updates the React model and redraws the map. This makes selection work bounded without thousands of component updates, though each redraw still processes the fixture. Keyboard neighbor search is currently a linear coordinate scan and is adequate for the supplied 15,000-seat venue.

Canvas was chosen because the largest fixture contains 15,000 seats with irregular geometry. A DOM/SVG-per-seat implementation would create a large document and accessibility tree; virtualization would reduce node count but is less natural for a two-dimensional map. Canvas trades native per-seat controls for compact rendering and requires a separate accessibility strategy.

## Performance Notes

The supplied fixtures were validated with the assignment's venue validator and checked in Preview: the large map rendered at 1365×900, and the responsive page was checked at 390×844. The seat finder located available seat A-1-01; Enter selected it and showed its price; reload preserved the selection. The map uses a spatial grid for pointer hits and avoids per-seat React components or tab stops.

These checks are not a formal benchmark; no FPS, latency, or memory guarantee is claimed. Main costs are fixture JSON parsing and a full canvas redraw after selection; keyboard neighbor lookup is linear. For a 50,000+ seat production venue, profile on target devices first, then consider section/viewport culling, tiled draw lists, a worker-maintained spatial index, or OffscreenCanvas/WebGL where measurements justify the added complexity. Production mobile pinch gestures, camera bounds, and inertia are not included; the current map has drag panning and explicit zoom controls.

## Accessibility Notes

The map is one focusable surface rather than thousands of tab stops. Tab focuses it; arrow keys move spatially; Enter or Space selects/deselects; Home and End focus the first and last seat. A visible ring marks the active seat, and the seat finder supports direct keyboard lookup. Zoom/fit, fixture selection, seat removal, and clearing selection are labelled controls.

A polite live region announces the focused seat's section, row, number, and status. The inspector shows its tier and price and explains why sold, reserved, or held seats cannot be selected. Status uses text and a legend as well as color; focus and selection use distinct outlines.

Canvas does not expose each seat as a native screen-reader control. The delivered strategy combines instructions, live announcements, the seat finder, and the inspector, but should not be treated as complete production accessibility. Further work should include screen-reader user testing, section/row navigation, and an optional synchronized accessible seat list.

## Backend correctness and limitations

The API preserves `GET /health`, `GET /events/:eventId/seats`, `POST /events/:eventId/holds`, `GET /holds/:holdId`, and `DELETE /holds/:holdId`. A hold accepts 1–8 seats, expires after five minutes, and is all-or-nothing. Sold, reserved, or actively held seats cannot be claimed.

The decisive check-and-claim is a synchronous store operation: it validates the full seat set before inserting one hold, with no asynchronous yield between checking and claiming. Idempotency is scoped by customer, event, and key; a retry replays the same request, while reuse for a different ordered seat list conflicts. Expiry is evaluated on reads and claims, not left to the cleanup timer alone.

This correctness guarantee is **single-process only**. The in-memory store loses state on restart and does not coordinate workers or API instances. A production system should move active-seat claims and idempotency records into a shared durable store, enforce the invariant transactionally (with a database uniqueness constraint as a backstop), and use a consistent server/database clock. See [`backend/CANDIDATE_NOTES.md`](backend/CANDIDATE_NOTES.md) for findings, trade-offs, and a production outline.

## Repository layout

```text
src/                    React app, seating domain and canvas component
public/venues/          Small, medium and large fixture JSON
backend/                Independent Express/TypeScript seat-hold API
backend/tests/          API and concurrency regression tests
docs/                   Original frontend assignment and venue schema
README.md               This guide
```

## Scope and assumptions

- Fixture coordinates are absolute within map width/height; section transforms are retained in the schema but are not applied to those coordinates.
- Price tiers in a venue share a currency for the displayed subtotal.
- The frontend is a fixture-backed selection exercise, not a checkout or live reservation system.
- The API uses the assignment's in-memory store and mock `x-customer-id` identity; there is no production authentication, payment completion, realtime seat update, or cross-instance durability.
- Pinch zoom, adjacent-seat search, frontend/API integration, and a production-grade screen-reader seat grid remain out of scope.

## Source materials and AI usage

The original frontend brief is preserved in [`docs/frontend-candidate-assignment.md`](docs/frontend-candidate-assignment.md); the API task and candidate notes are in [`backend/README.md`](backend/README.md) and [`backend/CANDIDATE_NOTES.md`](backend/CANDIDATE_NOTES.md). AI-assisted implementation and code review were used. The delivered behavior, tests, concurrency boundary, and trade-offs were checked against the supplied requirements.