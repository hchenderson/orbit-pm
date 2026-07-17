import type { Member, Task } from "./types";

const DEFAULT_REMINDER_DAYS = 1;
const DEFAULT_REMINDER_TIME = "09:00";
const DEFAULT_TIMEZONE = "UTC";
const STALE_NEW_SCHEDULE_GRACE_MS = 15 * 60 * 1000;

export interface ReminderSchedule {
  key: string;
  at: string;
}

function safeTimeZone(timeZone?: string) {
  const candidate = timeZone || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

/** Converts a wall-clock date and time in an IANA timezone to a stable UTC ISO timestamp. */
function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let instant = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = zonedParts(new Date(instant), timeZone);
    const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second, 0);
    instant -= renderedAsUtc - desired;
  }
  const result = new Date(instant);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function subtractCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(result.getTime())) return null;
  result.setUTCDate(result.getUTCDate() - days);
  return result.toISOString().slice(0, 10);
}

export function reminderScheduleForTask(task: Task, members: Member[]): ReminderSchedule | null {
  if (!task.assigneeId || !task.dueDate || task.status === "Complete") return null;
  const member = members.find((item) => item.id === task.assigneeId);
  if (!member) return null;
  const legacy = member.preferences as (typeof member.preferences & { reminderHoursBefore?: number }) | undefined;
  const days = Math.max(0, Math.floor(legacy?.reminderDaysBefore ?? Math.ceil((legacy?.reminderHoursBefore ?? 24) / 24) ?? DEFAULT_REMINDER_DAYS));
  const time = legacy?.reminderTime || DEFAULT_REMINDER_TIME;
  const timeZone = safeTimeZone(legacy?.timezone);
  if (legacy?.reminderEmail === false && legacy?.reminderInApp === false && legacy?.pushNotifications !== true) return null;
  const reminderDate = subtractCalendarDays(task.dueDate, days);
  const at = reminderDate ? localDateTimeToUtc(reminderDate, time, timeZone) : null;
  if (!at) return null;
  return { key: [task.assigneeId, task.dueDate, days, time, timeZone].join("|"), at };
}

/** Adds the denormalized fields used by the scheduled reminder query. */
export function withReminderSchedule(task: Task, members: Member[], nowMs = Date.now()): Task {
  const schedule = reminderScheduleForTask(task, members);
  if (!schedule) return { ...task, reminderScheduleKey: null, nextReminderAt: null };
  if (task.reminderDeliveredKey === schedule.key) return { ...task, reminderScheduleKey: schedule.key, nextReminderAt: null };
  const scheduleChanged = task.reminderScheduleKey !== schedule.key;
  if (scheduleChanged && new Date(schedule.at).getTime() < nowMs - STALE_NEW_SCHEDULE_GRACE_MS) {
    return { ...task, reminderScheduleKey: schedule.key, reminderDeliveredKey: schedule.key, nextReminderAt: null };
  }
  return { ...task, reminderScheduleKey: schedule.key, nextReminderAt: schedule.at };
}
