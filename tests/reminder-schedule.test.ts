import { describe, expect, it } from "vitest";
import { reminderScheduleForTask, withReminderSchedule } from "../lib/reminder-schedule";
import type { Member, Task } from "../lib/types";

const member: Member = {
  id: "member-1",
  name: "Carter",
  email: "carter@example.com",
  initials: "C",
  color: "#000000",
  role: "Owner",
  preferences: {
    reminderDaysBefore: 1,
    reminderTime: "09:00",
    timezone: "America/New_York",
    dailyDigestTime: "08:00",
    reminderEmail: true,
    reminderInApp: true,
    dailyDigest: true,
    assignmentEmails: true,
    mentionEmails: true,
    overdueEmails: true,
  },
};

const task: Task = {
  id: "task-1",
  projectId: "project-1",
  title: "Publish issue",
  description: "",
  status: "Not Started",
  priority: "Low",
  assigneeId: member.id,
  startDate: "2026-08-01",
  dueDate: "2026-08-12",
  estimate: 1,
  labels: [],
  subtasks: [],
  comments: 0,
  attachments: 0,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
};

describe("reminder scheduling", () => {
  it("converts the user's local reminder time to UTC", () => {
    expect(reminderScheduleForTask(task, [member])).toEqual({
      key: "member-1|2026-08-12|1|09:00|America/New_York",
      at: "2026-08-11T13:00:00.000Z",
    });
  });

  it("does not reschedule a reminder already delivered for the same inputs", () => {
    const scheduled = reminderScheduleForTask(task, [member])!;
    expect(withReminderSchedule({ ...task, reminderDeliveredKey: scheduled.key }, [member]).nextReminderAt).toBeNull();
  });

  it("reschedules when the due date changes", () => {
    const old = reminderScheduleForTask(task, [member])!;
    const changed = withReminderSchedule({ ...task, dueDate: "2026-08-13", reminderScheduleKey: old.key, reminderDeliveredKey: old.key }, [member], Date.parse("2026-07-17T00:00:00.000Z"));
    expect(changed.nextReminderAt).toBe("2026-08-12T13:00:00.000Z");
    expect(changed.reminderScheduleKey).not.toBe(old.key);
  });

  it("removes the schedule when a task is complete", () => {
    expect(withReminderSchedule({ ...task, status: "Complete" }, [member]).nextReminderAt).toBeNull();
  });
});
