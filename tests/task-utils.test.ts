import { describe, expect, it } from "vitest";
import { filterTasks, isOverdue, taskProgress } from "../lib/task-utils";
import type { Task } from "../lib/types";

const baseTask: Task = {
  id: "1", projectId: "p1", title: "Write launch brief", description: "Campaign planning",
  status: "Not Started", priority: "High", assigneeId: "m1", startDate: "2026-01-01",
  dueDate: "2026-01-03", estimate: 2, labels: ["Launch"], subtasks: [], comments: 0,
  attachments: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

describe("task utilities", () => {
  it("calculates completion percentage", () => {
    expect(taskProgress([baseTask, { ...baseTask, id: "2", status: "Complete" }])).toBe(50);
  });

  it("detects overdue unfinished tasks", () => {
    expect(isOverdue(baseTask, new Date("2026-01-05T12:00:00"))).toBe(true);
    expect(isOverdue({ ...baseTask, status: "Complete" }, new Date("2026-01-05T12:00:00"))).toBe(false);
  });

  it("filters using query, assignee, and priority", () => {
    expect(filterTasks([baseTask], "launch", "m1", "High")).toHaveLength(1);
    expect(filterTasks([baseTask], "design", "", "")).toHaveLength(0);
  });
});
