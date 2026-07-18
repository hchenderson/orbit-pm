"use client";

import { CalendarDays, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Plus, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { dateLabel, isDueToday, isOverdue, TASK_STATUSES } from "@/lib/task-utils";
import type { Member, Project, Task, TaskStatus, WorkspaceData } from "@/lib/types";

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function dateFromToday(offset = 0) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + offset);
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function MobileTaskGroup({ title, icon, tasks, projects, empty, onTask, onComplete, onViewAll }: { title: string; icon: React.ReactNode; tasks: Task[]; projects: Project[]; empty: string; onTask: (id: string) => void; onComplete: (task: Task) => void; onViewAll?: () => void }) {
  return <section className="mobile-home-group"><header><span>{icon}</span><h2>{title}</h2><em>{tasks.length}</em>{onViewAll && <button onClick={onViewAll}>View all <ChevronRight size={14} /></button>}</header>{tasks.length ? <div>{tasks.map((task) => { const project = projects.find((item) => item.id === task.projectId); return <article key={task.id}><button className="mobile-complete-task" onClick={() => onComplete(task)} aria-label={`Complete ${task.title}`}><Check size={17} /></button><button className="mobile-home-task" onClick={() => onTask(task.id)}><span><strong>{task.title}</strong><small><i style={{ background: project?.color }} />{project?.name ?? "Project"}</small></span><time className={isOverdue(task) ? "overdue" : ""}><CalendarDays size={13} />{dateLabel(task.dueDate)}</time><ChevronRight size={17} /></button></article>; })}</div> : <p>{empty}</p>}</section>;
}

export function MobileHome({ data, currentUserId, onTask, onStatus, onNewTask, onViewAll }: { data: WorkspaceData; currentUserId: string; onTask: (id: string) => void; onStatus: (id: string, patch: Partial<Task>) => void; onNewTask: () => void; onViewAll: () => void }) {
  const assigned = useMemo(() => data.tasks.filter((task) => task.assigneeId === currentUserId && task.status !== "Complete"), [currentUserId, data.tasks]);
  const dueToday = assigned.filter((task) => isDueToday(task) && !isOverdue(task));
  const overdue = assigned.filter((task) => isOverdue(task));
  const upcoming = assigned.filter((task) => !isOverdue(task) && !isDueToday(task)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8);
  const firstName = data.members.find((member) => member.id === currentUserId)?.name.split(" ")[0] ?? "there";
  const complete = (task: Task) => onStatus(task.id, { status: "Complete" });

  return <div className="mobile-home"><header className="mobile-home-hero"><div><span>My workspace</span><h1>Hi, {firstName}</h1><p>{assigned.length ? `${assigned.length} open task${assigned.length === 1 ? "" : "s"} across ${new Set(assigned.map((task) => task.projectId)).size} project${new Set(assigned.map((task) => task.projectId)).size === 1 ? "" : "s"}.` : "You’re all caught up."}</p></div><button onClick={onNewTask}><Plus size={19} /><span>New task</span></button></header><div className="mobile-home-summary"><article><span className="amber"><Clock3 size={18} /></span><strong>{dueToday.length}</strong><small>Today</small></article><article><span className="red"><CircleAlert size={18} /></span><strong>{overdue.length}</strong><small>Overdue</small></article><article><span className="purple"><CheckCircle2 size={18} /></span><strong>{upcoming.length}</strong><small>Upcoming</small></article></div><MobileTaskGroup title="Today" icon={<Clock3 size={17} />} tasks={dueToday} projects={data.projects} empty="Nothing is due today." onTask={onTask} onComplete={complete} /><MobileTaskGroup title="Overdue" icon={<CircleAlert size={17} />} tasks={overdue} projects={data.projects} empty="No overdue work." onTask={onTask} onComplete={complete} /><MobileTaskGroup title="Upcoming" icon={<CalendarDays size={17} />} tasks={upcoming} projects={data.projects} empty="No upcoming assignments." onTask={onTask} onComplete={complete} onViewAll={onViewAll} /></div>;
}

export function QuickTaskSheet({ data, defaultProjectId, currentUserId, close, save }: { data: WorkspaceData; defaultProjectId: string; currentUserId: string; close: () => void; save: (task: Task) => void }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId || data.projects[0]?.id || "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !projectId) return;
    const timestamp = new Date().toISOString();
    const startDate = dateFromToday();
    save({ id: uid("task"), projectId, title: title.trim(), description: "", status: "Not Started", priority: "Medium", assigneeId: data.members.some((member) => member.id === currentUserId) ? currentUserId : data.members[0]?.id ?? "", startDate, dueDate: dateFromToday(7), durationDays: 8, estimate: 0, labels: [], subtasks: [], comments: 0, attachments: 0, commentItems: [], attachmentItems: [], activity: [{ id: uid("activity"), actorId: currentUserId, kind: "created", summary: `created ${title.trim()}`, createdAt: timestamp }], dependencyIds: [], createdAt: timestamp, updatedAt: timestamp });
  }

  return <div className="mobile-quick-task-layer"><button className="modal-backdrop" onClick={close} aria-label="Close quick task" /><section className="mobile-quick-task" role="dialog" aria-modal="true" aria-labelledby="quick-task-title"><header><div><span>Quick create</span><h2 id="quick-task-title">New task</h2></div><button onClick={close} aria-label="Close"><X size={20} /></button></header><form onSubmit={submit}><label>Task name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" required /></label><label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} required>{data.projects.filter((project) => !project.archived).map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label><p>You can add dates, dependencies, children, and other details after creating it.</p><button className="primary-button" type="submit" disabled={!title.trim() || !projectId}><Plus size={17} /> Create task</button></form></section></div>;
}

export function MobileTaskActions({ task, members, isSummary, update, addComment, addChild }: { task: Task; members: Member[]; isSummary: boolean; update: (id: string, patch: Partial<Task>) => void; addComment: (id: string, body: string) => void; addChild: (id: string, title: string) => void }) {
  const [comment, setComment] = useState("");
  const [child, setChild] = useState("");
  return <aside className="mobile-task-quick-actions" aria-label="Quick task actions"><div><button className="mobile-complete-action" disabled={isSummary} onClick={() => update(task.id, { status: task.status === "Complete" ? "Not Started" : "Complete" })}><CheckCircle2 size={17} />{task.status === "Complete" ? "Reopen" : "Complete"}</button><label><span>Status</span><select disabled={isSummary} value={task.status} onChange={(event) => update(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Assignee</span><select value={task.assigneeId} onChange={(event) => update(task.id, { assigneeId: event.target.value })}>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label></div><form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; addComment(task.id, comment); setComment(""); }}><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment…" /><button disabled={!comment.trim()}>Send</button></form><form onSubmit={(event) => { event.preventDefault(); if (!child.trim()) return; addChild(task.id, child.trim()); setChild(""); }}><input value={child} onChange={(event) => setChild(event.target.value)} placeholder="Add a child task…" /><button disabled={!child.trim()}>Add</button></form></aside>;
}
