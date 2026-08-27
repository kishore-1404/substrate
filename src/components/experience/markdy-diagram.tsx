"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Diagram } from "@markdy/renderer-dom";

// Brand teal, not Markdy's default rainbow scene-boundary ring — the
// rainbow read as visually disconnected from the rest of the app's teal/
// coral palette.
const PROGRESS_COLOR = "#0d9488";

// Thin wrapper around @markdy/renderer-dom's createDiagram. This is the
// renderer for `visualization` / `simulation` stage payloads — living
// diagrams are a first-class product primitive (handoff §5/§15.6), never a
// static image. Uses Markdy's own player chrome (scrubber, beat nav, speed,
// fullscreen) rather than a single hand-rolled play/pause button.
//
// The diagram's theme always follows the APP's light/dark mode (editorial
// in light, blueprint in dark), overriding whatever the generated scene
// declared — a diagram that's permanently dark regardless of the reader's
// theme reads as a foreign object dropped into the page, not part of it.
export function MarkdyDiagram({ code, autoplay = false }: { code: string; autoplay?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<Diagram | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { createDiagram } = await import("@markdy/renderer-dom");
      if (cancelled || !containerRef.current) return;
      diagramRef.current?.destroy();
      diagramRef.current = createDiagram({
        container: containerRef.current,
        code,
        autoplay,
        loop: true,
        progressColor: PROGRESS_COLOR,
        controls: { playback: true, prevBeat: true, nextBeat: true, seek: true, speed: true, fit: true, fullscreen: true },
      });
      diagramRef.current.setTheme(resolvedTheme === "dark" ? "blueprint" : "editorial");
    })();
    return () => {
      cancelled = true;
      diagramRef.current?.destroy();
      diagramRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, autoplay]);

  // Live theme toggle without restarting the animation/losing playback position.
  useEffect(() => {
    diagramRef.current?.setTheme(resolvedTheme === "dark" ? "blueprint" : "editorial");
  }, [resolvedTheme]);

  return <div ref={containerRef} className="w-full overflow-hidden rounded-xl border shadow-sm" />;
}
