import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SeatingCanvas, type SeatingCanvasHandle } from "./components/SeatingCanvas";
import {
  flattenVenue,
  formatMoney,
  getSelectionSummary,
  sanitizeSelection,
  toggleSeatSelection
} from "./domain/seating";
import type { FixtureName, SeatRecord, Venue } from "./domain/types";
import { FIXTURE_INFO } from "./domain/types";

const fixtureNames: FixtureName[] = ["small", "medium", "large"];

function getInitialFixture(): FixtureName {
  const requested = new URLSearchParams(window.location.search).get("venue");
  return fixtureNames.includes(requested as FixtureName) ? requested as FixtureName : "medium";
}

function readPersistedSelection(venueId: string): string[] {
  try {
    const raw = window.localStorage.getItem(`seatline:selection:${venueId}`);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function App() {
  const [fixture, setFixture] = useState<FixtureName>(getInitialFixture);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeSeatId, setActiveSeatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("Choose an available seat to begin.");
  const [searchValue, setSearchValue] = useState("");
  const [searchError, setSearchError] = useState("");
  const [selectionLoadedFor, setSelectionLoadedFor] = useState<string | null>(null);
  const canvasApi = useRef<SeatingCanvasHandle>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSelectionLoadedFor(null);
    fetch(`/venues/${fixture}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load ${fixture}.json (${response.status}).`);
        return response.json() as Promise<Venue>;
      })
      .then((loadedVenue) => {
        const records = flattenVenue(loadedVenue);
        const byId = new Map(records.map((seat) => [seat.id, seat]));
        setVenue(loadedVenue);
        setSelectedIds(sanitizeSelection(readPersistedSelection(loadedVenue.venueId), byId));
        setActiveSeatId(null);
        setSelectionLoadedFor(loadedVenue.venueId);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "The venue fixture could not be loaded.");
        setLoading(false);
      });
    return () => controller.abort();
  }, [fixture]);

  const seats = useMemo(() => venue ? flattenVenue(venue) : [], [venue]);
  const seatById = useMemo(() => new Map(seats.map((seat) => [seat.id, seat])), [seats]);
  const activeSeat = activeSeatId ? seatById.get(activeSeatId) : undefined;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const summary = useMemo(
    () => venue ? getSelectionSummary(selectedIds, seatById, venue) : null,
    [selectedIds, seatById, venue]
  );

  useEffect(() => {
    if (!venue || selectionLoadedFor !== venue.venueId) return;
    try {
      window.localStorage.setItem(`seatline:selection:${venue.venueId}`, JSON.stringify(selectedIds));
    } catch {
      setNotice("Selection is active, but this browser could not save it for reload.");
    }
  }, [selectedIds, selectionLoadedFor, venue]);

  const handleSeatFocus = (seat: SeatRecord) => {
    setActiveSeatId(seat.id);
    setNotice(`${seat.id} focused. Press Enter or Space to select or remove it.`);
  };

  const handleSeatActivate = (seat: SeatRecord) => {
    setActiveSeatId(seat.id);
    const result = toggleSeatSelection(selectedIds, seat);
    if (!result.changed) {
      setNotice(result.message ?? `${seat.id} cannot be selected.`);
      return;
    }
    setSelectedIds(result.ids);
    setNotice(result.ids.includes(seat.id) ? `${seat.id} added to your selection.` : `${seat.id} removed from your selection.`);
  };

  const handleFindSeat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchValue.trim().toLocaleLowerCase();
    if (!query) {
      setSearchError("Enter a seat ID, such as A-1-01.");
      return;
    }
    const seat = seats.find((candidate) => candidate.id.toLocaleLowerCase() === query);
    if (!seat) {
      setSearchError("No matching seat ID in this fixture.");
      return;
    }
    setSearchError("");
    canvasApi.current?.focusSeat(seat.id);
  };

  const removeSeat = (seatId: string) => {
    setSelectedIds((current) => current.filter((id) => id !== seatId));
    setNotice(`${seatId} removed from your selection.`);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setNotice("Your seat selection is clear.");
  };

  const statusClass = (status: string) => `status-dot status-${status}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main" aria-label="Seatline home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>seatline<span className="brand-period">.</span></span>
        </a>
        <div className="event-context">
          <span className="context-label">TICKETING / SEAT SELECTION</span>
          <span className="context-divider" aria-hidden="true" />
          <span className="context-name">{venue?.name ?? "Choose a venue"}</span>
        </div>
        <div className="topbar-step"><span>01</span><span className="step-line" /><span>SELECT SEATS</span></div>
      </header>

      <section className="page-heading" id="main">
        <div>
          <p className="eyebrow">YOUR NIGHT, YOUR VIEW</p>
          <h1>Choose your seats<span className="heading-period">.</span></h1>
          <p className="heading-copy">Tap or focus a seat to see the details. Available seats are yours to choose.</p>
        </div>
        <div className="fixture-control">
          <label htmlFor="fixture-select">Venue data</label>
          <select id="fixture-select" value={fixture} onChange={(event) => setFixture(event.target.value as FixtureName)}>
            {fixtureNames.map((name) => (
              <option key={name} value={name}>{FIXTURE_INFO[name].label} · {FIXTURE_INFO[name].count}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="content-grid">
        <div className="map-column">
          <section className="finder-card" aria-label="Find a seat">
            <form className="seat-finder" onSubmit={handleFindSeat}>
              <label htmlFor="seat-search"><span className="search-icon" aria-hidden="true">⌕</span><span className="visually-hidden">Find a seat by ID</span></label>
              <input
                id="seat-search"
                type="search"
                value={searchValue}
                onChange={(event) => { setSearchValue(event.target.value); setSearchError(""); }}
                placeholder="Find a seat by ID (e.g. A-1-01)"
                aria-describedby={searchError ? "search-error" : undefined}
              />
              <button type="submit">Find seat <span aria-hidden="true">↗</span></button>
            </form>
            {searchError && <p id="search-error" className="search-error" role="alert">{searchError}</p>}
          </section>

          {loading && <div className="loading-card" role="status"><span className="loader" />Loading venue map…</div>}
          {error && <div className="error-card" role="alert"><strong>Map unavailable</strong><span>{error}</span></div>}
          {venue && !loading && (
            <SeatingCanvas
              ref={canvasApi}
              venue={venue}
              seats={seats}
              selectedIds={selectedSet}
              activeSeatId={activeSeatId}
              onFocusSeat={handleSeatFocus}
              onActivateSeat={handleSeatActivate}
            />
          )}

          {venue && (
            <div className="legend-strip" aria-label="Seat availability legend">
              <span className="legend-title">SEAT STATUS</span>
              <span><i className="legend-seat available" />Available</span>
              <span><i className="legend-seat reserved" />Reserved</span>
              <span><i className="legend-seat held" />Held</span>
              <span><i className="legend-seat sold" />Sold</span>
              <span><i className="legend-seat selected" />Your selection</span>
            </div>
          )}
        </div>

        <aside className="details-column" aria-label="Seat details and selection">
          <section className="detail-card">
            <div className="card-heading">
              <div><p className="eyebrow">SEAT DETAILS</p><h2>{activeSeat ? activeSeat.id : "Nothing selected"}</h2></div>
              {activeSeat && <span className={`availability-pill ${activeSeat.status}`}>{activeSeat.status}</span>}
            </div>
            {activeSeat && venue ? (
              <>
                <div className="detail-location"><span>{activeSeat.sectionLabel}</span><span aria-hidden="true">/</span><span>Row {activeSeat.rowLabel}</span><span aria-hidden="true">/</span><span>Seat {activeSeat.col}</span></div>
                <div className="detail-price-row">
                  <span>{venue.priceTiers[String(activeSeat.priceTier)]?.label ?? `Tier ${activeSeat.priceTier}`}</span>
                  <strong>{venue.priceTiers[String(activeSeat.priceTier)]
                    ? formatMoney(venue.priceTiers[String(activeSeat.priceTier)]!.priceCents, venue.priceTiers[String(activeSeat.priceTier)]!.currency)
                    : "Price unavailable"}</strong>
                </div>
                <p className={`seat-message ${activeSeat.status === "available" ? "available-message" : "unavailable-message"}`}>
                  <span className={statusClass(activeSeat.status)} aria-hidden="true" />
                  {activeSeat.status === "available" ? "Available to select" : `${activeSeat.status[0]?.toUpperCase()}${activeSeat.status.slice(1)} — unavailable to select`}
                </p>
              </>
            ) : (
              <p className="empty-detail">Choose or focus any seat on the map to see its section, row, tier and availability.</p>
            )}
          </section>

          <section className="selection-card" aria-labelledby="selection-heading">
            <div className="card-heading selection-heading-row">
              <div><p className="eyebrow">YOUR ORDER</p><h2 id="selection-heading">Selected seats</h2></div>
              <span className="selection-count">{selectedIds.length}<span> / 8</span></span>
            </div>
            {summary && summary.lines.length > 0 ? (
              <ul className="selected-list">
                {summary.lines.map(({ seat, priceCents, currency, tierLabel }) => (
                  <li key={seat.id} className="selected-seat">
                    <span className="selected-seat-icon" aria-hidden="true">✓</span>
                    <span className="selected-seat-copy"><strong>{seat.sectionLabel} · Row {seat.rowLabel}</strong><small>Seat {seat.col} · {tierLabel}</small></span>
                    <span className="selected-seat-price">{formatMoney(priceCents, currency)}</span>
                    <button type="button" className="remove-seat" onClick={() => removeSeat(seat.id)} aria-label={`Remove ${seat.id}`}>×</button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-selection"><span className="empty-ticket" aria-hidden="true">＋</span><span>Your seats will appear here.</span><small>Choose up to eight available seats.</small></div>
            )}
            <div className="subtotal-row"><span>Subtotal</span><strong>{summary ? formatMoney(summary.subtotalCents, summary.currency) : "—"}</strong></div>
            <p className="fee-note">Taxes and fees, if any, are calculated at checkout.</p>
            <button type="button" className="clear-button" onClick={clearSelection} disabled={selectedIds.length === 0}>Clear selection</button>
          </section>

          <section className="tip-card">
            <span className="tip-icon" aria-hidden="true">i</span>
            <p><strong>Map tip</strong> Use the arrow keys after focusing the map. Search by seat ID to jump directly to a location.</p>
          </section>
        </aside>
      </div>

      <footer className="page-footer">
        <span>SEATLINE · INTERACTIVE VENUE MAP</span>
        <span>{venue ? `${seats.length.toLocaleString()} seats mapped` : "Fixture-powered demo"}</span>
      </footer>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {activeSeat ? `${activeSeat.sectionLabel}, row ${activeSeat.rowLabel}, seat ${activeSeat.col}, ${activeSeat.status}. ${notice}` : notice}
      </div>
    </main>
  );
}

export default App;
