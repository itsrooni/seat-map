import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import {
  buildSpatialIndex,
  findDirectionalNeighbor,
  hitTestSeat,
  type Direction
} from "../domain/seating";
import type { SeatRecord, SeatStatus, Venue } from "../domain/types";

interface SeatingCanvasProps {
  venue: Venue;
  seats: SeatRecord[];
  selectedIds: ReadonlySet<string>;
  activeSeatId: string | null;
  onFocusSeat: (seat: SeatRecord) => void;
  onActivateSeat: (seat: SeatRecord) => void;
}

export interface SeatingCanvasHandle {
  focusSeat: (seatId: string) => boolean;
}

interface Viewport {
  width: number;
  height: number;
}

interface Pan {
  x: number;
  y: number;
}

const statusColor: Record<SeatStatus, string> = {
  available: "#48d6b2",
  reserved: "#d7aa5d",
  sold: "#637082",
  held: "#f08d76"
};

function getFitScale(viewport: Viewport, venue: Venue): number {
  if (!viewport.width || !viewport.height) return 1;
  return Math.min((viewport.width - 44) / venue.map.width, (viewport.height - 44) / venue.map.height);
}

function getTransform(viewport: Viewport, venue: Venue, zoom: number, pan: Pan) {
  const scale = getFitScale(viewport, venue) * zoom;
  return {
    scale,
    offsetX: (viewport.width - venue.map.width * scale) / 2 + pan.x,
    offsetY: (viewport.height - venue.map.height * scale) / 2 + pan.y
  };
}

export const SeatingCanvas = forwardRef<SeatingCanvasHandle, SeatingCanvasProps>(function SeatingCanvas(
  { venue, seats, selectedIds, activeSeatId, onFocusSeat, onActivateSeat },
  forwardedRef
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestureRef = useRef<{ startX: number; startY: number; lastX: number; lastY: number; moved: boolean } | null>(null);
  const index = useMemo(() => buildSpatialIndex(seats), [seats]);
  const [viewport, setViewport] = useState<Viewport>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(forwardedRef, () => ({
    focusSeat(seatId: string) {
      const seat = seats.find((candidate) => candidate.id === seatId);
      if (!seat) return false;
      const nextZoom = Math.max(zoom, 1.8);
      const scale = getFitScale(viewport, venue) * nextZoom;
      const centeredOffsetX = (viewport.width - venue.map.width * scale) / 2;
      const centeredOffsetY = (viewport.height - venue.map.height * scale) / 2;
      setZoom(nextZoom);
      setPan({
        x: viewport.width / 2 - centeredOffsetX - seat.x * scale,
        y: viewport.height / 2 - centeredOffsetY - seat.y * scale
      });
      onFocusSeat(seat);
      requestAnimationFrame(() => canvasRef.current?.focus());
      return true;
    }
  }), [onFocusSeat, seats, venue, viewport, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !viewport.width || !viewport.height) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport.width, viewport.height);
    context.fillStyle = "#0d1721";
    context.fillRect(0, 0, viewport.width, viewport.height);

    const transform = getTransform(viewport, venue, zoom, pan);
    context.save();
    context.translate(transform.offsetX, transform.offsetY);
    context.scale(transform.scale, transform.scale);

    const centerX = venue.map.width / 2;
    const centerY = venue.map.height / 2;
    context.strokeStyle = "rgba(120, 153, 169, 0.08)";
    context.lineWidth = 1 / transform.scale;
    for (const radius of [venue.map.width * 0.13, venue.map.width * 0.23, venue.map.width * 0.34]) {
      context.beginPath();
      context.ellipse(centerX, centerY, radius, radius * 0.7, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.fillStyle = "#182a36";
    context.strokeStyle = "rgba(72, 214, 178, 0.38)";
    context.lineWidth = 1.5 / transform.scale;
    const stageWidth = venue.map.width * 0.13;
    const stageHeight = venue.map.height * 0.055;
    context.beginPath();
    context.roundRect(centerX - stageWidth / 2, centerY - stageHeight / 2, stageWidth, stageHeight, 8 / transform.scale);
    context.fill();
    context.stroke();
    context.fillStyle = "#89a2ad";
    context.font = `${Math.max(8, 10 / transform.scale)}px "IBM Plex Sans", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("STAGE", centerX, centerY);

    const radius = Math.max(2.1 / transform.scale, Math.min(3.7 / transform.scale, 4.2));
    const statuses: SeatStatus[] = ["available", "reserved", "held", "sold"];
    for (const status of statuses) {
      context.beginPath();
      for (const seat of seats) {
        if (seat.status === status && !selectedIds.has(seat.id)) {
          context.moveTo(seat.x + radius, seat.y);
          context.arc(seat.x, seat.y, radius, 0, Math.PI * 2);
        }
      }
      context.fillStyle = statusColor[status];
      context.fill();
    }

    for (const seat of seats) {
      if (!selectedIds.has(seat.id)) continue;
      context.beginPath();
      context.arc(seat.x, seat.y, radius + 2.5 / transform.scale, 0, Math.PI * 2);
      context.fillStyle = "rgba(72, 214, 178, 0.23)";
      context.fill();
      context.beginPath();
      context.arc(seat.x, seat.y, radius, 0, Math.PI * 2);
      context.fillStyle = "#eff8f4";
      context.fill();
      context.strokeStyle = "#48d6b2";
      context.lineWidth = 1.7 / transform.scale;
      context.stroke();
    }

    const activeSeat = seats.find((seat) => seat.id === activeSeatId);
    if (activeSeat) {
      context.beginPath();
      context.arc(activeSeat.x, activeSeat.y, radius + 4 / transform.scale, 0, Math.PI * 2);
      context.strokeStyle = "#fff4d2";
      context.lineWidth = 1.5 / transform.scale;
      context.stroke();
    }
    context.restore();
  }, [activeSeatId, pan, selectedIds, seats, venue, viewport, zoom]);

  const changeZoom = (factor: number) => setZoom((value) => Math.min(5, Math.max(1, value * factor)));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const getWorldPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const transform = getTransform(viewport, venue, zoom, pan);
    return {
      x: (clientX - rect.left - transform.offsetX) / transform.scale,
      y: (clientY - rect.top - transform.offsetY) / transform.scale,
      scale: transform.scale
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    gestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || event.buttons === 0) return;
    const totalX = event.clientX - gesture.startX;
    const totalY = event.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(totalX, totalY) < 5) return;
    gesture.moved = true;
    const dx = event.clientX - gesture.lastX;
    const dy = event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    setPan((current) => ({ x: current.x + dx, y: current.y + dy }));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture || gesture.moved) return;
    const point = getWorldPoint(event.clientX, event.clientY);
    if (!point) return;
    const seat = hitTestSeat(point.x, point.y, index, 13 / point.scale);
    if (seat) onActivateSeat(seat);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const directionByKey: Record<string, Direction> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down"
    };
    const direction = directionByKey[event.key];
    if (direction) {
      event.preventDefault();
      const next = findDirectionalNeighbor(activeSeatId ?? "", seats, direction);
      if (next) onFocusSeat(next);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && activeSeatId) {
      event.preventDefault();
      const active = seats.find((seat) => seat.id === activeSeatId);
      if (active) onActivateSeat(active);
    }
    if (event.key === "Home" && seats[0]) {
      event.preventDefault();
      onFocusSeat(seats[0]);
    }
    if (event.key === "End" && seats.length) {
      event.preventDefault();
      onFocusSeat(seats[seats.length - 1]!);
    }
  };

  return (
    <section className="map-panel" aria-labelledby="map-heading">
      <div className="map-toolbar">
        <div>
          <p className="eyebrow">VENUE MAP</p>
          <h2 id="map-heading">Find your view</h2>
        </div>
        <div className="map-controls" aria-label="Map view controls">
          <button type="button" className="icon-button" onClick={() => changeZoom(1.25)} aria-label="Zoom in">+</button>
          <button type="button" className="icon-button" onClick={() => changeZoom(0.8)} aria-label="Zoom out">−</button>
          <button type="button" className="fit-button" onClick={resetView}>Fit map</button>
        </div>
      </div>
      <div className="map-stage" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="seating-canvas"
          tabIndex={0}
          role="application"
          aria-label="Interactive venue seating map. Use arrow keys to move between seats, Enter or Space to select or deselect, Home for the first seat, and End for the last seat."
          aria-describedby="map-key-instructions"
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <div className="map-hint" id="map-key-instructions">
          <span className="keyboard-cue">↑ ↓ ← →</span>
          <span>Move seat focus</span>
          <span className="hint-divider" aria-hidden="true">·</span>
          <span><kbd>Enter</kbd> Select</span>
          <span className="hint-divider" aria-hidden="true">·</span>
          <span>Drag to pan</span>
        </div>
      </div>
    </section>
  );
});
