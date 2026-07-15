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
    expect(result.tasks[0]).toMatchObject({ title: "Plan, scope", priority: "High", assigneeId: "m1", labels: ["Planning", "Strategy"] });
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
});
