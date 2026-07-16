"use client";

import { CalendarDays, Check, CheckCircle2, ChevronRight, Circle, CircleAlert, ExternalLink, Link2, Paperclip, Plus, Repeat2, Trash2, UploadCloud, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { taskDuration, wouldCreateDependencyCycle, wouldCreateParentCycle } from "@/lib/scheduling";
import { PRIORITIES, TASK_STATUSES } from "@/lib/task-utils";
import type { Member, Priority, Task, TaskAttachment, TaskStatus, WorkspaceData } from "@/lib/types";

const statusTone: Record<TaskStatus, string> = { "Not Started": "slate", "In Progress": "blue", Blocked: "red", "In Review": "amber", Complete: "green" };

function Avatar({ member }: { member?: Member }) {
  return <span className="avatar avatar-small" style={{ background: member?.color }} title={member?.name}>{member?.initials ?? "?"}</span>;
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "Complete") return <CheckCircle2 size={15} />;
  if (status === "Blocked") return <CircleAlert size={15} />;
  return <Circle size={15} fill={status === "In Progress" || status === "In Review" ? "currentColor" : "none"} />;
}

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface TaskDetailDrawerProps {
  data: WorkspaceData;
  task: Task;
  currentUserId: string;
  close: () => void;
  update: (id: string, patch: Partial<Task>) => void;
  remove: (id: string) => void;
  addComment: (id: string, body: string) => void;
  uploadAttachment: (id: string, file: File) => Promise<void>;
  removeAttachment: (id: string, attachment: TaskAttachment) => Promise<void>;
  addChild: (parentTaskId: string, title: string) => void;
  openTask: (id: string) => void;
}

export function TaskDetailDrawer({ data, task, currentUserId, close, update, remove, addComment, uploadAttachment, removeAttachment, addChild, openTask }: TaskDetailDrawerProps) {
  const [comment, setComment] = useState("");
  const [newChild, setNewChild] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const comments = task.commentItems ?? [];
  const attachments = task.attachmentItems ?? [];
  const dependencyIds = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
  const blockers = dependencyIds.map((id) => data.tasks.find((item) => item.id === id)).filter((item): item is Task => Boolean(item));
  const projectTasks = data.tasks.filter((item) => item.projectId === task.projectId && item.id !== task.id);
  const children = data.tasks.filter((item) => item.parentTaskId === task.id);
  const parent = data.tasks.find((item) => item.id === task.parentTaskId);
  const isSummary = children.length > 0;

  function submitChild(event: FormEvent) {
    event.preventDefault();
    if (!newChild.trim()) return;
    addChild(task.id, newChild.trim());
    setNewChild("");
  }

  async function chooseFile(file?: File) {
    if (!file) return;
    setUploading(true); setFileError("");
    try { await uploadAttachment(task.id, file); } catch (error) { setFileError(error instanceof Error ? error.message : "The file could not be uploaded."); } finally { setUploading(false); }
  }

  return <><button className="drawer-backdrop" aria-label="Close task" onClick={close} /><aside className="task-drawer advanced-drawer"><header><div><span className="breadcrumb">{data.projects.find((project) => project.id === task.projectId)?.name}</span>{parent && <><ChevronRight size={13} /><button className="breadcrumb-link" onClick={() => openTask(parent.id)}>{parent.title}</button></>}<ChevronRight size={13} /><span>{task.id.slice(0, 8).toUpperCase()}</span></div><div><button className="icon-button" aria-label="Copy task link" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/?task=${task.id}`)}><Link2 size={16} /></button><button className="icon-button" aria-label="Delete task" onClick={() => remove(task.id)}><Trash2 size={16} /></button><button className="icon-button" aria-label="Close task drawer" onClick={close}><X size={18} /></button></div></header><div className="drawer-body"><div className="drawer-title"><button className={`task-check ${statusTone[task.status]}`} disabled={isSummary} title={isSummary ? "Parent status is calculated from its children" : "Toggle complete"} onClick={() => update(task.id, { status: task.status === "Complete" ? "Not Started" : "Complete" })}><StatusIcon status={task.status} /></button><textarea value={task.title} onChange={(event) => update(task.id, { title: event.target.value })} rows={2} /></div><textarea className="description-edit" value={task.description} onChange={(event) => update(task.id, { description: event.target.value })} rows={3} placeholder="Add a description…" /><div className="task-properties"><label><span>Status</span><select value={task.status} disabled={isSummary} onChange={(event) => update(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Parent task</span><select value={task.parentTaskId ?? ""} onChange={(event) => { const parentTaskId = event.target.value; if (!parentTaskId || !wouldCreateParentCycle(data.tasks, task.id, parentTaskId)) update(task.id, { parentTaskId: parentTaskId || undefined }); }}><option value="">No parent</option>{projectTasks.filter((candidate) => !wouldCreateParentCycle(data.tasks, task.id, candidate.id)).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.title}</option>)}</select></label><label><span>Assignee</span><select value={task.assigneeId} onChange={(event) => update(task.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label><span>Priority</span><select value={task.priority} onChange={(event) => update(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label><span>Start</span><input type="date" value={task.startDate} readOnly={dependencyIds.length > 0 || isSummary} onChange={(event) => update(task.id, { startDate: event.target.value })} /></label><label><span>Duration</span><span className="duration-cell"><input type="number" min="1" value={taskDuration(task)} readOnly={isSummary} onChange={(event) => update(task.id, { durationDays: Math.max(1, Math.floor(Number(event.target.value))) })} /><small>days</small></span></label><label><span>Finish</span><input type="date" value={task.dueDate} readOnly /></label><label><span>Milestone</span><select value={task.milestoneId ?? ""} onChange={(event) => update(task.id, { milestoneId: event.target.value || undefined })}><option value="">No milestone</option>{(data.milestones ?? []).filter((item) => item.projectId === task.projectId).map((milestone) => <option value={milestone.id} key={milestone.id}>{milestone.name}</option>)}</select></label><label><span>Repeats</span><select value={task.recurrence?.frequency ?? (task.recurring ? "monthly" : "")} onChange={(event) => update(task.id, { recurring: Boolean(event.target.value), recurrence: event.target.value ? { frequency: event.target.value as "daily" | "weekly" | "monthly", interval: 1 } : undefined, recurrenceGeneratedAt: undefined })}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>{task.recurrence && <p className="feature-note"><Repeat2 size={14} /> The next occurrence is created once when this task is completed.</p>}{isSummary && <p className="feature-note"><CalendarDays size={14} /> This parent task’s dates and status roll up automatically from its child tasks.</p>}<div className="drawer-section"><h3>Predecessors <span>{blockers.filter((item) => item.status !== "Complete").length} blocking</span></h3><details className="dependency-picker"><summary><Link2 size={14} /> Choose tasks that must finish first</summary><div>{projectTasks.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={dependencyIds.includes(candidate.id)} onChange={(event) => { const next = event.target.checked ? [...dependencyIds, candidate.id] : dependencyIds.filter((id) => id !== candidate.id); if (!wouldCreateDependencyCycle(data.tasks, task.id, next)) update(task.id, { dependencyIds: next, dependencyId: undefined }); }} /><span><strong>{candidate.title}</strong><small>{candidate.status} · finishes {candidate.dueDate}</small></span></label>)}</div></details>{blockers.map((blocker) => <button className={`blocker-row ${blocker.status === "Complete" ? "resolved" : ""}`} onClick={() => openTask(blocker.id)} key={blocker.id}><StatusIcon status={blocker.status} /><span>{blocker.title}</span><small>{blocker.status === "Complete" ? "Resolved" : "Blocking"}</small></button>)}</div><div className="drawer-section"><h3>Child tasks <span>{children.filter((child) => child.status === "Complete").length}/{children.length}</span></h3><div className="child-task-editor">{children.map((child) => <div className="child-task-row" key={child.id}><button className={`mini-check ${child.status === "Complete" ? "complete" : ""}`} onClick={() => update(child.id, { status: child.status === "Complete" ? "Not Started" : "Complete" })}>{child.status === "Complete" && <Check size={11} />}</button><input className={child.status === "Complete" ? "done" : ""} value={child.title} onChange={(event) => update(child.id, { title: event.target.value })} aria-label="Child task title" /><select value={child.assigneeId} onChange={(event) => update(child.id, { assigneeId: event.target.value })} aria-label={`Assignee for ${child.title}`}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><button className="icon-button" onClick={() => openTask(child.id)} aria-label={`Open ${child.title}`}><ExternalLink size={13} /></button><button className="icon-button" onClick={() => remove(child.id)} aria-label={`Delete ${child.title}`}><Trash2 size={13} /></button></div>)}</div><form className="add-subtask-form" onSubmit={submitChild}><input value={newChild} onChange={(event) => setNewChild(event.target.value)} placeholder="Add a child task…" /><button disabled={!newChild.trim()}><Plus size={14} /> Add</button></form></div><div className="drawer-section"><h3>Attachments <span>{attachments.length || task.attachments}</span></h3><div className="attachment-list">{attachments.map((attachment) => <div key={attachment.id}><Paperclip size={14} /><a href={attachment.url} target="_blank" rel="noreferrer"><strong>{attachment.name}</strong><small>{Math.max(1, Math.round(attachment.size / 1024))} KB · {timeAgo(attachment.createdAt)}</small></a><button className="icon-button" onClick={() => void removeAttachment(task.id, attachment)}><Trash2 size={13} /></button></div>)}</div><label className="attachment-upload secondary-button"><UploadCloud size={14} /> {uploading ? "Uploading…" : "Attach file"}<input type="file" disabled={uploading} onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>{fileError && <p className="form-error">{fileError}</p>}</div><div className="drawer-section"><h3>Comments and activity <span>{comments.length}</span></h3><div className="comment-thread">{comments.map((item) => { const author = data.members.find((member) => member.id === item.authorId); return <div key={item.id}><Avatar member={author} /><span><p><strong>{author?.name ?? "A teammate"}</strong> {item.body}</p><small>{timeAgo(item.createdAt)}</small></span></div>; })}</div><div className="activity-thread">{(task.activity ?? []).slice(-5).reverse().map((event) => <div key={event.id}><Avatar member={data.members.find((member) => member.id === event.actorId)} /><span><p>{event.summary}</p><small>{timeAgo(event.createdAt)}</small></span></div>)}</div><div className="comment-box"><Avatar member={data.members.find((member) => member.id === currentUserId)} /><div><textarea placeholder="Leave a comment or @mention a full name…" value={comment} onChange={(event) => setComment(event.target.value)} /><button disabled={!comment.trim()} onClick={() => { addComment(task.id, comment); setComment(""); }}>Comment</button></div></div></div></div></aside></>;
}
