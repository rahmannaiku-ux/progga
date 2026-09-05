"use client";

import { useTransition } from "react";
import Link from "next/link";
import { markNotificationRead } from "@/server/actions/notification-actions";

export function NotificationRow({
  id,
  isRead,
  linkUrl,
  children,
}: {
  id: string;
  isRead: boolean;
  linkUrl: string | null;
  children: React.ReactNode;
}) {
  const [, startTransition] = useTransition();

  const handleClick = () => {
    if (!isRead) startTransition(() => markNotificationRead(id));
  };

  const className = `comic-panel relative flex items-start gap-3 bg-surface p-4 transition-transform ${
    !isRead ? "border-primary" : ""
  }`;

  if (linkUrl) {
    return (
      <Link href={linkUrl} onClick={handleClick} className={`${className} hover-glow-card`}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={`${className} w-full text-left`}>
      {children}
    </button>
  );
}
