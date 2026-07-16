import { describe, expect, it } from "vitest";
import { duplicateTaskTree, migrateLegacySubtasks, recalculateProjectSchedule, taskOutline, wouldCreateDependencyCycle, wouldCreateParentCycle } from "../lib/scheduling";
import type { Project, Task } from "../lib/types";

const project: Project = { id: "p1", name: "Plan", description: "", icon: "P", color: "#000", status: "Active", startDate: "2026-08-01", dueDate: "2026-09-01", ownerId: "m1", memberIds: ["m1"] };
const task = (id: string, startDate = "2026-08-01", dueDate = "2026-08-01"): Task => ({ id, projectId: "p1", title: id, description: "", status: "Not Started", priority: "Medium", assigneeId: "m1", startDate, dueDate, durationDays: 1, estimate: 0, labels: [], subtasks: [], comments: 0, attachments: 0, dependencyIds: [], createdAt: "2026-08-01", updatedAt: "2026-08-01" });

describe("calculated project scheduling", () => {
  it("starts a dependent task after its latest predecessor and applies duration", () => {
    const scheduled = recalculateProjectSchedule([
      { ...task("a"), durationDays: 3 },
      { ...task("b"), durationDays: 2, dependencyIds: ["a"] },
    ], project);
    expect(scheduled.find((item) => item.id === "a")?.dueDate).toBe("2026-08-03");
    expect(scheduled.find((item) => item.id === "b")?.startDate).toBe("2026-08-04");
    expect(scheduled.find((item) => item.id === "b")?.dueDate).toBe("2026-08-05");
  });

  it("rolls parent dates, duration, and status up from child tasks", () => {
    const scheduled = recalculateProjectSchedule([
      task("parent"),
      { ...task("child-1", "2026-08-02"), parentTaskId: "parent", durationDays: 2, status: "Complete" },
      { ...task("child-2", "2026-08-06"), parentTaskId: "parent", durationDays: 3, status: "In Progress" },
    ], project);
    const parent = scheduled.find((item) => item.id === "parent");
    expect(parent?.startDate).toBe("2026-08-02");
    expect(parent?.dueDate).toBe("2026-08-08");
    expect(parent?.durationDays).toBe(5);
    expect(parent?.status).toBe("In Progress");
  });

  it("detects dependency and parent cycles", () => {
    const tasks = [{ ...task("a"), dependencyIds: ["b"] }, task("b")];
    expect(wouldCreateDependencyCycle(tasks, "b", ["a"])).toBe(true);
    expect(wouldCreateParentCycle([{ ...task("child"), parentTaskId: "parent" }, task("parent")], "parent", "child")).toBe(true);
  });

  it("migrates embedded subtasks into real child task records", () => {
    const migrated = migrateLegacySubtasks([{ ...task("parent"), subtasks: [{ id: "s1", title: "Child", complete: false, assigneeId: "m1" }] }]);
    expect(migrated).toHaveLength(2);
    expect(migrated[0].subtasks).toEqual([]);
    expect(migrated[1]).toMatchObject({ id: "child-parent-s1", parentTaskId: "parent", title: "Child", assigneeId: "m1" });
    expect(taskOutline(migrated).map((row) => row.outline)).toEqual(["1", "1.1"]);
  });

  it("duplicates a parent tree and remaps child relationships and internal predecessors", () => {
    const tasks = [
      task("parent"),
      { ...task("child-1"), parentTaskId: "parent", durationDays: 2 },
      { ...task("child-2"), parentTaskId: "parent", dependencyIds: ["child-1", "external"] },
      task("external"),
    ];
    const copies = duplicateTaskTree(tasks, "parent", (id) => `copy-${id}`, "2026-08-02T12:00:00.000Z", "m1");
    expect(copies).toHaveLength(3);
    expect(copies.find((item) => item.id === "copy-parent")).toMatchObject({ title: "parent copy", status: "Not Started", comments: 0, attachments: 0 });
    expect(copies.find((item) => item.id === "copy-child-1")?.parentTaskId).toBe("copy-parent");
    expect(copies.find((item) => item.id === "copy-child-2")?.dependencyIds).toEqual(["copy-child-1", "external"]);
  });
});
