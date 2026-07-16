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

export function inclusiveDuration(startDate: string, dueDate: string) {
  if (!startDate || !dueDate) return 1;
  const start = dateParts(startDate);
  const due = dateParts(dueDate);
  const difference = Math.round((Date.UTC(due.year, due.month - 1, due.day) - Date.UTC(start.year, start.month - 1, start.day)) / DAY_MS);
  return Math.max(1, difference + 1);
}

export function taskDuration(task: Task) {
  return Math.max(1, Math.floor(task.durationDays ?? inclusiveDuration(task.startDate, task.dueDate)));
}

function dependencyCreatesCycle(tasks: Task[], taskId: string, dependencyId: string) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  function visit(id: string): boolean {
    if (id === taskId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const task = byId.get(id);
    return (task?.dependencyIds ?? (task?.dependencyId ? [task.dependencyId] : [])).some(visit);
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
    return {
      ...task,
      id: ids.get(task.id)!,
      title: task.id === rootTaskId ? `${task.title} copy` : task.title,
      parentTaskId: task.parentTaskId ? ids.get(task.parentTaskId) ?? task.parentTaskId : undefined,
      dependencyIds,
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
      const rawDependencies = (task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : [])).filter((dependencyId) => projectIds.has(dependencyId));
      const dependencies = rawDependencies
        .filter((dependencyId) => !dependencyCreatesCycle([...scheduled.values()], task.id, dependencyId))
        .map((dependencyId) => scheduled.get(dependencyId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      const startDate = dependencies.length ? addCalendarDays(dependencies.map((item) => item.dueDate).sort().at(-1)!, 1) : task.startDate || project.startDate;
      scheduled.set(id, { ...task, startDate, dueDate: addCalendarDays(startDate, duration - 1), durationDays: duration, dependencyIds: rawDependencies });
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
