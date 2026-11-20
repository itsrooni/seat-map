# Candidate Notes

## Summary

I replaced the in-memory seat hold check-then-insert sequence with one synchronous atomic claim operation. The operation validates the full requested seat set before inserting a hold, so competing requests in this single Node.js process cannot both claim the same active event seat and a rejected multi-seat request does not leave partial claims.

## Findings

- Hold creation previously performed event/seat lookup, checked for a blocking hold, then inserted after separate `await` points. Concurrent requests could both pass the check before either inserted.
- Idempotency keys were searched globally and a matching key returned its hold without validating the customer, event, or requested seats.
- Blocking checks ignored the supplied request time and trusted a cleanup job for correctness. Expired holds could also be returned as active by status reads or idempotent retries, and seat listings could show stale state.

## Changes made

- Added a store-level `claimSeats` operation with no `await` between checks and insert. It validates all seats and performs a single hold insertion only after every seat passes, preserving all-or-nothing behavior for the requested seats.
- Scoped idempotency keys by `(customerId, eventId, idempotencyKey)`. A repeat in that scope only replays the existing hold when the ordered seat ID list is identical; reuse for a different request returns `409 IDEMPOTENCY_KEY_REUSED`. The same key under another customer or event is an independent scope, never a replay of another scope's hold.
- Evaluated expiration against the request's `now`: holds with `expiresAt <= now` do not block. Hold retrieval, seat listing, and idempotent replay mark an expired active hold cancelled, so the cleanup timer is housekeeping rather than the correctness boundary.
- Reject duplicate seat IDs with a clear `400 DUPLICATE_SEATS` response.

## Tests added or changed

- Enabled and strengthened the simultaneous-claim test: two concurrent requests must produce exactly one `201` and one `409 SEATS_HELD`, and the store must contain exactly one active claim for that seat.
- Added multi-seat all-or-nothing verification, idempotency replay/mismatch/customer/event scope coverage, duplicate-seat validation, deterministic exact-expiry behavior, and regression coverage that expired holds read and replay as cancelled.

## Trade-offs and limitations

- The atomicity guarantee relies on a single Node.js process and the claim method staying synchronous. It does not coordinate multiple workers or API instances.
- The in-memory store loses holds and idempotency history on process restart. Idempotency history currently remains with each hold indefinitely; there is no retention policy or request fingerprint/versioning.
- A valid idempotent retry returns the existing hold resource (including its current status if it was later cancelled); it does not renew an expired/cancelled hold. Clients needing a new hold must use a new key.
- The test set is focused on this store and API behavior; it does not cover distributed deployment, payment finalization, or realtime seat updates.

## Production considerations

For multiple instances, move the invariant into a shared durable store. Use a transaction with row/seat-level locking or a conditional atomic claim, and enforce a unique active `(event_id, seat_id)` claim in the database so correctness does not rely on process scheduling. Persist idempotency scope and request fingerprint with a unique constraint and return a conflict for mismatched reuse. Expiration should be checked against a consistent server/database clock as part of the transaction; cleanup can remain asynchronous for housekeeping, not correctness. Checkout should atomically transition held seats to sold/reserved and ensure payment retries cannot create duplicate orders. Publish seat updates only after the durable transaction commits.
