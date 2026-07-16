"use client";

import { ChevronDown, ChevronRight, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { taskDuration, taskOutline, wouldCreateDependencyCycle, wouldCreateParentCycle } from "@/lib/scheduling";
import { PRIORITIES, TASK_STATUSES } from "@/lib/task-utils";
import type { Priority, Task, TaskStatus, WorkspaceData } from "@/lib/types";

const statusTone: Record<TaskStatus, string> = { "Not Started": "slate", "In Progress": "blue", Blocked: "red", "In Review": "amber", Complete: "green" };

interface ScheduleTableProps {
  data: WorkspaceData;
  tasks: Task[];
  onTask: (id: string) => void;
  onTaskUpdate: (id: string, patch: Partial<Task>) => void;
  onBulkUpdate: (ids: string[], patch: Partial<Task>) => void;
  onBulkDelete: (ids: string[]) => void;
  onAddTask: (parentTaskId?: string) => void;
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

export function ScheduleTable({ data, tasks, onTask, onTaskUpdate, onBulkUpdate, onBulkDelete, onAddTask, exportCsv }: ScheduleTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const rows = useMemo(() => taskOutline(tasks), [tasks]);
  const rowNumbers = useMemo(() => new Map(rows.map((row) => [row.task.id, row.outline])), [rows]);
  const visibleRows = rows.filter((row) => !row.ancestorIds.some((id) => collapsed.includes(id)));
  useEffect(() => setSelected((current) => current.filter((id) => tasks.some((task) => task.id === id))), [tasks]);
  const allSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.includes(row.task.id));

  return <div className="schedule-sheet panel"><div className="sheet-toolbar"><div>{selected.length ? <div className="bulk-tools"><strong>{selected.length} selected</strong><select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { status: event.target.value as TaskStatus }); event.target.value = ""; }}><option value="">Status…</option>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { assigneeId: event.target.value }); event.target.value = ""; }}><option value="">Assign…</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><button className="danger-button" onClick={() => { onBulkDelete(selected); setSelected([]); }}><Trash2 size={13} /> Delete</button></div> : <><strong>Project schedule</strong><span>Durations use calendar days. Predecessors reference row numbers.</span></>}</div><div><button onClick={() => onAddTask()}><Plus size={14} /> Add row</button><button onClick={exportCsv}><Download size={14} /> Export</button></div></div><div className="schedule-sheet-scroll"><table><thead><tr><th className="sheet-check"><input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? visibleRows.map((row) => row.task.id) : [])} aria-label="Select all visible tasks" /></th><th className="sheet-number">#</th><th className="sheet-task">Task name</th><th>Parent</th><th>Predecessors</th><th>Duration</th><th>Start</th><th>Finish</th><th>Status</th><th>Assignee</th><th>Priority</th></tr></thead><tbody>{visibleRows.map((row) => { const task = row.task; const children = rows.filter((item) => item.task.parentTaskId === task.id); const dependencies = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []); const isSummary = children.length > 0; return <tr key={task.id} className={`${selected.includes(task.id) ? "selected-row" : ""} ${isSummary ? "summary-row" : ""}`}><td className="sheet-check"><input type="checkbox" checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} /></td><td className="sheet-number">{row.outline}</td><td className="sheet-task"><div style={{ paddingLeft: `${row.depth * 16}px` }}>{row.hasChildren ? <button className="sheet-collapse" onClick={() => setCollapsed((current) => current.includes(task.id) ? current.filter((id) => id !== task.id) : [...current, task.id])} aria-label={`${collapsed.includes(task.id) ? "Expand" : "Collapse"} ${task.title}`}>{collapsed.includes(task.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button> : <span className="sheet-indent" />}<input value={task.title} onChange={(event) => onTaskUpdate(task.id, { title: event.target.value })} onDoubleClick={() => onTask(task.id)} aria-label={`Task name ${row.outline}`} />{isSummary && <button className="sheet-add-child" onClick={() => onAddTask(task.id)} aria-label={`Add child task to ${task.title}`}><Plus size={12} /></button>}</div></td><td><select value={task.parentTaskId ?? ""} onChange={(event) => { const parentTaskId = event.target.value; if (!parentTaskId || !wouldCreateParentCycle(tasks, task.id, parentTaskId)) onTaskUpdate(task.id, { parentTaskId: parentTaskId || undefined }); }} aria-label={`Parent for ${task.title}`}><option value="">—</option>{tasks.filter((candidate) => candidate.id !== task.id && !wouldCreateParentCycle(tasks, task.id, candidate.id)).map((candidate) => <option value={candidate.id} key={candidate.id}>{rowNumbers.get(candidate.id)} {candidate.title}</option>)}</select></td><td><PredecessorCell task={task} tasks={tasks} rowNumbers={rowNumbers} update={(dependencyIds) => onTaskUpdate(task.id, { dependencyIds, dependencyId: undefined })} /></td><td><span className="duration-cell"><input type="number" min="1" value={taskDuration(task)} readOnly={isSummary} onChange={(event) => onTaskUpdate(task.id, { durationDays: Math.max(1, Math.floor(Number(event.target.value))) })} aria-label={`Duration for ${task.title}`} /><small>d</small></span></td><td><input type="date" value={task.startDate} readOnly={dependencies.length > 0 || isSummary} title={dependencies.length ? "Calculated from predecessors" : isSummary ? "Calculated from child tasks" : "Manual start date"} onChange={(event) => onTaskUpdate(task.id, { startDate: event.target.value })} aria-label={`Start for ${task.title}`} /></td><td><input type="date" value={task.dueDate} readOnly title="Calculated from start and duration" aria-label={`Finish for ${task.title}`} /></td><td><select className={`sheet-status ${statusTone[task.status]}`} value={task.status} disabled={isSummary} onChange={(event) => onTaskUpdate(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td><td><select value={task.assigneeId} onChange={(event) => onTaskUpdate(task.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></td><td><select value={task.priority} onChange={(event) => onTaskUpdate(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td></tr>; })}</tbody><tfoot><tr><td /><td /><td><button onClick={() => onAddTask()}><Plus size={13} /> Add task row</button></td><td colSpan={8} /></tr></tfoot></table></div></div>;
}
