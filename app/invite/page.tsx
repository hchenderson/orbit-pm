"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, MailCheck, RefreshCw, Sparkles, UserPlus } from "lucide-react";
import { onAuthStateChanged, sendEmailVerification, type User } from "firebase/auth";
import { getFirebaseAuth, getFirebaseFirestore } from "@/lib/firebase";
import { acceptWorkspaceInvitation, getInvitation } from "@/lib/invitations";
import type { Role } from "@/lib/types";

export default function InvitationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [verificationAction, setVerificationAction] = useState<"check" | "resend" | "">("");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [invitation, setInvitation] = useState<{ email: string; role: Role; inviterName: string } | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    const db = getFirebaseFirestore();
    const params = new URLSearchParams(window.location.search);
    const workspace = params.get("workspace") ?? "";
    const invitationToken = params.get("token") ?? "";
    setWorkspaceId(workspace);
    setToken(invitationToken);
    if (!auth || !db || !workspace || !invitationToken) {
      setError("This invitation link is incomplete or Firebase is not configured.");
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setEmailVerified(Boolean(currentUser?.emailVerified));
      if (!currentUser) {
        setLoading(false);
        return;
      }
      void getInvitation(db, workspace, invitationToken).then((value) => {
        setInvitation(value);
        setLoading(false);
      }).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "The invitation could not be loaded.");
        setLoading(false);
      });
    });
  }, []);

  async function accept() {
    const db = getFirebaseFirestore();
    if (!db || !user) return;
    setWorking(true);
    setActionError("");
    try {
      await acceptWorkspaceInvitation(db, user, workspaceId, token);
      window.location.replace("/");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The invitation could not be accepted.";
      if (message.toLowerCase().includes("verify")) setEmailVerified(false);
      setActionError(message);
      setWorking(false);
    }
  }

  async function resendVerification() {
    if (!user) return;
    setVerificationAction("resend");
    setActionError("");
    try {
      await sendEmailVerification(user, { url: window.location.href });
      setVerificationSent(true);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message.replace("Firebase: ", "") : "The verification email could not be sent.");
    } finally {
      setVerificationAction("");
    }
  }

  async function checkVerification() {
    if (!user) return;
    setVerificationAction("check");
    setActionError("");
    try {
      await user.reload();
      await user.getIdToken(true);
      setEmailVerified(user.emailVerified);
      if (!user.emailVerified) setActionError("This email is not verified yet. Open the verification email, then try again.");
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message.replace("Firebase: ", "") : "Orbit could not refresh your verification status.");
    } finally {
      setVerificationAction("");
    }
  }

  const nextPath = `/invite?workspace=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(token)}`;
  return <main className="invite-page"><section className="invite-card"><span className="brand-mark"><Sparkles size={18} /></span>{loading ? <><h1>Opening invitation…</h1><p>Checking the invitation securely.</p></> : error ? <><CircleAlert className="invite-state-icon error" size={28} /><h1>Invitation unavailable</h1><p>{error}</p><Link className="secondary-button invite-home" href="/support">Contact support</Link></> : !user ? <><UserPlus className="invite-state-icon" size={28} /><h1>You’ve been invited to Orbit</h1><p>Sign in with the email address that received this invitation.</p><Link className="primary-button invite-accept" href={`/sign-in?next=${encodeURIComponent(nextPath)}`}>Sign in to continue</Link></> : !emailVerified ? <><MailCheck className="invite-state-icon" size={28} /><span className="invite-eyebrow">ONE MORE STEP</span><h1>Verify your email</h1><p>Orbit created your account, but <strong>{invitation?.email ?? user.email}</strong> must be verified before joining the workspace.</p>{actionError && <p className="form-error invite-action-message" role="alert">{actionError}</p>}{verificationSent && <p className="form-success invite-action-message">Verification email sent. Check your inbox and spam folder.</p>}<div className="invite-actions"><button className="primary-button" onClick={() => void checkVerification()} disabled={Boolean(verificationAction)}><RefreshCw size={15} /> {verificationAction === "check" ? "Checking…" : "I’ve verified my email"}</button><button className="secondary-button" onClick={() => void resendVerification()} disabled={Boolean(verificationAction)}>{verificationAction === "resend" ? "Sending…" : verificationSent ? "Send again" : "Resend verification email"}</button></div><small>After opening the verification link, return here and select “I’ve verified my email.”</small></> : <><CheckCircle2 className="invite-state-icon success" size={28} /><span className="invite-eyebrow">WORKSPACE INVITATION</span><h1>Join the team</h1><p><strong>{invitation?.inviterName}</strong> invited <strong>{invitation?.email}</strong> to join Orbit as a {invitation?.role}.</p>{actionError && <p className="form-error invite-action-message" role="alert">{actionError}</p>}<button className="primary-button invite-accept" onClick={() => void accept()} disabled={working}>{working ? "Joining…" : "Accept invitation"}</button><small>Invitations remain valid until accepted or revoked.</small></>}</section></main>;
}
