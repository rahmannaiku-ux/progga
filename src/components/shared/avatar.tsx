diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/next.config.mjs /home/claude/proggaa/next.config.mjs
--- /tmp/proggaa-orig/next.config.mjs	2026-09-05 17:01:08.000000000 +0000
+++ /home/claude/proggaa/next.config.mjs	2026-09-06 18:38:39.138190065 +0000
@@ -17,7 +17,7 @@
   "default-src 'self'",
   "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://www.youtube.com http://www.youtube.com https://s.ytimg.com",
   "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
-  "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://utfs.io https://img.clerk.com https://*.clerk.com",
+  "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://utfs.io https://img.clerk.com https://*.clerk.com https://lh3.googleusercontent.com",
   "font-src 'self' data: https://fonts.gstatic.com",
   "media-src 'self' https://utfs.io",
   "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://uploadthing.com https://*.uploadthing.com https://utfs.io https://api.telegram.org",
@@ -49,6 +49,10 @@
       { protocol: "https", hostname: "i.ytimg.com" },
       { protocol: "https", hostname: "utfs.io" }, // uploadthing CDN
       { protocol: "https", hostname: "img.clerk.com" },
+      // Clerk sometimes returns the original OAuth provider's avatar URL
+      // (not always re-hosted at img.clerk.com) — Google's is the one
+      // we've seen show up unproxied for Google-sign-in students.
+      { protocol: "https", hostname: "lh3.googleusercontent.com" },
     ],
   },
   async headers() {
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/app/(hero)/leaderboard/page.tsx /home/claude/proggaa/src/app/(hero)/leaderboard/page.tsx
--- /tmp/proggaa-orig/src/app/(hero)/leaderboard/page.tsx	2026-09-05 14:32:08.000000000 +0000
+++ /home/claude/proggaa/src/app/(hero)/leaderboard/page.tsx	2026-09-06 18:38:15.422319776 +0000
@@ -1,10 +1,10 @@
-import Image from "next/image";
 import Link from "next/link";
 import { Trophy, Flame, Medal } from "lucide-react";
 import { getCurrentUser } from "@/lib/auth/current-user";
 import { db } from "@/lib/db/client";
 import { cn } from "@/lib/utils";
 import { StaggerContainer, StaggerItem } from "@/components/shared/stagger";
+import { Avatar } from "@/components/shared/avatar";
 import { xpProgressWithinLevel } from "@/lib/gamification/xp-curve";
 
 const TOP_N = 50;
@@ -113,19 +113,13 @@
                   <Medal className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", theme.medal)} />
                 </span>
                 <div className="sticker shrink-0 rounded-full bg-surface p-0.5">
-                  {row.user.avatarUrl ? (
-                    <Image
-                      src={row.user.avatarUrl}
-                      alt=""
-                      width={48}
-                      height={48}
-                      className="h-9 w-9 rounded-full sm:h-12 sm:w-12"
-                    />
-                  ) : (
-                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface font-display font-bold text-muted-foreground sm:h-12 sm:w-12">
-                      {row.user.firstName.charAt(0)}
-                    </div>
-                  )}
+                  <Avatar
+                    src={row.user.avatarUrl}
+                    name={row.user.firstName}
+                    size={48}
+                    className="h-9 w-9 font-display sm:h-12 sm:w-12"
+                    fallbackClassName="h-9 w-9 font-display sm:h-12 sm:w-12"
+                  />
                 </div>
                 <p className="line-clamp-1 w-full text-[11px] font-bold text-foreground sm:text-xs">
                   {row.user.firstName}
@@ -154,17 +148,7 @@
               <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-muted-foreground">
                 {i + 4}
               </span>
-              {row.user.avatarUrl ? (
-                <Image
-                  src={row.user.avatarUrl}
-                  alt=""
-                  width={32}
-                  height={32}
-                  className="rounded-full"
-                />
-              ) : (
-                <div className="h-8 w-8 rounded-full bg-surface" />
-              )}
+              <Avatar src={row.user.avatarUrl} name={row.user.firstName} size={32} className="h-8 w-8" />
               <div className="min-w-0 flex-1">
                 <p className="truncate text-sm font-medium text-foreground">
                   {row.user.firstName} {row.user.lastName}
@@ -191,17 +175,12 @@
             <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-muted-foreground">
               {myRank}
             </span>
-            {myRankRow.user.avatarUrl ? (
-              <Image
-                src={myRankRow.user.avatarUrl}
-                alt=""
-                width={32}
-                height={32}
-                className="rounded-full"
-              />
-            ) : (
-              <div className="h-8 w-8 rounded-full bg-surface" />
-            )}
+            <Avatar
+              src={myRankRow.user.avatarUrl}
+              name={myRankRow.user.firstName}
+              size={32}
+              className="h-8 w-8"
+            />
             <div className="min-w-0 flex-1">
               <p className="truncate text-sm font-medium text-foreground">
                 {myRankRow.user.firstName} {myRankRow.user.lastName}{" "}
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/app/(public)/courses/[slug]/page.tsx /home/claude/proggaa/src/app/(public)/courses/[slug]/page.tsx
--- /tmp/proggaa-orig/src/app/(public)/courses/[slug]/page.tsx	2026-09-05 14:32:10.000000000 +0000
+++ /home/claude/proggaa/src/app/(public)/courses/[slug]/page.tsx	2026-09-06 18:38:32.168359069 +0000
@@ -1,10 +1,10 @@
 import { notFound } from "next/navigation";
 import Link from "next/link";
-import Image from "next/image";
 import { Clock, BarChart3, Star, CheckCircle2, Tag } from "lucide-react";
 import { Badge } from "@/components/ui/badge";
 import { EnrollButton } from "@/components/course/enroll-button";
 import { WishlistButton } from "@/components/course/wishlist-button";
+import { Avatar } from "@/components/shared/avatar";
 import {
   Accordion,
   AccordionItem,
@@ -214,15 +214,11 @@
             Your mentor
           </h2>
           <div className="mt-4 flex items-center gap-4">
-            {course.teacher.avatarUrl && (
-              <Image
-                src={course.teacher.avatarUrl}
-                alt={`${course.teacher.firstName} ${course.teacher.lastName}`}
-                width={56}
-                height={56}
-                className="rounded-full"
-              />
-            )}
+            <Avatar
+              src={course.teacher.avatarUrl}
+              name={course.teacher.firstName}
+              size={56}
+            />
             <div>
               <p className="font-semibold text-foreground">
                 {course.teacher.firstName} {course.teacher.lastName}
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/app/(public)/instructors/[id]/page.tsx /home/claude/proggaa/src/app/(public)/instructors/[id]/page.tsx
--- /tmp/proggaa-orig/src/app/(public)/instructors/[id]/page.tsx	2026-09-05 14:32:10.000000000 +0000
+++ /home/claude/proggaa/src/app/(public)/instructors/[id]/page.tsx	2026-09-06 18:38:21.200358009 +0000
@@ -1,6 +1,6 @@
 import { notFound } from "next/navigation";
-import Image from "next/image";
 import { CourseCard } from "@/components/course/course-card";
+import { Avatar } from "@/components/shared/avatar";
 import { db } from "@/lib/db/client";
 
 export default async function InstructorProfilePage({
@@ -31,15 +31,12 @@
   return (
     <div className="container max-w-4xl py-14">
       <div className="flex items-center gap-5">
-        {teacher.avatarUrl && (
-          <Image
-            src={teacher.avatarUrl}
-            alt={`${teacher.firstName} ${teacher.lastName}`}
-            width={80}
-            height={80}
-            className="rounded-full"
-          />
-        )}
+        <Avatar
+          src={teacher.avatarUrl}
+          name={teacher.firstName}
+          size={80}
+          className="text-2xl"
+        />
         <div>
           <h1 className="font-display text-2xl font-semibold text-foreground">
             {teacher.firstName} {teacher.lastName}
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/components/gamification/avatar-uploader.tsx /home/claude/proggaa/src/components/gamification/avatar-uploader.tsx
--- /tmp/proggaa-orig/src/components/gamification/avatar-uploader.tsx	2026-09-05 14:32:06.000000000 +0000
+++ /home/claude/proggaa/src/components/gamification/avatar-uploader.tsx	2026-09-06 18:37:28.755067423 +0000
@@ -1,9 +1,9 @@
 "use client";
 
 import { useState } from "react";
-import Image from "next/image";
 import { useRouter } from "next/navigation";
 import { Camera, Loader2 } from "lucide-react";
+import { Avatar } from "@/components/shared/avatar";
 
 export function AvatarUploader({
   currentUrl,
@@ -37,19 +37,12 @@
   return (
     <div>
       <label className="group relative block h-20 w-20 cursor-pointer">
-        {currentUrl ? (
-          <Image
-            src={currentUrl}
-            alt={firstName}
-            width={80}
-            height={80}
-            className="h-20 w-20 rounded-full object-cover"
-          />
-        ) : (
-          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface font-display text-2xl text-muted-foreground">
-            {firstName.charAt(0).toUpperCase()}
-          </div>
-        )}
+        <Avatar
+          src={currentUrl}
+          name={firstName}
+          size={80}
+          className="h-20 w-20 text-2xl"
+        />
         <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
           {uploading ? (
             <Loader2 className="h-5 w-5 animate-spin text-foreground" />
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/components/gamification/mobile-hero-hud.tsx /home/claude/proggaa/src/components/gamification/mobile-hero-hud.tsx
--- /tmp/proggaa-orig/src/components/gamification/mobile-hero-hud.tsx	2026-09-06 00:54:28.000000000 +0000
+++ /home/claude/proggaa/src/components/gamification/mobile-hero-hud.tsx	2026-09-06 18:37:46.274880960 +0000
@@ -2,6 +2,7 @@
 
 import Link from "next/link";
 import Image from "next/image";
+import { useState } from "react";
 import { motion, useReducedMotion } from "framer-motion";
 import { Flame, Bell } from "lucide-react";
 import { AnimatedProgressBar } from "@/components/gamification/animated-progress-bar";
@@ -36,17 +37,24 @@
   coinBalance?: number;
 }) {
   const shouldReduceMotion = useReducedMotion();
+  // Guards against avatarUrl pointing at a host next/image won't fetch
+  // (e.g. an OAuth avatar host not yet in next.config.mjs remotePatterns)
+  // or a dead/blocked link — falls back to the "Lv" sticker instead of
+  // leaving blank space. See Avatar component for the same pattern
+  // applied elsewhere.
+  const [avatarFailed, setAvatarFailed] = useState(false);
 
   return (
     <div className="border-t border-border/10 bg-surface/60 px-4 py-2.5 lg:hidden">
       <div className="flex items-center gap-3">
-        {avatarUrl ? (
+        {avatarUrl && !avatarFailed ? (
           <Image
             src={avatarUrl}
             alt=""
             width={36}
             height={36}
             className="h-9 w-9 shrink-0 rounded-full border-2 border-xp object-cover"
+            onError={() => setAvatarFailed(true)}
           />
         ) : (
           <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-xs font-extrabold text-primary-foreground">
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/components/shared/avatar.tsx /home/claude/proggaa/src/components/shared/avatar.tsx
--- /tmp/proggaa-orig/src/components/shared/avatar.tsx	1970-01-01 00:00:00.000000000 +0000
+++ /home/claude/proggaa/src/components/shared/avatar.tsx	2026-09-06 18:37:20.993370537 +0000
@@ -0,0 +1,63 @@
+"use client";
+
+import { useState } from "react";
+import Image from "next/image";
+import { cn } from "@/lib/utils";
+
+interface AvatarProps {
+  /** May be null/undefined (no photo yet) or a URL that fails to load
+   *  (unallowlisted host, dead link, hotlink-blocked, etc.) — both cases
+   *  fall through to the letter sticker below. */
+  src?: string | null;
+  /** Used for the alt text and, when the image is missing/fails, the
+   *  single letter shown in the fallback sticker. */
+  name: string;
+  size: number;
+  className?: string;
+  fallbackClassName?: string;
+}
+
+/**
+ * Client component because the `onError` fallback needs an event
+ * handler, which server components can't have. Centralizes the
+ * "avatar photo, or first-letter sticker if there isn't one / it
+ * didn't load" pattern that used to be duplicated (and inconsistently
+ * handled) across the HUD, nav drawer, leaderboard, and instructor
+ * pages — see SiteLogo for the same pattern applied to the site logo.
+ *
+ * Note this only guards against load *failures* (wrong content type,
+ * dead link, blocked hotlinking, host not in next.config.mjs
+ * remotePatterns, etc.). It doesn't change which hosts next/image is
+ * willing to request in the first place — that allowlist still lives
+ * in next.config.mjs and needs the actual source domain (e.g. Google's
+ * avatar CDN) added for the request to be attempted at all.
+ */
+export function Avatar({ src, name, size, className, fallbackClassName }: AvatarProps) {
+  const [failed, setFailed] = useState(false);
+  const showImage = Boolean(src) && !failed;
+
+  if (showImage) {
+    return (
+      <Image
+        src={src!}
+        alt={name}
+        width={size}
+        height={size}
+        className={cn("rounded-full object-cover", className)}
+        onError={() => setFailed(true)}
+      />
+    );
+  }
+
+  return (
+    <div
+      style={{ width: size, height: size }}
+      className={cn(
+        "flex shrink-0 items-center justify-center rounded-full bg-surface font-display font-bold text-muted-foreground",
+        fallbackClassName ?? className
+      )}
+    >
+      {name.charAt(0).toUpperCase() || "?"}
+    </div>
+  );
+}
diff -ruN '--exclude=node_modules' '--exclude=tsconfig.tsbuildinfo' /tmp/proggaa-orig/src/components/shared/mobile-nav-drawer.tsx /home/claude/proggaa/src/components/shared/mobile-nav-drawer.tsx
--- /tmp/proggaa-orig/src/components/shared/mobile-nav-drawer.tsx	2026-09-05 14:32:06.000000000 +0000
+++ /home/claude/proggaa/src/components/shared/mobile-nav-drawer.tsx	2026-09-06 18:37:55.525930296 +0000
@@ -2,11 +2,11 @@
 
 import { useEffect, useState } from "react";
 import Link from "next/link";
-import Image from "next/image";
 import { usePathname } from "next/navigation";
 import { AnimatePresence, motion } from "framer-motion";
 import { Menu, X } from "lucide-react";
 import { cn } from "@/lib/utils";
+import { Avatar } from "@/components/shared/avatar";
 import { heroNav, mentorNav, adminNav } from "@/lib/nav-config";
 import { drawerVariants, backdropVariants } from "@/lib/motion";
 
@@ -142,19 +142,13 @@
                 <div className="shrink-0 px-4 pb-4">
                   <div className="rounded-2xl bg-white/10 p-3.5">
                     <div className="flex items-center gap-2.5">
-                      {heroProfile.avatarUrl ? (
-                        <Image
-                          src={heroProfile.avatarUrl}
-                          alt=""
-                          width={36}
-                          height={36}
-                          className="h-9 w-9 shrink-0 rounded-full border-2 border-xp object-cover"
-                        />
-                      ) : (
-                        <span className="sticker flex h-9 w-9 shrink-0 items-center justify-center bg-xp text-xs font-extrabold text-xp-foreground">
-                          {heroProfile.name.charAt(0)}
-                        </span>
-                      )}
+                      <Avatar
+                        src={heroProfile.avatarUrl}
+                        name={heroProfile.name}
+                        size={36}
+                        className="h-9 w-9 border-2 border-xp text-xs font-extrabold"
+                        fallbackClassName="h-9 w-9 border-2 border-xp bg-xp text-xs font-extrabold text-xp-foreground"
+                      />
                       <div className="min-w-0 flex-1">
                         <p className="truncate text-sm font-bold text-sidebar-foreground">
                           {heroProfile.name}
