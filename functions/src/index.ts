import { initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { DateTime } from "luxon";

initializeApp();

interface Preferences {
  reminderHoursBefore?: number;
  timezone?: string;
  dailyDigestTime?: string;
  reminderEmail?: boolean;
  reminderInApp?: boolean;
  dailyDigest?: boolean;
  overdueEmails?: boolean;
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
}

const defaults: Required<Preferences> = {
  reminderHoursBefore: 24,
  timezone: "UTC",
  dailyDigestTime: "08:00",
  reminderEmail: true,
  reminderInApp: true,
  dailyDigest: true,
  overdueEmails: true,
};

function safeZone(zone?: string) {
  const candidate = zone || "UTC";
  return DateTime.now().setZone(candidate).isValid ? candidate : "UTC";
}

function digestWindow(now: DateTime, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const target = now.set({ hour: Number.isFinite(hour) ? hour : 8, minute: Number.isFinite(minute) ? minute : 0, second: 0, millisecond: 0 });
  const minutes = now.diff(target, "minutes").minutes;
  return minutes >= 0 && minutes < 15;
}

async function deliverOnce(db: Firestore, workspaceRef: DocumentReference, deliveryId: string, notification: object | null, email: object | null) {
  const marker = workspaceRef.collection("deliveries").doc(deliveryId);
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(marker)).exists) return;
    transaction.create(marker, { deliveredAt: new Date().toISOString() });
    if (notification) transaction.create(workspaceRef.collection("notifications").doc(deliveryId), notification);
    if (email) transaction.create(db.collection("mail").doc(deliveryId), email);
  });
}

export const processReminders = onSchedule({ schedule: "every 15 minutes", timeZone: "UTC", retryCount: 3, timeoutSeconds: 300, memory: "512MiB" }, async () => {
  const db = getFirestore();
  const nowUtc = DateTime.utc();
  const workspaces = await db.collection("workspaces").get();
  let deliveries = 0;

  for (const workspace of workspaces.docs) {
    const workspaceRef = workspace.ref;
    const [memberSnapshot, taskSnapshot] = await Promise.all([workspaceRef.collection("members").get(), workspaceRef.collection("tasks").get()]);
    const members = memberSnapshot.docs.map((item) => item.data() as MemberData);
    const tasks = taskSnapshot.docs.map((item) => item.data() as TaskData).filter((task) => task.status !== "Complete");

    for (const member of members) {
      if (!member.email) continue;
      const preferences = { ...defaults, ...member.preferences };
      const zone = safeZone(preferences.timezone);
      const localNow = nowUtc.setZone(zone);
      const assigned = tasks.filter((task) => task.assigneeId === member.id);

      for (const task of assigned) {
        const due = DateTime.fromISO(`${task.dueDate}T17:00`, { zone });
        if (!due.isValid) continue;
        const hoursUntilDue = due.diff(localNow, "hours").hours;
        if (hoursUntilDue > preferences.reminderHoursBefore || hoursUntilDue < -24) continue;
        const deliveryId = `reminder_${member.id}_${task.id}_${task.dueDate}_${preferences.reminderHoursBefore}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        const notification = preferences.reminderInApp ? { id: deliveryId, recipientId: member.id, title: hoursUntilDue < 0 ? "Task overdue" : "Task due soon", body: `${task.title} is due ${due.toLocaleString(DateTime.DATE_MED)}`, time: "Just now", read: false, tone: hoursUntilDue < 0 ? "red" : "amber" } : null;
        const email = preferences.reminderEmail ? { to: [member.email], template: { name: "task-reminder", data: { memberName: member.name, taskTitle: task.title, dueDate: due.toLocaleString(DateTime.DATETIME_MED), overdue: hoursUntilDue < 0 } } } : null;
        if (notification || email) { await deliverOnce(db, workspaceRef, deliveryId, notification, email); deliveries += 1; }
      }

      if (preferences.dailyDigest && digestWindow(localNow, preferences.dailyDigestTime)) {
        const digestTasks = assigned.filter((task) => {
          const due = DateTime.fromISO(`${task.dueDate}T17:00`, { zone });
          return due.isValid && due.diff(localNow, "days").days <= 7;
        });
        if (digestTasks.length) {
          const localDate = localNow.toISODate();
          const deliveryId = `digest_${member.id}_${localDate}`;
          const taskList = digestTasks.slice(0, 20).map((task) => ({ title: task.title, dueDate: task.dueDate }));
          const notification = preferences.reminderInApp ? { id: deliveryId, recipientId: member.id, title: "Daily task digest", body: `${digestTasks.length} upcoming or overdue task${digestTasks.length === 1 ? "" : "s"}`, time: "Just now", read: false, tone: "purple" } : null;
          const email = preferences.reminderEmail ? { to: [member.email], template: { name: "daily-digest", data: { memberName: member.name, taskCount: digestTasks.length, tasks: taskList } } } : null;
          if (notification || email) { await deliverOnce(db, workspaceRef, deliveryId, notification, email); deliveries += 1; }
        }
      }
    }
  }
  logger.info("Orbit reminder run complete", { workspaceCount: workspaces.size, deliveries });
});
