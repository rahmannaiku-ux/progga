import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const db = new PrismaClient();

// Famous, extremely stable, permanently-public YouTube uploads used only
// as placeholder embeds for demo lessons — not a copyright concern since
// they're rendered through YouTube's own embed player, and any real
// deployment replaces these via the mission builder before going live.
const DEMO_VIDEO_A = "jNQXAC9IVRw"; // "Me at the zoo" — first video ever uploaded to YouTube
const DEMO_VIDEO_B = "dQw4w9WgXcQ"; // Rick Astley — "Never Gonna Give You Up"

async function main() {
  console.log("Seeding...");

  // -------------------------------------------------------------
  // Site settings + email templates
  // -------------------------------------------------------------
  await db.siteSettings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      siteName: "Proggaa",
      // Official logo (public/branding/proggaa-logo.png is the untouched
      // source; this is the optimized derivative actually served). Also
      // falls back the same way via DEFAULT_BRANDING in site-branding.ts,
      // so this just keeps a freshly seeded row's row-level value in sync
      // with what a from-scratch app already shows.
      logoUrl: "/branding/proggaa-logo-512.png",
      primaryColor: "#F4349A",
      bkashNumber: "01700000000",
    },
    update: {},
  });

  await db.emailTemplate.createMany({
    data: [
      {
        key: "welcome",
        subject: "Welcome to Proggaa",
        bodyHtml: "<p>Hi {{firstName}}, welcome aboard — your first mission is waiting.</p>",
      },
      {
        key: "certificate-issued",
        subject: "Your medal is ready 🏅",
        bodyHtml: "<p>Congratulations on completing {{courseTitle}}! Your certificate is attached.</p>",
      },
      {
        key: "grade-posted",
        subject: "Your challenge was graded",
        bodyHtml: "<p>You scored {{grade}}/{{maxPoints}} on {{assignmentTitle}}.</p>",
      },
      {
        key: "enrollment-confirmed",
        subject: "You're enrolled!",
        bodyHtml: "<p>You're in — {{courseTitle}} is now on your dashboard.</p>",
      },
      {
        key: "payment-verified",
        subject: "Payment verified — you're in! 🎉",
        bodyHtml: "<p>Your payment for {{courseTitle}} was verified. It's unlocked on your dashboard now.</p>",
      },
    ],
    skipDuplicates: true,
  });

  // -------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------
  const categoryNames = [
    "Web Development",
    "Data Science",
    "Mobile Development",
    "Design",
    "Cloud & DevOps",
    "Cybersecurity",
    "Business",
    "Product Management",
  ];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      db.category.upsert({
        where: { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") },
        create: {
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          description: `Missions covering ${name.toLowerCase()}.`,
        },
        update: {},
      })
    )
  );

  // -------------------------------------------------------------
  // Demo mentor + student
  //
  // PHASE 5.5: these still keep their historical fake clerkId (as
  // compatibility data only — Clerk itself is fully removed, nothing
  // reads this for auth anymore) but now ALSO have a real phone +
  // password, so they're actually loginable through the current
  // phone+password system for local dev/testing. The passwords below
  // are dev-only placeholders, hashed for real with this project's own
  // Argon2id hashPassword (never stored/logged in plaintext) — replace
  // them for anything beyond a local sandbox. For your OWN account,
  // register normally at /register, then use Admin → Roles &
  // Permissions → "promote by email" (if you set one during
  // /complete-profile) to make it a TEACHER/ADMIN for hands-on testing.
  // -------------------------------------------------------------
  const DEMO_MENTOR_PASSWORD = "DemoMentor#2026"; // dev-only — see note above
  const DEMO_STUDENT_PASSWORD = "DemoStudent#2026"; // dev-only — see note above

  const mentor = await db.user.upsert({
    where: { clerkId: "seed_mentor_demo" },
    create: {
      clerkId: "seed_mentor_demo",
      email: "mentor.demo@example.com",
      firstName: "Alex",
      lastName: "Rivera",
      role: "TEACHER",
      bio: "Full-stack engineer turned mentor. Loves shipping and teaching in equal measure.",
      headline: "Full-Stack Mentor",
      phone: "+8801700000001",
      passwordHash: await hashPassword(DEMO_MENTOR_PASSWORD),
      phoneVerified: true,
      profileCompleted: true,
      teacherProfile: { create: { expertiseTags: ["React", "Node.js", "TypeScript"], isVerified: true } },
    },
    update: {},
  });

  const student = await db.user.upsert({
    where: { clerkId: "seed_student_demo" },
    create: {
      clerkId: "seed_student_demo",
      email: "student.demo@example.com",
      firstName: "Jordan",
      lastName: "Lee",
      role: "STUDENT",
      phone: "+8801700000002",
      passwordHash: await hashPassword(DEMO_STUDENT_PASSWORD),
      phoneVerified: true,
      profileCompleted: true,
      studentProfile: {
        create: {
          interests: ["Web Development"],
          name: "Jordan Lee",
          district: "Dhaka",
          zipCode: "1207",
          collegeName: "Demo College",
          hscBatch: "2025",
          studyVersion: "ENGLISH",
          fatherPhone: "+8801700000003",
        },
      },
      heroStats: { create: { xp: 120, level: 2, currentStreak: 3, longestStreak: 5 } },
    },
    update: {},
  });

  // -------------------------------------------------------------
  // Demo course: modules → chapters → lessons
  // -------------------------------------------------------------
  const course = await db.course.upsert({
    where: { slug: "full-stack-web-development" },
    create: {
      slug: "full-stack-web-development",
      title: "Full-Stack Web Development",
      subtitle: "Go from zero to a deployed, production-ready web app.",
      description:
        "A hands-on mission covering modern full-stack development: frontend fundamentals, backend APIs, databases, and deployment. Build real projects as you go.",
      level: "BEGINNER",
      status: "PUBLISHED",
      isFree: true,
      priceCents: 0,
      durationMinutes: 45,
      teacherId: mentor.id,
      categoryId: categories[0]!.id,
      publishedAt: new Date(),
      trailerYoutubeId: DEMO_VIDEO_B,
    },
    update: {},
  });

  const module1 = await db.module.upsert({
    where: { id: `${course.id}-mod-1` },
    create: {
      id: `${course.id}-mod-1`,
      courseId: course.id,
      title: "Getting Started",
      summary: "Environment setup and the fundamentals.",
      order: 0,
    },
    update: {},
  });

  const chapter1 = await db.chapter.upsert({
    where: { id: `${course.id}-ch-1` },
    create: { id: `${course.id}-ch-1`, moduleId: module1.id, title: "Foundations", order: 0 },
    update: {},
  });

  // Teacher-defined class type ("Foundation Class" / "Archive Class" /
  // etc.) — free text per chapter, sits between Chapter and Lesson.
  const group1 = await db.lessonGroup.upsert({
    where: { id: `${course.id}-group-1` },
    create: { id: `${course.id}-group-1`, chapterId: chapter1.id, title: "Foundation Class", order: 0 },
    update: {},
  });

  const lesson1 = await db.lesson.upsert({
    where: { id: `${course.id}-lesson-1` },
    create: {
      id: `${course.id}-lesson-1`,
      groupId: group1.id,
      title: "Welcome to the Mission",
      description: "An overview of what you'll build and how the course is structured.",
      youtubeVideoId: DEMO_VIDEO_A,
      durationSeconds: 240,
      order: 0,
      isPreview: true,
    },
    update: {},
  });

  const lesson2 = await db.lesson.upsert({
    where: { id: `${course.id}-lesson-2` },
    create: {
      id: `${course.id}-lesson-2`,
      groupId: group1.id,
      title: "Setting Up Your Environment",
      description: "Installing Node.js, an editor, and your first project.",
      youtubeVideoId: DEMO_VIDEO_B,
      durationSeconds: 480,
      order: 1,
    },
    update: {},
  });

  // A second class type on the same chapter — shows the teacher-defined
  // grouping (Foundation Class / Archive Class / etc.) actually varying.
  const group2 = await db.lessonGroup.upsert({
    where: { id: `${course.id}-group-2` },
    create: { id: `${course.id}-group-2`, chapterId: chapter1.id, title: "Archive Class", order: 1 },
    update: {},
  });

  await db.lesson.upsert({
    where: { id: `${course.id}-lesson-3` },
    create: {
      id: `${course.id}-lesson-3`,
      groupId: group2.id,
      title: "Foundations Recap (Last Term)",
      description: "An archived walkthrough from a previous cohort.",
      youtubeVideoId: DEMO_VIDEO_A,
      durationSeconds: 360,
      order: 0,
    },
    update: {},
  });

  // -------------------------------------------------------------
  // Demo quiz
  // -------------------------------------------------------------
  const quiz = await db.assessment.upsert({
    where: { id: `${course.id}-quiz-1` },
    create: {
      id: `${course.id}-quiz-1`,
      courseId: course.id,
      lessonId: lesson2.id,
      title: "Foundations Check",
      kind: "QUIZ",
      instructions: "Quick check on what you just learned.",
      timeLimitSeconds: 300,
      maxAttempts: 3,
      passPercentage: 70,
      publishedAt: new Date(),
    },
    update: {},
  });

  const q1 = await db.question.upsert({
    where: { id: `${quiz.id}-q1` },
    create: {
      id: `${quiz.id}-q1`,
      courseId: course.id,
      creatorId: mentor.id,
      type: "MCQ",
      prompt: "Which command starts a Next.js dev server?",
      points: 1,
      options: {
        create: [
          { label: "npm run dev", isCorrect: true, order: 0 },
          { label: "npm start-dev", isCorrect: false, order: 1 },
          { label: "next launch", isCorrect: false, order: 2 },
          { label: "node dev.js", isCorrect: false, order: 3 },
        ],
      },
    },
    update: {},
  });

  await db.assessmentQuestion.upsert({
    where: { assessmentId_questionId: { assessmentId: quiz.id, questionId: q1.id } },
    create: { assessmentId: quiz.id, questionId: q1.id, order: 0 },
    update: {},
  });

  // -------------------------------------------------------------
  // Demo assignment
  // -------------------------------------------------------------
  await db.assignment.upsert({
    where: { id: `${course.id}-assignment-1` },
    create: {
      id: `${course.id}-assignment-1`,
      lessonId: lesson2.id,
      title: "Build a Personal Landing Page",
      instructions: "Create a one-page site introducing yourself. Submit a link or a zipped export.",
      maxPoints: 100,
      allowLateSubmission: true,
      rubric: [
        { criterion: "Responsive layout", points: 40 },
        { criterion: "Clean, semantic HTML", points: 30 },
        { criterion: "Visual polish", points: 30 },
      ],
    },
    update: {},
  });

  // -------------------------------------------------------------
  // Student enrollment + a bit of progress
  // -------------------------------------------------------------
  await db.enrollment.upsert({
    where: { userId_courseId: { userId: student.id, courseId: course.id } },
    create: { userId: student.id, courseId: course.id, progressPct: 50 },
    update: {},
  });

  await db.lessonProgress.upsert({
    where: { userId_lessonId: { userId: student.id, lessonId: lesson1.id } },
    create: {
      userId: student.id,
      lessonId: lesson1.id,
      isCompleted: true,
      completedAt: new Date(),
      watchedSeconds: 240,
      lastPositionSec: 240,
    },
    update: {},
  });

  // -------------------------------------------------------------
  // Blog posts
  // -------------------------------------------------------------
  await db.blogPost.createMany({
    data: [
      {
        slug: "why-gamified-learning-works",
        title: "Why Gamified Learning Actually Works",
        excerpt: "Streaks, XP, and levels aren't just decoration — here's the psychology behind them.",
        contentHtml:
          "<p>Most online courses lose the majority of learners before the halfway point. Structure and visible progress close that gap — this post breaks down why.</p>",
        authorName: "Proggaa Team",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
      {
        slug: "building-your-first-mission",
        title: "A Mentor's Guide to Building Your First Mission",
        excerpt: "From pasting your first YouTube link to publishing your first quiz.",
        contentHtml:
          "<p>The mission builder is designed to get your first course live in an afternoon. Here's a walkthrough of the whole flow.</p>",
        authorName: "Proggaa Team",
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seed complete.");
  console.log(`  Demo mentor login: +8801700000001 / ${DEMO_MENTOR_PASSWORD}`);
  console.log(`  Demo student login: +8801700000002 / ${DEMO_STUDENT_PASSWORD}`);
  console.log("  Sign up for real, then use Admin → Roles & Permissions to promote your account.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
