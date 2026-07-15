"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Sparkles, UserPlus } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth, getFirebaseFirestore } from "@/lib/firebase";
import { acceptWorkspaceInvitation, getInvitation } from "@/lib/invitations";
import type { Role } from "@/lib/types";

export default function InvitationPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
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
    setError("");
    try {
      await acceptWorkspaceInvitation(db, user, workspaceId, token);
      window.location.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The invitation could not be accepted.");
      setWorking(false);
    }
  }

  const nextPath = `/invite?workspace=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(token)}`;
  return <main className="invite-page"><section className="invite-card"><span className="brand-mark"><Sparkles size={18} /></span>{loading ? <><h1>Opening invitation…</h1><p>Checking the invitation securely.</p></> : error ? <><CircleAlert className="invite-state-icon error" size={28} /><h1>Invitation unavailable</h1><p>{error}</p><Link className="secondary-button invite-home" href="/support">Contact support</Link></> : !user ? <><UserPlus className="invite-state-icon" size={28} /><h1>You’ve been invited to Orbit</h1><p>Sign in with the email address that received this invitation.</p><Link className="primary-button invite-accept" href={`/sign-in?next=${encodeURIComponent(nextPath)}`}>Sign in to continue</Link></> : <><CheckCircle2 className="invite-state-icon success" size={28} /><span className="invite-eyebrow">WORKSPACE INVITATION</span><h1>Join the team</h1><p><strong>{invitation?.inviterName}</strong> invited <strong>{invitation?.email}</strong> to join Orbit as a {invitation?.role}.</p><button className="primary-button invite-accept" onClick={() => void accept()} disabled={working}>{working ? "Joining…" : "Accept invitation"}</button><small>Invitations remain valid until accepted or revoked.</small></>}</section></main>;
}
