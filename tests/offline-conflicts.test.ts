import { describe, expect, it } from "vitest";
import { findNewerServerTaskConflicts } from "../lib/offline-conflicts";
import { seedData } from "../lib/seed";
import type { WorkspaceData } from "../lib/types";

function workspaceWithTask(title: string, updatedAt: string, reminderAt: string | null = null): WorkspaceData {
  const task = { ...seedData.tasks[0], title, updatedAt, nextReminderAt: reminderAt };
  return { ...seedData, tasks: [task] };
}

describe("offline conflict detection", () => {
  it("reports a newer server-authored task edit", () => {
    const local = workspaceWithTask("Local title", "2026-07-17T12:00:00.000Z");
    const server = workspaceWithTask("Teammate title", "2026-07-17T12:05:00.000Z");
    expect(findNewerServerTaskConflicts(local, server)).toEqual([
      expect.objectContaining({ taskId: seedData.tasks[0].id, taskTitle: "Teammate title" }),
    ]);
  });

  it("does not report an older server snapshot", () => {
    const local = workspaceWithTask("Local title", "2026-07-17T12:05:00.000Z");
    const server = workspaceWithTask("Older title", "2026-07-17T12:00:00.000Z");
    expect(findNewerServerTaskConflicts(local, server)).toEqual([]);
  });

  it("ignores server-only reminder bookkeeping", () => {
    const local = workspaceWithTask("Same title", "2026-07-17T12:00:00.000Z", null);
    const server = workspaceWithTask("Same title", "2026-07-17T12:00:00.000Z", "2026-07-18T13:00:00.000Z");
    expect(findNewerServerTaskConflicts(local, server)).toEqual([]);
  });
});
