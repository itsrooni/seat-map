import { randomUUID } from "node:crypto";
import type { Event, SeatHold } from "../domain/types.js";
import { initialEvents } from "../data/seed.js";
import { addMilliseconds, HOLD_TTL_MS, sleep } from "../utils/time.js";

function cloneEvent(event: Event): Event {
  return {
    ...event,
    seats: event.seats.map((seat) => ({ ...seat }))
  };
}

function cloneHold(hold: SeatHold): SeatHold {
  return {
    ...hold,
    seatIds: [...hold.seatIds]
  };
}

function expireHold(holds: Map<string, SeatHold>, hold: SeatHold, now: Date): SeatHold {
  if (hold.status !== "active" || new Date(hold.expiresAt).getTime() > now.getTime()) return hold;
  const expired = { ...hold, status: "cancelled" as const };
  holds.set(hold.id, expired);
  return expired;
}

type HoldClaimFailure = {
  kind: "error";
  statusCode: 400 | 404 | 409;
  code: string;
  message: string;
  details?: unknown;
};

export type HoldClaimResult =
  | { kind: "created" | "replayed"; hold: SeatHold }
  | HoldClaimFailure;

export class InMemoryStore {
  private events = new Map<string, Event>();
  private holds = new Map<string, SeatHold>();

  constructor(events: Event[] = initialEvents) {
    for (const event of events) {
      this.events.set(event.id, cloneEvent(event));
    }
  }

  reset(): void {
    this.events.clear();
    this.holds.clear();

    for (const event of initialEvents) {
      this.events.set(event.id, cloneEvent(event));
    }
  }

  async getEvent(eventId: string): Promise<Event | undefined> {
    await sleep(5);
    const event = this.events.get(eventId);
    return event ? cloneEvent(event) : undefined;
  }

  async getHold(holdId: string, now = new Date()): Promise<SeatHold | undefined> {
    await sleep(5);
    const hold = this.holds.get(holdId);
    return hold ? cloneHold(expireHold(this.holds, hold, now)) : undefined;
  }

  async listHoldsForEvent(eventId: string, now = new Date()): Promise<SeatHold[]> {
    await sleep(5);
    return [...this.holds.values()]
      .filter((hold) => hold.eventId === eventId)
      .map((hold) => cloneHold(expireHold(this.holds, hold, now)));
  }

  /**
   * Checks idempotency, event/seat availability, and active claims before writing.
   * This method deliberately contains no await: in the single Node.js process,
   * its validation and insert execute as one uninterrupted critical section.
   */
  claimSeats(input: {
    eventId: string;
    customerId: string;
    seatIds: string[];
    idempotencyKey?: string;
    now: Date;
  }): HoldClaimResult {
    if (input.idempotencyKey) {
      const existingHold = [...this.holds.values()].find(
        (hold) =>
          hold.idempotencyKey === input.idempotencyKey &&
          hold.customerId === input.customerId &&
          hold.eventId === input.eventId
      );

      if (existingHold) {
        const currentHold = expireHold(this.holds, existingHold, input.now);
        const sameRequest =
          currentHold.seatIds.length === input.seatIds.length &&
          currentHold.seatIds.every((seatId, index) => seatId === input.seatIds[index]);

        if (!sameRequest) {
          return {
            kind: "error",
            statusCode: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "This idempotency key was already used for a different seat request",
            details: { holdId: currentHold.id }
          };
        }

        return { kind: "replayed", hold: cloneHold(currentHold) };
      }
    }

    const event = this.events.get(input.eventId);
    if (!event) {
      return {
        kind: "error",
        statusCode: 404,
        code: "EVENT_NOT_FOUND",
        message: `Event ${input.eventId} was not found`
      };
    }

    const requestedSeats = input.seatIds.map((seatId) => event.seats.find((seat) => seat.id === seatId));
    const missingSeatIds = input.seatIds.filter((_, index) => !requestedSeats[index]);
    if (missingSeatIds.length > 0) {
      return {
        kind: "error",
        statusCode: 404,
        code: "SEATS_NOT_FOUND",
        message: "Some requested seats do not exist",
        details: { seatIds: missingSeatIds }
      };
    }

    const unavailableBaseSeats = requestedSeats
      .filter((seat) => seat && seat.status !== "available")
      .map((seat) => seat?.id);
    if (unavailableBaseSeats.length > 0) {
      return {
        kind: "error",
        statusCode: 409,
        code: "SEATS_UNAVAILABLE",
        message: "Some seats are not available",
        details: { seatIds: unavailableBaseSeats }
      };
    }

    const requestTime = input.now.getTime();
    for (const hold of this.holds.values()) {
      if (
        hold.eventId === input.eventId &&
        hold.status === "active" &&
        new Date(hold.expiresAt).getTime() <= requestTime
      ) {
        this.holds.set(hold.id, { ...hold, status: "cancelled" });
      }
    }

    const blockingHold = [...this.holds.values()].find(
      (hold) =>
        hold.eventId === input.eventId &&
        hold.status === "active" &&
        new Date(hold.expiresAt).getTime() > requestTime &&
        hold.seatIds.some((seatId) => input.seatIds.includes(seatId))
    );

    if (blockingHold) {
      return {
        kind: "error",
        statusCode: 409,
        code: "SEATS_HELD",
        message: "Some seats are already held",
        details: {
          holdId: blockingHold.id,
          seatIds: blockingHold.seatIds.filter((seatId) => input.seatIds.includes(seatId))
        }
      };
    }

    const hold: SeatHold = {
      id: randomUUID(),
      eventId: input.eventId,
      customerId: input.customerId,
      seatIds: [...input.seatIds],
      status: "active",
      idempotencyKey: input.idempotencyKey,
      createdAt: input.now.toISOString(),
      expiresAt: addMilliseconds(input.now, HOLD_TTL_MS).toISOString()
    };

    // Insert only after every requested seat has passed validation.
    this.holds.set(hold.id, hold);
    return { kind: "created", hold: cloneHold(hold) };
  }

  async cancelHold(holdId: string): Promise<SeatHold | undefined> {
    await sleep(10);
    const hold = this.holds.get(holdId);

    if (!hold) {
      return undefined;
    }

    const cancelled = { ...hold, status: "cancelled" as const };
    this.holds.set(holdId, cancelled);
    return cloneHold(cancelled);
  }

  async cleanupExpiredHolds(now: Date): Promise<number> {
    let cancelledCount = 0;

    for (const hold of this.holds.values()) {
      if (hold.status === "active" && new Date(hold.expiresAt).getTime() <= now.getTime()) {
        this.holds.set(hold.id, { ...hold, status: "cancelled" });
        cancelledCount += 1;
      }
    }

    return cancelledCount;
  }
}

export const store = new InMemoryStore();
