import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Delete Your Account — Orbit" };

export default function DeleteAccountPage() {
  return <LegalPage eyebrow="Account" title="Delete your Orbit account" summary="Orbit provides an authenticated, automated deletion workflow in Workspace Settings." sections={[
    { title: "Before requesting deletion", bullets: ["Export any projects or task information you need to keep.", "Transfer ownership of workspaces you own or request deletion of those workspaces.", "Understand that deletion may remove access immediately and may not be reversible."] },
    { title: "Delete from Orbit", paragraphs: ["Sign in, open Settings, choose Account, and scroll to Danger zone. Orbit requires a recent sign-in and an exact confirmation phrase before deletion begins.", "Workspace owners can delete their current workspace with the account. If you own additional workspaces, transfer or delete them first. If you cannot sign in, contact [PRIVACY OR SUPPORT EMAIL] for an assisted identity-verification process."] },
    { title: "What will be deleted", bullets: ["Your Orbit user profile and authentication account.", "Personal notification and preference records.", "Workspace content you solely own when the workspace is also being deleted.", "Membership links to shared workspaces, subject to legitimate audit and security retention requirements."] },
    { title: "Timing and backups", paragraphs: ["Active Firestore, Firebase Authentication, notification, membership, and attachment records are removed automatically. Deleted data may remain in encrypted backups until the documented backup-retention period expires and will not be restored except for disaster recovery."] },
    { title: "Organization-controlled accounts", paragraphs: ["If an employer or other organization controls your workspace, contact its workspace owner or administrator first. The organization may be the controller of project content and may retain that content after your individual account is removed."] },
  ]} />;
}
