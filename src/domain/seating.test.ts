import { describe, expect, it } from "vitest";
import {
  buildSpatialIndex,
  findDirectionalNeighbor,
  getSelectionSummary,
  hitTestSeat,
  sanitizeSelection,
  toggleSeatSelection
} from "./seating";
import type { SeatRecord, Venue } from "./types";

const seats: SeatRecord[] = [
  { id: "A-1-01", col: 1, x: 10, y: 10, priceTier: 1, status: "available", sectionId: "A", sectionLabel: "Lower A", rowIndex: 1, rowLabel: "1" },
  { id: "A-1-02", col: 2, x: 30, y: 10, priceTier: 2, status: "available", sectionId: "A", sectionLabel: "Lower A", rowIndex: 1, rowLabel: "1" },
  { id: "A-2-01", col: 1, x: 12, y: 30, priceTier: 1, status: "sold", sectionId: "A", sectionLabel: "Lower A", rowIndex: 2, rowLabel: "2" }
];
const seatById = new Map(seats.map((seat) => [seat.id, seat]));
const venue: Venue = {
  venueId: "test-venue",
  name: "Test Hall",
  map: { width: 100, height: 100 },
  priceTiers: {
    "1": { label: "Standard", priceCents: 4500, currency: "USD" },
    "2": { label: "Premium", priceCents: 7200, currency: "USD" }
  },
  sections: []
};

describe("selection rules", () => {
  it("removes missing, unavailable, duplicate and over-limit persisted IDs", () => {
    expect(sanitizeSelection(["gone", "A-2-01", "A-1-01", "A-1-01", "A-1-02"], seatById, 1)).toEqual(["A-1-01"]);
  });

  it("allows toggling available seats but blocks unavailable seats and a ninth seat", () => {
    expect(toggleSeatSelection([], seats[0]!).ids).toEqual(["A-1-01"]);
    expect(toggleSeatSelection(["A-1-01"], seats[0]!).ids).toEqual([]);
    expect(toggleSeatSelection([], seats[2]!).message).toContain("sold");
    const eight = Array.from({ length: 8 }, (_, index) => `seat-${index}`);
    expect(toggleSeatSelection(eight, seats[0]!).message).toContain("up to 8");
  });

  it("computes subtotal from the selected seats' price tiers", () => {
    expect(getSelectionSummary(["A-1-01", "A-1-02"], seatById, venue)).toMatchObject({
      subtotalCents: 11700,
      currency: "USD",
      lines: [{ tierLabel: "Standard" }, { tierLabel: "Premium" }]
    });
  });
});

describe("seat navigation and hit testing", () => {
  it("moves to the next seat in the requested geometric direction", () => {
    expect(findDirectionalNeighbor("A-1-01", seats, "right")?.id).toBe("A-1-02");
    expect(findDirectionalNeighbor("A-1-01", seats, "down")?.id).toBe("A-2-01");
  });

  it("uses its spatial index to return the nearest seat inside the hit radius", () => {
    const index = buildSpatialIndex(seats);
    expect(hitTestSeat(29, 11, index, 5)?.id).toBe("A-1-02");
    expect(hitTestSeat(80, 80, index, 5)).toBeUndefined();
  });
});
