import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy — Orbit" };

export default function PrivacyPage() {
  return <LegalPage eyebrow="Legal" title="Privacy Policy" summary="This policy explains how Orbit collects, uses, shares, and protects information when people use the service." sections={[
    { title: "1. Who operates Orbit", paragraphs: ["Orbit is operated by [LEGAL NAME OR COMPANY], located at [MAILING ADDRESS]. Questions about privacy may be sent to [PRIVACY EMAIL]."] },
    { title: "2. Information we collect", bullets: ["Account information such as name, email address, profile image, authentication provider, and account identifiers.", "Workspace content such as projects, tasks, comments, assignments, dates, reminders, invitations, and uploaded files if attachments are enabled.", "Technical information such as device, browser, approximate location derived from IP address, logs, security events, and product usage analytics.", "Communications sent to support or in response to surveys and service messages."] },
    { title: "3. How we use information", bullets: ["Provide, secure, maintain, and improve Orbit.", "Authenticate users and enforce workspace permissions.", "Deliver invitations, reminders, account notices, and support responses.", "Prevent abuse, investigate incidents, comply with law, and protect users and the service.", "Analyze aggregated product usage when analytics is enabled."] },
    { title: "4. Legal bases and choices", paragraphs: ["Where applicable, processing is based on providing the service, legitimate interests in operating and securing it, consent, and compliance with legal obligations. Users may adjust notification preferences inside Orbit and may request access, correction, export, or deletion of personal information."] },
    { title: "5. Service providers and sharing", paragraphs: ["Orbit uses service providers such as Google Firebase and Google Cloud for authentication, databases, hosting, security, and infrastructure, and [EMAIL PROVIDER] for transactional email. Information is shared only as needed to provide those services, comply with law, or complete a business transaction with appropriate safeguards. Orbit does not sell personal information."] },
    { title: "6. Retention", paragraphs: ["Information is retained while an account or workspace is active and as needed for security, backups, legal obligations, and dispute resolution. Backup copies may remain for a limited period after deletion. Define the final backup-retention period before launch."] },
    { title: "7. Security and international transfers", paragraphs: ["Orbit uses access controls, encryption in transit, managed cloud infrastructure, monitoring, and other reasonable safeguards. No system is completely secure. Information may be processed in countries other than the user’s country, subject to applicable transfer safeguards."] },
    { title: "8. Children", paragraphs: ["Orbit is not directed to children under 13, or a higher minimum age where required by local law. The service should not knowingly collect information from children without appropriate authorization."] },
    { title: "9. Changes and contact", paragraphs: ["Material changes will be announced through the service or by email when appropriate. Privacy questions and rights requests should be sent to [PRIVACY EMAIL]."] },
  ]} />;
}
