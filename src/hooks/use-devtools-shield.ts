"use client";

import { useEffect, useRef } from "react";
import { onDevToolsDetected } from "@/lib/security/anti-devtools";

/**
 * Runs `onDetected` the moment the anti-DevTools monitor decides DevTools is
 * open — just BEFORE it navigates to /security/devtools. Protected media
 * (the YouTube player, the live-class frame) uses it to pause and cover
 * itself. Hiding an iframe does not protect the stream from a determined
 * user; it only removes the easy "watch while inspecting" path.
 */
export function useDevToolsShield(onDetected: () => void) {
  const ref = useRef(onDetected);
  ref.current = onDetected;
  useEffect(() => onDevToolsDetected(() => ref.current()), []);
}
