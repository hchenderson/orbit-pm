import type { Task, WorkspaceData } from "./types";

export interface OfflineConflict {
  taskId: string;
  taskTitle: string;
  localUpdatedAt: string;
  serverUpdatedAt: string;
}

function timestamp(value?: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function comparableTask(task: Task) {
  const editable = { ...task };
  delete editable.nextReminderAt;
  delete editable.reminderScheduleKey;
  delete editable.reminderDeliveredKey;
  return editable;
}

/**
 * Finds edits where Firestore returned a newer task than the local offline copy.
 * Reminder bookkeeping is intentionally ignored because it is maintained by the
 * server and is not a user-authored conflict.
 */
export function findNewerServerTaskConflicts(local: WorkspaceData, server: WorkspaceData): OfflineConflict[] {
  const localTasks = new Map(local.tasks.map((task) => [task.id, task]));
  return server.tasks.flatMap((serverTask) => {
    const localTask = localTasks.get(serverTask.id);
    if (!localTask || timestamp(serverTask.updatedAt) <= timestamp(localTask.updatedAt)) return [];
    if (JSON.stringify(comparableTask(serverTask)) === JSON.stringify(comparableTask(localTask))) return [];
    return [{
      taskId: serverTask.id,
      taskTitle: serverTask.title,
      localUpdatedAt: localTask.updatedAt,
      serverUpdatedAt: serverTask.updatedAt,
    }];
  });
}
