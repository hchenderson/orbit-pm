import type { Member, Priority, TaskStatus } from "./types";

export interface ImportedTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  durationDays: number;
  estimate: number;
  labels: string[];
  sourceId?: string;
  parentIndex?: number;
  dependencyIndexes?: number[];
  dependencyLags?: number[];
  isMilestone?: boolean;
  baselineDueDate?: string;
}

export interface CsvImportResult {
  tasks: ImportedTask[];
  warnings: string[];
  skipped: number;
  projectNotes: string;
}

const headerAliases: Record<string, string> = {
  task: "title", task_name: "title", name: "title",
  details: "description", notes: "description",
  owner: "assignee", email: "assignee",
  start: "start_date", startdate: "start_date",
  due: "due_date", duedate: "due_date", deadline: "due_date",
  effort: "estimate", hours: "estimate",
  tag: "labels", tags: "labels",
  id: "wbs", outline: "wbs", task_id: "wbs", task_number: "wbs",
  parent: "parent_task", parenttask: "parent_task", summary_task: "parent_task",
  predecessor: "predecessors", predecessor_ids: "predecessors", dependency: "predecessors", dependencies: "predecessors", depends_on: "predecessors",
  duration: "duration_days", days: "duration_days", duration_in_days: "duration_days",
  project_note: "project_notes",
  baseline: "baseline_due_date", baseline_finish: "baseline_due_date", baseline_due: "baseline_due_date",
  type: "task_type",
};

function normalizeHeader(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return headerAliases[key] ?? key;
}

function parseRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function validDate(value: string, fallback: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : value;
}

function addDays(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function inclusiveDuration(startDate: string, dueDate: string) {
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const due = new Date(`${dueDate}T12:00:00`).getTime();
  return Math.max(1, Math.round((due - start) / 86400000) + 1);
}

function referenceKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitReferences(value: string) {
  return value.split(/[;,|]/).map((reference) => reference.trim()).filter(Boolean);
}

function predecessorReference(value: string) {
  const match = value.trim().match(/^(.*?)(?:FS)?\s*([+-]\s*\d+)\s*d?$/i);
  return { reference: (match?.[1] ?? value).trim(), lag: match ? Number(match[2].replaceAll(" ", "")) : 0 };
}

function parentCreatesCycle(tasks: ImportedTask[], taskIndex: number, parentIndex: number) {
  const visited = new Set<number>([taskIndex]);
  let current: number | undefined = parentIndex;
  while (current !== undefined) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = tasks[current]?.parentIndex;
  }
  return false;
}

function dependencyCreatesCycle(tasks: ImportedTask[], taskIndex: number, dependencyIndex: number) {
  const pending = [dependencyIndex];
  const visited = new Set<number>();
  while (pending.length) {
    const current = pending.pop()!;
    if (current === taskIndex) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(tasks[current]?.dependencyIndexes ?? []));
  }
  return false;
}

export function parseTaskCsv(text: string, members: Member[], defaultStartDate: string): CsvImportResult {
  const rows = parseRows(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return { tasks: [], warnings: ["The CSV file is empty."], skipped: 0, projectNotes: "" };

  const headers = rows[0].map(normalizeHeader);
  if (!headers.includes("title")) {
    return { tasks: [], warnings: ["Add a title, task, task_name, or name column before importing."], skipped: Math.max(0, rows.length - 1), projectNotes: "" };
  }

  const warnings: string[] = [];
  let skipped = 0;
  const references: { parent: string; predecessors: string[]; row: number }[] = [];
  let projectNotes = "";
  const tasks: ImportedTask[] = rows.slice(1).flatMap((values, rowIndex) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    if (!record.title) {
      skipped += 1;
      return [];
    }

    const status = (["Not Started", "In Progress", "Blocked", "In Review", "Complete"] as TaskStatus[])
      .find((item) => item.toLowerCase() === record.status?.toLowerCase()) ?? "Not Started";
    const priority = (["Low", "Medium", "High", "Urgent"] as Priority[])
      .find((item) => item.toLowerCase() === record.priority?.toLowerCase()) ?? "Medium";
    const matchedAssignee = members.find((member) =>
      member.email.toLowerCase() === record.assignee?.toLowerCase()
      || member.name.toLowerCase() === record.assignee?.toLowerCase(),
    );
    const assignee = record.assignee ? matchedAssignee ?? members[0] : undefined;
    const startDate = validDate(record.start_date ?? "", defaultStartDate);
    const isMilestone = record.task_type?.trim().toLowerCase() === "milestone";
    const parsedDuration = Number(record.duration_days);
    const explicitDuration = Number.isFinite(parsedDuration) && parsedDuration >= (isMilestone ? 0 : 1) ? Math.floor(parsedDuration) : undefined;
    const importedDueDate = validDate(record.due_date ?? "", "");
    const dueDate = importedDueDate || addDays(startDate, explicitDuration ? explicitDuration - 1 : 7);
    const durationDays = isMilestone ? 0 : explicitDuration ?? inclusiveDuration(startDate, dueDate);
    const estimate = Number(record.estimate);
    const taskType = record.task_type?.trim();
    const labels = (record.labels ?? "").split(/[;,|]/).map((label) => label.trim()).filter(Boolean);
    if (taskType && !labels.some((label) => label.toLowerCase() === taskType.toLowerCase())) labels.push(taskType);
    if (!projectNotes && record.project_notes) projectNotes = record.project_notes;
    references.push({ parent: record.parent_task ?? "", predecessors: splitReferences(record.predecessors ?? ""), row: rowIndex + 2 });

    if (record.assignee && !matchedAssignee) {
      warnings.push(`Row ${rowIndex + 2}: assignee “${record.assignee}” was not found, so it was assigned to ${members[0]?.name ?? "the project owner"}.`);
    }

    return [{
      title: record.title,
      description: record.description ?? "",
      status,
      priority,
      assigneeId: assignee?.id ?? "",
      startDate,
      dueDate,
      durationDays,
      estimate: Number.isFinite(estimate) && estimate >= 0 ? estimate : 0,
      labels,
      sourceId: record.wbs || undefined,
      isMilestone,
      baselineDueDate: validDate(record.baseline_due_date ?? "", "") || undefined,
    }];
  });

  const sourceLookup = new Map<string, number>();
  const titleLookup = new Map<string, number>();
  tasks.forEach((task, index) => {
    if (task.sourceId) {
      const key = referenceKey(task.sourceId);
      if (!sourceLookup.has(key)) sourceLookup.set(key, index);
      else warnings.push(`Row ${references[index].row}: task reference “${task.sourceId}” is duplicated; the first match will be used.`);
    }
    const titleKey = referenceKey(task.title);
    if (!titleLookup.has(titleKey)) titleLookup.set(titleKey, index);
  });
  const resolveReference = (reference: string) => sourceLookup.get(referenceKey(reference)) ?? titleLookup.get(referenceKey(reference));

  tasks.forEach((task, index) => {
    const reference = references[index];
    if (reference.parent) {
      const parentIndex = resolveReference(reference.parent);
      if (parentIndex === undefined) warnings.push(`Row ${reference.row}: parent task “${reference.parent}” was not found.`);
      else if (parentIndex === index) warnings.push(`Row ${reference.row}: a task cannot be its own parent.`);
      else task.parentIndex = parentIndex;
    }
  });
  tasks.forEach((task, index) => {
    if (task.parentIndex !== undefined && parentCreatesCycle(tasks, index, task.parentIndex)) {
      warnings.push(`Row ${references[index].row}: the parent relationship was ignored because it creates a cycle.`);
      task.parentIndex = undefined;
    }
  });

  tasks.forEach((task, index) => {
    const dependencyIndexes: number[] = [];
    const dependencyLags: number[] = [];
    for (const rawPredecessor of references[index].predecessors) {
      const predecessor = predecessorReference(rawPredecessor);
      const dependencyIndex = resolveReference(predecessor.reference);
      if (dependencyIndex === undefined) {
        warnings.push(`Row ${references[index].row}: predecessor “${predecessor.reference}” was not found.`);
        continue;
      }
      if (dependencyIndex === index || dependencyIndexes.includes(dependencyIndex)) continue;
      task.dependencyIndexes = dependencyIndexes;
      if (dependencyCreatesCycle(tasks, index, dependencyIndex)) {
        warnings.push(`Row ${references[index].row}: predecessor “${predecessor.reference}” was ignored because it creates a cycle.`);
        continue;
      }
      dependencyIndexes.push(dependencyIndex);
      dependencyLags.push(predecessor.lag);
    }
    task.dependencyIndexes = dependencyIndexes;
    task.dependencyLags = dependencyLags;
  });

  return { tasks, warnings: [...new Set(warnings)].slice(0, 6), skipped, projectNotes };
}
