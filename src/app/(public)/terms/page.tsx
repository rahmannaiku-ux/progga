export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: this draft ships with the platform and should be
        reviewed by counsel before production use.
      </p>

      <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            1. Accounts
          </h2>
          <p>
            You're responsible for the activity on your account. Mentor
            accounts are subject to review and may be revoked for content
            that violates these terms.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            2. Content ownership
          </h2>
          <p>
            Mentors retain ownership of the courses they create. By
            publishing, a mentor grants the platform a license to host and
            display that content to enrolled students.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            3. Academic integrity
          </h2>
          <p>
            Exam proctoring features (timers, tab-switch detection, attempt
            limits) exist to protect the value of certificates. Circumventing
            them may result in attempt invalidation or account suspension.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            4. Payments
          </h2>
          <p>
            Paid mission and subscription prices are shown before purchase.
            Refund eligibility is described at checkout.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            5. Termination
          </h2>
          <p>
            We may suspend accounts that violate these terms. You may close
            your account at any time from profile settings.
          </p>
        </section>
      </div>
    </div>
  );
}
