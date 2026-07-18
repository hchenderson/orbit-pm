"use client";

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { signOut } from "firebase/auth";
import { permanentlyDeleteAccount, permanentlyDeleteWorkspace } from "@/lib/account-actions";
import { clearFirebaseOfflineCache, getFirebaseAuth } from "@/lib/firebase";

function deletionError(error: unknown) {
  const message = error instanceof Error ? error.message : "The deletion could not be completed.";
  if (message.includes("recent-login-required")) return "For your security, sign out and sign back in before deleting data.";
  return message.replace(/^FirebaseError:\s*/i, "");
}

async function finishDeletion(destination: string) {
  const auth = getFirebaseAuth();
  await clearFirebaseOfflineCache();
  if (auth) await signOut(auth).catch(() => undefined);
  window.location.replace(destination);
}

export function DangerZone({ workspaceId, workspaceName, isOwner, firestoreConnected }: { workspaceId: string; workspaceName: string; isOwner: boolean; firestoreConnected: boolean }) {
  const [workspaceConfirmation, setWorkspaceConfirmation] = useState("");
  const [accountConfirmation, setAccountConfirmation] = useState("");
  const [accountWorkspaceConfirmation, setAccountWorkspaceConfirmation] = useState("");
  const [busy, setBusy] = useState<"workspace" | "account" | "">("");
  const [error, setError] = useState("");

  async function deleteWorkspace() {
    setBusy("workspace"); setError("");
    try {
      await permanentlyDeleteWorkspace(workspaceId, workspaceConfirmation);
      await finishDeletion("/sign-in?deleted=workspace");
    } catch (caught) {
      setError(deletionError(caught)); setBusy("");
    }
  }

  async function deleteAccount() {
    setBusy("account"); setError("");
    try {
      await permanentlyDeleteAccount({
        confirmation: accountConfirmation,
        ...(isOwner ? { deleteWorkspaceId: workspaceId, workspaceConfirmation: accountWorkspaceConfirmation } : {}),
      });
      await finishDeletion("/sign-in?deleted=account");
    } catch (caught) {
      setError(deletionError(caught)); setBusy("");
    }
  }

  return <section className="settings-card danger-zone-card"><header><h2>Danger zone</h2><p>These actions permanently remove production data and cannot be undone.</p></header>
    {!firestoreConnected && <p className="danger-note"><AlertTriangle size={15} /> Permanent deletion is available only while connected to Firebase.</p>}
    {isOwner && <div className="danger-action"><span><strong>Delete this workspace</strong><small>Deletes every project, task, invitation, notification, and attachment in {workspaceName}. Your login account remains active.</small></span><label>Type <b>{workspaceName}</b> to confirm<input value={workspaceConfirmation} onChange={(event) => setWorkspaceConfirmation(event.target.value)} /></label><button className="danger-button" disabled={!firestoreConnected || busy !== "" || workspaceConfirmation !== workspaceName} onClick={() => void deleteWorkspace()}><Trash2 size={14} />{busy === "workspace" ? "Deleting…" : "Delete workspace"}</button></div>}
    <div className="danger-action"><span><strong>Delete my account{isOwner ? " and workspace" : ""}</strong><small>{isOwner ? "Deletes this owned workspace, removes your shared-workspace memberships, and deletes your Firebase Authentication account." : "Removes your memberships, personal records, notifications, and Firebase Authentication account. Shared project content remains with its workspace."}</small></span><label>Type <b>DELETE MY ACCOUNT</b> to confirm<input value={accountConfirmation} onChange={(event) => setAccountConfirmation(event.target.value)} /></label>{isOwner && <label>Type <b>{workspaceName}</b> to confirm the workspace deletion<input value={accountWorkspaceConfirmation} onChange={(event) => setAccountWorkspaceConfirmation(event.target.value)} /></label>}<button className="danger-button" disabled={!firestoreConnected || busy !== "" || accountConfirmation !== "DELETE MY ACCOUNT" || (isOwner && accountWorkspaceConfirmation !== workspaceName)} onClick={() => void deleteAccount()}><Trash2 size={14} />{busy === "account" ? "Deleting…" : "Delete my account"}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
