export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: this draft ships with the platform and should be
        reviewed by counsel before production use.
      </p>

      <div className="prose prose-invert mt-8 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            1. Information we collect
          </h2>
          <p>
            Account details (name, email, avatar) via our authentication
            provider; learning activity (progress, quiz and exam attempts,
            assignment submissions, certificates); and usage data such as
            device and browser information for security and analytics.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            2. How we use it
          </h2>
          <p>
            To operate the platform (track progress, grade work, issue
            certificates), to communicate with you (course updates, grading
            notifications), and to improve the product.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            3. Sharing
          </h2>
          <p>
            We share data with service providers strictly to operate the
            platform (authentication, email delivery, file storage, hosting).
            We do not sell personal data.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            4. Your choices
          </h2>
          <p>
            You can access, correct, or request deletion of your account data
            at any time from your profile settings or by contacting support.
          </p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">
            5. Contact
          </h2>
          <p>Questions about this policy can be sent through our contact page.</p>
        </section>
      </div>
    </div>
  );
}
