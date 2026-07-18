import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type DocumentReference, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineString } from "firebase-functions/params";
import { beforeUserCreated, HttpsError as IdentityHttpsError } from "firebase-functions/v2/identity";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { DateTime } from "luxon";
import { isBootstrapEmail, normalizeEmail } from "./invite-policy";
import { hasRecentLogin, safeErrorText } from "./security";

initializeApp();

const bootstrapOwnerEmails = defineString("INVITE_ONLY_BOOTSTRAP_EMAILS", { default: "" });

interface Preferences {
  reminderDaysBefore?: number;
  reminderTime?: string;
  // Used only to migrate preferences saved before reminders changed from hours to days.
  reminderHoursBefore?: number;
  timezone?: string;
  dailyDigestTime?: string;
  reminderEmail?: boolean;
  reminderInApp?: boolean;
  dailyDigest?: boolean;
  overdueEmails?: boolean;
  pushNotifications?: boolean;
}

interface MemberData {
  id: string;
  name: string;
  email: string;
  preferences?: Preferences;
}

interface TaskData {
  id: string;
  projectId: string;
  title: string;
  dueDate: string;
  status: string;
  assigneeId: string;
  nextReminderAt?: string | null;
  reminderScheduleKey?: string | null;
  reminderDeliveredKey?: string | null;
}

const defaults = {
  reminderDaysBefore: 1,
  reminderTime: "09:00",
  timezone: "UTC",
  dailyDigestTime: "08:00",
  reminderEmail: true,
  reminderInApp: true,
  dailyDigest: true,
  overdueEmails: true,
  pushNotifications: false,
} satisfies Required<Omit<Preferences, "reminderHoursBefore">>;

type NormalizedPreferences = Required<Omit<Preferences, "reminderHoursBefore">>;

function safeZone(zone?: string) {
  const candidate = zone || "UTC";
  return DateTime.now().setZone(candidate).isValid ? candidate : "UTC";
}

function normalizePreferences(member: MemberData): NormalizedPreferences {
  const stored = member.preferences ?? {};
  return {
    ...defaults,
    ...stored,
    reminderDaysBefore: Math.max(0, Math.floor(stored.reminderDaysBefore ?? Math.ceil((stored.reminderHoursBefore ?? 24) / 24))),
    timezone: safeZone(stored.timezone),
  };
}

function reminderPlan(task: TaskData, preferences: NormalizedPreferences) {
  if (!task.assigneeId || !task.dueDate || task.status === "Complete") return null;
  if (!preferences.reminderEmail && !preferences.reminderInApp && !preferences.pushNotifications) return null;
  const due = DateTime.fromISO(task.dueDate, { zone: preferences.timezone }).startOf("day");
  if (!due.isValid) return null;
  const [hour, minute] = preferences.reminderTime.split(":").map(Number);
  const at = due.minus({ days: preferences.reminderDaysBefore }).set({
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
    second: 0,
    millisecond: 0,
  }).toUTC().toISO();
  if (!at) return null;
  return {
    at,
    due,
    key: [task.assigneeId, task.dueDate, preferences.reminderDaysBefore, preferences.reminderTime, preferences.timezone].join("|"),
  };
}

function digestWindow(now: DateTime, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const target = now.set({ hour: Number.isFinite(hour) ? hour : 8, minute: Number.isFinite(minute) ? minute : 0, second: 0, millisecond: 0 });
  const minutes = now.diff(target, "minutes").minutes;
  return minutes >= 0 && minutes < 15;
}

async function deliverOnce(
  db: Firestore,
  workspaceRef: DocumentReference,
  deliveryId: string,
  notification: object | null,
  email: object | null,
  taskRef?: DocumentReference,
  taskCompletion?: object,
) {
  const marker = workspaceRef.collection("deliveries").doc(deliveryId);
  let created = false;
  await db.runTransaction(async (transaction) => {
    const alreadyDelivered = (await transaction.get(marker)).exists;
    if (!alreadyDelivered) {
      transaction.create(marker, { deliveredAt: new Date().toISOString() });
      if (notification) transaction.create(workspaceRef.collection("notifications").doc(deliveryId), notification);
      if (email) transaction.create(db.collection("mail").doc(deliveryId), email);
      created = true;
    }
    if (taskRef && taskCompletion) transaction.set(taskRef, taskCompletion, { merge: true });
  });
  return created;
}

async function getPushTargets(workspaceRef: DocumentReference, userId: string) {
  const snapshot = await workspaceRef.collection("pushSubscriptions").where("userId", "==", userId).get();
  return snapshot.docs.flatMap((item) => {
    const subscription = item.data() as { fid?: string; token?: string };
    const target = subscription.fid ?? subscription.token;
    return target ? [target] : [];
  });
}

async function sendPush(targets: string[], title: string, body: string, url: string) {
  if (!targets.length) return;
  const absoluteUrl = new URL(url, process.env.APP_URL ?? "https://orbitpm.fyi").toString();
  // The Admin SDK's token field accepts Firebase Installation IDs during the FID migration period.
  const result = await getMessaging().sendEachForMulticast({
    tokens: [...new Set(targets)].slice(0, 500),
    data: { title, body, url: absoluteUrl },
  });
  if (result.failureCount) logger.warn("Some Orbit push notifications could not be delivered", { failures: result.failureCount, successes: result.successCount });
}

async function processDueTask(db: Firestore, taskDocument: QueryDocumentSnapshot, nowUtc: DateTime) {
  const task = taskDocument.data() as TaskData;
  const taskRef = taskDocument.ref;
  const workspaceRef = taskRef.parent.parent;
  if (!workspaceRef || !task.assigneeId) {
    await taskRef.set({ nextReminderAt: null, reminderScheduleKey: null }, { merge: true });
    return 0;
  }

  const memberDocument = await workspaceRef.collection("members").doc(task.assigneeId).get();
  if (!memberDocument.exists) {
    await taskRef.set({ nextReminderAt: null, reminderScheduleKey: null }, { merge: true });
    return 0;
  }

  const member = memberDocument.data() as MemberData;
  const preferences = normalizePreferences(member);
  const plan = reminderPlan(task, preferences);
  if (!plan) {
    await taskRef.set({ nextReminderAt: null, reminderScheduleKey: null }, { merge: true });
    return 0;
  }

  if (task.reminderScheduleKey !== plan.key) {
    const stale = DateTime.fromISO(plan.at).diff(nowUtc, "minutes").minutes < -15;
    await taskRef.set({
      nextReminderAt: stale ? null : plan.at,
      reminderScheduleKey: plan.key,
      ...(stale ? { reminderDeliveredKey: plan.key } : {}),
    }, { merge: true });
    return 0;
  }

  const completion = { nextReminderAt: null, reminderDeliveredKey: plan.key };
  const deliveryId = `reminder_${task.id}_${plan.key}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dueLabel = plan.due.toLocaleString(DateTime.DATE_MED);
  const notification = preferences.reminderInApp ? {
    id: deliveryId,
    recipientId: member.id,
    taskId: task.id,
    projectId: task.projectId,
    title: "Task due soon",
    body: `${task.title} is due ${dueLabel}`,
    time: "Just now",
    read: false,
    tone: "amber",
  } : null;
  const email = preferences.reminderEmail && member.email ? {
    to: [member.email],
    template: { name: "task-reminder", data: { memberName: member.name, taskTitle: task.title, dueDate: dueLabel, overdue: false } },
  } : null;
  const push = preferences.pushNotifications ? await getPushTargets(workspaceRef, member.id) : [];

  if (!notification && !email && !push.length) {
    await taskRef.set(completion, { merge: true });
    return 0;
  }
  const delivered = await deliverOnce(db, workspaceRef, deliveryId, notification, email, taskRef, completion);
  if (delivered && push.length) await sendPush(push, "Task due soon", `${task.title} is due ${dueLabel}`, `/?task=${encodeURIComponent(task.id)}`);
  return delivered ? 1 : 0;
}

async function processDailyDigests(db: Firestore, nowUtc: DateTime) {
  const workspaces = await db.collection("workspaces").get();
  let deliveries = 0;
  for (const workspace of workspaces.docs) {
    const workspaceRef = workspace.ref;
    const members = await workspaceRef.collection("members").get();
    for (const memberDocument of members.docs) {
      const member = memberDocument.data() as MemberData;
      const preferences = normalizePreferences(member);
      const localNow = nowUtc.setZone(preferences.timezone);
      if (!preferences.dailyDigest || !digestWindow(localNow, preferences.dailyDigestTime)) continue;

      const assignedSnapshot = await workspaceRef.collection("tasks").where("assigneeId", "==", member.id).get();
      const digestTasks = assignedSnapshot.docs.map((item) => item.data() as TaskData).filter((task) => {
        if (task.status === "Complete") return false;
        const due = DateTime.fromISO(`${task.dueDate}T17:00`, { zone: preferences.timezone });
        return due.isValid && due.diff(localNow, "days").days <= 7;
      });
      if (!digestTasks.length) continue;

      const deliveryId = `digest_${member.id}_${localNow.toISODate()}`;
      const taskList = digestTasks.slice(0, 20).map((task) => ({ title: task.title, dueDate: task.dueDate }));
      const notification = preferences.reminderInApp ? { id: deliveryId, recipientId: member.id, title: "Daily task digest", body: `${digestTasks.length} upcoming or overdue task${digestTasks.length === 1 ? "" : "s"}`, time: "Just now", read: false, tone: "purple" } : null;
      const email = preferences.reminderEmail && member.email ? { to: [member.email], template: { name: "daily-digest", data: { memberName: member.name, taskCount: digestTasks.length, tasks: taskList } } } : null;
      const push = preferences.pushNotifications ? await getPushTargets(workspaceRef, member.id) : [];
      if (!notification && !email && !push.length) continue;
      const delivered = await deliverOnce(db, workspaceRef, deliveryId, notification, email);
      if (delivered && push.length) await sendPush(push, "Daily task digest", `${digestTasks.length} upcoming or overdue task${digestTasks.length === 1 ? "" : "s"}`, "/?view=my-tasks");
      if (delivered) deliveries += 1;
    }
  }
  return { deliveries, workspaceCount: workspaces.size };
}

export const processReminders = onSchedule({ schedule: "every 15 minutes", timeZone: "UTC", retryCount: 3, timeoutSeconds: 300, memory: "512MiB" }, async () => {
  const db = getFirestore();
  const nowUtc = DateTime.utc();
  const dueTasks = await db.collectionGroup("tasks")
    .where("nextReminderAt", "<=", nowUtc.toISO())
    .orderBy("nextReminderAt")
    .limit(500)
    .get();

  let reminderDeliveries = 0;
  for (const taskDocument of dueTasks.docs) {
    try {
      reminderDeliveries += await processDueTask(db, taskDocument, nowUtc);
    } catch (error) {
      logger.error("Orbit could not process a due task reminder", { taskPath: taskDocument.ref.path, error });
    }
  }
  const digests = await processDailyDigests(db, nowUtc);
  logger.info("Orbit reminder run complete", {
    dueTasksScanned: dueTasks.size,
    reminderDeliveries,
    digestDeliveries: digests.deliveries,
    workspaceCount: digests.workspaceCount,
  });
});

export const enforceInviteOnlyRegistration = beforeUserCreated({ region: "us-central1", timeoutSeconds: 7, maxInstances: 10 }, async (event) => {
  const email = normalizeEmail(event.data?.email ?? "");
  if (!email) throw new IdentityHttpsError("invalid-argument", "Orbit registration requires an invited email address.");
  if (isBootstrapEmail(email, bootstrapOwnerEmails.value())) return { customClaims: { orbitInvited: true, orbitBootstrapOwner: true } };

  const invitation = await getFirestore().collectionGroup("invitations")
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (invitation.empty) {
    logger.warn("Blocked an uninvited Orbit registration", { emailDomain: email.split("@")[1] ?? "unknown" });
    throw new IdentityHttpsError("permission-denied", "Orbit is invite-only. Ask a workspace owner to invite this email address.");
  }
  return { customClaims: { orbitInvited: true } };
});

function requireRecentUser(request: { auth?: { uid: string; token: Record<string, unknown> } }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  if (!hasRecentLogin(request.auth.token.auth_time)) throw new HttpsError("failed-precondition", "recent-login-required");
  return request.auth.uid;
}

function requestRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function deleteWorkspaceData(db: Firestore, workspaceRef: DocumentReference) {
  const workspaceId = workspaceRef.id;
  const users = await db.collection("users").where("defaultWorkspaceId", "==", workspaceId).get();
  const mail = await db.collection("mail").where("invitationWorkspaceId", "==", workspaceId).get();
  const writer = db.bulkWriter();
  for (const user of users.docs) writer.set(user.ref, { defaultWorkspaceId: FieldValue.delete(), updatedAt: new Date().toISOString() }, { merge: true });
  for (const item of mail.docs) writer.delete(item.ref);
  await writer.close();
  await db.recursiveDelete(workspaceRef);
  try {
    await getStorage().bucket().deleteFiles({ prefix: `workspaces/${workspaceId}/` });
  } catch (error) {
    logger.warn("Workspace records were deleted but attachment cleanup needs attention", { workspaceId, error: safeErrorText(error) });
  }
}

async function sharedWorkspaceCleanup(db: Firestore, uid: string, email: string) {
  const memberships = await db.collectionGroup("members").where("id", "==", uid).get();
  for (const membership of memberships.docs) {
    const workspaceRef = membership.ref.parent.parent;
    if (!workspaceRef) continue;
    const workspaceSnapshot = await workspaceRef.get();
    if (!workspaceSnapshot.exists) continue;
    const workspace = workspaceSnapshot.data() as { ownerId?: string } | undefined;
    if (workspace?.ownerId === uid) throw new HttpsError("failed-precondition", "Delete or transfer every workspace you own before deleting your account.");
    const [tasks, projects, notifications, pushSubscriptions, savedViews, templates, invitations] = await Promise.all([
      workspaceRef.collection("tasks").get(),
      workspaceRef.collection("projects").get(),
      workspaceRef.collection("notifications").where("recipientId", "==", uid).get(),
      workspaceRef.collection("pushSubscriptions").where("userId", "==", uid).get(),
      workspaceRef.collection("savedViews").where("ownerId", "==", uid).get(),
      workspaceRef.collection("templates").where("ownerId", "==", uid).get(),
      workspaceRef.collection("invitations").get(),
    ]);
    const writer = db.bulkWriter();
    for (const task of tasks.docs) {
      const value = task.data() as {
        assigneeId?: string;
        subtasks?: Array<{ assigneeId?: string; [key: string]: unknown }>;
        commentItems?: Array<{ authorId?: string; mentions?: string[]; [key: string]: unknown }>;
        attachmentItems?: Array<{ uploadedBy?: string; [key: string]: unknown }>;
        activity?: Array<{ actorId?: string }>;
      };
      const patch: Record<string, unknown> = {};
      if (value.assigneeId === uid) patch.assigneeId = "";
      if (value.subtasks?.some((item) => item.assigneeId === uid)) patch.subtasks = value.subtasks.map((item) => item.assigneeId === uid ? { ...item, assigneeId: "" } : item);
      if (value.commentItems?.some((item) => item.authorId === uid || item.mentions?.includes(uid))) {
        patch.commentItems = value.commentItems
          .filter((item) => item.authorId !== uid)
          .map((item) => item.mentions?.includes(uid) ? { ...item, mentions: item.mentions.filter((mention) => mention !== uid) } : item);
      }
      if (value.attachmentItems?.some((item) => item.uploadedBy === uid)) patch.attachmentItems = value.attachmentItems.map((item) => item.uploadedBy === uid ? { ...item, uploadedBy: "" } : item);
      if (value.activity?.some((item) => item.actorId === uid)) patch.activity = value.activity.filter((item) => item.actorId !== uid);
      if (Object.keys(patch).length) writer.set(task.ref, { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
    }
    for (const project of projects.docs) {
      const value = project.data() as { ownerId?: string; memberIds?: string[] };
      const patch: Record<string, unknown> = {};
      if (value.ownerId === uid) patch.ownerId = workspace?.ownerId ?? "";
      if (value.memberIds?.includes(uid)) patch.memberIds = FieldValue.arrayRemove(uid);
      if (Object.keys(patch).length) writer.set(project.ref, patch, { merge: true });
    }
    for (const invitation of invitations.docs) {
      const value = invitation.data() as { email?: string; createdBy?: string; inviterName?: string };
      if (normalizeEmail(value.email ?? "") === email) writer.delete(invitation.ref);
      else if (value.createdBy === uid) writer.set(invitation.ref, { createdBy: "", inviterName: "Former member" }, { merge: true });
    }
    for (const snapshot of [notifications, pushSubscriptions, savedViews, templates]) for (const item of snapshot.docs) writer.delete(item.ref);
    writer.delete(membership.ref);
    await writer.close();
  }
}

export const deleteWorkspace = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB", maxInstances: 5 }, async (request) => {
  const uid = requireRecentUser(request);
  const data = requestRecord(request.data);
  const workspaceId = typeof data.workspaceId === "string" ? data.workspaceId : "";
  const confirmation = typeof data.confirmation === "string" ? data.confirmation.trim() : "";
  if (!workspaceId) throw new HttpsError("invalid-argument", "A workspace is required.");
  const db = getFirestore();
  const workspaceRef = db.collection("workspaces").doc(workspaceId);
  const snapshot = await workspaceRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "This workspace no longer exists.");
  const workspace = snapshot.data() as { ownerId?: string; workspaceName?: string };
  if (workspace.ownerId !== uid) throw new HttpsError("permission-denied", "Only the workspace owner can permanently delete it.");
  if (!workspace.workspaceName || confirmation !== workspace.workspaceName) throw new HttpsError("invalid-argument", "Enter the exact workspace name to confirm deletion.");
  await deleteWorkspaceData(db, workspaceRef);
  logger.warn("Orbit workspace permanently deleted", { workspaceId, deletedBy: uid });
  return { deleted: true };
});

export const deleteMyAccount = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB", maxInstances: 5 }, async (request) => {
  const uid = requireRecentUser(request);
  const data = requestRecord(request.data);
  if (data.confirmation !== "DELETE MY ACCOUNT") throw new HttpsError("invalid-argument", "Type DELETE MY ACCOUNT to confirm.");
  const db = getFirestore();
  const authUser = await getAuth().getUser(uid);
  const email = normalizeEmail(authUser.email ?? "");
  const owned = await db.collection("workspaces").where("ownerId", "==", uid).get();
  const deleteWorkspaceId = typeof data.deleteWorkspaceId === "string" ? data.deleteWorkspaceId : "";
  if (!owned.empty) {
    if (owned.size !== 1 || owned.docs[0].id !== deleteWorkspaceId) throw new HttpsError("failed-precondition", "Delete or transfer every workspace you own before deleting your account.");
    const workspaceName = (owned.docs[0].data() as { workspaceName?: string }).workspaceName ?? "";
    if (data.workspaceConfirmation !== workspaceName) throw new HttpsError("invalid-argument", "Enter the exact workspace name to delete the owned workspace with this account.");
    await deleteWorkspaceData(db, owned.docs[0].ref);
  }
  await sharedWorkspaceCleanup(db, uid, email);
  if (email) {
    const queuedMail = await db.collection("mail").where("to", "array-contains", email).get();
    const mailWriter = db.bulkWriter();
    for (const item of queuedMail.docs) mailWriter.delete(item.ref);
    await mailWriter.close();
  }
  await db.recursiveDelete(db.collection("users").doc(uid));
  await getAuth().deleteUser(uid);
  logger.warn("Orbit account permanently deleted", { deletedUserId: uid });
  return { deleted: true };
});

export const reportClientError = onCall({ region: "us-central1", timeoutSeconds: 15, memory: "256MiB", maxInstances: 5 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
  const data = requestRecord(request.data);
  const message = safeErrorText(data.message, "Orbit client error");
  const stack = safeErrorText(data.stack, message);
  const route = typeof data.route === "string" ? data.route.slice(0, 300) : "unknown";
  const release = typeof data.release === "string" ? data.release.slice(0, 100) : "unknown";
  logger.error(stack, {
    "@type": "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
    serviceContext: { service: "orbit-web", version: release },
    context: { user: request.auth.uid, reportLocation: { filePath: route, lineNumber: 1, functionName: "browser" } },
    errorMessage: message,
    route,
  });
  return { recorded: true };
});
