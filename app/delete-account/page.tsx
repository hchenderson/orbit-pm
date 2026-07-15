import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Delete Your Account — Orbit" };

export default function DeleteAccountPage() {
  return <LegalPage eyebrow="Account" title="Delete your Orbit account" summary="Use this process to request deletion of your account and associated personal information." sections={[
    { title: "Before requesting deletion", bullets: ["Export any projects or task information you need to keep.", "Transfer ownership of workspaces you own or request deletion of those workspaces.", "Understand that deletion may remove access immediately and may not be reversible."] },
    { title: "Submit a request", paragraphs: ["Email [PRIVACY OR SUPPORT EMAIL] from the email address associated with your Orbit account. Use the subject “Orbit account deletion request” and include your workspace name. Support will verify your identity before processing the request."] },
    { title: "What will be deleted", bullets: ["Your Orbit user profile and authentication account.", "Personal notification and preference records.", "Workspace content you solely own when the workspace is also being deleted.", "Membership links to shared workspaces, subject to legitimate audit and security retention requirements."] },
    { title: "Timing and backups", paragraphs: ["Set and publish a final processing target before launch; 30 days is a common operational target. Deleted data may remain in encrypted backups until the documented backup-retention period expires and will not be restored except for disaster recovery."] },
    { title: "Organization-controlled accounts", paragraphs: ["If an employer or other organization controls your workspace, contact its workspace owner or administrator first. The organization may be the controller of project content and may retain that content after your individual account is removed."] },
  ]} />;
}
