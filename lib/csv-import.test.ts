import { describe, expect, it } from "vitest";
import { parseTaskCsv } from "./csv-import";
import type { Member } from "./types";

const members: Member[] = [
  { id: "m1", name: "Carter Henderson", email: "carter@example.com", initials: "CH", color: "#000", role: "Owner" },
];

describe("parseTaskCsv", () => {
  it("supports quoted fields, aliases, and task defaults", () => {
    const result = parseTaskCsv('Task,Notes,Priority,Owner,Tags\n"Plan, scope",Agree on outcomes,high,carter@example.com,"Planning,Strategy"', members, "2026-08-01");
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toMatchObject({ title: "Plan, scope", priority: "High", assigneeId: "m1", durationDays: 8, labels: ["Planning", "Strategy"] });
    expect(result.tasks[0].dueDate).toBe("2026-08-08");
  });

  it("reports a missing title column", () => {
    const result = parseTaskCsv("description,priority\nMissing title,High", members, "2026-08-01");
    expect(result.tasks).toEqual([]);
    expect(result.warnings[0]).toContain("title");
  });

  it("skips untitled rows and falls back to the owner", () => {
    const result = parseTaskCsv("title,assignee,description\n,,Untitled detail\nResearch,unknown@example.com,", members, "2026-08-01");
    expect(result.tasks).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.tasks[0].assigneeId).toBe("m1");
  });

  it("imports parent tasks, predecessors, durations, project notes, and blank assignees", () => {
    const csv = [
      "wbs,title,parent_task,task_type,description,status,priority,assignee,duration_days,predecessors,start_date,due_date,labels,project_notes",
      "1,Article,,Parent Article,Feature copy,Not Started,Low,,5,,2026-08-01,2026-08-08,Editorial,Four-page issue",
      "1.1,Draft,Article,Draft,Write it,Not Started,Low,,2,,2026-08-01,2026-08-02,Editorial,",
      "1.2,Layout,Article,Layout,Design it,Not Started,Low,,3,1.1,2026-08-03,2026-08-05,Editorial,",
    ].join("\n");
    const result = parseTaskCsv(csv, members, "2026-08-01");

    expect(result.tasks).toHaveLength(3);
    expect(result.tasks[0]).toMatchObject({ sourceId: "1", durationDays: 5, assigneeId: "", labels: ["Editorial", "Parent Article"] });
    expect(result.tasks[1]).toMatchObject({ parentIndex: 0, durationDays: 2, labels: ["Editorial", "Draft"] });
    expect(result.tasks[2]).toMatchObject({ parentIndex: 0, dependencyIndexes: [1], durationDays: 3 });
    expect(result.projectNotes).toBe("Four-page issue");
    expect(result.warnings).toEqual([]);
  });

  it("warns about missing and circular task references", () => {
    const csv = [
      "wbs,title,parent_task,predecessors",
      "1,First,2,2",
      "2,Second,1,1",
      "3,Third,Missing,Unknown",
    ].join("\n");
    const result = parseTaskCsv(csv, members, "2026-08-01");

    expect(result.warnings.some((warning) => warning.includes("parent relationship"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("predecessor"))).toBe(true);
    expect(result.tasks[2].parentIndex).toBeUndefined();
  });
});
