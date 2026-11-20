import type { SeatHold, SeatWithAvailability } from "../domain/types.js";
import { store } from "../store/inMemoryStore.js";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export async function listSeats(eventId: string): Promise<SeatWithAvailability[]> {
  const now = new Date();
  const event = await store.getEvent(eventId);

  if (!event) {
    throw new ApiError(404, "EVENT_NOT_FOUND", `Event ${eventId} was not found`);
  }

  const holds = await store.listHoldsForEvent(eventId, now);

  return event.seats.map((seat) => {
    const activeHold = holds.find(
      (hold) =>
        hold.status === "active" &&
        new Date(hold.expiresAt).getTime() > now.getTime() &&
        hold.seatIds.includes(seat.id)
    );

    return {
      ...seat,
      availability: activeHold ? "held" : seat.status,
      activeHoldId: activeHold?.id
    };
  });
}

export async function createSeatHold(input: {
  eventId: string;
  customerId: string;
  seatIds: string[];
  idempotencyKey?: string;
  now?: Date;
}): Promise<SeatHold> {
  const now = input.now ?? new Date();

  if (input.seatIds.length === 0) {
    throw new ApiError(400, "NO_SEATS_REQUESTED", "At least one seat is required");
  }

  if (input.seatIds.length > 8) {
    throw new ApiError(400, "TOO_MANY_SEATS", "A hold can contain at most 8 seats");
  }

  if (new Set(input.seatIds).size !== input.seatIds.length) {
    throw new ApiError(400, "DUPLICATE_SEATS", "A seat may only appear once in a hold request");
  }

  // Store checks and claims the complete set without yielding to another request.
  const result = store.claimSeats({ ...input, now });
  if (result.kind === "error") {
    throw new ApiError(result.statusCode, result.code, result.message, result.details);
  }

  return result.hold;
}

export async function getHold(holdId: string, now = new Date()): Promise<SeatHold> {
  const hold = await store.getHold(holdId, now);

  if (!hold) {
    throw new ApiError(404, "HOLD_NOT_FOUND", `Hold ${holdId} was not found`);
  }

  return hold;
}

export async function cancelHold(holdId: string): Promise<SeatHold> {
  const hold = await store.cancelHold(holdId);

  if (!hold) {
    throw new ApiError(404, "HOLD_NOT_FOUND", `Hold ${holdId} was not found`);
  }

  return hold;
}
