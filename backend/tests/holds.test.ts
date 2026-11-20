import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp, resetForTests } from "../src/app.js";
import { createSeatHold } from "../src/services/holdService.js";
import { InMemoryStore, store } from "../src/store/inMemoryStore.js";
import type { Event } from "../src/domain/types.js";
import { HOLD_TTL_MS } from "../src/utils/time.js";

const app = createApp();

describe("seat hold API", () => {
  beforeEach(() => {
    resetForTests();
  });

  it("creates a hold for available seats", async () => {
    const response = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-01", "A-1-02"] })
      .expect(201);

    expect(response.body.hold).toMatchObject({
      eventId: "arena-01",
      customerId: "customer-a",
      seatIds: ["A-1-01", "A-1-02"],
      status: "active"
    });
  });

  it("rejects holds with more than 8 seats", async () => {
    const response = await request(app)
      .post("/events/arena-01/holds")
      .send({ seatIds: ["A-1-01", "A-1-02", "A-1-03", "A-1-04", "A-1-05", "A-1-06", "A-1-07", "A-1-08", "A-1-09"] })
      .expect(400);

    expect(response.body.error.code).toBe("TOO_MANY_SEATS");
  });

  it("rejects duplicate seat IDs in one request", async () => {
    const response = await request(app)
      .post("/events/arena-01/holds")
      .send({ seatIds: ["A-1-01", "A-1-01"] })
      .expect(400);

    expect(response.body.error.code).toBe("DUPLICATE_SEATS");
  });

  it("rejects a sequential hold when a seat is already held", async () => {
    await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-08"] })
      .expect(201);

    const response = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-b")
      .send({ seatIds: ["A-1-08"] })
      .expect(409);

    expect(response.body.error.code).toBe("SEATS_HELD");
  });

  it("does not partially claim available seats when another requested seat is held", async () => {
    await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-08"] })
      .expect(201);

    const conflict = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-b")
      .send({ seatIds: ["A-1-09", "A-1-08"] })
      .expect(409);
    expect(conflict.body.error.code).toBe("SEATS_HELD");

    // If the failed two-seat request had written part of its claim, this would conflict.
    await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-c")
      .send({ seatIds: ["A-1-09"] })
      .expect(201);
  });

  it("returns the same hold when the same idempotency key and request are retried", async () => {
    const first = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-04"], idempotencyKey: "retry-key-1" })
      .expect(201);

    const second = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-04"], idempotencyKey: "retry-key-1" })
      .expect(201);

    expect(second.body.hold.id).toBe(first.body.hold.id);
  });

  it("rejects reuse of a customer/event idempotency key for a different seat request", async () => {
    await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-04"], idempotencyKey: "changed-request-key" })
      .expect(201);

    const response = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-05"], idempotencyKey: "changed-request-key" })
      .expect(409);

    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-b")
      .send({ seatIds: ["A-1-05"] })
      .expect(201);
  });

  it("does not replay a key across different customers", async () => {
    const first = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-04"], idempotencyKey: "customer-scope-key" })
      .expect(201);

    const second = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-b")
      .send({ seatIds: ["A-1-05"], idempotencyKey: "customer-scope-key" })
      .expect(201);

    expect(second.body.hold.id).not.toBe(first.body.hold.id);
    expect(second.body.hold).toMatchObject({ customerId: "customer-b", seatIds: ["A-1-05"] });
  });

  it("does not replay a key across different events", async () => {
    const first = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-04"], idempotencyKey: "event-scope-key" })
      .expect(201);

    const response = await request(app)
      .post("/events/not-arena/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-04"], idempotencyKey: "event-scope-key" })
      .expect(404);

    expect(response.body.error.code).toBe("EVENT_NOT_FOUND");
    expect(response.body.hold?.id).not.toBe(first.body.hold.id);
  });

  it("marks unexpired held seats in the seat listing", async () => {
    const holdResponse = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-05"] })
      .expect(201);

    const seatsResponse = await request(app)
      .get("/events/arena-01/seats")
      .expect(200);

    const heldSeat = seatsResponse.body.seats.find((seat: { id: string }) => seat.id === "A-1-05");
    expect(heldSeat).toMatchObject({
      id: "A-1-05",
      availability: "held",
      activeHoldId: holdResponse.body.hold.id
    });
  });

  it("allows a seat to be held again after cancelling a hold", async () => {
    const holdResponse = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-a")
      .send({ seatIds: ["A-1-06"] })
      .expect(201);

    await request(app)
      .delete(`/holds/${holdResponse.body.hold.id}`)
      .expect(200);

    await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-b")
      .send({ seatIds: ["A-1-06"] })
      .expect(201);
  });

  it("allows a new claim at the exact expiry time supplied for the request", async () => {
    const requestTime = new Date(Date.now() - HOLD_TTL_MS);
    const first = await createSeatHold({
      eventId: "arena-01",
      customerId: "customer-a",
      seatIds: ["A-1-07"],
      now: requestTime
    });
    const expiryTime = new Date(requestTime.getTime() + HOLD_TTL_MS);

    const second = await createSeatHold({
      eventId: "arena-01",
      customerId: "customer-b",
      seatIds: ["A-1-07"],
      now: expiryTime
    });

    expect(new Date(first.expiresAt).getTime()).toBe(expiryTime.getTime());
    expect(second.id).not.toBe(first.id);
    expect(second.createdAt).toBe(expiryTime.toISOString());
    const eventHolds = await store.listHoldsForEvent("arena-01");
    expect(eventHolds.find((hold) => hold.id === first.id)?.status).toBe("cancelled");
    expect(eventHolds.filter((hold) => hold.status === "active" && hold.seatIds.includes("A-1-07"))).toHaveLength(1);

    const seatsResponse = await request(app).get("/events/arena-01/seats").expect(200);
    const seat = seatsResponse.body.seats.find((candidate: { id: string }) => candidate.id === "A-1-07");
    expect(seat).toMatchObject({ availability: "held", activeHoldId: second.id });
  });

  it("reports an expired hold as cancelled on status reads and idempotent retries", async () => {
    const requestTime = new Date(Date.now() - HOLD_TTL_MS - 1_000);
    const hold = await createSeatHold({
      eventId: "arena-01",
      customerId: "customer-expiry",
      seatIds: ["A-1-07"],
      idempotencyKey: "expired-retry-key",
      now: requestTime
    });

    const status = await request(app).get(`/holds/${hold.id}`).expect(200);
    expect(status.body.hold).toMatchObject({ id: hold.id, status: "cancelled" });

    const retry = await request(app)
      .post("/events/arena-01/holds")
      .set("x-customer-id", "customer-expiry")
      .send({ seatIds: ["A-1-07"], idempotencyKey: "expired-retry-key" })
      .expect(201);
    expect(retry.body.hold).toMatchObject({ id: hold.id, status: "cancelled" });

    const storedHolds = await store.listHoldsForEvent("arena-01");
    expect(storedHolds.find((candidate) => candidate.id === hold.id)?.status).toBe("cancelled");
  });

  it("allows only one of two simultaneous requests to claim a seat", async () => {
    const [first, second] = await Promise.all([
      request(app)
        .post("/events/arena-01/holds")
        .set("x-customer-id", "customer-a")
        .send({ seatIds: ["A-1-07"] }),
      request(app)
        .post("/events/arena-01/holds")
        .set("x-customer-id", "customer-b")
        .send({ seatIds: ["A-1-07"] })
    ]);

    expect([first.status, second.status].sort((left, right) => left - right)).toEqual([201, 409]);
    const winner = first.status === 201 ? first : second;
    const loser = first.status === 409 ? first : second;
    expect(loser.body.error.code).toBe("SEATS_HELD");

    const allHolds = await store.listHoldsForEvent("arena-01");
    const activeClaimsForSeat = allHolds.flatMap((hold) =>
      hold.status === "active" && hold.seatIds.includes("A-1-07") ? [hold] : []
    );
    expect(activeClaimsForSeat).toHaveLength(1);
    expect(activeClaimsForSeat[0]?.id).toBe(winner.body.hold.id);
  });
});

describe("in-memory idempotency key scope", () => {
  it("scopes keys by both customer and event", () => {
    const makeEvent = (id: string): Event => ({
      id,
      name: id,
      seats: [
        { id: "S-1", section: "S", row: 1, number: 1, priceTier: 1, status: "available" },
        { id: "S-2", section: "S", row: 1, number: 2, priceTier: 1, status: "available" }
      ]
    });
    const isolatedStore = new InMemoryStore([makeEvent("event-a"), makeEvent("event-b")]);
    const now = new Date();
    const first = isolatedStore.claimSeats({
      eventId: "event-a", customerId: "customer-a", seatIds: ["S-1"], idempotencyKey: "shared-key", now
    });
    const otherCustomer = isolatedStore.claimSeats({
      eventId: "event-a", customerId: "customer-b", seatIds: ["S-2"], idempotencyKey: "shared-key", now
    });
    const otherEvent = isolatedStore.claimSeats({
      eventId: "event-b", customerId: "customer-a", seatIds: ["S-1"], idempotencyKey: "shared-key", now
    });

    expect(first.kind).toBe("created");
    expect(otherCustomer.kind).toBe("created");
    expect(otherEvent.kind).toBe("created");
    if (first.kind !== "error" && otherCustomer.kind !== "error" && otherEvent.kind !== "error") {
      expect(new Set([first.hold.id, otherCustomer.hold.id, otherEvent.hold.id]).size).toBe(3);
    }
  });
});
