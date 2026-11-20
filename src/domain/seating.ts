import type { SeatRecord, Venue, VenueSeat } from "./types";

export function flattenVenue(venue: Venue): SeatRecord[] {
  return venue.sections.flatMap((section) =>
    section.rows.flatMap((row) =>
      row.seats.map((seat) => ({
        ...seat,
        sectionId: section.id,
        sectionLabel: section.label,
        rowIndex: row.index,
        rowLabel: row.label
      }))
    )
  );
}

export interface SelectionResult {
  ids: string[];
  changed: boolean;
  message?: string;
}

export function sanitizeSelection(
  persistedIds: string[],
  seatById: ReadonlyMap<string, SeatRecord>,
  limit = 8
): string[] {
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const id of persistedIds) {
    if (seen.has(id)) continue;
    const seat = seatById.get(id);
    if (!seat || seat.status !== "available") continue;
    seen.add(id);
    valid.push(id);
    if (valid.length >= limit) break;
  }
  return valid;
}

export function toggleSeatSelection(
  selectedIds: string[],
  seat: SeatRecord,
  limit = 8
): SelectionResult {
  if (selectedIds.includes(seat.id)) {
    return { ids: selectedIds.filter((id) => id !== seat.id), changed: true };
  }
  if (seat.status !== "available") {
    return {
      ids: selectedIds,
      changed: false,
      message: `${seat.id} is ${seat.status} and cannot be selected.`
    };
  }
  if (selectedIds.length >= limit) {
    return {
      ids: selectedIds,
      changed: false,
      message: `You can select up to ${limit} seats. Remove one to choose another.`
    };
  }
  return { ids: [...selectedIds, seat.id], changed: true };
}

export interface SelectionLine {
  seat: SeatRecord;
  priceCents: number;
  currency: string;
  tierLabel: string;
}

export interface SelectionSummary {
  lines: SelectionLine[];
  subtotalCents: number;
  currency: string;
}

export function getSelectionSummary(
  selectedIds: string[],
  seatById: ReadonlyMap<string, SeatRecord>,
  venue: Venue
): SelectionSummary {
  const lines: SelectionLine[] = [];
  for (const id of selectedIds) {
    const seat = seatById.get(id);
    const tier = seat ? venue.priceTiers[String(seat.priceTier)] : undefined;
    if (!seat || !tier) continue;
    lines.push({ seat, priceCents: tier.priceCents, currency: tier.currency, tierLabel: tier.label });
  }
  const currency = lines[0]?.currency ?? Object.values(venue.priceTiers)[0]?.currency ?? "USD";
  return {
    lines,
    subtotalCents: lines.reduce((total, line) => total + line.priceCents, 0),
    currency
  };
}

export function formatMoney(cents: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export type Direction = "left" | "right" | "up" | "down";

export function findDirectionalNeighbor(
  currentId: string,
  seats: SeatRecord[],
  direction: Direction
): SeatRecord | undefined {
  const current = seats.find((seat) => seat.id === currentId);
  if (!current) return seats[0];

  let best: SeatRecord | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of seats) {
    if (candidate.id === current.id) continue;
    const dx = candidate.x - current.x;
    const dy = candidate.y - current.y;
    const forward = direction === "left" ? -dx
      : direction === "right" ? dx
        : direction === "up" ? -dy : dy;
    if (forward <= 0.01) continue;
    const lateral = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = forward + lateral * 1.8 + (lateral * lateral) / Math.max(forward, 1);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

const DEFAULT_CELL_SIZE = 24;
export type SpatialIndex = Map<string, SeatRecord[]>;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function buildSpatialIndex(seats: SeatRecord[], cellSize = DEFAULT_CELL_SIZE): SpatialIndex {
  const index: SpatialIndex = new Map();
  for (const seat of seats) {
    const key = cellKey(Math.floor(seat.x / cellSize), Math.floor(seat.y / cellSize));
    const cell = index.get(key);
    if (cell) cell.push(seat);
    else index.set(key, [seat]);
  }
  return index;
}

export function hitTestSeat(
  x: number,
  y: number,
  index: SpatialIndex,
  tolerance: number,
  cellSize = DEFAULT_CELL_SIZE
): SeatRecord | undefined {
  const cellX = Math.floor(x / cellSize);
  const cellY = Math.floor(y / cellSize);
  const cellRadius = Math.ceil(tolerance / cellSize);
  let nearest: SeatRecord | undefined;
  let nearestDistance = tolerance * tolerance;
  for (let gx = cellX - cellRadius; gx <= cellX + cellRadius; gx += 1) {
    for (let gy = cellY - cellRadius; gy <= cellY + cellRadius; gy += 1) {
      const cell = index.get(cellKey(gx, gy));
      if (!cell) continue;
      for (const seat of cell) {
        const dx = seat.x - x;
        const dy = seat.y - y;
        const distance = dx * dx + dy * dy;
        if (distance <= nearestDistance) {
          nearest = seat;
          nearestDistance = distance;
        }
      }
    }
  }
  return nearest;
}

export function isSelectable(seat: VenueSeat): boolean {
  return seat.status === "available";
}
