import Link from "next/link";
import {
  Bell,
  Trophy,
  ClipboardCheck,
  MessageSquare,
  Flame,
  Rocket,
  Wallet,
  Megaphone,
  Award,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { MarkAllReadButton } from "@/components/gamification/mark-all-read-button";
import { NotificationRow } from "@/components/gamification/notification-row";
import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
import { formatDhakaDate } from "@/lib/timezone";

const TYPE_META: Record<NotificationType, { icon: LucideIcon; color: string }> = {
  ANNOUNCEMENT: { icon: Megaphone, color: "text-accent" },
  GRADE_POSTED: { icon: MessageSquare, color: "text-primary" },
  ENROLLMENT: { icon: Rocket, color: "text-primary" },
  CERTIFICATE_ISSUED: { icon: Award, color: "text-xp" },
  EXAM_REMINDER: { icon: ClipboardCheck, color: "text-danger" },
  ASSIGNMENT_DUE: { icon: ClipboardCheck, color: "text-accent" },
  STREAK_RISK: { icon: Flame, color: "text-danger" },
  ACHIEVEMENT_UNLOCKED: { icon: Trophy, color: "text-xp" },
  SYSTEM: { icon: Bell, color: "text-muted-foreground" },
  PAYMENT_AWAITING_VERIFICATION: { icon: Wallet, color: "text-xp" },
  PAYMENT_VERIFIED: { icon: Wallet, color: "text-accent" },
  PAYMENT_REJECTED: { icon: Wallet, color: "text-danger" },
  LIVE_CLASS_REMINDER: { icon: Video, color: "text-danger" },
};

const TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "system", label: "System" },
] as const;

function timeAgo(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDhakaDate(date);
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const user = await getCurrentUser();
  const tab = TABS.find((t) => t.key === searchParams.tab)?.key ?? "all";

  const [all, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: {
        userId: user.id,
        ...(tab === "unread" ? { isRead: false } : {}),
        ...(tab === "system" ? { type: { in: ["SYSTEM", "ANNOUNCEMENT"] } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-foreground">
            <Bell className="h-6 w-6 text-accent" /> Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {unreadCount} unread notification{unreadCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <MarkAllReadButton disabled={unreadCount === 0} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/notifications?tab=${t.key}`}
            className={`sticker-badge px-4 py-1.5 text-xs font-bold ${
              t.key === tab ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"
            }`}
          >
            {t.label}
            {t.key === "unread" && unreadCount > 0 && ` (${unreadCount})`}
          </Link>
        ))}
      </div>

      {all.length === 0 ? (
        <div className="comic-panel mt-6 bg-surface p-10 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-display text-lg font-bold text-foreground">All quiet here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "unread" ? "No unread notifications." : "Nothing to show yet — check back after your next mission."}
          </p>
        </div>
      ) : (
        <StaggerContainer className="mt-6 space-y-2.5">
          {all.map((n) => {
            const meta = TYPE_META[n.type];
            return (
              <StaggerItem key={n.id}>
                <NotificationRow id={n.id} isRead={n.isRead} linkUrl={n.linkUrl}>
                  <span className={`sticker flex h-9 w-9 shrink-0 items-center justify-center bg-muted ${meta.color}`}>
                    <meta.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-sm font-bold text-foreground">{n.title}</span>
                      {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                    <span className="mt-1 block text-[10px] font-medium text-muted-foreground">
                      {timeAgo(n.createdAt)}
                    </span>
                  </span>
                </NotificationRow>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      )}
    </div>
  );
}
