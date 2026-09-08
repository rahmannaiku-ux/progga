"use client";

import { useState, useTransition } from "react";
import { Send, CheckCircle2, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDhakaDate, formatDhakaTime } from "@/lib/timezone";
import {
  generateTelegramLinkTokenAction,
  unlinkTelegramAction,
} from "@/server/actions/telegram-settings-actions";

type LinkStatus =
  | { linked: true; telegramId: string; linkedAt: Date }
  | { linked: false };

export function TelegramLinkPanel({ initialStatus }: { initialStatus: LinkStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateTelegramLinkTokenAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToken(result.token);
      setExpiresAt(result.expiresAt);
    });
  }

  function handleUnlink() {
    setError(null);
    startTransition(async () => {
      await unlinkTelegramAction();
      setStatus({ linked: false });
      setToken(null);
    });
  }

  if (status.linked) {
    return (
      <div className="comic-panel bg-surface p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-accent" />
          <p className="font-semibold text-foreground">Telegram connected</p>
          <Badge variant="accent">Active</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Linked since {formatDhakaDate(status.linkedAt)}. Your dashboard, exams, results, and notifications are available in the Proggaa Telegram bot.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={handleUnlink} disabled={isPending}>
          {isPending ? "Unlinking..." : "Unlink Telegram"}
        </Button>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="comic-panel bg-surface p-5">
      <div className="flex items-center gap-2">
        <Send className="h-5 w-5 text-muted-foreground" />
        <p className="font-semibold text-foreground">Not connected</p>
      </div>

      {!token ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Generate a one-time code, then send it to the Proggaa Telegram bot to connect your account.
          </p>
          <Button variant="accent" size="sm" className="mt-4" onClick={handleGenerate} disabled={isPending}>
            {isPending ? "Generating..." : "Generate code"}
          </Button>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background px-4 py-3">
            <code className="flex-1 font-mono text-lg font-bold tracking-wide text-foreground">{token}</code>
            <button
              type="button"
              aria-label="Copy code"
              onClick={() => {
                navigator.clipboard.writeText(token);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rounded-lg p-2 text-muted-foreground hover:bg-surface"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {copied && <p className="text-xs text-accent">Copied!</p>}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {expiresAt && `Expires at ${formatDhakaTime(expiresAt)}`} — one-time use.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Open the Proggaa bot on Telegram.</li>
            <li>
              Send <code className="rounded bg-background px-1">/link</code>.
            </li>
            <li>Paste this code when asked.</li>
          </ol>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isPending}>
            {isPending ? "Generating..." : "Generate a new code"}
          </Button>
        </div>
      )}
    </div>
  );
}
