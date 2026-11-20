export type SeatStatus = "available" | "reserved" | "sold" | "held";

export interface PriceTier {
  label: string;
  priceCents: number;
  currency: string;
}

export interface VenueSeat {
  id: string;
  col: number;
  x: number;
  y: number;
  priceTier: number;
  status: SeatStatus;
}

export interface VenueRow {
  index: number;
  label: string;
  seats: VenueSeat[];
}

export interface VenueSection {
  id: string;
  label: string;
  transform: { x: number; y: number; scale: number };
  rows: VenueRow[];
}

export interface Venue {
  venueId: string;
  name: string;
  map: { width: number; height: number };
  priceTiers: Record<string, PriceTier>;
  sections: VenueSection[];
}

export interface SeatRecord extends VenueSeat {
  sectionId: string;
  sectionLabel: string;
  rowIndex: number;
  rowLabel: string;
}

export type FixtureName = "small" | "medium" | "large";

export const FIXTURE_INFO: Record<FixtureName, { label: string; count: string }> = {
  small: { label: "Small", count: "144 seats" },
  medium: { label: "Medium", count: "2,500 seats" },
  large: { label: "Large", count: "15,000 seats" }
};
