import { initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { DateTime } from "luxon";

initializeApp();

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
