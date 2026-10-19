import Link from "next/link";

export const metadata = { title: "Terms of Service" };

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

export default function TermsPage() {
  return (
    <div className="container max-w-2xl py-14">
      <h1 className="font-display text-3xl font-semibold text-foreground">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {UPDATED}</p>

      <div className="mt-8 max-w-none space-y-8 text-sm leading-relaxed text-muted-foreground">
        <p>
          These terms are the agreement between you and Proggaa when you use the website and app. By
          creating an account or using Proggaa you agree to them. If you are under 18, please read them
          with a parent or guardian. How we handle your data is explained in our{" "}
          <Link href="/privacy" className={A}>
            Privacy policy
          </Link>
          .
        </p>

        <Section title="1. Your account">
          <ul className="list-disc space-y-1 pl-5">
            <li>Sign up with your own mobile number and give true details in your student profile.</li>
            <li>
              Keep your password to yourself. Your account can be signed in on one device at a time;
              signing in somewhere new signs the old device out.
            </li>
            <li>You are responsible for what happens on your account. Tell us straight away if you think someone else has used it.</li>
            <li>
              Your date of birth can be set once. After that only our team can change it, so the birthday
              reward can&apos;t be claimed more than once a year.
            </li>
            <li>Mentor accounts are given by our team and can be withdrawn if these terms are broken.</li>
          </ul>
        </Section>

        <Section title="2. Missions, live classes and medals">
          <p>
            Missions, lessons, live classes, exams and resources are for your own learning. You may not
            record, download, copy, resell or share them (including lesson videos, notes and exam
            questions) outside Proggaa. A medal (certificate) shows that you completed a mission on
            Proggaa; we may cancel a medal earned by cheating.
          </p>
        </Section>

        <Section title="3. Exams and fair play">
          <p>
            Exams use timers, attempt limits and checks such as leaving the exam window to keep results
            fair. Getting someone else to take an exam for you, sharing questions or answers while an
            exam is open, or trying to get around these checks can lead to the attempt being cancelled
            and the account being suspended.
          </p>
        </Section>

        <Section title="4. Payments">
          <ul className="list-disc space-y-1 pl-5">
            <li>The price of a paid mission is shown before you pay.</li>
            <li>
              For a bKash or similar payment, enter the exact transaction ID you received. Access is
              given once we have matched the payment; a transaction ID can be used only once, and a
              false or someone else&apos;s transaction ID will be rejected and may lead to suspension.
            </li>
            <li>
              Questions about a payment or a refund go to{" "}
              <Link href="/support" className={A}>
                Support
              </Link>{" "}
              (or the{" "}
              <Link href="/contact" className={A}>
                contact page
              </Link>
              ). We look at every request individually.
            </li>
          </ul>
        </Section>

        <Section title="5. XP, Proggy Coins and rewards">
          <p>
            XP, levels, streaks, badges and Proggy Coins are rewards for learning on Proggaa. Coins can
            only be spent in the Proggaa store. They have no cash value and can&apos;t be sold,
            transferred to another account or exchanged for money. Some coins expire, for example
            birthday coins expire 30 days after they are given. We may correct balances that were
            gained through a mistake, a bug or abuse.
          </p>
        </Section>

        <Section title="6. The Community">
          <p>The Community (posts, reels, comments, groups, messages and group chats) is for students and mentors to help each other. Please:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Be kind. No bullying, harassment, hate, threats or sexual content.</li>
            <li>Don&apos;t share anyone&apos;s phone number, address or other private details, including your own.</li>
            <li>Don&apos;t pretend to be someone else, including a mentor or a member of the Proggaa team.</li>
            <li>No spam, scams, advertising, or selling anything.</li>
            <li>Don&apos;t post exam answers while an exam is running, or anything you don&apos;t have the right to share.</li>
            <li>Only post photos or videos of other people with their permission.</li>
          </ul>
          <p>
            <strong className="text-foreground">Usernames:</strong> everyone has a unique @username. You
            can pick another free one, but not one that is offensive, misleading or looks like our team.
            We may change a username that breaks these rules.
          </p>
          <p>
            <strong className="text-foreground">Groups:</strong> the person who creates a group owns it
            and decides whether it is public or private. The owner chooses admins; admins and moderators
            look after the group, can remove posts and comments in it, and approve who joins a private
            group. They must follow these terms too. &quot;Private&quot; means only members can see the
            posts; members can still screenshot or share what they see, so think before you post.
          </p>
          <p>
            <strong className="text-foreground">Messages and group chats</strong> are between the people
            in them. Anyone in a group chat can add people who follow them, and its admins can remove
            members. Our team does not read chats as a routine, but may review content when it is
            reported, to keep someone safe, or when the law requires it.
          </p>
          <p>
            You can report a post, comment or profile. We may hide or remove content, limit features or
            suspend an account that breaks these rules.
          </p>
        </Section>

        <Section title="7. Your content">
          <p>
            You keep ownership of what you post, upload or send (posts, photos, reels, comments,
            messages, assignment files). You give Proggaa permission to store it, show it to the people
            you shared it with, and make copies needed to run the service (for example, reels and images
            are stored in Proggaa&apos;s Google Drive). This permission ends when you delete the content,
            except for copies that others have already shared within Proggaa or that we must keep for
            safety or legal reasons. Mentors keep ownership of the missions they create and let Proggaa
            show them to enrolled students.
          </p>
        </Section>

        <Section title="8. Notifications and messages">
          <p>
            We send account messages you can&apos;t opt out of, such as sign-in codes, payment receipts
            and important account notices, by SMS, email or in-app notification. We also send learning
            reminders, community notifications and birthday wishes; you can turn off phone (push)
            notifications in your device or browser settings.
          </p>
        </Section>

        <Section title="9. The apps">
          <p>
            The Proggaa apps for Windows and Android are free and show the same service, so these terms apply in
            them too. Download them only from{" "}
            <Link href="/download" className={A}>
              prooggaa.com/download
            </Link>
            . The apps offer updates themselves; please install them, as older versions may stop working.
          </p>
        </Section>

        <Section title="10. Suspension and closing your account">
          <p>
            We may suspend or close an account that breaks these terms, puts others at risk or misuses
            payments. To close your account, contact us through the{" "}
            <Link href="/contact" className={A}>
              contact page
            </Link>{" "}
            and we will delete or anonymise your data as described in the Privacy policy.
          </p>
        </Section>

        <Section title="11. The service">
          <p>
            We work hard to keep Proggaa running and accurate, but it is provided as it is: there may be
            interruptions, mistakes or changes to features and content. We are not responsible for
            exam or admission results, or for losses caused by things outside our reasonable control. Nothing in
            these terms takes away rights you have under the laws of Bangladesh.
          </p>
        </Section>

        <Section title="12. Changes and contact">
          <p>
            If we change these terms we will update the date above and, for important changes, tell you
            in the app. Using Proggaa after a change means you accept the new terms. These terms are
            governed by the laws of Bangladesh. Questions can be sent through our{" "}
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
