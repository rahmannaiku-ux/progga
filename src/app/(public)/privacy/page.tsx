import Link from "next/link";

export const metadata = { title: "Privacy Policy" };

const UPDATED = "30 September 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <div className="mt-8 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          This policy explains what Proggaa collects when you sign up and learn on the platform, why,
          who it is shared with, and the choices you have. In it, &quot;we&quot; means the Proggaa
          team.
        </p>

        <Section title="1. What we collect">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">Account details:</strong> your mobile phone number
              (used to sign in and verified with a one-time code), your password (stored only as a
              secure hash), and your email address.
            </li>
            <li>
              <strong className="text-foreground">Student profile:</strong> your name, district, ZIP /
              postal code, college name and EIIN, HSC batch, study version, and at least one parent or
              guardian phone number.
            </li>
            <li>
              <strong className="text-foreground">Learning activity:</strong> enrollments, lesson
              progress, exam and quiz attempts and results, assignment submissions and uploaded files,
              XP, coins, badges, and medals (certificates).
            </li>
            <li>
              <strong className="text-foreground">Payments:</strong> the order, amount, payment method
              and transaction ID you provide for a manual bKash or similar payment. We do not see or
              store your wallet PIN or card details.
            </li>
            <li>
              <strong className="text-foreground">Community and support:</strong> posts, comments,
              messages in live rooms, contact-form messages, and bug reports with any screenshots you
              attach.
            </li>
            <li>
              <strong className="text-foreground">Technical data:</strong> a random device identifier,
              session information, IP address and browser details, used for security, abuse prevention
              and rate limiting. Exams may record integrity signals such as leaving the exam window.
            </li>
          </ul>
        </Section>

        <Section title="2. How we use it">
          <ul className="list-disc space-y-1 pl-5">
            <li>To create and secure your account and send sign-in and password-reset codes.</li>
            <li>To deliver missions, track progress, grade work and issue medals.</li>
            <li>To verify payments and grant access to paid missions.</li>
            <li>
              To contact you about your account, classes and results by SMS, email or notification, and
              to contact a parent or guardian where you have given their number.
            </li>
            <li>To keep the platform safe: detecting fraud, cheating, and abuse.</li>
            <li>To improve the product using aggregate usage information.</li>
          </ul>
          <p>We do not sell your personal data and we do not show third-party advertising.</p>
        </Section>

        <Section title="3. Who can see your information">
          <p>
            Your mentors can see your progress, results and submissions for the missions they teach.
            Administrators can see account and payment details needed to run the platform. Other
            students can see your name, level and XP on leaderboards and in community areas, but not
            your phone number or email.
          </p>
        </Section>

        <Section title="4. Service providers">
          <p>
            We use providers to operate the platform, and they process data only for that purpose:
            hosting and database services; SMS delivery for one-time codes; email delivery; file
            storage (Google Drive and UploadThing) for uploads and certificates; YouTube and Google
            Docs/Drive for embedded lesson media; Stream for live-room chat; Telegram if you link your
            account to the Proggaa bot; and an AI provider when a mentor uses AI-assisted question
            generation.
          </p>
        </Section>

        <Section title="5. Cookies">
          <p>
            We use a small number of cookies to keep you signed in and to protect your account. See our{" "}
            <Link href="/cookies" className="font-semibold text-accent underline">
              Cookie policy
            </Link>{" "}
            for the full list and how to change your choice.
          </p>
        </Section>

        <Section title="6. How long we keep it">
          <p>
            We keep account and learning records while your account is active, and payment and medal
            records for as long as needed to verify them and meet accounting obligations. Sign-in
            sessions expire after 30 days. When you ask us to delete your account, we delete or
            anonymise your personal data, except records we must keep.
          </p>
        </Section>

        <Section title="7. Your choices">
          <p>
            You can view and update your profile details from your profile page, and change your login
            phone number there after verifying the new one. You can ask us to correct or delete your
            data, or change your cookie choice at any time, through the contact page.
          </p>
        </Section>

        <Section title="8. Children">
          <p>
            Many of our students are under 18. We ask for a parent or guardian phone number so we can
            reach them about the student&apos;s account. Parents and guardians can contact us to review
            or delete a child&apos;s data.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            Passwords are hashed, sessions are stored server-side, uploads are served only to people
            allowed to see them, and access to admin tools is restricted by role. No system is
            perfectly secure; please tell us straight away if you suspect your account has been
            misused.
          </p>
        </Section>

        <Section title="10. Changes and contact">
          <p>
            If we change this policy we will update the date above and, for significant changes,
            notify you in the app. Questions or requests can be sent through our{" "}
            <Link href="/contact" className="font-semibold text-accent underline">
              contact page
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
