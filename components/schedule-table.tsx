"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Download, ChevronDown, ChevronRight, Plus, Search, Trash2, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { taskDuration, taskOutline, wouldCreateDependencyCycle, wouldCreateParentCycle } from "@/lib/scheduling";
import { PRIORITIES, TASK_STATUSES } from "@/lib/task-utils";
import type { Priority, Task, TaskStatus, WorkspaceData } from "@/lib/types";

const statusTone: Record<TaskStatus, string> = { "Not Started": "slate", "In Progress": "blue", Blocked: "red", "In Review": "amber", Complete: "green" };
type SortKey = "outline" | "title" | "parent" | "duration" | "start" | "finish" | "status" | "assignee" | "priority";
type SortDirection = "asc" | "desc";
const statusRank = new Map(TASK_STATUSES.map((status, index) => [status, index]));
const priorityRank = new Map(PRIORITIES.map((priority, index) => [priority, index]));

interface ScheduleTableProps {
  data: WorkspaceData;
  tasks: Task[];
  onTask: (id: string) => void;
  onTaskUpdate: (id: string, patch: Partial<Task>) => void;
  onBulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  onBulkDelete: (ids: string[]) => void;
  onAddTask: (parentTaskId?: string) => void;
  importCsv: (file?: File) => void;
  exportCsv: () => void;
}

function PredecessorCell({ task, tasks, rowNumbers, update }: { task: Task; tasks: Task[]; rowNumbers: Map<string, string>; update: (dependencyIds: string[]) => void }) {
  const dependencyIds = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
  const displayValue = dependencyIds.map((id) => rowNumbers.get(id) ?? id).join(", ");
  const [draft, setDraft] = useState(displayValue);
  const [error, setError] = useState("");
  useEffect(() => setDraft(displayValue), [displayValue]);

  function commit() {
    const byOutline = new Map([...rowNumbers.entries()].map(([id, outline]) => [outline, id]));
    const byId = new Map(tasks.map((item) => [item.id, item.id]));
    const parsed = [...new Set(draft.split(",").map((token) => token.trim()).filter(Boolean).map((token) => byOutline.get(token) ?? byId.get(token)).filter((id): id is string => Boolean(id) && id !== task.id))];
    if (wouldCreateDependencyCycle(tasks, task.id, parsed)) {
      setError("That would create a circular schedule.");
      setDraft(displayValue);
      return;
    }
    setError("");
    update(parsed);
  }

  return <input className={error ? "sheet-error" : ""} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="e.g. 1, 2.1" title={error || "Enter predecessor row numbers separated by commas"} aria-label={`Predecessors for ${task.title}`} />;
}

export function ScheduleTable({ data, tasks, onTask, onTaskUpdate, onBulkUpdate, onBulkDelete, onAddTask, importCsv, exportCsv }: ScheduleTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "outline", direction: "asc" });
  const canonicalRows = useMemo(() => taskOutline(tasks), [tasks]);
  const rows = useMemo(() => {
    const originalIndex = new Map(canonicalRows.map((row, index) => [row.task.id, index]));
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const memberNames = new Map(data.members.map((member) => [member.id, member.name.toLowerCase()]));
    const children = new Map<string, typeof canonicalRows>();
    const roots: typeof canonicalRows = [];
    for (const row of canonicalRows) {
      if (row.task.parentTaskId && byId.has(row.task.parentTaskId) && row.depth > 0) children.set(row.task.parentTaskId, [...(children.get(row.task.parentTaskId) ?? []), row]);
      else roots.push(row);
    }
    const value = (task: Task) => {
      if (sort.key === "title") return task.title.toLowerCase();
      if (sort.key === "parent") return byId.get(task.parentTaskId ?? "")?.title.toLowerCase() ?? "";
      if (sort.key === "duration") return taskDuration(task);
      if (sort.key === "start") return task.startDate;
      if (sort.key === "finish") return task.dueDate;
      if (sort.key === "status") return statusRank.get(task.status) ?? 0;
      if (sort.key === "assignee") return memberNames.get(task.assigneeId) ?? "";
      if (sort.key === "priority") return priorityRank.get(task.priority) ?? 0;
      return originalIndex.get(task.id) ?? 0;
    };
    const compare = (left: (typeof canonicalRows)[number], right: (typeof canonicalRows)[number]) => {
      const leftValue = value(left.task);
      const rightValue = value(right.task);
      const result = typeof leftValue === "number" && typeof rightValue === "number" ? leftValue - rightValue : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
      if (result) return sort.direction === "asc" ? result : -result;
      return (originalIndex.get(left.task.id) ?? 0) - (originalIndex.get(right.task.id) ?? 0);
    };
    const orderedTasks: Task[] = [];
    const append = (row: (typeof canonicalRows)[number]) => {
      orderedTasks.push(row.task);
      [...(children.get(row.task.id) ?? [])].sort(compare).forEach(append);
    };
    [...roots].sort(compare).forEach(append);
    return taskOutline(orderedTasks);
  }, [canonicalRows, data.members, sort, tasks]);
  const rowNumbers = useMemo(() => new Map(canonicalRows.map((row) => [row.task.id, row.outline])), [canonicalRows]);
  const hasFilters = Boolean(query.trim() || statusFilter || assigneeFilter || priorityFilter);
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const memberNames = new Map(data.members.map((member) => [member.id, member.name.toLowerCase()]));
    const included = new Set<string>();
    for (const row of rows) {
      const task = row.task;
      const searchable = `${task.title} ${task.description} ${task.labels.join(" ")} ${memberNames.get(task.assigneeId) ?? "unassigned"}`.toLowerCase();
      const matches = (!normalizedQuery || searchable.includes(normalizedQuery))
        && (!statusFilter || task.status === statusFilter)
        && (!assigneeFilter || (assigneeFilter === "unassigned" ? !task.assigneeId : task.assigneeId === assigneeFilter))
        && (!priorityFilter || task.priority === priorityFilter);
      if (matches) {
        included.add(task.id);
        row.ancestorIds.forEach((id) => included.add(id));
      }
    }
    return rows.filter((row) => included.has(row.task.id) && (hasFilters || !row.ancestorIds.some((id) => collapsed.includes(id))));
  }, [assigneeFilter, collapsed, data.members, hasFilters, priorityFilter, query, rows, statusFilter]);
  useEffect(() => setSelected((current) => current.filter((id) => tasks.some((task) => task.id === id))), [tasks]);
  const allSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.includes(row.task.id));

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
  }

  function SortIndicator({ column }: { column: SortKey }) {
    if (sort.key !== column) return <ChevronsUpDown size={11} />;
    return sort.direction === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
  }

  return <div className="schedule-sheet panel">
    <div className="sheet-toolbar">
      <div>{selected.length ? <div className="bulk-tools">
        <strong>{selected.length} selected</strong>
        <select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { status: event.target.value as TaskStatus }); event.target.value = ""; }}><option value="">Status…</option>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
        <select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { assigneeId: event.target.value }); event.target.value = ""; }}><option value="">Assign…</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select>
        <button className="danger-button" onClick={() => { onBulkDelete(selected); setSelected([]); }}><Trash2 size={13} /> Delete</button>
      </div> : <><strong>Project schedule</strong><span>Durations use calendar days. Predecessors reference row numbers.</span></>}</div>
      <div>
        <label className="sheet-import-button"><UploadCloud size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { importCsv(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        <button onClick={() => onAddTask()}><Plus size={14} /> Add row</button>
        <button onClick={exportCsv}><Download size={14} /> Export</button>
      </div>
    </div>
    <div className="sheet-filterbar">
      <label className="sheet-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tasks…" aria-label="Filter table tasks" /></label>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")} aria-label="Filter by status"><option value="">All statuses</option>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
      <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Filter by assignee"><option value="">All assignees</option><option value="unassigned">Unassigned</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
      <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as Priority | "")} aria-label="Filter by priority"><option value="">All priorities</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select>
      <span className="sheet-result-count">{visibleRows.length} of {rows.length} rows</span>
      {hasFilters && <button className="sheet-clear-filters" onClick={() => { setQuery(""); setStatusFilter(""); setAssigneeFilter(""); setPriorityFilter(""); }}><X size={12} /> Clear</button>}
    </div>
    <div className="schedule-sheet-scroll"><table>
      <thead><tr>
        <th className="sheet-check"><input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? visibleRows.map((row) => row.task.id) : [])} aria-label="Select all visible tasks" /></th>
        <th className="sheet-number"><button className="sheet-sort" onClick={() => toggleSort("outline")} aria-label={`Sort row number ${sort.key === "outline" ? sort.direction : "ascending"}`}># <SortIndicator column="outline" /></button></th>
        <th className="sheet-task"><button className="sheet-sort" onClick={() => toggleSort("title")} aria-label={`Sort task name ${sort.key === "title" ? sort.direction : "ascending"}`}>Task name <SortIndicator column="title" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("parent")}>Parent <SortIndicator column="parent" /></button></th>
        <th>Predecessors</th>
        <th><button className="sheet-sort" onClick={() => toggleSort("duration")}>Duration <SortIndicator column="duration" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("start")}>Start <SortIndicator column="start" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("finish")}>Finish <SortIndicator column="finish" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("status")}>Status <SortIndicator column="status" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("assignee")}>Assignee <SortIndicator column="assignee" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("priority")}>Priority <SortIndicator column="priority" /></button></th>
      </tr></thead>
      <tbody>{visibleRows.map((row) => {
        const task = row.task;
        const children = rows.filter((item) => item.task.parentTaskId === task.id);
        const dependencies = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
        const isSummary = children.length > 0;
        return <tr key={task.id} className={`${selected.includes(task.id) ? "selected-row" : ""} ${isSummary ? "summary-row" : ""}`}>
          <td className="sheet-check"><input type="checkbox" checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} /></td>
          <td className="sheet-number">{rowNumbers.get(task.id) ?? row.outline}</td>
          <td className="sheet-task"><div style={{ paddingLeft: `${row.depth * 16}px` }}>{row.hasChildren ? <button className="sheet-collapse" onClick={() => setCollapsed((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])} aria-label={`${collapsed.includes(task.id) ? "Expand" : "Collapse"} ${task.title}`}>{collapsed.includes(task.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="sheet-indent" />}<input value={task.title} onChange={(event) => onTaskUpdate(task.id, { title: event.target.value })} onDoubleClick={() => onTask(task.id)} aria-label={`Task name ${row.outline}`} />{isSummary && <button className="sheet-add-child" onClick={() => onAddTask(task.id)} aria-label={`Add child task to ${task.title}`}><Plus size={12} /></button>}</div></td>
          <td><select value={task.parentTaskId ?? ""} onChange={(event) => { const parentTaskId = event.target.value; if (!parentTaskId || !wouldCreateParentCycle(tasks, task.id, parentTaskId)) onTaskUpdate(task.id, { parentTaskId: parentTaskId || undefined }); }} aria-label={`Parent for ${task.title}`}><option value="">—</option>{tasks.filter((candidate) => candidate.id !== task.id && !wouldCreateParentCycle(tasks, task.id, candidate.id)).map((candidate) => <option value={candidate.id} key={candidate.id}>{rowNumbers.get(candidate.id)} {candidate.title}</option>)}</select></td>
          <td><PredecessorCell task={task} tasks={tasks} rowNumbers={rowNumbers} update={(dependencyIds) => onTaskUpdate(task.id, { dependencyIds, dependencyId: undefined })} /></td>
          <td><span className="duration-cell"><input type="number" min="1" value={taskDuration(task)} readOnly={isSummary} onChange={(event) => onTaskUpdate(task.id, { durationDays: Math.max(1, Math.floor(Number(event.target.value))) })} aria-label={`Duration for ${task.title}`} /><small>d</small></span></td>
          <td><input type="date" value={task.startDate} readOnly={dependencies.length > 0 || isSummary} title={dependencies.length ? "Calculated from predecessors" : isSummary ? "Calculated from child tasks" : "Manual start date"} onChange={(event) => onTaskUpdate(task.id, { startDate: event.target.value })} aria-label={`Start for ${task.title}`} /></td>
          <td><input type="date" value={task.dueDate} readOnly title="Calculated from start and duration" aria-label={`Finish for ${task.title}`} /></td>
          <td><select className={`sheet-status ${statusTone[task.status]}`} value={task.status} disabled={isSummary} onChange={(event) => onTaskUpdate(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
          <td><select value={task.assigneeId} onChange={(event) => onTaskUpdate(task.id, { assigneeId: event.target.value })}><option value="">Unassigned</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></td>
          <td><select value={task.priority} onChange={(event) => onTaskUpdate(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td>
        </tr>;
      })}{visibleRows.length === 0 && <tr className="sheet-empty-row"><td colSpan={11}>No tasks match these filters.</td></tr>}</tbody>
      <tfoot><tr><td /><td /><td><button onClick={() => onAddTask()}><Plus size={13} /> Add task row</button></td><td colSpan={8} /></tr></tfoot>
    </table></div>
  </div>;
}
