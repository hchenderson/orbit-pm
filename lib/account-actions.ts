import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase";

function functionsOrThrow() {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not available in this session.");
  return functions;
}

export async function permanentlyDeleteWorkspace(workspaceId: string, confirmation: string) {
  const call = httpsCallable<{ workspaceId: string; confirmation: string }, { deleted: boolean }>(functionsOrThrow(), "deleteWorkspace");
  return (await call({ workspaceId, confirmation })).data;
}

export async function permanentlyDeleteAccount(options: { confirmation: string; deleteWorkspaceId?: string; workspaceConfirmation?: string }) {
  const call = httpsCallable<typeof options, { deleted: boolean }>(functionsOrThrow(), "deleteMyAccount");
  return (await call(options)).data;
}
