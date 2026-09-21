-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "LessonResourceType" AS ENUM ('PDF', 'LINK', 'FILE', 'IMAGE');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'MULTIPLE_SELECT', 'TRUE_FALSE', 'FILL_IN_BLANK', 'SHORT_ANSWER', 'ESSAY', 'NUMERICAL');

-- CreateEnum
CREATE TYPE "QuestionDifficultyLevel" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "AssessmentKind" AS ENUM ('QUIZ', 'EXAM');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED', 'GRADED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "ExamRiskLevel" AS ENUM ('NORMAL', 'REVIEW', 'HIGH_RISK', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "FullscreenExitAction" AS ENUM ('WARNING', 'FLAG', 'AUTO_DISQUALIFY');

-- CreateEnum
CREATE TYPE "ExamIntegrityEventType" AS ENUM ('EXAM_STARTED', 'EXAM_SUBMITTED', 'QUESTION_OPENED', 'ANSWER_SELECTED', 'ANSWER_CHANGE_ATTEMPT', 'ANSWER_LOCKED', 'QUESTION_MARKED', 'QUESTION_UNMARKED', 'TAB_SWITCH', 'WINDOW_BLUR', 'WINDOW_FOCUS', 'FULLSCREEN_ENTER', 'FULLSCREEN_EXIT', 'COPY', 'PASTE', 'CUT', 'CONNECTION_LOST', 'CONNECTION_RESTORED', 'SESSION_ANOMALY', 'SCREEN_CAPTURE_ATTEMPT', 'TIME_ANOMALY', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "AssignmentSubmissionStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('PENDING', 'ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT', 'GRADE_POSTED', 'ENROLLMENT', 'CERTIFICATE_ISSUED', 'EXAM_REMINDER', 'ASSIGNMENT_DUE', 'STREAK_RISK', 'ACHIEVEMENT_UNLOCKED', 'SYSTEM', 'PAYMENT_AWAITING_VERIFICATION', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'LIVE_CLASS_REMINDER');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'PUBLISH', 'UNPUBLISH', 'LOGIN', 'GRADE', 'ENROLL', 'ISSUE_CERTIFICATE', 'ROLE_CHANGE', 'SETTINGS_CHANGE', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AWAITING_VERIFICATION', 'PAID', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL_BKASH', 'BKASH_API', 'SSLCOMMERZ', 'STRIPE');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('MANUAL_ADMIN', 'AUTOMATIC_API');

-- CreateEnum
CREATE TYPE "UploadContext" AS ENUM ('LESSON_RESOURCE', 'ASSIGNMENT_SUBMISSION', 'AVATAR', 'CERTIFICATE', 'COMMUNITY_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('UPLOADTHING', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "DriveConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CoinTransactionType" AS ENUM ('CHALLENGE_REWARD', 'EXAM_REWARD', 'STORE_PURCHASE', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StoreItemType" AS ENUM ('PDF', 'EXCLUSIVE_CLASS', 'STICKER');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON', 'ENUM');

-- CreateTable
CREATE TABLE "CourseDiscount" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "percentOff" INTEGER,
    "amountOffCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseTeacher" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roleLabel" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseCoupon" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "percentOff" INTEGER,
    "amountOffCents" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByTeacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "bio" TEXT,
    "headline" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expertiseTags" TEXT[],
    "yearsExperience" INTEGER,
    "socialLinks" JSONB,
    "payoutEmail" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interests" TEXT[],
    "goals" TEXT,
    "weeklyGoalMinutes" INTEGER NOT NULL DEFAULT 150,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleChangeLog" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "fromRole" "Role" NOT NULL,
    "toRole" "Role" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "trailerYoutubeId" TEXT,
    "level" "CourseLevel" NOT NULL DEFAULT 'ALL_LEVELS',
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "teacherId" TEXT NOT NULL,
    "categoryId" TEXT,
    "examsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseReview" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonGroup" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "youtubeVideoId" TEXT,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL,
    "isPreview" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "context" "UploadContext" NOT NULL,
    "provider" "StorageProvider" NOT NULL DEFAULT 'UPLOADTHING',
    "driveFileId" TEXT,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "status" "DriveConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connectedEmail" TEXT,
    "refreshTokenEncrypted" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "rootFolderId" TEXT,
    "profilePicturesFolderId" TEXT,
    "assignmentsFolderId" TEXT,
    "certificatesFolderId" TEXT,
    "communityFolderId" TEXT,
    "otherFolderId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonResource" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "type" "LessonResourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "lastPositionSec" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestampSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchMember" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "progressPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "courseId" TEXT,
    "chapterId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "AssessmentKind" NOT NULL DEFAULT 'QUIZ',
    "instructions" TEXT,
    "timeLimitSeconds" INTEGER,
    "autoSubmitOnExpiry" BOOLEAN NOT NULL DEFAULT true,
    "randomizeQuestions" BOOLEAN NOT NULL DEFAULT false,
    "questionBankSize" INTEGER,
    "negativeMarkingRatio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fullscreenRequired" BOOLEAN NOT NULL DEFAULT false,
    "tabSwitchDetection" BOOLEAN NOT NULL DEFAULT false,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "lockAnswersAfterSelection" BOOLEAN NOT NULL DEFAULT false,
    "detectCopyPaste" BOOLEAN NOT NULL DEFAULT false,
    "detectScreenshotAttempts" BOOLEAN NOT NULL DEFAULT false,
    "detectSessionAnomalies" BOOLEAN NOT NULL DEFAULT false,
    "fullscreenExitAction" "FullscreenExitAction" NOT NULL DEFAULT 'WARNING',
    "passPercentage" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "showResultsInstantly" BOOLEAN NOT NULL DEFAULT true,
    "requiresTeacherReview" BOOLEAN NOT NULL DEFAULT false,
    "coinReward" INTEGER NOT NULL DEFAULT 0,
    "minimumScoreForCoinReward" DOUBLE PRECISION,
    "rewardCoinsOnce" BOOLEAN NOT NULL DEFAULT true,
    "isLiveExam" BOOLEAN NOT NULL DEFAULT false,
    "monitoringStartsAt" TIMESTAMP(3),
    "monitoringEndsAt" TIMESTAMP(3),
    "accessOpensAt" TIMESTAMP(3),
    "accessClosesAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "explanation" TEXT,
    "difficulty" "QuestionDifficultyLevel" NOT NULL DEFAULT 'MEDIUM',
    "topic" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "numericAnswer" DOUBLE PRECISION,
    "numericTolerance" DOUBLE PRECISION DEFAULT 0,
    "numericUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentAttempt" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "timeSpentSec" INTEGER,
    "tabSwitchCount" INTEGER NOT NULL DEFAULT 0,
    "wasDisqualified" BOOLEAN NOT NULL DEFAULT false,
    "questionOrder" JSONB,
    "rawScore" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "percentage" DOUBLE PRECISION,
    "isPassed" BOOLEAN,
    "selectedQuestionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "riskLevel" "ExamRiskLevel" NOT NULL DEFAULT 'NORMAL',
    "riskReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fullscreenExitCount" INTEGER NOT NULL DEFAULT 0,
    "copyPasteCount" INTEGER NOT NULL DEFAULT 0,
    "screenshotAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lockViolationCount" INTEGER NOT NULL DEFAULT 0,
    "sessionAnomalyCount" INTEGER NOT NULL DEFAULT 0,
    "timeAnomalyCount" INTEGER NOT NULL DEFAULT 0,
    "sessionFingerprint" TEXT,

    CONSTRAINT "AssessmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedOptionIds" TEXT[],
    "textAnswer" TEXT,
    "questionSnapshot" JSONB,
    "isAutoGraded" BOOLEAN NOT NULL DEFAULT true,
    "isCorrect" BOOLEAN,
    "pointsAwarded" DOUBLE PRECISION,
    "teacherFeedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockViolations" INTEGER NOT NULL DEFAULT 0,
    "changeHistory" JSONB,
    "firstOpenedAt" TIMESTAMP(3),
    "lastOpenedAt" TIMESTAMP(3),
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamIntegrityEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "type" "ExamIntegrityEventType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamIntegrityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "maxPoints" INTEGER NOT NULL DEFAULT 100,
    "rubric" JSONB,
    "allowLateSubmission" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "coinReward" INTEGER NOT NULL DEFAULT 0,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "maxRewardClaims" INTEGER,
    "rewardOncePerStudent" BOOLEAN NOT NULL DEFAULT true,
    "coinRewardClaimsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileUrls" TEXT[],
    "comment" TEXT,
    "status" "AssignmentSubmissionStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "submittedAt" TIMESTAMP(3),
    "grade" DOUBLE PRECISION,
    "feedback" TEXT,
    "rubricScores" JSONB,
    "gradedAt" TIMESTAMP(3),
    "gradedById" TEXT,

    CONSTRAINT "AssignmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'PENDING',
    "certificateNo" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "issuedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "couponId" TEXT,
    "couponCode" TEXT,
    "couponDiscountCents" INTEGER,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MANUAL_BKASH',
    "paymentReference" TEXT NOT NULL,
    "transactionId" TEXT,
    "payerPhone" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verificationMethod" "VerificationMethod",
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "source" TEXT,
    "deviceId" TEXT,
    "eventId" TEXT,
    "rawEvent" JSONB,
    "enrollmentId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBridgeDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentBridgeDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProggyCoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CoinTransactionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProggyCoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinStoreItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "StoreItemType" NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "thumbnailUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "resourceUrl" TEXT,
    "lessonId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoinStoreItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "coinsSpent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TIMESTAMP(3),
    "coinBalance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "iconKey" TEXT NOT NULL,
    "xpBonus" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscussionPost" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT,
    "courseId" TEXT,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "siteName" TEXT NOT NULL DEFAULT 'Proggaa',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#7C3AED',
    "supportEmail" TEXT,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceMessage" TEXT,
    "maintenanceEstimatedRestore" TEXT,
    "bkashNumber" TEXT,
    "bkashInstructions" TEXT,
    "autoVerifyPayments" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "type" "SettingValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "rolloutPercent" INTEGER,
    "allowedRoles" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Destination" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "authorName" TEXT NOT NULL,
    "authorId" TEXT,
    "categoryId" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseDiscount_courseId_key" ON "CourseDiscount"("courseId");

-- CreateIndex
CREATE INDEX "CourseDiscount_courseId_idx" ON "CourseDiscount"("courseId");

-- CreateIndex
CREATE INDEX "CourseTeacher_teacherId_idx" ON "CourseTeacher"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseTeacher_courseId_teacherId_key" ON "CourseTeacher"("courseId", "teacherId");

-- CreateIndex
CREATE INDEX "CourseCoupon_courseId_idx" ON "CourseCoupon"("courseId");

-- CreateIndex
CREATE INDEX "CourseCoupon_code_idx" ON "CourseCoupon"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCoupon_courseId_code_key" ON "CourseCoupon"("courseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_paymentId_key" ON "CouponRedemption"("paymentId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_idx" ON "CouponRedemption"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentProfile_userId_key" ON "StudentProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Category_displayOrder_idx" ON "Category"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_teacherId_idx" ON "Course"("teacherId");

-- CreateIndex
CREATE INDEX "Course_categoryId_idx" ON "Course"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseReview_courseId_userId_key" ON "CourseReview"("courseId", "userId");

-- CreateIndex
CREATE INDEX "Module_courseId_idx" ON "Module"("courseId");

-- CreateIndex
CREATE INDEX "Chapter_moduleId_idx" ON "Chapter"("moduleId");

-- CreateIndex
CREATE INDEX "LessonGroup_chapterId_idx" ON "LessonGroup"("chapterId");

-- CreateIndex
CREATE INDEX "Lesson_groupId_idx" ON "Lesson"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_key_key" ON "Upload"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_url_key" ON "Upload"("url");

-- CreateIndex
CREATE INDEX "Upload_uploaderId_idx" ON "Upload"("uploaderId");

-- CreateIndex
CREATE INDEX "Upload_context_idx" ON "Upload"("context");

-- CreateIndex
CREATE INDEX "Upload_provider_idx" ON "Upload"("provider");

-- CreateIndex
CREATE INDEX "LessonResource_lessonId_idx" ON "LessonResource"("lessonId");

-- CreateIndex
CREATE INDEX "LessonProgress_userId_idx" ON "LessonProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "LessonNote_userId_lessonId_idx" ON "LessonNote"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_userId_lessonId_key" ON "Bookmark"("userId", "lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_userId_courseId_key" ON "Wishlist"("userId", "courseId");

-- CreateIndex
CREATE INDEX "Batch_courseId_idx" ON "Batch"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchMember_batchId_userId_key" ON "BatchMember"("batchId", "userId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_userId_courseId_key" ON "Enrollment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "Assessment_lessonId_idx" ON "Assessment"("lessonId");

-- CreateIndex
CREATE INDEX "Assessment_chapterId_idx" ON "Assessment"("chapterId");

-- CreateIndex
CREATE INDEX "Assessment_courseId_idx" ON "Assessment"("courseId");

-- CreateIndex
CREATE INDEX "Question_courseId_idx" ON "Question"("courseId");

-- CreateIndex
CREATE INDEX "Question_creatorId_idx" ON "Question"("creatorId");

-- CreateIndex
CREATE INDEX "Question_type_idx" ON "Question"("type");

-- CreateIndex
CREATE INDEX "Question_difficulty_idx" ON "Question"("difficulty");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_assessmentId_idx" ON "AssessmentQuestion"("assessmentId");

-- CreateIndex
CREATE INDEX "AssessmentQuestion_questionId_idx" ON "AssessmentQuestion"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_questionId_key" ON "AssessmentQuestion"("assessmentId", "questionId");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");

-- CreateIndex
CREATE INDEX "AssessmentAttempt_assessmentId_userId_idx" ON "AssessmentAttempt"("assessmentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentAttempt_assessmentId_userId_attemptNumber_key" ON "AssessmentAttempt"("assessmentId", "userId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionAnswer_attemptId_questionId_key" ON "QuestionAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "ExamIntegrityEvent_attemptId_createdAt_idx" ON "ExamIntegrityEvent"("attemptId", "createdAt");

-- CreateIndex
CREATE INDEX "ExamIntegrityEvent_attemptId_type_idx" ON "ExamIntegrityEvent"("attemptId", "type");

-- CreateIndex
CREATE INDEX "Assignment_lessonId_idx" ON "Assignment"("lessonId");

-- CreateIndex
CREATE INDEX "Assignment_courseId_idx" ON "Assignment"("courseId");

-- CreateIndex
CREATE INDEX "AssignmentSubmission_assignmentId_idx" ON "AssignmentSubmission"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_assignmentId_userId_key" ON "AssignmentSubmission"("assignmentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_certificateNo_key" ON "Certificate"("certificateNo");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_userId_courseId_key" ON "Certificate"("userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentReference_key" ON "Payment"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_eventId_key" ON "Payment"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_enrollmentId_key" ON "Payment"("enrollmentId");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_courseId_idx" ON "Payment"("courseId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- CreateIndex
CREATE INDEX "Payment_couponId_idx" ON "Payment"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBridgeDevice_tokenHash_key" ON "PaymentBridgeDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "PaymentBridgeDevice_isActive_idx" ON "PaymentBridgeDevice"("isActive");

-- CreateIndex
CREATE INDEX "RewardEvent_userId_idx" ON "RewardEvent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardEvent_sourceType_sourceId_rewardType_userId_key" ON "RewardEvent"("sourceType", "sourceId", "rewardType", "userId");

-- CreateIndex
CREATE INDEX "ProggyCoinTransaction_userId_idx" ON "ProggyCoinTransaction"("userId");

-- CreateIndex
CREATE INDEX "ProggyCoinTransaction_createdAt_idx" ON "ProggyCoinTransaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProggyCoinTransaction_sourceType_sourceId_type_userId_key" ON "ProggyCoinTransaction"("sourceType", "sourceId", "type", "userId");

-- CreateIndex
CREATE INDEX "CoinStoreItem_isPublished_idx" ON "CoinStoreItem"("isPublished");

-- CreateIndex
CREATE INDEX "CoinPurchase_userId_idx" ON "CoinPurchase"("userId");

-- CreateIndex
CREATE INDEX "CoinPurchase_itemId_idx" ON "CoinPurchase"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "CoinPurchase_userId_itemId_key" ON "CoinPurchase"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "HeroStats_userId_key" ON "HeroStats"("userId");

-- CreateIndex
CREATE INDEX "HeroStats_xp_idx" ON "HeroStats"("xp");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_key_key" ON "Achievement"("key");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "Announcement_courseId_idx" ON "Announcement"("courseId");

-- CreateIndex
CREATE INDEX "CalendarEvent_courseId_idx" ON "CalendarEvent"("courseId");

-- CreateIndex
CREATE INDEX "CalendarEvent_startAt_idx" ON "CalendarEvent"("startAt");

-- CreateIndex
CREATE INDEX "DiscussionPost_lessonId_idx" ON "DiscussionPost"("lessonId");

-- CreateIndex
CREATE INDEX "DiscussionPost_courseId_idx" ON "DiscussionPost"("courseId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_idx" ON "ActivityLog"("userId");

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_idx" ON "ActivityLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "PlatformSetting_type_idx" ON "PlatformSetting"("type");

-- CreateIndex
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");

-- CreateIndex
CREATE INDEX "BlogPost_status_idx" ON "BlogPost"("status");

-- CreateIndex
CREATE INDEX "BlogPost_categoryId_idx" ON "BlogPost"("categoryId");

-- CreateIndex
CREATE INDEX "BlogPost_isFeatured_idx" ON "BlogPost"("isFeatured");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_userId_key" ON "TelegramLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLink_telegramId_key" ON "TelegramLink"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_userId_idx" ON "TelegramLinkToken"("userId");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_expiresAt_idx" ON "TelegramLinkToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CourseDiscount" ADD CONSTRAINT "CourseDiscount_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseDiscount" ADD CONSTRAINT "CourseDiscount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacher" ADD CONSTRAINT "CourseTeacher_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacher" ADD CONSTRAINT "CourseTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseTeacher" ADD CONSTRAINT "CourseTeacher_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCoupon" ADD CONSTRAINT "CourseCoupon_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCoupon" ADD CONSTRAINT "CourseCoupon_createdByTeacherId_fkey" FOREIGN KEY ("createdByTeacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "CourseCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChangeLog" ADD CONSTRAINT "RoleChangeLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChangeLog" ADD CONSTRAINT "RoleChangeLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseReview" ADD CONSTRAINT "CourseReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonGroup" ADD CONSTRAINT "LessonGroup_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LessonGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDriveConnection" ADD CONSTRAINT "GoogleDriveConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResource" ADD CONSTRAINT "LessonResource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMember" ADD CONSTRAINT "BatchMember_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchMember" ADD CONSTRAINT "BatchMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentAttempt" ADD CONSTRAINT "AssessmentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamIntegrityEvent" ADD CONSTRAINT "ExamIntegrityEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssessmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "CourseCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProggyCoinTransaction" ADD CONSTRAINT "ProggyCoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinStoreItem" ADD CONSTRAINT "CoinStoreItem_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinPurchase" ADD CONSTRAINT "CoinPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinPurchase" ADD CONSTRAINT "CoinPurchase_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CoinStoreItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeroStats" ADD CONSTRAINT "HeroStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionPost" ADD CONSTRAINT "DiscussionPost_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DiscussionPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
