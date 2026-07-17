import type { Project, Task, TaskStatus } from "./types";

const DAY_MS = 86_400_000;

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function addCalendarDays(value: string, days: number) {
  const { year, month, day } = dateParts(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("-");
}

function weekday(value: string) {
  const { year, month, day } = dateParts(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWorkingDate(value: string, project: Project) {
  if (project.scheduleMode !== "business") return true;
  const workingDays = project.workingDays?.length ? project.workingDays : [1, 2, 3, 4, 5];
  return workingDays.includes(weekday(value)) && !(project.holidays ?? []).includes(value);
}

/** Adds schedule days, skipping weekends and project holidays for business-day projects. */
export function addScheduleDays(value: string, days: number, project: Project) {
  if (project.scheduleMode !== "business") return addCalendarDays(value, days);
  if (!days) {
    let current = value;
    while (!isWorkingDate(current, project)) current = addCalendarDays(current, 1);
    return current;
  }
  let current = value;
  let remaining = Math.abs(days);
  const direction = days > 0 ? 1 : -1;
  while (remaining > 0) {
    current = addCalendarDays(current, direction);
    if (isWorkingDate(current, project)) remaining -= 1;
  }
  return current;
}

export function inclusiveDuration(startDate: string, dueDate: string) {
  if (!startDate || !dueDate) return 1;
  const start = dateParts(startDate);
  const due = dateParts(dueDate);
  const difference = Math.round((Date.UTC(due.year, due.month - 1, due.day) - Date.UTC(start.year, start.month - 1, start.day)) / DAY_MS);
  return Math.max(1, difference + 1);
}

export function taskDuration(task: Task) {
  if (task.isMilestone) return 0;
  return Math.max(1, Math.floor(task.durationDays ?? inclusiveDuration(task.startDate, task.dueDate)));
}

function dependencyIds(task: Task) {
  return task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
}

function dependencyCreatesCycle(tasks: Task[], taskId: string, dependencyId: string) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (id === taskId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const task = byId.get(id);
    return task ? dependencyIds(task).some(visit) : false;
  }
  return visit(dependencyId);
}

export function wouldCreateDependencyCycle(tasks: Task[], taskId: string, dependencyIds: string[]) {
  return dependencyIds.some((dependencyId) => dependencyId === taskId || dependencyCreatesCycle(tasks, taskId, dependencyId));
}

export function wouldCreateParentCycle(tasks: Task[], taskId: string, parentTaskId: string) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let current: Task | undefined = byId.get(parentTaskId);
  const visited = new Set<string>();
  while (current) {
    if (current.id === taskId) return true;
    if (!current.parentTaskId || visited.has(current.id)) return false;
    visited.add(current.id);
    current = byId.get(current.parentTaskId);
  }
  return false;
}

export function migrateLegacySubtasks(tasks: Task[]) {
  const existingIds = new Set(tasks.map((task) => task.id));
  const migrated: Task[] = [];
  for (const task of tasks) {
    const normalized: Task = {
      ...task,
      durationDays: taskDuration(task),
      dependencyIds: task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []),
      dependencyLags: task.dependencyLags ?? {},
      commentItems: task.commentItems ?? [],
      attachmentItems: task.attachmentItems ?? [],
      activity: task.activity ?? [],
      subtasks: [],
    };
    migrated.push(normalized);
    for (const subtask of task.subtasks ?? []) {
      const childId = `child-${task.id}-${subtask.id}`;
      if (existingIds.has(childId)) continue;
      existingIds.add(childId);
      migrated.push({
        id: childId,
        projectId: task.projectId,
        parentTaskId: task.id,
        title: subtask.title,
        description: "",
        status: subtask.complete ? "Complete" : "Not Started",
        priority: task.priority,
        assigneeId: subtask.assigneeId ?? task.assigneeId,
        startDate: task.startDate,
        dueDate: task.dueDate,
        durationDays: taskDuration(task),
        estimate: 0,
        labels: [],
        subtasks: [],
        comments: 0,
        attachments: 0,
        commentItems: [],
        attachmentItems: [],
        activity: [],
        dependencyIds: [],
        dependencyLags: {},
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    }
  }
  return migrated;
}

export function duplicateTaskTree(
  tasks: Task[],
  rootTaskId: string,
  createId: (originalId: string) => string,
  timestamp: string,
  actorId: string,
) {
  const root = tasks.find((task) => task.id === rootTaskId);
  if (!root) return [];

  const included = new Set([rootTaskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (task.parentTaskId && included.has(task.parentTaskId) && !included.has(task.id)) {
        included.add(task.id);
        changed = true;
      }
    }
  }

  const tree = tasks.filter((task) => included.has(task.id));
  const ids = new Map(tree.map((task) => [task.id, createId(task.id)]));
  return tree.map((task): Task => {
    const dependencyIds = (task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []))
      .map((id) => ids.get(id) ?? id);
    const dependencyLags = Object.fromEntries(Object.entries(task.dependencyLags ?? {}).map(([id, lag]) => [ids.get(id) ?? id, lag]));
    return {
      ...task,
      id: ids.get(task.id)!,
      title: task.id === rootTaskId ? `${task.title} copy` : task.title,
      parentTaskId: task.parentTaskId ? ids.get(task.parentTaskId) ?? task.parentTaskId : undefined,
      dependencyIds,
      dependencyLags,
      dependencyId: undefined,
      status: "Not Started",
      subtasks: [],
      comments: 0,
      attachments: 0,
      commentItems: [],
      attachmentItems: [],
      activity: [{ id: `activity-${ids.get(task.id)}`, actorId, kind: "created", summary: `duplicated ${task.title}`, createdAt: timestamp }],
      recurrenceGeneratedAt: undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

function summaryStatus(children: Task[]): TaskStatus {
  if (children.every((task) => task.status === "Complete")) return "Complete";
  if (children.some((task) => task.status === "Blocked")) return "Blocked";
  if (children.some((task) => task.status !== "Not Started")) return "In Progress";
  return "Not Started";
}

export function recalculateProjectSchedule(tasks: Task[], project: Project) {
  const projectIds = new Set(tasks.filter((task) => task.projectId === project.id).map((task) => task.id));
  const scheduled = new Map(tasks.map((task) => [task.id, { ...task, durationDays: taskDuration(task) }]));
  const passes = Math.max(2, projectIds.size + 1);

  for (let pass = 0; pass < passes; pass += 1) {
    for (const id of projectIds) {
      const task = scheduled.get(id)!;
      const duration = taskDuration(task);
      const rawDependencies = dependencyIds(task);
      const dependencies = rawDependencies
        .filter((dependencyId) => projectIds.has(dependencyId))
        .filter((dependencyId) => !dependencyCreatesCycle([...scheduled.values()], task.id, dependencyId))
        .map((dependencyId) => {
          const predecessor = scheduled.get(dependencyId);
          if (!predecessor) return null;
          const lag = Math.trunc(task.dependencyLags?.[dependencyId] ?? 0);
          return addScheduleDays(predecessor.dueDate, lag + 1, project);
        })
        .filter((item): item is string => Boolean(item));
      const startDate = dependencies.length
        ? dependencies.sort().at(-1)!
        : addScheduleDays(task.startDate || project.startDate, 0, project);
      const dueDate = duration === 0 ? startDate : addScheduleDays(startDate, duration - 1, project);
      scheduled.set(id, { ...task, startDate, dueDate, durationDays: duration, dependencyIds: rawDependencies, dependencyLags: task.dependencyLags ?? {} });
    }

    for (const id of [...projectIds].reverse()) {
      const parent = scheduled.get(id)!;
      const children = [...scheduled.values()].filter((task) => task.projectId === project.id && task.parentTaskId === id);
      if (!children.length) continue;
      const startDate = children.map((task) => task.startDate).sort()[0];
      const dueDate = children.map((task) => task.dueDate).sort().at(-1)!;
      const durationDays = children.reduce((total, child) => total + taskDuration(child), 0);
      scheduled.set(id, { ...parent, startDate, dueDate, durationDays, status: summaryStatus(children) });
    }
  }

  return tasks.map((task) => scheduled.get(task.id) ?? task);
}

export type ScheduleIssueKind = "cycle" | "missing-predecessor" | "late" | "outside-project" | "blocked" | "baseline-slip";

export interface ScheduleIssue {
  id: string;
  taskId?: string;
  kind: ScheduleIssueKind;
  severity: "warning" | "critical";
  message: string;
}

export interface ScheduleAnalysis {
  criticalTaskIds: Set<string>;
  issues: ScheduleIssue[];
  finishDate: string;
  baselineVarianceDays: number;
}

function dateDifference(left: string, right: string) {
  const a = dateParts(left);
  const b = dateParts(right);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS);
}

/** Produces a deterministic critical chain and actionable schedule health warnings. */
export function analyzeProjectSchedule(tasks: Task[], project: Project): ScheduleAnalysis {
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  const byId = new Map(projectTasks.map((task) => [task.id, task]));
  const children = new Set(projectTasks.flatMap((task) => task.parentTaskId ? [task.parentTaskId] : []));
  const leafTasks = projectTasks.filter((task) => !children.has(task.id));
  const issues: ScheduleIssue[] = [];

  for (const task of projectTasks) {
    for (const predecessorId of dependencyIds(task)) {
      if (!byId.has(predecessorId)) issues.push({ id: `missing-${task.id}-${predecessorId}`, taskId: task.id, kind: "missing-predecessor", severity: "critical", message: `${task.title} references a predecessor that no longer exists.` });
      else if (dependencyCreatesCycle(projectTasks, task.id, predecessorId)) issues.push({ id: `cycle-${task.id}-${predecessorId}`, taskId: task.id, kind: "cycle", severity: "critical", message: `${task.title} is part of a circular dependency.` });
    }
    if (task.status === "Blocked") issues.push({ id: `blocked-${task.id}`, taskId: task.id, kind: "blocked", severity: "warning", message: `${task.title} is blocked.` });
    if (task.startDate < project.startDate) issues.push({ id: `early-${task.id}`, taskId: task.id, kind: "outside-project", severity: "warning", message: `${task.title} begins before the project start date.` });
    if (task.dueDate > project.dueDate) issues.push({ id: `late-${task.id}`, taskId: task.id, kind: "late", severity: "critical", message: `${task.title} finishes after the project deadline.` });
    if (task.baselineDueDate && task.dueDate > task.baselineDueDate) {
      const days = dateDifference(task.dueDate, task.baselineDueDate);
      issues.push({ id: `baseline-${task.id}`, taskId: task.id, kind: "baseline-slip", severity: days > 3 ? "critical" : "warning", message: `${task.title} is ${days} day${days === 1 ? "" : "s"} later than its baseline.` });
    }
  }

  const memo = new Map<string, { length: number; previous?: string }>();
  const visiting = new Set<string>();
  function longestTo(task: Task): { length: number; previous?: string } {
    const cached = memo.get(task.id);
    if (cached) return cached;
    if (visiting.has(task.id)) return { length: taskDuration(task) };
    visiting.add(task.id);
    const candidates = dependencyIds(task)
      .map((id) => byId.get(id))
      .filter((item): item is Task => Boolean(item))
      .map((predecessor) => ({ predecessor, value: longestTo(predecessor) }));
    const best = candidates.sort((a, b) => b.value.length - a.value.length)[0];
    const value = { length: taskDuration(task) + (best?.value.length ?? 0) + (best ? Math.max(0, task.dependencyLags?.[best.predecessor.id] ?? 0) : 0), previous: best?.predecessor.id };
    memo.set(task.id, value);
    visiting.delete(task.id);
    return value;
  }
  const end = leafTasks.map((task) => ({ task, value: longestTo(task) })).sort((a, b) => b.value.length - a.value.length || b.task.dueDate.localeCompare(a.task.dueDate))[0];
  const criticalTaskIds = new Set<string>();
  let currentId: string | undefined = end?.task.id;
  while (currentId && !criticalTaskIds.has(currentId)) {
    criticalTaskIds.add(currentId);
    currentId = memo.get(currentId)?.previous;
  }
  const finishDate = projectTasks.map((task) => task.dueDate).sort().at(-1) ?? project.startDate;
  const baselineFinish = projectTasks.map((task) => task.baselineDueDate).filter((value): value is string => Boolean(value)).sort().at(-1);
  return { criticalTaskIds, issues, finishDate, baselineVarianceDays: baselineFinish ? dateDifference(finishDate, baselineFinish) : 0 };
}

export interface TaskOutlineRow {
  task: Task;
  depth: number;
  outline: string;
  hasChildren: boolean;
  ancestorIds: string[];
}

export function taskOutline(tasks: Task[]): TaskOutlineRow[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const children = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentTaskId || !taskIds.has(task.parentTaskId)) continue;
    children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]);
  }
  const roots = tasks.filter((task) => !task.parentTaskId || !taskIds.has(task.parentTaskId));
  const rows: TaskOutlineRow[] = [];
  const seen = new Set<string>();
  function append(task: Task, depth: number, outline: string, ancestorIds: string[]) {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    const childTasks = children.get(task.id) ?? [];
    rows.push({ task, depth, outline, hasChildren: childTasks.length > 0, ancestorIds });
    childTasks.forEach((child, index) => append(child, depth + 1, `${outline}.${index + 1}`, [...ancestorIds, task.id]));
  }
  roots.forEach((task, index) => append(task, 0, String(index + 1), []));
  tasks.filter((task) => !seen.has(task.id)).forEach((task, index) => append(task, 0, String(roots.length + index + 1), []));
  return rows;
}
