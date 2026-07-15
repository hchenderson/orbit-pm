import type { Member, Priority, TaskStatus } from "./types";

export interface ImportedTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  estimate: number;
  labels: string[];
}

export interface CsvImportResult {
  tasks: ImportedTask[];
  warnings: string[];
  skipped: number;
}

const headerAliases: Record<string, string> = {
  task: "title", task_name: "title", name: "title",
  details: "description", notes: "description",
  owner: "assignee", email: "assignee",
  start: "start_date", startdate: "start_date",
  due: "due_date", duedate: "due_date", deadline: "due_date",
  effort: "estimate", hours: "estimate",
  tag: "labels", tags: "labels",
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

export function parseTaskCsv(text: string, members: Member[], defaultStartDate: string): CsvImportResult {
  const rows = parseRows(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return { tasks: [], warnings: ["The CSV file is empty."], skipped: 0 };

  const headers = rows[0].map(normalizeHeader);
  if (!headers.includes("title")) {
    return { tasks: [], warnings: ["Add a title, task, task_name, or name column before importing."], skipped: Math.max(0, rows.length - 1) };
  }

  const warnings: string[] = [];
  let skipped = 0;
  const tasks = rows.slice(1).flatMap((values, rowIndex) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    if (!record.title) {
      skipped += 1;
      return [];
    }

    const status = (["Not Started", "In Progress", "Blocked", "In Review", "Complete"] as TaskStatus[])
      .find((item) => item.toLowerCase() === record.status?.toLowerCase()) ?? "Not Started";
    const priority = (["Low", "Medium", "High", "Urgent"] as Priority[])
      .find((item) => item.toLowerCase() === record.priority?.toLowerCase()) ?? "Medium";
    const assignee = members.find((member) =>
      member.email.toLowerCase() === record.assignee?.toLowerCase()
      || member.name.toLowerCase() === record.assignee?.toLowerCase(),
    ) ?? members[0];
    const startDate = validDate(record.start_date ?? "", defaultStartDate);
    const dueDate = validDate(record.due_date ?? "", addDays(startDate, 7));
    const estimate = Number(record.estimate);

    if (record.assignee && assignee === members[0] && ![members[0]?.email, members[0]?.name].some((value) => value?.toLowerCase() === record.assignee.toLowerCase())) {
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
      estimate: Number.isFinite(estimate) && estimate >= 0 ? estimate : 0,
      labels: (record.labels ?? "").split(/[;,|]/).map((label) => label.trim()).filter(Boolean),
    }];
  });

  return { tasks, warnings: [...new Set(warnings)].slice(0, 4), skipped };
}
