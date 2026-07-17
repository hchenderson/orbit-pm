"use client";

import { AlertTriangle, ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, CalendarCheck2, ChevronsUpDown, Download, ChevronDown, ChevronRight, Diamond, GripVertical, History, Plus, Redo2, Search, Trash2, Undo2, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { analyzeProjectSchedule, taskDuration, taskOutline, wouldCreateDependencyCycle, wouldCreateParentCycle } from "@/lib/scheduling";
import { PRIORITIES, TASK_STATUSES } from "@/lib/task-utils";
import type { Priority, Project, Task, TaskStatus, WorkspaceData } from "@/lib/types";

const statusTone: Record<TaskStatus, string> = { "Not Started": "slate", "In Progress": "blue", Blocked: "red", "In Review": "amber", Complete: "green" };
type SortKey = "outline" | "title" | "parent" | "duration" | "start" | "finish" | "status" | "assignee" | "priority";
type SortDirection = "asc" | "desc";
const statusRank = new Map(TASK_STATUSES.map((status, index) => [status, index]));
const priorityRank = new Map(PRIORITIES.map((priority, index) => [priority, index]));

interface ScheduleTableProps {
  data: WorkspaceData;
  project: Project;
  tasks: Task[];
  onTask: (id: string) => void;
  onTaskUpdate: (id: string, patch: Partial<Task>) => void;
  onTaskUpdates: (updates: { id: string; patch: Partial<Task> }[], label: string) => void;
  onBulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  onBulkDelete: (ids: string[]) => void;
  onAddTask: (parentTaskId?: string) => void;
  onAddMilestone: () => void;
  onProjectUpdate: (patch: Partial<Project>) => void;
  onCaptureBaseline: () => void;
  onReorder: (taskId: string, beforeTaskId: string) => void;
  onIndent: (taskId: string) => void;
  onOutdent: (taskId: string) => void;
  history: { id: string; label: string; time: string }[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  importCsv: (file?: File) => void;
  exportCsv: () => void;
}

function parsePredecessors(value: string, task: Task, tasks: Task[], rowNumbers: Map<string, string>) {
  const byOutline = new Map([...rowNumbers.entries()].map(([id, outline]) => [outline, id]));
  const byId = new Map(tasks.map((item) => [item.id, item.id]));
  const dependencyIds: string[] = [];
  const dependencyLags: Record<string, number> = {};
  for (const rawToken of value.split(",").map((token) => token.trim()).filter(Boolean)) {
    const match = rawToken.match(/^(.*?)(?:FS)?\s*([+-]\s*\d+)\s*d?$/i);
    const reference = (match?.[1] ?? rawToken).trim();
    const id = byOutline.get(reference) ?? byId.get(reference);
    if (!id || id === task.id || dependencyIds.includes(id)) continue;
    dependencyIds.push(id);
    dependencyLags[id] = match ? Number(match[2].replaceAll(" ", "")) : 0;
  }
  return { dependencyIds, dependencyLags };
}

function PredecessorCell({ task, tasks, rowNumbers, update, cellProps }: { task: Task; tasks: Task[]; rowNumbers: Map<string, string>; update: (dependencyIds: string[], dependencyLags: Record<string, number>) => void; cellProps?: Record<string, string | number> }) {
  const dependencyIds = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
  const displayValue = dependencyIds.map((id) => {
    const lag = task.dependencyLags?.[id] ?? 0;
    return `${rowNumbers.get(id) ?? id}${lag ? `${lag > 0 ? "+" : ""}${lag}d` : ""}`;
  }).join(", ");
  const [draft, setDraft] = useState(displayValue);
  const [error, setError] = useState("");
  useEffect(() => setDraft(displayValue), [displayValue]);

  function commit() {
    const parsed = parsePredecessors(draft, task, tasks, rowNumbers);
    if (wouldCreateDependencyCycle(tasks, task.id, parsed.dependencyIds)) {
      setError("That would create a circular schedule.");
      setDraft(displayValue);
      return;
    }
    setError("");
    update(parsed.dependencyIds, parsed.dependencyLags);
  }

  return <input {...cellProps} className={error ? "sheet-error" : ""} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="e.g. 1, 2.1+2d" title={error || "Enter predecessor rows; add +2d or -1d for lag"} aria-label={`Predecessors for ${task.title}`} />;
}

export function ScheduleTable({ data, project, tasks, onTask, onTaskUpdate, onTaskUpdates, onBulkUpdate, onBulkDelete, onAddTask, onAddMilestone, onProjectUpdate, onCaptureBaseline, onReorder, onIndent, onOutdent, history, canUndo, canRedo, onUndo, onRedo, importCsv, exportCsv }: ScheduleTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [fillColumn, setFillColumn] = useState<"durationDays" | "status" | "assigneeId" | "priority">("durationDays");
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
  const analysis = useMemo(() => analyzeProjectSchedule(tasks, project), [project, tasks]);
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

  function fillDown() {
    const ordered = canonicalRows.map((row) => row.task).filter((task) => selected.includes(task.id));
    const source = ordered[0];
    if (!source || ordered.length < 2) return;
    const value = source[fillColumn];
    onTaskUpdates(ordered.slice(1).map((task) => ({ id: task.id, patch: { [fillColumn]: value } })), `Filled ${fillColumn} down ${ordered.length - 1} rows`);
  }

  function pasteCells(event: React.ClipboardEvent<HTMLElement>, startTaskId: string, startColumn: number) {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, "").split("\n").filter((line, index, lines) => line.length || index < lines.length - 1).map((line) => line.split("\t"));
    const ordered = visibleRows.map((row) => row.task);
    const startRow = ordered.findIndex((task) => task.id === startTaskId);
    const columns = ["title", "parentTaskId", "dependencyIds", "durationDays", "startDate", "status", "assigneeId", "priority"] as const;
    const updates: { id: string; patch: Partial<Task> }[] = [];
    matrix.forEach((values, rowOffset) => {
      const task = ordered[startRow + rowOffset];
      if (!task) return;
      const patch: Partial<Task> = {};
      values.forEach((raw, columnOffset) => {
        const column = columns[startColumn + columnOffset];
        const value = raw.trim();
        if (!column) return;
        if (column === "title" && value) patch.title = value;
        if (column === "durationDays" && Number.isFinite(Number(value))) patch.durationDays = Math.max(task.isMilestone ? 0 : 1, Math.floor(Number(value)));
        if (column === "startDate" && /^\d{4}-\d{2}-\d{2}$/.test(value)) patch.startDate = value;
        if (column === "status" && TASK_STATUSES.includes(value as TaskStatus)) patch.status = value as TaskStatus;
        if (column === "priority" && PRIORITIES.includes(value as Priority)) patch.priority = value as Priority;
        if (column === "assigneeId") patch.assigneeId = data.members.find((member) => member.id === value || member.name.toLowerCase() === value.toLowerCase())?.id ?? "";
        if (column === "parentTaskId") {
          const id = [...rowNumbers.entries()].find(([, outline]) => outline === value)?.[0] ?? tasks.find((candidate) => candidate.title.toLowerCase() === value.toLowerCase())?.id;
          if (!id || !wouldCreateParentCycle(tasks, task.id, id)) patch.parentTaskId = id;
        }
        if (column === "dependencyIds") {
          const parsed = parsePredecessors(value, task, tasks, rowNumbers);
          if (!wouldCreateDependencyCycle(tasks, task.id, parsed.dependencyIds)) {
            patch.dependencyIds = parsed.dependencyIds;
            patch.dependencyLags = parsed.dependencyLags;
          }
        }
      });
      if (Object.keys(patch).length) updates.push({ id: task.id, patch });
    });
    if (updates.length) onTaskUpdates(updates, `Pasted ${updates.length} schedule row${updates.length === 1 ? "" : "s"}`);
  }

  function gridKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const target = event.currentTarget as HTMLElement;
    const row = Number(target.dataset.row);
    const column = Number(target.dataset.column);
    const next = document.querySelector<HTMLElement>(`[data-sheet-input][data-row="${row + (event.key === "ArrowDown" ? 1 : -1)}"][data-column="${column}"]`);
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

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
        <select value={fillColumn} onChange={(event) => setFillColumn(event.target.value as typeof fillColumn)} aria-label="Column to fill down"><option value="durationDays">Duration</option><option value="status">Status</option><option value="assigneeId">Assignee</option><option value="priority">Priority</option></select>
        <button onClick={fillDown} disabled={selected.length < 2}>Fill down</button>
        <button onClick={() => onIndent(selected[0])} disabled={selected.length !== 1} title="Make this a child of the row above"><ArrowRightToLine size={13} /> Indent</button>
        <button onClick={() => onOutdent(selected[0])} disabled={selected.length !== 1}><ArrowLeftToLine size={13} /> Outdent</button>
        <button className="danger-button" onClick={() => { onBulkDelete(selected); setSelected([]); }}><Trash2 size={13} /> Delete</button>
      </div> : <><strong>Project schedule</strong><span>{project.scheduleMode === "business" ? "Business days" : "Calendar days"} · predecessors accept lag such as 2+3d</span></>}</div>
      <div>
        <button onClick={onUndo} disabled={!canUndo} title={history[0] ? `Undo ${history[0].label}` : "Nothing to undo"}><Undo2 size={14} /> Undo</button>
        <button onClick={onRedo} disabled={!canRedo}><Redo2 size={14} /> Redo</button>
        <details className="sheet-history"><summary title="Recent schedule changes"><History size={14} /></summary><div>{history.length ? history.map((item) => <span key={item.id}><strong>{item.label}</strong><small>{item.time}</small></span>) : <p>No changes in this session.</p>}</div></details>
        <label className="sheet-import-button"><UploadCloud size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { importCsv(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
        <button onClick={() => onAddTask()}><Plus size={14} /> Add row</button>
        <button onClick={onAddMilestone}><Diamond size={13} /> Milestone</button>
        <button onClick={exportCsv}><Download size={14} /> Export</button>
      </div>
    </div>
    <div className="schedule-intelligence">
      <div><span className={analysis.issues.some((issue) => issue.severity === "critical") ? "schedule-health critical" : analysis.issues.length ? "schedule-health warning" : "schedule-health healthy"}><AlertTriangle size={13} />{analysis.issues.length ? `${analysis.issues.length} schedule issue${analysis.issues.length === 1 ? "" : "s"}` : "Schedule is healthy"}</span><span>Finish {analysis.finishDate}</span><span>{analysis.criticalTaskIds.size} critical-path task{analysis.criticalTaskIds.size === 1 ? "" : "s"}</span>{tasks.some((task) => task.baselineDueDate) && <span className={analysis.baselineVarianceDays > 0 ? "variance-late" : "variance-good"}>{analysis.baselineVarianceDays > 0 ? `+${analysis.baselineVarianceDays}d vs baseline` : "On baseline"}</span>}</div>
      <div><label>Schedule<select value={project.scheduleMode ?? "calendar"} onChange={(event) => onProjectUpdate({ scheduleMode: event.target.value as Project["scheduleMode"] })}><option value="calendar">Calendar days</option><option value="business">Business days (Mon–Fri)</option></select></label><button onClick={onCaptureBaseline}><CalendarCheck2 size={13} /> {tasks.some((task) => task.baselineDueDate) ? "Update baseline" : "Set baseline"}</button><details className="schedule-issues"><summary>Review issues</summary><div>{analysis.issues.length ? analysis.issues.slice(0, 12).map((issue) => <button key={issue.id} onClick={() => issue.taskId && onTask(issue.taskId)} className={issue.severity}><AlertTriangle size={12} />{issue.message}</button>) : <p>No blocked, late, circular, or missing predecessor issues.</p>}</div></details></div>
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
        <th>Baseline</th>
        <th><button className="sheet-sort" onClick={() => toggleSort("status")}>Status <SortIndicator column="status" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("assignee")}>Assignee <SortIndicator column="assignee" /></button></th>
        <th><button className="sheet-sort" onClick={() => toggleSort("priority")}>Priority <SortIndicator column="priority" /></button></th>
      </tr></thead>
      <tbody>{visibleRows.map((row, rowIndex) => {
        const task = row.task;
        const children = rows.filter((item) => item.task.parentTaskId === task.id);
        const dependencies = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
        const isSummary = children.length > 0;
        const taskIssues = analysis.issues.filter((issue) => issue.taskId === task.id);
        const baselineVariance = task.baselineDueDate ? Math.round((new Date(`${task.dueDate}T12:00:00`).getTime() - new Date(`${task.baselineDueDate}T12:00:00`).getTime()) / 86400000) : null;
        const inputProps = (column: number) => ({ "data-sheet-input": "true", "data-row": rowIndex, "data-column": column, onKeyDown: gridKeyDown });
        return <tr key={task.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const dragged = event.dataTransfer.getData("orbit-task-row"); if (dragged && dragged !== task.id) onReorder(dragged, task.id); }} className={`${selected.includes(task.id) ? "selected-row" : ""} ${isSummary ? "summary-row" : ""} ${analysis.criticalTaskIds.has(task.id) ? "critical-path-row" : ""} ${task.isMilestone ? "milestone-row" : ""}`}>
          <td className="sheet-check"><input type="checkbox" checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} /></td>
          <td className="sheet-number"><span className="sheet-drag-handle" draggable onDragStart={(event) => { event.dataTransfer.setData("orbit-task-row", task.id); event.dataTransfer.effectAllowed = "move"; }}><GripVertical size={11} /></span>{rowNumbers.get(task.id) ?? row.outline}</td>
          <td className="sheet-task"><div style={{ paddingLeft: `${row.depth * 16}px` }}>{row.hasChildren ? <button className="sheet-collapse" onClick={() => setCollapsed((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])} aria-label={`${collapsed.includes(task.id) ? "Expand" : "Collapse"} ${task.title}`}>{collapsed.includes(task.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="sheet-indent">{task.isMilestone && <Diamond size={10} />}</span>}<input {...inputProps(0)} value={task.title} onPaste={(event) => pasteCells(event, task.id, 0)} onChange={(event) => onTaskUpdate(task.id, { title: event.target.value })} onDoubleClick={() => onTask(task.id)} aria-label={`Task name ${row.outline}`} />{taskIssues.length > 0 && <button className={`sheet-task-warning ${taskIssues.some((issue) => issue.severity === "critical") ? "critical" : ""}`} title={taskIssues.map((issue) => issue.message).join("\n")} onClick={() => onTask(task.id)}><AlertTriangle size={11} /></button>}{isSummary && <button className="sheet-add-child" onClick={() => onAddTask(task.id)} aria-label={`Add child task to ${task.title}`}><Plus size={12} /></button>}</div></td>
          <td><select {...inputProps(1)} value={task.parentTaskId ?? ""} onPaste={(event) => pasteCells(event, task.id, 1)} onChange={(event) => { const parentTaskId = event.target.value; if (!parentTaskId || !wouldCreateParentCycle(tasks, task.id, parentTaskId)) onTaskUpdate(task.id, { parentTaskId: parentTaskId || undefined }); }} aria-label={`Parent for ${task.title}`}><option value="">—</option>{tasks.filter((candidate) => candidate.id !== task.id && !wouldCreateParentCycle(tasks, task.id, candidate.id)).map((candidate) => <option value={candidate.id} key={candidate.id}>{rowNumbers.get(candidate.id)} {candidate.title}</option>)}</select></td>
          <td><PredecessorCell task={task} tasks={tasks} rowNumbers={rowNumbers} cellProps={{ "data-sheet-input": "true", "data-row": rowIndex, "data-column": 2 }} update={(dependencyIds, dependencyLags) => onTaskUpdate(task.id, { dependencyIds, dependencyLags, dependencyId: undefined })} /></td>
          <td><span className="duration-cell"><input {...inputProps(3)} type="number" min={task.isMilestone ? "0" : "1"} value={taskDuration(task)} readOnly={isSummary || task.isMilestone} onPaste={(event) => pasteCells(event, task.id, 3)} onChange={(event) => onTaskUpdate(task.id, { durationDays: Math.max(task.isMilestone ? 0 : 1, Math.floor(Number(event.target.value))) })} aria-label={`Duration for ${task.title}`} /><small>d</small></span></td>
          <td><input {...inputProps(4)} type="date" value={task.startDate} readOnly={dependencies.length > 0 || isSummary} title={dependencies.length ? "Calculated from predecessors" : isSummary ? "Calculated from child tasks" : "Manual start date"} onPaste={(event) => pasteCells(event, task.id, 4)} onChange={(event) => onTaskUpdate(task.id, { startDate: event.target.value })} aria-label={`Start for ${task.title}`} /></td>
          <td><input type="date" value={task.dueDate} readOnly title="Calculated from start and duration" aria-label={`Finish for ${task.title}`} /></td>
          <td className="baseline-cell">{task.baselineDueDate ? <span className={baselineVariance && baselineVariance > 0 ? "late" : "good"}>{task.baselineDueDate}<small>{baselineVariance === 0 ? "on plan" : `${baselineVariance && baselineVariance > 0 ? "+" : ""}${baselineVariance}d`}</small></span> : <span>—</span>}</td>
          <td><select {...inputProps(5)} className={`sheet-status ${statusTone[task.status]}`} value={task.status} disabled={isSummary} onPaste={(event) => pasteCells(event, task.id, 5)} onChange={(event) => onTaskUpdate(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
          <td><select {...inputProps(6)} value={task.assigneeId} onPaste={(event) => pasteCells(event, task.id, 6)} onChange={(event) => onTaskUpdate(task.id, { assigneeId: event.target.value })}><option value="">Unassigned</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></td>
          <td><select {...inputProps(7)} value={task.priority} onPaste={(event) => pasteCells(event, task.id, 7)} onChange={(event) => onTaskUpdate(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td>
        </tr>;
      })}{visibleRows.length === 0 && <tr className="sheet-empty-row"><td colSpan={12}>No tasks match these filters.</td></tr>}</tbody>
      <tfoot><tr><td /><td /><td><button onClick={() => onAddTask()}><Plus size={13} /> Add task row</button></td><td colSpan={9} /></tr></tfoot>
    </table></div>
  </div>;
}
