"use client";

import { useEffect, useRef } from "react";

/**
 * Fires the join/leave calls to /api/live/[id]/attendance. Join happens
 * once on mount (guarded against StrictMode's dev-only double-invoke);
 * leave happens on unmount AND on pagehide/visibilitychange-to-hidden
 * via sendBeacon, since a closed tab or phone app-switch does not
 * reliably run a React cleanup effect. sendBeacon carries the existing
 * session cookie automatically (same-origin), which is what
 * /api/live/[id]/attendance's "leave" branch relies on instead of an
 * Authorization header it could never receive from a beacon.
 */
export function AttendanceTracker({ liveClassId }: { liveClassId: string }) {
  const joinedOnce = useRef(false);
  const leftRef = useRef(false);

  useEffect(() => {
    if (joinedOnce.current) return;
    joinedOnce.current = true;
    void fetch(`/api/live/${liveClassId}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join" }),
      keepalive: true,
    }).catch(() => {
      /* best-effort -- attendance is not gating, joining the room already succeeded */
    });

    function sendLeave() {
      if (leftRef.current) return;
      leftRef.current = true;
      const payload = new Blob([JSON.stringify({ action: "leave" })], { type: "application/json" });
      if (!navigator.sendBeacon(`/api/live/${liveClassId}/attendance`, payload)) {
        void fetch(`/api/live/${liveClassId}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave" }),
          keepalive: true,
        }).catch(() => {});
      }
    }

    document.addEventListener("pagehide", sendLeave);
    return () => {
      document.removeEventListener("pagehide", sendLeave);
      sendLeave();
    };
  }, [liveClassId]);

  return null;
}
