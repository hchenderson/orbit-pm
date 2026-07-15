import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service — Orbit" };

export default function TermsPage() {
  return <LegalPage eyebrow="Legal" title="Terms of Service" summary="These terms govern access to and use of Orbit and form an agreement between each user and the service operator." sections={[
    { title: "1. Agreement and eligibility", paragraphs: ["By accessing Orbit, you agree to these terms on behalf of yourself or the organization you represent. You must be legally able to enter this agreement and meet the minimum age required in your location."] },
    { title: "2. Accounts and invitations", paragraphs: ["Orbit is an invite-only service. You must provide accurate account information, protect your credentials, and promptly report unauthorized access. Workspace owners and administrators are responsible for invitations, roles, and activity in their workspaces."] },
    { title: "3. Acceptable use", bullets: ["Do not use Orbit unlawfully, fraudulently, or to violate another person’s rights.", "Do not upload malware, attempt unauthorized access, probe security, disrupt the service, or evade limits.", "Do not send spam, abusive invitations, or harmful content.", "Do not reverse engineer or resell the service except where expressly permitted by law or a separate agreement."] },
    { title: "4. Customer content", paragraphs: ["You retain ownership of content you submit. You grant [LEGAL NAME OR COMPANY] a limited license to host, process, transmit, back up, and display that content solely to operate and improve Orbit. You represent that you have the rights needed to submit the content."] },
    { title: "5. Service changes and availability", paragraphs: ["Orbit may change, suspend, or discontinue features and may impose reasonable usage limits. Planned material changes will be communicated when practical. No uninterrupted or error-free service is guaranteed."] },
    { title: "6. Fees", paragraphs: ["If paid plans are introduced, pricing, billing frequency, taxes, cancellation, and refund terms will be shown before purchase. Insert the final subscription and refund policy before accepting payments."] },
    { title: "7. Intellectual property", paragraphs: ["Orbit, its software, branding, and documentation are owned by [LEGAL NAME OR COMPANY] or its licensors. These terms grant only a limited, revocable right to use the service."] },
    { title: "8. Termination", paragraphs: ["Users may stop using Orbit and request account deletion. Orbit may suspend or terminate access for material violations, security risk, nonpayment, or legal requirements. Workspace owners should export needed information before deletion."] },
    { title: "9. Disclaimers and liability", paragraphs: ["To the maximum extent allowed by law, Orbit is provided “as is” without implied warranties. Insert jurisdiction-appropriate warranty exclusions, liability caps, indemnity terms, governing law, venue, and dispute-resolution language after legal review."] },
    { title: "10. Contact", paragraphs: ["Questions about these terms may be sent to [LEGAL EMAIL] or [MAILING ADDRESS]."] },
  ]} />;
}
