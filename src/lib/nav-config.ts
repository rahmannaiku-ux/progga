import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  LayoutDashboard,
  Bug,
  Rocket,
  Trophy,
  Award,
  BarChart3,
  Calendar,
  Bell,
  User,
  Users,
  ClipboardCheck,
  Megaphone,
  Settings,
  Shield,
  FileClock,
  Mail,
  DatabaseBackup,
  Layers,
  BookOpen,
  Wallet,
  CreditCard,
  MessageCircle,
  LifeBuoy,
  HardDrive,
  Radio,
  History,
  Video,
  UserPlus,
  Share2,
  Coins,
  Smartphone,
  ShieldAlert,
  ListTree,
  Newspaper,
  Store,
  Wrench,
  GraduationCap,
  ClipboardList,
  Inbox,
  ImagePlus,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Next.js prefetches every <Link> that's in viewport by default. The
   * sidebar/drawer render every nav item simultaneously, so on a page
   * with a long nav (admin especially) that's a burst of prefetch
   * requests for pages the user may never open in this session. Set
   * `false` only on items that are genuinely rarely visited utility
   * pages — leave everything else on the default (undefined = prefetch
   * enabled), since most items here ARE common destinations.
   */
  prefetch?: boolean;
  /**
   * Which pages light this item up. Without it, the item is active on its
   * own `href` and everything beneath it.
   */
  match?: (pathname: string) => boolean;
  /** Admin menu: shown to SUPER_ADMIN only (the pages check it too: requireSuperAdmin). */
  superAdminOnly?: boolean;
};

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

/** Whether `item` is the nav entry for the page at `pathname`. */
export function isNavItemActive(item: NavItem, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return item.match ? item.match(pathname) : under(pathname, item.href);
}

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const heroNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      // A course's own pages live at /missions/<id>/..., so they belong to
      // "My Courses". "Missions" is only the daily/weekly tracker at /missions.
      {
        label: "My Courses",
        href: "/my-courses",
        icon: BookOpen,
        match: (p) => under(p, "/my-courses") || (under(p, "/missions") && p !== "/missions"),
      },
      { label: "Missions", href: "/missions", icon: Rocket, match: (p) => p === "/missions" },
      { label: "Exams", href: "/exams", icon: GraduationCap },
      { label: "Results", href: "/results", icon: ClipboardList },
      { label: "Live Classes", href: "/live-classes", icon: Video },
      { label: "Proggy Store", href: "/store", icon: Store },
      // The birthday rewards page (/birthday) is reached from the wallet,
      // the dashboard banner and the birthday notification.
      { label: "Wallet", href: "/wallet", icon: Coins, match: (p) => under(p, "/wallet") || under(p, "/birthday") },
      { label: "Community", href: "/community", icon: MessageCircle },
      { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
      // "Certificates" in the reference design — this app calls the
      // underlying page "Medals" (same feature: earned course
      // certificates), so the label is updated without renaming the route.
      { label: "Certificates", href: "/medals", icon: Award },
      { label: "Calendar", href: "/calendar", icon: Calendar, prefetch: false },
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Support", href: "/support", icon: LifeBuoy, prefetch: false },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const mentorNav: NavSection[] = [
  {
    title: "Mentor",
    items: [
      { label: "Dashboard", href: "/mentor/dashboard", icon: LayoutDashboard },
      { label: "My Missions", href: "/mentor/missions", icon: Rocket },
      { label: "Co-mentors", href: "/mentor/co-mentors", icon: Share2, prefetch: false },
      { label: "Live Classes", href: "/mentor/live-classes", icon: Video },
      { label: "Calendar", href: "/mentor/calendar", icon: Calendar },
      { label: "Heroes", href: "/mentor/students", icon: Users },
      { label: "Grant Access", href: "/mentor/enrollments", icon: UserPlus },
      { label: "Issue Medals", href: "/mentor/medals", icon: Award },
      {
        label: "Assignment Grading",
        href: "/mentor/grading/assignments",
        icon: ClipboardCheck,
      },
      {
        label: "Exam Grading",
        href: "/mentor/grading/exams",
        icon: ClipboardCheck,
      },
      { label: "Live Exams", href: "/mentor/live-exams", icon: Radio },
      { label: "Exams", href: "/mentor/exam-history", icon: History, prefetch: false },
      { label: "Analytics", href: "/mentor/analytics", icon: BarChart3 },
      {
        label: "Announcements",
        href: "/mentor/announcements",
        icon: Megaphone,
        prefetch: false,
      },
    ],
  },
];

export const adminNav: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Reports", href: "/admin/reports", icon: BarChart3 },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Activity Logs", href: "/admin/activity-logs", icon: FileClock, prefetch: false, superAdminOnly: true },
      { label: "Bug Reports", href: "/admin/bug-reports", icon: Bug, prefetch: false },
      { label: "Community Reports", href: "/admin/community", icon: ShieldAlert, prefetch: false },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Grant Access", href: "/admin/enrollments", icon: UserPlus },
      { label: "Mission Switches", href: "/admin/mission-switches", icon: ArrowRightLeft, prefetch: false },
      { label: "Mentors", href: "/admin/mentors", icon: Shield },
      { label: "Co-mentor Requests", href: "/admin/co-mentor-requests", icon: Share2, prefetch: false },
      { label: "Payments", href: "/admin/payments", icon: CreditCard },
      { label: "Payment Devices", href: "/admin/payments/devices", icon: Smartphone, prefetch: false, superAdminOnly: true },
      { label: "Provider Rules", href: "/admin/payments/provider-rules", icon: ListTree, prefetch: false, superAdminOnly: true },
      { label: "Suspicious Transactions", href: "/admin/payments/suspicious", icon: ShieldAlert, prefetch: false },
      { label: "Heroes", href: "/admin/heroes", icon: User },
      { label: "Leaderboard", href: "/admin/leaderboard", icon: Trophy, prefetch: false },
      // admins ask here for what only a super admin may do (receiving numbers, admin access)
      { label: "Requests", href: "/admin/requests", icon: Inbox, prefetch: false },
      {
        label: "Roles & Permissions",
        href: "/admin/roles-permissions",
        icon: Shield,
        prefetch: false,
        superAdminOnly: true,
      },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Missions", href: "/admin/missions", icon: Rocket },
      { label: "Categories", href: "/admin/categories", icon: Layers },
      { label: "Blog", href: "/admin/blog", icon: Newspaper },
      { label: "Medals", href: "/admin/medals", icon: Award },
      { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { label: "Ad Studio", href: "/admin/ad-studio", icon: ImagePlus, prefetch: false },
      { label: "Calendar", href: "/admin/calendar", icon: Calendar },
      { label: "Proggy Store", href: "/admin/store", icon: Store },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Control Center", href: "/admin/control-center", icon: Wrench, superAdminOnly: true },
      { label: "Branding", href: "/admin/settings/branding", icon: Settings, prefetch: false, superAdminOnly: true },
      {
        label: "Payment Settings",
        href: "/admin/settings/payments",
        icon: Wallet,
        prefetch: false,
        superAdminOnly: true,
      },
      {
        label: "Email Templates",
        href: "/admin/settings/email-templates",
        icon: Mail,
        prefetch: false,
        superAdminOnly: true,
      },
      {
        label: "Backup & Restore",
        href: "/admin/backup-restore",
        icon: DatabaseBackup,
        prefetch: false,
        superAdminOnly: true,
      },
      { label: "Storage", href: "/admin/storage", icon: HardDrive, prefetch: false, superAdminOnly: true },
      { label: "Apps", href: "/admin/apps", icon: Smartphone, prefetch: false, superAdminOnly: true },
    ],
  },
];

/** The admin menu for an ADMIN: without the super-admin-only system pages. */
export const adminNavForAdmin: NavSection[] = adminNav
  .map((s) => ({ ...s, items: s.items.filter((i) => !i.superAdminOnly) }))
  .filter((s) => s.items.length > 0);

/** Which admin menu a role sees. */
export const adminNavKey = (role: string): "admin" | "superAdmin" => (role === "SUPER_ADMIN" ? "superAdmin" : "admin");
