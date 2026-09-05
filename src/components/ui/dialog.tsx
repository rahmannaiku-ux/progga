"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thin, styled wrapper around @radix-ui/react-dialog (already a
 * dependency; there was just no shared component built on it yet).
 * Radix gives us, for free, the behaviors a hand-rolled modal tends to
 * get wrong: Escape closes, clicking outside Content closes but
 * clicking inside doesn't, focus is trapped while open and restored to
 * the trigger on close, background scroll is locked while open and
 * released on close, and the right aria-modal/aria-labelledby wiring.
 * This file only adds the app's visual styling on top, plus one fix
 * (see useThemeContainer below) for where Radix should mount the
 * dialog in this specific app's DOM.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * The app's entire visual theme — colors, `.comic-panel`, `.sticker`,
 * etc. — is scoped to a `.theme-cartoon` wrapper div in the root
 * layout, not to `:root`/`<body>` (see globals.css). Radix's
 * `Dialog.Portal` appends to `document.body` by default, which is a
 * *sibling* of that wrapper, not a descendant — a dialog portaled
 * there would render with none of the app's design tokens. This finds
 * the wrapper on the client and portals into it instead, falling back
 * to Radix's own default (document.body) if it's ever not found.
 */
function useThemeContainer() {
  const [container, setContainer] = React.useState<HTMLElement | undefined>(undefined);
  React.useEffect(() => {
    setContainer(document.querySelector<HTMLElement>(".theme-cartoon") ?? undefined);
  }, []);
  return container;
}

type DialogContentProps = {
  children: React.ReactNode;
  /** Required — becomes the dialog's accessible name (Dialog.Title)
   * and its visible header text. */
  title: string;
  /** Optional supporting text under the title. Always available to
   * screen readers (as Dialog.Description) even when not shown
   * visually, so the dialog never loses its aria-describedby target. */
  description?: string;
  /** Optional small label chip next to the title, e.g. a resource
   * type ("Google Slides"). */
  badge?: React.ReactNode;
  /** Sizing/layout overrides for the content box — the base size is
   * intentionally modest since call sites know their own content. */
  className?: string;
  /** aria-label for the close button. Defaults to "Close" — override
   * with something more specific ("Close slide preview") when a
   * single word wouldn't be clear out of context. */
  closeLabel?: string;
} & Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "className" | "title">;

export function DialogContent({
  children,
  title,
  description,
  badge,
  className,
  closeLabel = "Close",
  ...contentProps
}: DialogContentProps) {
  const container = useThemeContainer();

  return (
    <DialogPrimitive.Portal container={container}>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm",
          "opacity-0 transition-opacity duration-200 ease-out",
          "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
          "motion-reduce:transition-none"
        )}
      />
      <DialogPrimitive.Content
        {...contentProps}
        className={cn(
          // Centered, responsive box. w-[calc(100vw-2rem)] keeps a 1rem
          // margin on each side on narrow screens rather than touching
          // the viewport edges; max-w-* (from call sites, or the
          // default below) caps it on wider screens.
          "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden",
          "comic-panel bg-surface p-0 shadow-2xl",
          "opacity-0 scale-95 transition-[opacity,transform] duration-200 ease-out",
          "data-[state=open]:opacity-100 data-[state=open]:scale-100",
          "data-[state=closed]:opacity-0 data-[state=closed]:scale-95",
          "motion-reduce:transition-none",
          className
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/10 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DialogPrimitive.Title className="truncate font-display text-sm font-bold text-foreground sm:text-base">
                {title}
              </DialogPrimitive.Title>
              {badge && (
                <span className="sticker shrink-0 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {badge}
                </span>
              )}
            </div>
            {/* Always rendered so Radix always has an aria-describedby
               target — sr-only when the caller didn't supply visible
               description text, rather than omitting it and losing
               that a11y wiring. */}
            <DialogPrimitive.Description
              className={cn("truncate text-xs text-muted-foreground", !description && "sr-only")}
            >
              {description ?? `Preview of ${title}`}
            </DialogPrimitive.Description>
          </div>

          {/* h-11 w-11 (44px) keeps the tap target comfortable on
             mobile even though the icon itself is small. */}
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
