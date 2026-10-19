import Link from "next/link";

export const metadata = { title: "Privacy Policy" };

const UPDATED = "19 October 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

const A = "font-semibold text-accent underline";
const B = "text-foreground";

export default function PrivacyPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <div className="mt-8 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          This policy explains what Proggaa collects when you sign up and learn on the platform, why,
          who can see it, who it is shared with, and the choices you have. In it, &quot;we&quot; means
          the Proggaa team.
        </p>

        <Section title="1. What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className={B}>Account details:</strong> your mobile phone number (used to sign in
              and verified with a one-time code), your password (stored only as a secure hash), and your
              email address.
            </li>
            <li>
              <strong className={B}>Student profile:</strong> your name, district, ZIP / postal code,
              college name and EIIN, HSC batch, study version, at least one parent or guardian phone
              number, and your date of birth.
            </li>
            <li>
              <strong className={B}>Learning activity:</strong> enrollments, how much of each lesson you
              have watched, exam and quiz attempts and results, assignment submissions and uploaded files,
              live-class attendance, XP, streaks, Proggy Coins, store purchases, badges and medals
              (certificates).
            </li>
            <li>
              <strong className={B}>Payments:</strong> the order, amount, payment method and the
              transaction ID you enter for a bKash or similar payment. To confirm it, we match that ID
              against the payment confirmation received on Proggaa&apos;s own payment account. We never
              see or store your wallet PIN or card details.
            </li>
            <li>
              <strong className={B}>Community:</strong> your @username, profile picture, headline and bio;
              who you follow; your posts, photos, reels (short videos), comments, reactions, poll votes
              and saved posts; the groups you create, join or ask to join and your role in them; your
              direct messages and group chats, and when you last read them; and reports you make.
            </li>
            <li>
              <strong className={B}>Support:</strong> contact-form messages and bug reports with any
              screenshots you attach.
            </li>
            <li>
              <strong className={B}>Technical data:</strong> a random device identifier, session
              information, IP address and browser details, used for security, abuse prevention and rate
              limiting; and, if you turn on phone notifications, your browser&apos;s push subscription.
              Exams may record integrity signals such as leaving the exam window.
            </li>
          </ul>
        </Section>

        <Section title="2. How we use it">
          <ul className="list-disc space-y-1 pl-5">
            <li>To create and secure your account and send sign-in and password-reset codes.</li>
            <li>To deliver missions, track progress, grade work and issue medals.</li>
            <li>To verify payments, grant access to paid missions and send you a receipt by SMS.</li>
            <li>To run the Community: show posts and reels, deliver messages, and notify you of replies.</li>
            <li>
              To send account, class and result updates by SMS, email, in-app or phone notification, and
              to contact a parent or guardian where you have given their number.
            </li>
            <li>
              To wish you a happy birthday by SMS and notification and add your birthday Proggy Coins.
              Your date of birth is used only for this and is never shown to other people.
            </li>
            <li>To keep the platform safe: detecting fraud, cheating, spam and abuse.</li>
            <li>To improve the product using aggregate usage information.</li>
          </ul>
          <p>We do not sell your personal data and we do not show third-party advertising.</p>
        </Section>

        <Section title="3. Who can see your information">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className={B}>Everyone signed in</strong> can see your name, @username, profile
              picture, headline, bio, level, XP, streak and badges, and your name and level on
              leaderboards. They never see your phone number, email, date of birth, address, college
              details, grades or payments.
            </li>
            <li>
              <strong className={B}>Your posts and reels</strong> are visible to signed-in users. If you
              make your profile private, only your followers see them. Posts in a private group are
              visible only to its members.
            </li>
            <li>
              <strong className={B}>Messages and group chats</strong> are visible only to the people in
              them. Everyone in a group chat can see its member list and who has read the latest
              message; in a direct chat, the other person can see when you have read their message.
            </li>
            <li>
              <strong className={B}>Mentors</strong> can see your progress, results and submissions for
              the missions they teach.
            </li>
            <li>
              <strong className={B}>Group admins and moderators</strong> can see who asked to join their
              group and can remove posts in it.
            </li>
            <li>
              <strong className={B}>Proggaa administrators</strong> can see the account, payment and
              profile details needed to run the platform, review reported content, and may review
              messages when investigating a report, a safety concern or a legal request.
            </li>
          </ul>
        </Section>

        <Section title="4. Service providers">
          <p>
            We use these providers to operate Proggaa. They process data only to provide their service
            to us:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Vercel (website hosting) and Supabase (database);</li>
            <li>Upstash (rate limiting, to stop abuse);</li>
            <li>an SMS provider in Bangladesh, for sign-in codes, payment receipts and birthday wishes;</li>
            <li>Resend, for email;</li>
            <li>
              Google Drive and UploadThing, for uploaded files, profile and post images, reels and
              certificates;
            </li>
            <li>YouTube and Google Docs/Drive, for embedded lesson videos and resources;</li>
            <li>Stream, for live-room chat;</li>
            <li>your browser&apos;s push service (Google, Apple, Mozilla or Microsoft), for phone notifications;</li>
            <li>Telegram, if you link your account to the Proggaa bot;</li>
            <li>GitHub, which hosts the Proggaa app downloads and updates;</li>
            <li>Google Gemini, when a mentor uses AI to help write questions (no student personal data is sent).</li>
          </ul>
        </Section>

        <Section title="5. The Proggaa apps">
          <p>
            The Windows and Android apps show the same website, so everything in this policy applies to them. In
            addition:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Both apps check GitHub (where they are published) for new versions, and download updates from it. GitHub
              sees your IP address when they do; it gets no account details.
            </li>
            <li>
              The Android app checks Proggaa for your new notifications about every 15 minutes, using your signed-in
              session, and shows them on your phone. Sign out to stop it.
            </li>
            <li>
              The Android app asks permission to show notifications, and, the first time you install an update, to
              install apps. It only reads files and videos you choose to upload, and it doesn&apos;t use your location,
              contacts, camera or microphone.
            </li>
          </ul>
        </Section>

        <Section title="6. Cookies">
          <p>
            We use a small number of cookies to keep you signed in and to protect your account. See our{" "}
            <Link href="/cookies" className={A}>
              Cookie policy
            </Link>{" "}
            for the full list and how to change your choice.
          </p>
        </Section>

        <Section title="7. How long we keep it">
          <p>
            We keep account, learning and Community records while your account is active, and payment
            and medal records for as long as needed to verify them and meet accounting obligations.
            Sign-in sessions end after 30 days without use. When you delete a post, reel, comment or
            group, it is removed from Proggaa, and a reel&apos;s video is deleted from our storage.
            When you ask us to delete your account, we delete or anonymise your personal data, except
            records we must keep.
          </p>
        </Section>

        <Section title="8. Your choices">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Update your profile, picture, headline, bio and @username, and change your login phone
              number after verifying the new one.
            </li>
            <li>Make your Community profile private, so only followers see your posts.</li>
            <li>Choose who you follow, leave groups and group chats, and delete your own posts, reels and comments.</li>
            <li>Turn phone notifications on or off in Settings, in your browser, or in your phone&apos;s settings for the app.</li>
            <li>
              Ask us to correct or delete your data, or change your cookie choice, through the{" "}
              <Link href="/contact" className={A}>
                contact page
              </Link>
              .
            </li>
          </ul>
        </Section>

        <Section title="9. Children">
          <p>
            Many of our students are under 18. We ask for a parent or guardian phone number so we can
            reach them about the student&apos;s account. Students should not share personal contact
            details in the Community. Parents and guardians can contact us to review or delete a
            child&apos;s data.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            Passwords are hashed, sessions are stored server-side, and uploads and videos are served only
            to people allowed to see them. Admin tools are restricted by role, and requests are rate
            limited to stop abuse. No system is perfectly secure; please tell us straight away if you think your
            account has been misused.
          </p>
        </Section>

        <Section title="11. Changes and contact">
          <p>
            If we change this policy we will update the date above and, for significant changes,
            notify you in the app. Questions or requests can be sent through our{" "}
            <Link href="/contact" className={A}>
              contact page
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
