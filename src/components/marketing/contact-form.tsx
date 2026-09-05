"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (submitted) {
    return (
      <p className="text-sm text-foreground">
        Thanks — your message is on its way. We typically reply within one
        business day.
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        const form = e.currentTarget;
        const data = {
          name: (form.elements.namedItem("name") as HTMLInputElement).value,
          email: (form.elements.namedItem("email") as HTMLInputElement).value,
          message: (form.elements.namedItem("message") as HTMLTextAreaElement).value,
        };

        try {
          const res = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(json.error ?? "Something went wrong — please try again.");
            return;
          }
          setSubmitted(true);
        } catch {
          setError("Couldn't reach the server — check your connection and try again.");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Name
        </label>
        <input
          name="name"
          required
          type="text"
          className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Email
        </label>
        <input
          name="email"
          required
          type="email"
          className="h-11 w-full rounded-xl border border-border/60 bg-surface px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Message
        </label>
        <textarea
          name="message"
          required
          rows={4}
          className="w-full rounded-xl border border-border/60 bg-surface px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
        {submitting ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
