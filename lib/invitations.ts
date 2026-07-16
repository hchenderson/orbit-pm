import type { User } from "firebase/auth";
import { collection, doc, getDoc, getDocs, onSnapshot, updateDoc, writeBatch, type Firestore, type Unsubscribe } from "firebase/firestore";
import type { Member, Role, WorkspaceInvitation } from "./types";

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function memberFromUser(user: User, role: Role, invitationId: string): Member & { invitationId: string } {
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Orbit User";
  return { id: user.uid, name, email: user.email ?? "", initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: "#4d799f", role, invitationId, preferences: { reminderDaysBefore: 1, reminderTime: "09:00", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", dailyDigestTime: "08:00", reminderEmail: true, reminderInApp: true, dailyDigest: true, assignmentEmails: true, mentionEmails: true, overdueEmails: true } };
}

export async function createWorkspaceInvitation(db: Firestore, workspaceId: string, inviter: Member, email: string, role: Role) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getDocs(collection(db, "workspaces", workspaceId, "invitations"));
  if (existing.docs.some((item) => item.data().email === normalizedEmail && item.data().status === "pending")) {
    throw new Error(`A pending invitation already exists for ${normalizedEmail}. Resend or revoke it from People.`);
  }
  const token = randomToken();
  const invitationId = await tokenHash(token);
  const invitationUrl = `${window.location.origin}/invite?workspace=${encodeURIComponent(workspaceId)}&token=${token}`;
  const timestamp = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, "workspaces", workspaceId, "invitations", invitationId), {
    id: invitationId,
    email: normalizedEmail,
    role,
    status: "pending",
    createdAt: timestamp,
    createdBy: inviter.id,
    inviterName: inviter.name,
    expiresAt: null,
  });
  batch.set(doc(db, "mail", `invite_${invitationId}`), {
    to: [normalizedEmail],
    invitationWorkspaceId: workspaceId,
    template: { name: "workspace-invitation", data: { inviterName: inviter.name, role, invitationUrl } },
  });
  await batch.commit();
  return invitationUrl;
}

export async function getInvitation(db: Firestore, workspaceId: string, token: string) {
  const invitationId = await tokenHash(token);
  const snapshot = await getDoc(doc(db, "workspaces", workspaceId, "invitations", invitationId));
  if (!snapshot.exists()) throw new Error("This invitation could not be found.");
  return { invitationId, ...snapshot.data() } as { invitationId: string; email: string; role: Role; status: string; inviterName: string };
}

export async function acceptWorkspaceInvitation(db: Firestore, user: User, workspaceId: string, token: string) {
  if (!user.email) throw new Error("Your authenticated account does not have an email address.");
  const invitation = await getInvitation(db, workspaceId, token);
  if (invitation.status !== "pending") throw new Error("This invitation has already been accepted or revoked.");
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) throw new Error(`Sign in as ${invitation.email} to accept this invitation.`);
  const timestamp = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, "workspaces", workspaceId, "members", user.uid), memberFromUser(user, invitation.role, invitation.invitationId));
  batch.update(doc(db, "workspaces", workspaceId, "invitations", invitation.invitationId), { status: "accepted", acceptedAt: timestamp, acceptedBy: user.uid });
  batch.set(doc(db, "users", user.uid), { displayName: user.displayName ?? user.email.split("@")[0], email: user.email, defaultWorkspaceId: workspaceId, updatedAt: timestamp }, { merge: true });
  await batch.commit();
}

export async function revokeWorkspaceInvitation(db: Firestore, workspaceId: string, invitationId: string) {
  await updateDoc(doc(db, "workspaces", workspaceId, "invitations", invitationId), { status: "revoked", revokedAt: new Date().toISOString() });
}

export async function resendWorkspaceInvitation(db: Firestore, workspaceId: string, inviter: Member, invitation: WorkspaceInvitation) {
  await revokeWorkspaceInvitation(db, workspaceId, invitation.id);
  return createWorkspaceInvitation(db, workspaceId, inviter, invitation.email, invitation.role);
}

export function subscribeToWorkspaceInvitations(db: Firestore, workspaceId: string, onData: (invitations: WorkspaceInvitation[]) => void, onError: (error: Error) => void): Unsubscribe {
  return onSnapshot(collection(db, "workspaces", workspaceId, "invitations"), (snapshot) => {
    const invitations = snapshot.docs
      .map((item) => ({ ...item.data(), id: item.id }) as WorkspaceInvitation)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    onData(invitations);
  }, onError);
}
