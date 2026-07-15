import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Support — Orbit" };

export default function SupportPage() {
  return <LegalPage eyebrow="Help" title="Orbit Support" summary="Get help with account access, projects, invitations, data, billing, or security." sections={[
    { title: "Contact support", paragraphs: ["Email [SUPPORT EMAIL] with your account email, workspace name, a description of the problem, and any relevant screenshots. Do not send passwords, private keys, or sensitive authentication codes."] },
    { title: "Suggested response targets", bullets: ["Account access and security reports: acknowledge within one business day.", "Service-impacting issues: acknowledge within one business day.", "General questions and feature requests: respond within three business days."] },
    { title: "Account and data requests", paragraphs: ["For access, export, correction, or deletion requests, use the account email and clearly identify the workspace involved. Account deletion instructions are available on the Delete Account page."] },
    { title: "Security reports", paragraphs: ["Send suspected vulnerabilities privately to [SECURITY EMAIL]. Include reproduction steps and potential impact. Do not access other users’ information, disrupt the service, or publicly disclose an unresolved issue."] },
    { title: "Self-service links", paragraphs: ["Review the Privacy Policy and Terms of Service for information about data handling and service rules."] },
  ]} />;
}
