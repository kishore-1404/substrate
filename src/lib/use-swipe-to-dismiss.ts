"use client";

import { useRef, useState } from "react";

// Drag-to-dismiss for mobile bottom sheets — attach `handlers` to a small
// grab-bar element (not the whole sheet, so scrolling the sheet's own
// content isn't hijacked by the same gesture) and apply `dragY` as a
// translateY while dragging.
export function useSwipeToDismiss(onDismiss: () => void, thresholdPx = 80) {
  const startY = useRef<number | null>(null);
  // Live value read by onTouchEnd — a fast flick can fire touchmove then
  // touchend before React has committed the state update from the move, so
  // the dismiss decision can't depend on `dragY` state being up to date yet.
  const liveDelta = useRef(0);
  const [dragY, setDragY] = useState(0);

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
    liveDelta.current = 0;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      liveDelta.current = delta;
      setDragY(delta);
    }
  }
  function onTouchEnd() {
    if (liveDelta.current > thresholdPx) onDismiss();
    liveDelta.current = 0;
    setDragY(0);
    startY.current = null;
  }

  return { dragY, handlers: { onTouchStart, onTouchMove, onTouchEnd } };
}
