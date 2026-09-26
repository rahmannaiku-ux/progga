"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Avatar from "@radix-ui/react-avatar";
import { User, LogOut } from "lucide-react";
import { logoutAction } from "@/server/actions/auth-actions";

/**
 * PHASE 5: replaces Clerk's <UserButton>. Deliberately self-contained
 * and prop-free — it doesn't need the viewer's name/avatar plumbed in
 * from every Topbar call site across (hero)/(mentor)/(admin); it only
 * needs to offer "Profile" and "Sign out", which is everything
 * <UserButton> was actually used for here (no afterSignOutUrl-style
 * config beyond "go to /login", no org switcher, none of Clerk's other
 * account-management surface was in use). Renders a generic avatar
 * icon rather than fetching/displaying the real avatarUrl, specifically
 * to avoid adding a client-side user-info fetch (session tokens,
 * password hashes, etc. must never reach client state — see Phase 4's
 * toSafeUser pattern) just for this.
 */
export function AccountMenu() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    setOpen(false);
    startTransition(async () => {
      await logoutAction();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          disabled={isPending}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/15 bg-surface text-muted-foreground transition-transform hover:-translate-y-0.5 hover:text-foreground disabled:opacity-50"
        >
          <Avatar.Root className="flex h-full w-full items-center justify-center overflow-hidden rounded-full">
            <Avatar.Fallback delayMs={0}>
              <User className="h-4 w-4" />
            </Avatar.Fallback>
          </Avatar.Root>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[10rem] rounded-xl border border-border/15 bg-surface p-1 shadow-card-hover"
        >
          <DropdownMenu.Item asChild>
            <Link
              href="/profile"
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted"
            >
              <User className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={handleLogout}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger outline-none hover:bg-muted focus:bg-muted"
          >
            <LogOut className="h-4 w-4" />
            {isPending ? "Signing out..." : "Sign out"}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
