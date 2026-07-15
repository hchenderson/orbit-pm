import type { Priority, Task, TaskStatus } from "./types";

export const TASK_STATUSES: TaskStatus[] = [
  "Not Started",
  "In Progress",
  "Blocked",
  "In Review",
  "Complete",
];

export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Urgent"];

export function taskProgress(tasks: Task[]): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter((task) => task.status === "Complete").length / tasks.length) * 100);
}

export function isOverdue(task: Task, now = new Date()): boolean {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  return task.status !== "Complete" && new Date(`${task.dueDate}T23:59:59`) < endOfToday;
}

export function isDueToday(task: Task, now = new Date()): boolean {
  const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  return task.status !== "Complete" && task.dueDate === localDate;
}

export function daysUntil(date: string, now = new Date()): number {
  const target = new Date(`${date}T12:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function dateLabel(date: string, now = new Date()): string {
  const days = daysUntil(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export function filterTasks(tasks: Task[], query: string, assignee: string, priority: string): Task[] {
  const normalized = query.trim().toLowerCase();
  return tasks.filter((task) => {
    const matchesQuery = !normalized || `${task.title} ${task.description} ${task.labels.join(" ")}`.toLowerCase().includes(normalized);
    return matchesQuery && (!assignee || task.assigneeId === assignee) && (!priority || task.priority === priority);
  });
}
