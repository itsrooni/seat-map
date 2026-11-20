# TODO — Assignment Deliverables

## Frontend: seating-map application

- [x] **Load and render the venue fixtures.** Load one of `public/venues/small.json`, `public/venues/medium.json`, or `public/venues/large.json` and render all seats in their correct positions. The supplied large fixture has approximately 15,000 seats and the UI must remain responsive with it.
- [x] **Inspect seats.** When a seat is clicked or focused, display its section, row, seat/column, price tier, price, and status.
- [x] **Select seats with clear constraints.** Let users select and deselect seats; only `available` seats can be selected; allow up to 8 seats; distinguish selected seats visually; clearly communicate why unavailable seats cannot be selected.
- [x] **Show a live selection summary.** Include selected seat IDs or labels, individual prices, and subtotal. Derive prices from `priceTiers[seat.priceTier].priceCents`.
- [x] **Persist and sanitize selection.** Persist the current selection after reload. Gracefully remove a persisted seat that no longer exists or is no longer available in the loaded fixture.
- [x] **Provide keyboard access and responsive layout.** Include meaningful labels for seat controls, visible focus, keyboard support for current interactive seats, and a documented strategy for navigating a large map. Avoid thousands of tab stops. Keep map and summary usable on desktop and mobile viewports.
- [x] **Document frontend decisions.** Provide install/development commands and README sections titled `Rendering Strategy`, `Performance Notes`, and `Accessibility Notes`, plus assumptions/TODOs and AI usage if applicable. Explain alternatives, drawbacks, rerenders, how the design changes for 50,000+ seats and production mobile pan/zoom, what fixtures/responsiveness were checked, bottlenecks/optimizations, keyboard/focus/status announcements, limitations and production improvements.

## Backend: inherited seat-hold API

- [x] **Preserve product rules and endpoints.** Support holds of 1–8 seats for an event; sold/reserved seats cannot be held; a seat held by another active hold cannot be held; holds expire after 5 minutes; creation is all-or-nothing; conflicts are meaningful; retries behave sensibly. Preserve `GET /health`, `GET /events/:eventId/seats`, `POST /events/:eventId/holds`, `GET /holds/:holdId`, and `DELETE /holds/:holdId`.
- [x] **Enforce the active-hold invariant.** Two active holds must never exist for the same event seat; repair the highest-risk concurrency/correctness issue in the inherited implementation.
- [x] **Prove the repair.** Add/update automated tests for the changed behavior, including a concurrent request that yields one success and one conflict, and run `npm test` plus `npm run typecheck`.
- [x] **Write backend candidate notes.** Explain findings, changes, trade-offs, remaining unsafe/incomplete areas, and what a production design with multiple API instances would change.

## Combined delivery

- [x] **Package both solutions.** Keep frontend and backend run/install instructions distinct, include required source/data/tests/notes, and exclude installed dependency folders. Deliver the finished project as a ZIP.