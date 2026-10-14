"use client";

import { useEffect, useState, useTransition } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/server/actions/birthday-actions";

type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Settings card that turns Proggaa phone notifications (Web Push) on or off
 * for THIS device. Nothing is sent until the student presses the button and
 * allows notifications in the browser's own prompt.
 */
export function PhoneNotificationsCard({ vapidPublicKey, deviceCount }: { vapidPublicKey: string | null; deviceCount: number }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const sub = await currentSubscription();
        if (cancelled) return;
        if (sub && Notification.permission === "granted") {
          // Keep the server in step (e.g. someone else signed in on this device before).
          await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent).catch(() => undefined);
          setState("on");
        } else {
          setState("off");
        }
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    if (!vapidPublicKey) return;
    setError(null);
    startTransition(async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }));
        const res = await savePushSubscriptionAction(sub.toJSON(), navigator.userAgent);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setState("on");
      } catch {
        setError("Couldn't turn on notifications on this device. Please try again.");
      }
    });
  }

  function disable() {
    setError(null);
    startTransition(async () => {
      try {
        const sub = await currentSubscription();
        if (sub) {
          await removePushSubscriptionAction(sub.endpoint);
          await sub.unsubscribe();
        }
        setState("off");
      } catch {
        setError("Couldn't turn off notifications. Please try again.");
      }
    });
  }

  return (
    <div className="comic-panel bg-surface p-5">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
        <Smartphone className="h-4 w-4 text-accent" aria-hidden="true" /> Phone notifications
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Get important Proggaa messages, like your birthday surprise, on this phone or computer even when Proggaa is closed.
        Messages show only a short title and text, never your account details.
      </p>

      <div className="mt-4 space-y-3" aria-live="polite">
        {!vapidPublicKey ? (
          <p className="text-sm text-muted-foreground">Phone notifications aren&rsquo;t available yet.</p>
        ) : state === "checking" ? (
          <p className="text-sm text-muted-foreground">Checking this device…</p>
        ) : state === "unsupported" ? (
          <p className="text-sm text-muted-foreground">This browser can&rsquo;t receive notifications. Try Chrome, Edge, Firefox or Samsung Internet.</p>
        ) : state === "ios-install" ? (
          <p className="text-sm text-muted-foreground">
            On iPhone and iPad: tap <span className="font-semibold text-foreground">Share → Add to Home Screen</span>, open Proggaa
            from your Home Screen, then come back here to turn notifications on.
          </p>
        ) : state === "denied" ? (
          <p className="text-sm text-muted-foreground">
            Notifications are blocked for Proggaa in this browser. Allow them in the browser&rsquo;s site settings, then reload this page.
          </p>
        ) : state === "on" ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BellRing className="h-4 w-4 text-accent" aria-hidden="true" /> On for this device
            </p>
            <Button type="button" variant="outline" onClick={disable} disabled={isPending}>
              {isPending ? "Turning off…" : "Turn off on this device"}
            </Button>
          </>
        ) : (
          <Button type="button" variant="primary" onClick={enable} disabled={isPending}>
            {isPending ? "Turning on…" : "Turn on phone notifications"}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {deviceCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Turned on for {deviceCount} device{deviceCount === 1 ? "" : "s"} on your account.
          </p>
        )}
      </div>
    </div>
  );
}
