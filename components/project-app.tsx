"use client";

import {
  Archive,
  ArrowRight,
  Bell,
  CalendarDays,
  ChartNoAxesGantt,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock3,
  Columns3,
  Command,
  Copy,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  Flag,
  FolderPlus,
  Inbox,
  LayoutDashboard,
  Link2,
  List,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Repeat2,
  Save,
  Search,
  ShieldCheck,
  Settings,
  Sparkles,
  Table2,
  Trash2,
  UploadCloud,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { seedData } from "@/lib/seed";
import { ProjectCalendar } from "@/components/project-calendar";
import { ScheduleTable } from "@/components/schedule-table";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { enableFirebaseAnalytics, enableFirebaseAppCheck, getFirebaseAuth, getFirebaseFirestore, getFirebaseStorage, isDemoMode, isFirebaseConfigured } from "@/lib/firebase";
import { parseTaskCsv, type ImportedTask } from "@/lib/csv-import";
import { csvColumns, projectTemplates, sampleCsv, type ProjectTemplate } from "@/lib/project-templates";
import { onAuthStateChanged, sendEmailVerification, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { ensureUserWorkspace, subscribeToWorkspace, syncWorkspace } from "@/lib/workspace-repository";
import { createWorkspaceInvitation, resendWorkspaceInvitation, revokeWorkspaceInvitation, subscribeToWorkspaceInvitations } from "@/lib/invitations";
import { dateLabel, daysUntil, filterTasks, isDueToday, isOverdue, PRIORITIES, taskProgress, TASK_STATUSES } from "@/lib/task-utils";
import { duplicateTaskTree, inclusiveDuration, migrateLegacySubtasks, recalculateProjectSchedule, taskDuration, taskOutline } from "@/lib/scheduling";
import type { CustomTemplate, Member, Priority, Project, Role, SavedView, Task, TaskAttachment, TaskComment, TaskStatus, ViewMode, WorkspaceData, WorkspaceInvitation } from "@/lib/types";

const STORAGE_KEY = "orbit-workspace-v1";
const SIDEBAR_KEY = "orbit-sidebar-collapsed";
type AppSection = "project" | "people" | "inbox" | "settings";

const viewOptions: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "list", label: "List", icon: List },
  { id: "board", label: "Board", icon: Columns3 },
  { id: "timeline", label: "Timeline", icon: ChartNoAxesGantt },
  { id: "table", label: "Table", icon: Table2 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
];

const statusTone: Record<TaskStatus, string> = {
  "Not Started": "slate",
  "In Progress": "blue",
  "Blocked": "red",
  "In Review": "amber",
  "Complete": "green",
};

const priorityTone: Record<Priority, string> = {
  Low: "slate",
  Medium: "blue",
  High: "amber",
  Urgent: "red",
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function today(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function shiftDate(value: string, frequency: "daily" | "weekly" | "monthly", interval: number) {
  const date = new Date(`${value}T12:00:00`);
  if (frequency === "daily") date.setDate(date.getDate() + interval);
  if (frequency === "weekly") date.setDate(date.getDate() + interval * 7);
  if (frequency === "monthly") date.setMonth(date.getMonth() + interval);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function Avatar({ member, small = false }: { member?: Member; small?: boolean }) {
  if (!member) return <span className={`avatar ${small ? "avatar-small" : ""}`}>?</span>;
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ background: member.color }} title={member.name}>{member.initials}</span>;
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "Complete") return <CheckCircle2 size={15} />;
  if (status === "Blocked") return <CircleAlert size={15} />;
  return <Circle size={15} fill={status === "In Progress" || status === "In Review" ? "currentColor" : "none"} />;
}

export function ProjectApp() {
  const [data, setData] = useState<WorkspaceData>(() => ({ ...seedData, tasks: migrateLegacySubtasks(seedData.tasks) }));
  const [loaded, setLoaded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState("p1");
  const [view, setView] = useState<ViewMode>("overview");
  const [query, setQuery] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState("");
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [section, setSection] = useState<AppSection>("project");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dataMode, setDataMode] = useState<"loading" | "local" | "firestore">("loading");
  const [cloudError, setCloudError] = useState("");
  const [currentUserId, setCurrentUserId] = useState("m1");
  const [workspaceId, setWorkspaceId] = useState("");
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const workspaceIdRef = useRef("");
  const lastCloudDataRef = useRef<WorkspaceData | null>(null);
  const queuedCloudDataRef = useRef<WorkspaceData | null>(null);
  const pendingSyncsRef = useRef(0);
  const syncQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_KEY) === "true");
  }, []);

  useEffect(() => {
    void enableFirebaseAnalytics();
    void enableFirebaseAppCheck().catch((error: unknown) => {
      setCloudError(`Firebase App Check could not start: ${error instanceof Error ? error.message : "Unknown error"}`);
    });

    if (!isFirebaseConfigured || isDemoMode) {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as WorkspaceData;
          setData({ ...parsed, milestones: parsed.milestones ?? [], savedViews: parsed.savedViews ?? [], customTemplates: parsed.customTemplates ?? [], tasks: migrateLegacySubtasks(parsed.tasks), settings: { ...seedData.settings!, ...parsed.settings } });
        }
      } catch {
        // A malformed local demo record should never prevent the workspace from loading.
      }
      setDataMode("local");
      setLoaded(true);
      return;
    }

    const auth = getFirebaseAuth();
    const db = getFirebaseFirestore();
    if (!auth || !db) {
      setCloudError("Firebase could not be initialized. Check the production environment variables.");
      return;
    }

    let workspaceUnsubscribe: (() => void) | undefined;
    let cancelled = false;
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      workspaceUnsubscribe?.();
      workspaceUnsubscribe = undefined;
      if (!user) {
        window.location.replace("/sign-in");
        return;
      }
      setCurrentUserId(user.uid);
      void ensureUserWorkspace(db, user).then((workspaceId) => {
        if (cancelled) return;
        workspaceIdRef.current = workspaceId;
        setWorkspaceId(workspaceId);
        workspaceUnsubscribe = subscribeToWorkspace(db, workspaceId, user.uid, (cloudData) => {
          if (pendingSyncsRef.current > 0) {
            queuedCloudDataRef.current = cloudData;
            return;
          }
          lastCloudDataRef.current = cloudData;
          setData({ ...cloudData, tasks: migrateLegacySubtasks(cloudData.tasks) });
          setDataMode("firestore");
          setLoaded(true);
          setCloudError("");
        }, (error) => {
          setCloudError(`Firestore could not load this workspace: ${error.message}`);
        });
      }).catch((error: unknown) => {
        setCloudError(`Your workspace could not be created: ${error instanceof Error ? error.message : "Unknown error"}`);
      });
    });

    return () => {
      cancelled = true;
      authUnsubscribe();
      workspaceUnsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const db = getFirebaseFirestore();
    const role = data.members.find((member) => member.id === currentUserId)?.role;
    if (dataMode !== "firestore" || !db || !workspaceId || (role !== "Owner" && role !== "Admin")) {
      setInvitations([]);
      return;
    }
    return subscribeToWorkspaceInvitations(db, workspaceId, setInvitations, (error) => setCloudError(`Invitations could not load: ${error.message}`));
  }, [currentUserId, data.members, dataMode, workspaceId]);

  useEffect(() => {
    if (!loaded) return;
    if (dataMode === "local") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return;
    }
    const db = getFirebaseFirestore();
    const previous = lastCloudDataRef.current;
    const workspaceId = workspaceIdRef.current;
    if (dataMode !== "firestore" || !db || !previous || !workspaceId || JSON.stringify(previous) === JSON.stringify(data)) return;
    lastCloudDataRef.current = data;
    pendingSyncsRef.current += 1;
    syncQueueRef.current = syncQueueRef.current
      .then(() => syncWorkspace(db, workspaceId, currentUserId, previous, data))
      .catch((error: unknown) => {
        setCloudError(`A change could not be saved: ${error instanceof Error ? error.message : "Unknown error"}`);
      })
      .finally(() => {
        pendingSyncsRef.current -= 1;
        if (pendingSyncsRef.current === 0 && queuedCloudDataRef.current) {
          const cloudData = queuedCloudDataRef.current;
          queuedCloudDataRef.current = null;
          lastCloudDataRef.current = cloudData;
          setData({ ...cloudData, tasks: migrateLegacySubtasks(cloudData.tasks) });
        }
      });
  }, [currentUserId, data, dataMode, loaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeProject = data.projects.find((project) => project.id === activeProjectId) ?? data.projects[0];
  const projectTasks = data.tasks.filter((task) => task.projectId === activeProject?.id);
  const visibleTasks = useMemo(() => {
    const base = myTasksOnly ? data.tasks.filter((task) => task.assigneeId === currentUserId) : projectTasks;
    return filterTasks(base, query, assigneeFilter, priorityFilter);
  }, [data.tasks, projectTasks, query, assigneeFilter, priorityFilter, myTasksOnly, currentUserId]);
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const unreadCount = data.notifications.filter((notification) => !notification.read).length;
  const currentMember = data.members.find((member) => member.id === currentUserId) ?? data.members[0];

  function openSection(next: AppSection) {
    setSection(next);
    setMyTasksOnly(false);
    setSidebarOpen(false);
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
  }

  function toggleDesktopSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  }

  async function handleSignOut() {
    const auth = getFirebaseAuth();
    if (auth?.currentUser) await signOut(auth);
    window.location.href = "/sign-in";
  }

  function saveProject(project: Project, tasks: Task[]) {
    setData((current) => {
      const timestamp = new Date().toISOString();
      const additions = migrateLegacySubtasks(tasks.map((task) => ({ ...task, durationDays: taskDuration(task), activity: [{ id: uid("activity"), actorId: currentUserId, kind: "created" as const, summary: `created ${task.title}`, createdAt: timestamp }] })));
      return { ...current, projects: [...current.projects, project], tasks: recalculateProjectSchedule([...current.tasks, ...additions], project) };
    });
    setActiveProjectId(project.id);
    setView(data.settings?.defaultView ?? "overview");
    setSection("project");
    setProjectModalOpen(false);
    setToast(`Project created with ${tasks.length} starter task${tasks.length === 1 ? "" : "s"}`);
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setData((current) => {
      const existing = current.tasks.find((task) => task.id === taskId);
      if (!existing) return current;
      const timestamp = new Date().toISOString();
      const statusChanged = patch.status && patch.status !== existing.status;
      const event = statusChanged ? { id: uid("activity"), actorId: currentUserId, kind: patch.status === "Complete" ? "completed" as const : "updated" as const, summary: patch.status === "Complete" ? `completed ${existing.title}` : `moved ${existing.title} to ${patch.status}`, createdAt: timestamp } : null;
      const requestedActivity = patch.activity ?? existing.activity ?? [];
      const updated: Task = { ...existing, ...patch, durationDays: patch.dueDate && patch.durationDays === undefined ? inclusiveDuration(patch.startDate ?? existing.startDate, patch.dueDate) : Math.max(1, Math.floor(patch.durationDays ?? taskDuration(existing))), activity: event ? [...requestedActivity, event] : requestedActivity, updatedAt: timestamp };
      let tasks = current.tasks.map((task) => task.id === taskId ? updated : task);
      const recurrence = updated.recurrence ?? (updated.recurring ? { frequency: "monthly" as const, interval: 1 } : undefined);
      if (patch.status === "Complete" && existing.status !== "Complete" && recurrence && !existing.recurrenceGeneratedAt) {
        const nextDueDate = shiftDate(updated.dueDate, recurrence.frequency, recurrence.interval);
        const nextStartDate = shiftDate(updated.startDate, recurrence.frequency, recurrence.interval);
        tasks = tasks.map((task) => task.id === taskId ? { ...task, recurrenceGeneratedAt: timestamp } : task);
        tasks.push({ ...updated, id: `rec-${updated.id}-${nextDueDate}`, status: "Not Started", startDate: nextStartDate, dueDate: nextDueDate, subtasks: updated.subtasks.map((subtask) => ({ ...subtask, id: uid("sub"), complete: false })), comments: 0, attachments: 0, commentItems: [], attachmentItems: [], activity: [{ id: uid("activity"), actorId: currentUserId, kind: "created", summary: `created the next recurring ${updated.title}`, createdAt: timestamp }], recurrenceGeneratedAt: undefined, createdAt: timestamp, updatedAt: timestamp });
      }
      const project = current.projects.find((item) => item.id === existing.projectId);
      return { ...current, tasks: project ? recalculateProjectSchedule(tasks, project) : tasks };
    });
  }

  function addChildTask(parentTaskId: string, title: string) {
    setData((current) => {
      const parent = current.tasks.find((task) => task.id === parentTaskId);
      const project = parent ? current.projects.find((item) => item.id === parent.projectId) : undefined;
      if (!parent || !project) return current;
      const timestamp = new Date().toISOString();
      const child: Task = { id: uid("task"), projectId: parent.projectId, parentTaskId, title, description: "", status: "Not Started", priority: parent.priority, assigneeId: parent.assigneeId, startDate: parent.startDate, dueDate: parent.startDate, durationDays: 1, estimate: 0, labels: [], subtasks: [], comments: 0, attachments: 0, commentItems: [], attachmentItems: [], activity: [{ id: uid("activity"), actorId: currentUserId, kind: "created", summary: `created child task ${title}`, createdAt: timestamp }], dependencyIds: [], createdAt: timestamp, updatedAt: timestamp };
      return { ...current, tasks: recalculateProjectSchedule([...current.tasks, child], project) };
    });
    setToast("Child task added");
  }

  function addScheduleTask(parentTaskId?: string) {
    if (parentTaskId) {
      addChildTask(parentTaskId, "New child task");
      return;
    }
    const timestamp = new Date().toISOString();
    const task: Task = { id: uid("task"), projectId: activeProject.id, title: "New task", description: "", status: "Not Started", priority: "Medium", assigneeId: currentUserId, startDate: activeProject.startDate, dueDate: activeProject.startDate, durationDays: 1, estimate: 0, labels: [], subtasks: [], comments: 0, attachments: 0, commentItems: [], attachmentItems: [], activity: [{ id: uid("activity"), actorId: currentUserId, kind: "created", summary: "created New task", createdAt: timestamp }], dependencyIds: [], createdAt: timestamp, updatedAt: timestamp };
    setData((current) => ({ ...current, tasks: recalculateProjectSchedule([...current.tasks, task], activeProject) }));
    setToast("Task row added");
  }

  function addComment(taskId: string, body: string) {
    const timestamp = new Date().toISOString();
    const mentions = data.members.filter((member) => body.toLowerCase().includes(`@${member.name.toLowerCase()}`) || body.toLowerCase().includes(`@${member.email.split("@")[0].toLowerCase()}`)).map((member) => member.id);
    const comment: TaskComment = { id: uid("comment"), authorId: currentUserId, body: body.trim(), mentions, createdAt: timestamp, updatedAt: timestamp };
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    updateTask(taskId, { commentItems: [...(task.commentItems ?? []), comment], comments: Math.max(task.commentItems?.length ?? 0, task.comments ?? 0) + 1, activity: [...(task.activity ?? []), { id: uid("activity"), actorId: currentUserId, kind: "commented", summary: `commented on ${task.title}`, createdAt: timestamp }] });
    const db = getFirebaseFirestore();
    if (db && workspaceIdRef.current) {
      for (const recipientId of mentions.filter((id) => id !== currentUserId)) {
        const notificationId = uid("mention");
        void setDoc(doc(db, "workspaces", workspaceIdRef.current, "notifications", notificationId), { id: notificationId, recipientId, taskId, title: `${currentMember.name} mentioned you`, body: body.trim().slice(0, 180), time: "Just now", read: false, tone: "purple" });
      }
    }
  }

  async function uploadAttachment(taskId: string, file: File) {
    if (file.size > 20 * 1024 * 1024) throw new Error("Attachments must be smaller than 20 MB.");
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Task not found.");
    const attachmentId = uid("file");
    const timestamp = new Date().toISOString();
    let path = "";
    let url = "";
    const storage = getFirebaseStorage();
    if (dataMode === "firestore" && storage && workspaceIdRef.current) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      path = `workspaces/${workspaceIdRef.current}/tasks/${taskId}/${attachmentId}/${safeName}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
      url = await getDownloadURL(storageRef);
    } else {
      url = URL.createObjectURL(file);
    }
    const attachment: TaskAttachment = { id: attachmentId, name: file.name, url, path, size: file.size, contentType: file.type || "application/octet-stream", uploadedBy: currentUserId, createdAt: timestamp };
    updateTask(taskId, { attachmentItems: [...(task.attachmentItems ?? []), attachment], attachments: Math.max(task.attachmentItems?.length ?? 0, task.attachments ?? 0) + 1, activity: [...(task.activity ?? []), { id: uid("activity"), actorId: currentUserId, kind: "attached", summary: `attached ${file.name}`, createdAt: timestamp }] });
  }

  async function removeAttachment(taskId: string, attachment: TaskAttachment) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const storage = getFirebaseStorage();
    if (attachment.path && storage) await deleteObject(ref(storage, attachment.path));
    const remaining = (task.attachmentItems ?? []).filter((item) => item.id !== attachment.id);
    updateTask(taskId, { attachmentItems: remaining, attachments: remaining.length });
  }

  function saveCurrentView() {
    const name = window.prompt("Name this saved view");
    if (!name?.trim()) return;
    const savedView: SavedView = { id: uid("view"), name: name.trim(), projectId: activeProject.id, ownerId: currentUserId, view, query, assigneeId: assigneeFilter, priority: priorityFilter as Priority | "" };
    setData((current) => ({ ...current, savedViews: [...(current.savedViews ?? []), savedView] }));
    setToast("View saved");
  }

  function applySavedView(savedViewId: string) {
    const savedView = data.savedViews.find((item) => item.id === savedViewId);
    if (!savedView) return;
    setActiveProjectId(savedView.projectId);
    setView(savedView.view);
    setQuery(savedView.query);
    setAssigneeFilter(savedView.assigneeId);
    setPriorityFilter(savedView.priority);
  }

  function saveProjectAsTemplate() {
    if (!activeProject) return;
    const name = window.prompt("Template name", `${activeProject.name} template`);
    if (!name?.trim()) return;
    const start = new Date(`${activeProject.startDate}T12:00:00`).getTime();
    const template: CustomTemplate = { id: uid("template"), name: name.trim(), description: activeProject.description, icon: activeProject.icon, color: activeProject.color, category: "Custom", durationDays: Math.max(1, Math.round((new Date(`${activeProject.dueDate}T12:00:00`).getTime() - start) / 86400000)), ownerId: currentUserId, tasks: projectTasks.map((task) => ({ title: task.title, description: task.description, status: task.status, priority: task.priority, dueOffset: Math.max(0, Math.round((new Date(`${task.dueDate}T12:00:00`).getTime() - start) / 86400000)), estimate: task.estimate, labels: task.labels, subtasks: task.subtasks.map(({ title, complete, assigneeId }) => ({ title, complete, assigneeId })) })) };
    setData((current) => ({ ...current, customTemplates: [...(current.customTemplates ?? []), template] }));
    setToast("Reusable template saved");
  }

  function bulkUpdate(taskIds: string[], patch: Partial<Task>) {
    setData((current) => {
      const timestamp = new Date().toISOString();
      let tasks = current.tasks.map((task) => taskIds.includes(task.id) ? { ...task, ...patch, durationDays: patch.durationDays ?? taskDuration(task), updatedAt: timestamp } : task);
      const projectIds = [...new Set(tasks.filter((task) => taskIds.includes(task.id)).map((task) => task.projectId))];
      for (const projectId of projectIds) {
        const project = current.projects.find((item) => item.id === projectId);
        if (project) tasks = recalculateProjectSchedule(tasks, project);
      }
      return { ...current, tasks };
    });
    setToast(`${taskIds.length} task${taskIds.length === 1 ? "" : "s"} updated`);
  }

  function bulkDelete(taskIds: string[]) {
    if (!window.confirm(`Delete ${taskIds.length} selected task${taskIds.length === 1 ? "" : "s"}?`)) return;
    setData((current) => {
      const removed = new Set(taskIds);
      let changed = true;
      while (changed) {
        changed = false;
        for (const task of current.tasks) if (task.parentTaskId && removed.has(task.parentTaskId) && !removed.has(task.id)) { removed.add(task.id); changed = true; }
      }
      let tasks: Task[] = current.tasks.filter((task) => !removed.has(task.id)).map((task) => ({ ...task, dependencyIds: (task.dependencyIds ?? []).filter((id) => !removed.has(id)) }));
      for (const project of current.projects) tasks = recalculateProjectSchedule(tasks, project);
      return { ...current, tasks };
    });
    setToast("Selected tasks deleted");
  }

  function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task? This can’t be undone.")) return;
    setData((current) => {
      const removed = new Set([taskId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const task of current.tasks) if (task.parentTaskId && removed.has(task.parentTaskId) && !removed.has(task.id)) { removed.add(task.id); changed = true; }
      }
      let tasks: Task[] = current.tasks.filter((task) => !removed.has(task.id)).map((task) => ({ ...task, dependencyIds: (task.dependencyIds ?? []).filter((id) => !removed.has(id)) }));
      for (const project of current.projects) tasks = recalculateProjectSchedule(tasks, project);
      return { ...current, tasks };
    });
    setSelectedTaskId(null);
    setToast("Task deleted");
  }

  function duplicateTask(taskId: string) {
    const duplicatedRootId = uid("task");
    setData((current) => {
      const original = current.tasks.find((task) => task.id === taskId);
      const project = original ? current.projects.find((item) => item.id === original.projectId) : undefined;
      if (!original || !project) return current;
      const timestamp = new Date().toISOString();
      const copies = duplicateTaskTree(current.tasks, taskId, (originalId) => originalId === taskId ? duplicatedRootId : uid("task"), timestamp, currentUserId);
      return { ...current, tasks: recalculateProjectSchedule([...current.tasks, ...copies], project) };
    });
    setSelectedTaskId(duplicatedRootId);
    setToast("Task and child tasks duplicated");
  }

  function duplicateProject() {
    if (!activeProject) return;
    const projectId = uid("project");
    const copy: Project = { ...activeProject, id: projectId, name: `${activeProject.name} copy`, status: "Planning" };
    const taskIds = new Map(projectTasks.map((task) => [task.id, uid("task")]));
    const copies: Task[] = projectTasks.map((task) => ({
      ...task,
      id: taskIds.get(task.id)!,
      projectId,
      parentTaskId: task.parentTaskId ? taskIds.get(task.parentTaskId) : undefined,
      dependencyIds: (task.dependencyIds ?? []).map((id) => taskIds.get(id)).filter((id): id is string => Boolean(id)),
      dependencyId: undefined,
      status: "Not Started",
      recurrenceGeneratedAt: undefined,
    }));
    setData((current) => ({ ...current, projects: [...current.projects, copy], tasks: [...current.tasks, ...recalculateProjectSchedule(copies, copy)] }));
    setActiveProjectId(projectId);
    setToast("Project duplicated");
  }

  function archiveProject() {
    if (!activeProject || !window.confirm(`Archive ${activeProject.name}?`)) return;
    setData((current) => ({ ...current, projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, archived: true } : project) }));
    const next = data.projects.find((project) => project.id !== activeProject.id && !project.archived);
    if (next) setActiveProjectId(next.id);
    setToast("Project archived");
  }

  function importCsvIntoProject(file?: File) {
    if (!file || !activeProject) return;
    const projectId = activeProject.id;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseTaskCsv(String(reader.result ?? ""), data.members, activeProject.startDate || today());
      if (!result.tasks.length) {
        setToast(result.warnings[0] ?? "No tasks could be imported");
        return;
      }

      const timestamp = new Date().toISOString();
      const taskIds = result.tasks.map(() => uid("task"));
      const additions: Task[] = result.tasks.map((task, index) => ({
        id: taskIds[index],
        projectId,
        title: task.title.trim(),
        description: task.description,
        status: task.status,
        priority: task.priority,
        assigneeId: task.assigneeId,
        startDate: task.startDate,
        dueDate: task.dueDate,
        durationDays: task.durationDays,
        estimate: task.estimate,
        labels: task.labels,
        parentTaskId: task.parentIndex === undefined ? undefined : taskIds[task.parentIndex],
        dependencyIds: task.dependencyIndexes?.map((dependencyIndex) => taskIds[dependencyIndex]).filter(Boolean) ?? [],
        subtasks: [],
        comments: 0,
        attachments: 0,
        commentItems: [],
        attachmentItems: [],
        activity: [{ id: uid("activity"), actorId: currentUserId, kind: "created", summary: `imported ${task.title}`, createdAt: timestamp }],
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      const importedStart = additions.map((task) => task.startDate).sort()[0];
      const importedDue = additions.map((task) => task.dueDate).sort().at(-1)!;

      setData((current) => {
        const project = current.projects.find((item) => item.id === projectId);
        if (!project) return current;
        const updatedProject = {
          ...project,
          startDate: [project.startDate, importedStart].filter(Boolean).sort()[0],
          dueDate: [project.dueDate, importedDue].filter(Boolean).sort().at(-1)!,
        };
        return {
          ...current,
          projects: current.projects.map((item) => item.id === projectId ? updatedProject : item),
          tasks: recalculateProjectSchedule([...current.tasks, ...additions], updatedProject),
        };
      });
      setToast(`${additions.length} task${additions.length === 1 ? "" : "s"} imported${result.warnings.length ? ` · ${result.warnings[0]}` : ""}`);
    };
    reader.onerror = () => setToast("The CSV file could not be read");
    reader.readAsText(file);
  }

  function exportCsv() {
    const outlined = taskOutline(visibleTasks);
    const rowNumbers = new Map(outlined.map((row) => [row.task.id, row.outline]));
    const header = ["WBS", "Task", "Parent", "Predecessors", "Duration (days)", "Start", "Finish", "Status", "Priority", "Assignee", "Estimate (hours)"];
    const rows = outlined.map(({ task, outline }) => [
      outline,
      task.title,
      task.parentTaskId ? rowNumbers.get(task.parentTaskId) ?? task.parentTaskId : "",
      (task.dependencyIds ?? []).map((id) => rowNumbers.get(id) ?? id).join(", "),
      taskDuration(task),
      task.startDate,
      task.dueDate,
      task.status,
      task.priority,
      data.members.find((member) => member.id === task.assigneeId)?.name ?? "",
      task.estimate,
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${activeProject.name.toLowerCase().replaceAll(" ", "-")}-tasks.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("CSV exported");
  }

  async function inviteTeammate(email: string, role: Role) {
    if (dataMode === "firestore") {
      const db = getFirebaseFirestore();
      const inviter = data.members.find((member) => member.id === currentUserId);
      if (!db || !inviter || !workspaceIdRef.current) throw new Error("The workspace connection is not ready.");
      await createWorkspaceInvitation(db, workspaceIdRef.current, inviter, email, role);
      setInviteModalOpen(false);
      setToast(`Invitation queued for ${email}`);
      return;
    }
    const id = uid("member");
    const name = email.split("@")[0].split(/[._-]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    const member: Member = { id, name, email, initials: name.split(" ").map((word) => word[0]).join("").slice(0, 2), color: "#4d799f", role };
    setData((current) => ({ ...current, members: [...current.members, member], projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, memberIds: [...project.memberIds, id] } : project) }));
    setInviteModalOpen(false);
    setToast(`Demo teammate added for ${email}`);
  }

  async function resendInvitation(invitation: WorkspaceInvitation) {
    const db = getFirebaseFirestore();
    if (!db || !workspaceIdRef.current || !currentMember) return;
    await resendWorkspaceInvitation(db, workspaceIdRef.current, currentMember, invitation);
    setToast(`Invitation resent to ${invitation.email}`);
  }

  async function revokeInvitation(invitation: WorkspaceInvitation) {
    const db = getFirebaseFirestore();
    if (!db || !workspaceIdRef.current || !window.confirm(`Revoke the invitation for ${invitation.email}?`)) return;
    await revokeWorkspaceInvitation(db, workspaceIdRef.current, invitation.id);
    setToast("Invitation revoked");
  }

  if (!loaded) return <main className="workspace-loading"><span className="brand-mark"><Sparkles size={19} /></span><strong>Opening your workspace…</strong><small>{cloudError || "Connecting securely to Orbit"}</small></main>;
  if (cloudError && dataMode !== "local") return <main className="workspace-loading error"><CircleAlert size={24} /><strong>Orbit couldn’t open your workspace</strong><small>{cloudError}</small><button className="primary-button" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!activeProject) return <><main className="workspace-loading"><span className="brand-mark"><Sparkles size={19} /></span><strong>Welcome to Orbit</strong><small>Let’s set up your first project.</small></main><ProjectModal data={data} onboarding close={() => undefined} save={saveProject} /></>;

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#"><span className="brand-mark"><Sparkles size={16} /></span><span>orbit</span></a>
          <button className="icon-button sidebar-collapse-control" onClick={toggleDesktopSidebar} aria-label="Close sidebar"><PanelLeftClose size={18} /></button>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="workspace-switcher">
          <span className="workspace-logo">N</span>
          <span><strong>{data.workspaceName}</strong><small>Team workspace</small></span>
          <ChevronDown size={15} />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={section === "project" && !myTasksOnly && view === "overview" ? "active" : ""} onClick={() => { setSection("project"); setMyTasksOnly(false); setView("overview"); setSidebarOpen(false); }}><LayoutDashboard size={17} /> Home</button>
          <button className={section === "project" && myTasksOnly ? "active" : ""} onClick={() => { setSection("project"); setMyTasksOnly(true); setView("list"); setSidebarOpen(false); }}><CheckCircle2 size={17} /> My tasks <span className="nav-count">{data.tasks.filter((task) => task.assigneeId === currentUserId && task.status !== "Complete").length}</span></button>
          <button className={section === "inbox" ? "active" : ""} onClick={() => openSection("inbox")}><Inbox size={17} /> Inbox {unreadCount > 0 && <span className="nav-dot">{unreadCount}</span>}</button>
        </nav>
        <div className="sidebar-section-heading"><span>Projects</span><button aria-label="New project" onClick={() => setProjectModalOpen(true)}><Plus size={15} /></button></div>
        <nav className="project-nav" aria-label="Projects">
          {data.projects.filter((project) => !project.archived).map((project) => (
            <button key={project.id} className={section === "project" && project.id === activeProjectId ? "active" : ""} onClick={() => { setSection("project"); setActiveProjectId(project.id); setMyTasksOnly(false); setView("overview"); setSidebarOpen(false); }}>
              <span className="project-dot" style={{ background: project.color }}>{project.icon}</span>
              <span className="project-nav-name">{project.name}</span>
              {project.id === activeProjectId && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <button className="sidebar-new-project" onClick={() => setProjectModalOpen(true)}><FolderPlus size={16} /> New project</button>
        <div className="sidebar-bottom">
          <button className={section === "people" ? "active" : ""} onClick={() => openSection("people")}><Users size={16} /> People <span>{data.members.length}</span></button>
          <button className={section === "settings" ? "active" : ""} onClick={() => openSection("settings")}><Settings size={16} /> Settings</button>
          <button className="profile-card" onClick={() => setProfileMenuOpen((value) => !value)}>
            <Avatar member={currentMember} />
            <span><strong>{currentMember.name}</strong><small>{currentMember.role}</small></span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      <main className={`main-content ${sidebarCollapsed ? "sidebar-collapsed-content" : ""}`}>
        <header className="topbar">
          {sidebarCollapsed && <button className="icon-button desktop-sidebar-open" onClick={toggleDesktopSidebar} aria-label="Open sidebar"><PanelLeftOpen size={19} /></button>}
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, projects, or people…" /><span><Command size={11} /> K</span></label>
          <div className="topbar-actions">
            <button className="icon-button notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications"><Bell size={18} />{unreadCount > 0 && <i>{unreadCount}</i>}</button>
            <button className="avatar-button" onClick={() => setProfileMenuOpen((value) => !value)} aria-expanded={profileMenuOpen} aria-label="Open account menu"><Avatar member={currentMember} small /><ChevronDown size={13} /></button>
          </div>
        </header>

        {section === "project" && <section className="project-header">
          <div className="project-title-row">
            <span className="project-icon-large" style={{ background: activeProject.color }}>{activeProject.icon}</span>
            <div className="project-heading">
              <div><h1>{myTasksOnly ? "My tasks" : activeProject.name}</h1><button className="bare-button"><ChevronDown size={17} /></button></div>
              <p>{myTasksOnly ? "Your assigned work across every project" : activeProject.description}</p>
            </div>
            <div className="project-actions">
              <div className="avatar-stack">{activeProject.memberIds.slice(0, 4).map((id) => <Avatar key={id} member={data.members.find((member) => member.id === id)} small />)}</div>
              <button className="secondary-button" onClick={() => setInviteModalOpen(true)}><UserPlus size={16} /> Invite</button>
              <button className="primary-button" onClick={() => setTaskModalOpen(true)}><Plus size={17} /> New task</button>
              <details className="more-menu"><summary className="icon-button"><MoreHorizontal size={18} /></summary><div><button onClick={duplicateProject}><Copy size={15} /> Duplicate project</button><button onClick={saveProjectAsTemplate}><Save size={15} /> Save as template</button><button onClick={exportCsv}><Download size={15} /> Export CSV</button><button onClick={archiveProject}><Archive size={15} /> Archive project</button></div></details>
            </div>
          </div>

          <div className="view-toolbar">
            <div className="view-tabs">
              {viewOptions.map((option) => {
                const Icon = option.icon;
                return <button key={option.id} className={view === option.id ? "active" : ""} onClick={() => setView(option.id)}><Icon size={15} />{option.label}</button>;
              })}
            </div>
            <div className="filter-actions">
              <label className={(data.savedViews ?? []).length ? "filter-active" : ""}><Save size={14} /><select aria-label="Open a saved view" defaultValue="" onChange={(event) => { if (event.target.value) applySavedView(event.target.value); event.target.value = ""; }}><option value="">Open saved view</option>{(data.savedViews ?? []).filter((item) => item.projectId === activeProject.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={12} /></label>
              <button className="save-view-button" onClick={saveCurrentView}><Plus size={13} /> Save current view</button>
              <details className="saved-view-help"><summary aria-label="What are saved views?">?</summary><p>A saved view remembers this project’s layout, search, assignee filter, and priority filter so you can reopen the same working setup in one click.</p></details>
              <label className={assigneeFilter ? "filter-active" : ""}><Users size={14} /><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="">Assignee</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><ChevronDown size={12} /></label>
              <label className={priorityFilter ? "filter-active" : ""}><Filter size={14} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Priority</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><ChevronDown size={12} /></label>
              {(assigneeFilter || priorityFilter || query) && <button className="clear-filter" onClick={() => { setQuery(""); setAssigneeFilter(""); setPriorityFilter(""); }}>Clear</button>}
            </div>
          </div>
        </section>}

        <section className={`workspace-content ${section !== "project" ? "section-page" : ""}`}>
          {section === "project" && view === "overview" && <Overview data={data} project={activeProject} tasks={visibleTasks} onTask={setSelectedTaskId} addMilestone={(name, dueDate, description) => setData((current) => ({ ...current, milestones: [...(current.milestones ?? []), { id: uid("milestone"), projectId: activeProject.id, name, dueDate, description, complete: false }] }))} toggleMilestone={(id) => setData((current) => ({ ...current, milestones: current.milestones.map((item) => item.id === id ? { ...item, complete: !item.complete } : item) }))} removeMilestone={(id) => setData((current) => ({ ...current, milestones: current.milestones.filter((item) => item.id !== id), tasks: current.tasks.map((task) => task.milestoneId === id ? { ...task, milestoneId: undefined } : task) }))} />}
          {section === "project" && view === "list" && <ListView data={data} tasks={visibleTasks} onTask={setSelectedTaskId} onStatus={updateTask} />}
          {section === "project" && view === "board" && <BoardView data={data} tasks={visibleTasks} onTask={setSelectedTaskId} onStatus={updateTask} />}
          {section === "project" && view === "timeline" && <TimelineView data={data} project={activeProject} tasks={visibleTasks} onTask={setSelectedTaskId} importCsv={importCsvIntoProject} />}
          {section === "project" && view === "table" && <ScheduleTable data={data} tasks={visibleTasks} onTask={setSelectedTaskId} onTaskUpdate={updateTask} onBulkUpdate={bulkUpdate} onBulkDelete={bulkDelete} onAddTask={addScheduleTask} importCsv={importCsvIntoProject} exportCsv={exportCsv} />}
          {section === "project" && view === "calendar" && <ProjectCalendar data={data} tasks={visibleTasks} onTask={setSelectedTaskId} />}
          {section === "people" && <PeopleManagementView data={data} invitations={invitations} invite={() => setInviteModalOpen(true)} resend={(invitation) => void resendInvitation(invitation)} revoke={(invitation) => void revokeInvitation(invitation)} updateRole={(memberId, role) => setData((current) => ({ ...current, members: current.members.map((member) => member.id === memberId ? { ...member, role } : member) }))} />}
          {section === "inbox" && <InboxView data={data} markAll={() => setData((current) => ({ ...current, notifications: current.notifications.map((notification) => ({ ...notification, read: true })) }))} markOne={(id) => setData((current) => ({ ...current, notifications: current.notifications.map((notification) => notification.id === id ? { ...notification, read: true } : notification) }))} openSettings={() => openSection("settings")} />}
          {section === "settings" && <SettingsView data={data} currentUserId={currentUserId} dataMode={dataMode} update={(patch) => setData((current) => ({ ...current, ...patch }))} notify={setToast} />}
        </section>
      </main>

      {notificationsOpen && <NotificationPanel data={data} close={() => setNotificationsOpen(false)} markAll={() => setData((current) => ({ ...current, notifications: current.notifications.map((notification) => ({ ...notification, read: true })) }))} openInbox={() => openSection("inbox")} openSettings={() => openSection("settings")} />}
      {profileMenuOpen && <ProfileMenu member={currentMember} firebaseConnected={dataMode === "firestore"} close={() => setProfileMenuOpen(false)} openSettings={() => openSection("settings")} switchAccount={() => { window.location.href = "/sign-in?switch=1"; }} signOut={() => void handleSignOut()} />}
      {selectedTask && <TaskDetailDrawer data={data} task={selectedTask} currentUserId={currentUserId} close={() => setSelectedTaskId(null)} update={updateTask} remove={deleteTask} duplicate={duplicateTask} addComment={addComment} uploadAttachment={uploadAttachment} removeAttachment={removeAttachment} addChild={addChildTask} openTask={setSelectedTaskId} />}
      {taskModalOpen && <TaskModal data={data} projectId={activeProject.id} close={() => setTaskModalOpen(false)} save={(task) => { setData((current) => ({ ...current, tasks: recalculateProjectSchedule([...current.tasks, task], activeProject) })); setTaskModalOpen(false); setToast("Task created"); }} />}
      {projectModalOpen && <ProjectModal data={data} close={() => setProjectModalOpen(false)} save={saveProject} />}
      {inviteModalOpen && <InviteModal dataMode={dataMode} close={() => setInviteModalOpen(false)} save={inviteTeammate} />}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation"><button className={section === "project" && !myTasksOnly ? "active" : ""} onClick={() => { setSection("project"); setMyTasksOnly(false); setView("overview"); }}><LayoutDashboard size={18} /><span>Home</span></button><button className={myTasksOnly ? "active" : ""} onClick={() => { setSection("project"); setMyTasksOnly(true); setView("list"); }}><CheckCircle2 size={18} /><span>My tasks</span></button><button className={section === "inbox" ? "active" : ""} onClick={() => openSection("inbox")}><Inbox size={18} /><span>Inbox</span></button><button onClick={() => setTaskModalOpen(true)}><Plus size={19} /><span>New</span></button></nav>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Overview({ data, project, tasks, onTask, addMilestone, toggleMilestone, removeMilestone }: { data: WorkspaceData; project: Project; tasks: Task[]; onTask: (id: string) => void; addMilestone: (name: string, dueDate: string, description: string) => void; toggleMilestone: (id: string) => void; removeMilestone: (id: string) => void }) {
  const progress = taskProgress(tasks);
  const overdue = tasks.filter((task) => isOverdue(task));
  const dueToday = tasks.filter((task) => isDueToday(task));
  const upcoming = [...tasks].filter((task) => task.status !== "Complete").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  const active = tasks.filter((task) => task.status === "In Progress" || task.status === "In Review");
  const complete = tasks.filter((task) => task.status === "Complete").length;
  const activity = tasks.flatMap((task) => (task.activity ?? []).map((event) => ({ ...event, taskTitle: task.title }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="overview-grid">
      <div className="metric-grid">
        <article className="metric-card"><div className="metric-icon purple"><ChartNoAxesGantt size={18} /></div><span>Project progress</span><strong>{progress}%</strong><div className="metric-progress"><i style={{ width: `${progress}%` }} /></div><small>{complete} of {tasks.length} tasks complete</small></article>
        <article className="metric-card"><div className="metric-icon blue"><Clock3 size={18} /></div><span>In progress</span><strong>{active.length}</strong><small><em className="up-dot" /> Work is moving steadily</small></article>
        <article className="metric-card"><div className="metric-icon amber"><CalendarDays size={18} /></div><span>Due today</span><strong>{dueToday.length}</strong><small>{dueToday.length ? "Needs your attention" : "Nothing due today"}</small></article>
        <article className="metric-card"><div className="metric-icon red"><CircleAlert size={18} /></div><span>Overdue</span><strong>{overdue.length}</strong><small>{overdue.length ? `${overdue.length} task${overdue.length > 1 ? "s" : ""} need a new plan` : "Everything is on track"}</small></article>
      </div>

      <article className="panel upcoming-panel">
        <div className="panel-header"><div><h2>Upcoming work</h2><p>The next deadlines across this project</p></div><button>View all <ArrowRight size={14} /></button></div>
        <div className="task-list-compact">
          {upcoming.map((task) => {
            const member = data.members.find((item) => item.id === task.assigneeId);
            return <button key={task.id} onClick={() => onTask(task.id)}><span className={`status-symbol ${statusTone[task.status]}`}><StatusIcon status={task.status} /></span><span className="compact-task-title"><strong>{task.title}</strong><small>{task.labels[0] ?? "General"}</small></span><span className={`date-chip ${isOverdue(task) ? "overdue" : daysUntil(task.dueDate) <= 1 ? "soon" : ""}`}><CalendarDays size={13} />{dateLabel(task.dueDate)}</span><Avatar member={member} small /><ChevronRight size={14} /></button>;
          })}
        </div>
      </article>

      <article className="panel project-health-panel">
        <div className="panel-header"><div><h2>Project health</h2><p>Workload and delivery signals</p></div><span className="health-badge"><i /> On track</span></div>
        <div className="health-donut-row">
          <div className="donut" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span><strong>{progress}%</strong><small>complete</small></span></div>
          <div className="status-breakdown">
            {TASK_STATUSES.map((status) => <div key={status}><span><i className={statusTone[status]} />{status}</span><strong>{tasks.filter((task) => task.status === status).length}</strong></div>)}
          </div>
        </div>
        <div className="project-dates"><div><small>STARTED</small><strong>{formatDate(project.startDate)}</strong></div><ArrowRight size={17} /><div><small>TARGET DATE</small><strong>{formatDate(project.dueDate)}</strong></div></div>
      </article>

      <article className="panel workload-panel">
        <div className="panel-header"><div><h2>Team workload</h2><p>Open tasks by owner</p></div><button><MoreHorizontal size={17} /></button></div>
        <div className="workload-list">
          {data.members.filter((member) => project.memberIds.includes(member.id)).map((member) => {
            const count = tasks.filter((task) => task.assigneeId === member.id && task.status !== "Complete").length;
            const capacity = Math.min(100, count * 22);
            return <div key={member.id}><Avatar member={member} small /><span><strong>{member.name}</strong><small>{count} open task{count === 1 ? "" : "s"}</small></span><div className="workload-track"><i style={{ width: `${capacity}%`, background: capacity > 75 ? "#d86b5c" : member.color }} /></div><em>{capacity > 75 ? "Full" : "Good"}</em></div>;
          })}
        </div>
      </article>

      <article className="panel activity-panel">
        <div className="panel-header"><div><h2>Recent activity</h2><p>What changed since your last visit</p></div></div>
        <div className="activity-list">
          {activity.length ? activity.map((event) => <div key={event.id}><Avatar member={data.members.find((member) => member.id === event.actorId)} small /><span><strong>{data.members.find((member) => member.id === event.actorId)?.name ?? "A teammate"}</strong> {event.summary}<small>{timeAgo(event.createdAt)}</small></span></div>) : <p className="drawer-empty">Task updates and comments will appear here.</p>}
        </div>
      </article>

      <MilestonePanel milestones={(data.milestones ?? []).filter((item) => item.projectId === project.id)} tasks={tasks} add={addMilestone} toggle={toggleMilestone} remove={removeMilestone} />
    </div>
  );
}

function MilestonePanel({ milestones, tasks, add, toggle, remove }: { milestones: WorkspaceData["milestones"]; tasks: Task[]; add: (name: string, dueDate: string, description: string) => void; toggle: (id: string) => void; remove: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState(today(14));
  const [description, setDescription] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    add(name.trim(), dueDate, description.trim());
    setName(""); setDescription(""); setAdding(false);
  }
  return <article className="panel milestone-panel"><div className="panel-header"><div><h2>Milestones</h2><p>Major delivery points for this project</p></div><button onClick={() => setAdding((value) => !value)}><Plus size={14} /> Add</button></div>{adding && <form className="milestone-form" onSubmit={submit}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Milestone name" autoFocus required /><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description" /><button className="primary-button">Create</button></form>}<div className="milestone-list">{milestones.length ? milestones.map((milestone) => { const linked = tasks.filter((task) => task.milestoneId === milestone.id); const complete = linked.filter((task) => task.status === "Complete").length; return <div key={milestone.id}><button className={`mini-check ${milestone.complete ? "complete" : ""}`} onClick={() => toggle(milestone.id)}>{milestone.complete && <Check size={11} />}</button><span><strong className={milestone.complete ? "done" : ""}>{milestone.name}</strong><small>{dateLabel(milestone.dueDate)} · {complete}/{linked.length} linked tasks</small></span><button className="icon-button" onClick={() => remove(milestone.id)} aria-label={`Delete ${milestone.name}`}><Trash2 size={14} /></button></div>; }) : <p className="drawer-empty">No milestones yet.</p>}</div></article>;
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="section-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function PeopleManagementView({ data, invitations, invite, resend, revoke, updateRole }: { data: WorkspaceData; invitations: WorkspaceInvitation[]; invite: () => void; resend: (invitation: WorkspaceInvitation) => void; revoke: (invitation: WorkspaceInvitation) => void; updateRole: (memberId: string, role: Role) => void }) {
  const [search, setSearch] = useState("");
  const members = data.members.filter((member) => `${member.name} ${member.email}`.toLowerCase().includes(search.toLowerCase()));
  const pending = invitations.filter((invitation) => invitation.status === "pending");
  return <div className="management-page"><SectionHeader eyebrow="Workspace" title="People" description="Manage access, roles, and pending invitations." action={<button className="primary-button" onClick={invite}><UserPlus size={16} /> Invite teammate</button>} /><div className="people-summary"><article><span className="management-icon purple"><Users size={18} /></span><div><strong>{data.members.length}</strong><small>Active members</small></div></article><article><span className="management-icon green"><ShieldCheck size={18} /></span><div><strong>{data.members.filter((member) => member.role === "Owner" || member.role === "Admin").length}</strong><small>Workspace admins</small></div></article><article><span className="management-icon amber"><Mail size={18} /></span><div><strong>{pending.length}</strong><small>Pending invitations</small></div></article></div><section className="management-panel"><header><div><h2>Workspace members</h2><p>Everyone who can access {data.workspaceName}</p></div><label className="mini-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a person…" /></label></header><div className="people-table"><div className="people-table-head"><span>Person</span><span>Projects</span><span>Role</span><span>Status</span><span /></div>{members.map((member) => { const projects = data.projects.filter((project) => project.memberIds.includes(member.id) && !project.archived); return <div className="people-row" key={member.id}><span className="person-cell"><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></span><span className="project-access"><span className="avatar-stack small-stack">{projects.slice(0, 3).map((project) => <i key={project.id} style={{ background: project.color }}>{project.icon}</i>)}</span><small>{projects.length} project{projects.length === 1 ? "" : "s"}</small></span><span><select value={member.role} disabled={member.role === "Owner"} onChange={(event) => updateRole(member.id, event.target.value as Role)}><option>Owner</option><option>Admin</option><option>Member</option><option>Viewer</option></select></span><span className="active-status"><i /> Active</span><span /></div>; })}</div></section>{invitations.length > 0 && <section className="management-panel invitation-panel"><header><div><h2>Invitations</h2><p>Resend or revoke access before an invitation is accepted.</p></div></header><div className="invitation-list">{invitations.map((invitation) => <div key={invitation.id}><span className={`notification-icon ${invitation.status === "pending" ? "amber" : invitation.status === "accepted" ? "green" : "red"}`}><Mail size={15} /></span><span><strong>{invitation.email}</strong><small>{invitation.role} · {invitation.status} · {timeAgo(invitation.createdAt)}</small></span>{invitation.status === "pending" && <><button className="secondary-button" onClick={() => resend(invitation)}><RefreshCw size={13} /> Resend</button><button className="icon-button" onClick={() => revoke(invitation)} aria-label={`Revoke ${invitation.email}`}><Trash2 size={14} /></button></>}</div>)}</div></section>}</div>;
}

// Kept temporarily as a compatibility fallback for older embedded previews.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PeopleView({ data, invite, updateRole }: { data: WorkspaceData; invite: () => void; updateRole: (memberId: string, role: Role) => void }) {
  return <div className="management-page"><SectionHeader eyebrow="Workspace" title="People" description="Manage access, roles, and project participation." action={<button className="primary-button" onClick={invite}><UserPlus size={16} /> Invite teammate</button>} /><div className="people-summary"><article><span className="management-icon purple"><Users size={18} /></span><div><strong>{data.members.length}</strong><small>Active members</small></div></article><article><span className="management-icon green"><ShieldCheck size={18} /></span><div><strong>{data.members.filter((member) => member.role === "Owner" || member.role === "Admin").length}</strong><small>Workspace admins</small></div></article><article><span className="management-icon amber"><Mail size={18} /></span><div><strong>0</strong><small>Pending invitations</small></div></article></div><section className="management-panel"><header><div><h2>Workspace members</h2><p>Everyone who can access {data.workspaceName}</p></div><label className="mini-search"><Search size={14} /><input placeholder="Find a person…" /></label></header><div className="people-table"><div className="people-table-head"><span>Person</span><span>Projects</span><span>Role</span><span>Status</span><span /></div>{data.members.map((member) => { const projects = data.projects.filter((project) => project.memberIds.includes(member.id) && !project.archived); return <div className="people-row" key={member.id}><span className="person-cell"><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></span><span className="project-access"><span className="avatar-stack small-stack">{projects.slice(0, 3).map((project) => <i key={project.id} style={{ background: project.color }}>{project.icon}</i>)}</span><small>{projects.length} project{projects.length === 1 ? "" : "s"}</small></span><span><select value={member.role} disabled={member.role === "Owner"} onChange={(event) => updateRole(member.id, event.target.value as Role)}><option>Owner</option><option>Admin</option><option>Member</option><option>Viewer</option></select></span><span className="active-status"><i /> Active</span><button className="icon-button" aria-label={`More options for ${member.name}`}><MoreHorizontal size={16} /></button></div>; })}</div></section><aside className="access-note"><ShieldCheck size={18} /><div><strong>Role changes are saved in this local workspace.</strong><p>When the shared backend is connected, the server will enforce these roles on every project and task request.</p></div></aside></div>;
}

function InboxView({ data, markAll, markOne, openSettings }: { data: WorkspaceData; markAll: () => void; markOne: (id: string) => void; openSettings: () => void }) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const items = filter === "unread" ? data.notifications.filter((notification) => !notification.read) : data.notifications;
  return <div className="management-page"><SectionHeader eyebrow="Updates" title="Inbox" description="Mentions, assignments, reminders, and important changes." action={<button className="secondary-button" onClick={markAll}><Check size={15} /> Mark all read</button>} /><div className="inbox-layout"><section className="management-panel inbox-main"><header><div className="segmented-control"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All <span>{data.notifications.length}</span></button><button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>Unread <span>{data.notifications.filter((item) => !item.read).length}</span></button></div></header><div className="inbox-list">{items.length ? items.map((notification) => <button key={notification.id} className={!notification.read ? "unread" : ""} onClick={() => markOne(notification.id)}><span className={`notification-icon ${notification.tone}`}><Bell size={16} /></span><span><strong>{notification.title}</strong><p>{notification.body}</p><small>{notification.time}</small></span>{!notification.read && <i />}</button>) : <div className="empty-inbox"><CheckCircle2 size={27} /><strong>You’re all caught up</strong><p>New assignments and reminders will appear here.</p></div>}</div></section><aside className="inbox-side"><div className="inbox-tip"><Bell size={18} /><h3>Stay in the loop</h3><p>Choose which updates arrive by email and when reminders should be sent.</p><button onClick={openSettings}>Notification settings <ArrowRight size={14} /></button></div><div className="inbox-stat"><span>This week</span><strong>{data.notifications.length}</strong><small>workspace updates</small></div></aside></div></div>;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description: string }) {
  return <label className="setting-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function SettingsView({ data, currentUserId, dataMode, update, notify }: { data: WorkspaceData; currentUserId: string; dataMode: "loading" | "local" | "firestore"; update: (patch: Partial<WorkspaceData>) => void; notify: (message: string) => void }) {
  const settings = { ...seedData.settings!, ...data.settings };
  const currentMember = data.members.find((member) => member.id === currentUserId) ?? data.members[0];
  const legacyPreferences = currentMember.preferences as (typeof currentMember.preferences & { reminderHoursBefore?: number }) | undefined;
  const preferences = { reminderDaysBefore: legacyPreferences?.reminderDaysBefore ?? Math.ceil((legacyPreferences?.reminderHoursBefore ?? 24) / 24), reminderTime: legacyPreferences?.reminderTime ?? settings.reminderTime, timezone: settings.timezone, dailyDigestTime: settings.dailyDigestTime, reminderEmail: settings.reminderEmail, reminderInApp: settings.reminderInApp, dailyDigest: settings.dailyDigest, assignmentEmails: settings.assignmentEmails, mentionEmails: settings.mentionEmails, overdueEmails: settings.overdueEmails, ...currentMember.preferences };
  const [workspaceName, setWorkspaceName] = useState(data.workspaceName);
  const [verificationSent, setVerificationSent] = useState(false);
  const authUser = getFirebaseAuth()?.currentUser;
  function updateSettings(patch: Partial<typeof settings>) { update({ settings: { ...settings, ...patch } }); }
  function updatePreferences(patch: Partial<typeof preferences>) { update({ members: data.members.map((member) => member.id === currentMember.id ? { ...member, preferences: { ...preferences, ...patch } } : member) }); }
  return <div className="management-page">
    <SectionHeader eyebrow="Workspace" title="Settings" description="Manage workspace details, defaults, and notifications." action={<span className={`connection-badge ${dataMode === "firestore" ? "connected" : ""}`}><i />{dataMode === "firestore" ? "Firestore connected" : "Local demo mode"}</span>} />
    <div className="settings-layout"><nav className="settings-nav"><button className="active"><Settings size={15} /> General</button><button><Bell size={15} /> Notifications</button><button><ShieldCheck size={15} /> Permissions</button><button><Link2 size={15} /> Integrations</button></nav><div className="settings-content">
      <section className="settings-card"><header><h2>Workspace details</h2><p>The name and identity your team sees throughout Orbit.</p></header><div className="settings-fields"><label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label><label>Workspace URL<div className="url-input"><span>orbit.app/</span><input value="northstar-studio" readOnly /></div></label><label>Week starts on<select value={settings.weekStartsOn} onChange={(event) => updateSettings({ weekStartsOn: event.target.value as "Sunday" | "Monday" })}><option>Monday</option><option>Sunday</option></select></label><label>Default project view<select value={settings.defaultView} onChange={(event) => updateSettings({ defaultView: event.target.value as ViewMode })}>{viewOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div><footer><button className="primary-button" onClick={() => { if (workspaceName.trim()) update({ workspaceName: workspaceName.trim() }); notify("Workspace settings saved"); }}>Save changes</button></footer></section>
      <section className="settings-card"><header><h2>Account security</h2><p>Password recovery and email ownership are handled securely by Firebase Authentication.</p></header><dl className="account-security"><div><dt>Email</dt><dd>{authUser?.email ?? currentMember.email}</dd></div><div><dt>Verification</dt><dd>{authUser?.emailVerified ? "Verified" : verificationSent ? "Verification email sent" : "Not verified"}</dd></div></dl>{authUser && !authUser.emailVerified && <footer><button className="secondary-button" disabled={verificationSent} onClick={() => void sendEmailVerification(authUser).then(() => { setVerificationSent(true); notify("Verification email sent"); }).catch((error: unknown) => notify(error instanceof Error ? error.message : "Verification could not be sent"))}>Send verification email</button></footer>}</section>
      <section className="settings-card"><header><h2>My reminders and email</h2><p>Customize timing, timezone, digest delivery, and channels for your account.</p></header><div className="settings-fields"><label>Remind me before due date<input type="number" min="0" max="365" step="1" value={preferences.reminderDaysBefore} onChange={(event) => updatePreferences({ reminderDaysBefore: Math.max(0, Math.floor(Number(event.target.value))) })} /><small className="field-help">Days before the task is due</small></label><label>Reminder delivery time<input type="time" value={preferences.reminderTime} onChange={(event) => updatePreferences({ reminderTime: event.target.value })} /><small className="field-help">Uses your timezone below</small></label><label>Timezone<input value={preferences.timezone} onChange={(event) => updatePreferences({ timezone: event.target.value })} placeholder="America/New_York" /></label><label>Daily digest time<input type="time" value={preferences.dailyDigestTime} onChange={(event) => updatePreferences({ dailyDigestTime: event.target.value })} /></label></div><div className="settings-fields single-column reminder-toggles"><Toggle checked={preferences.reminderInApp} onChange={(checked) => updatePreferences({ reminderInApp: checked })} label="In-app reminders" description="Create notifications in Orbit." /><Toggle checked={preferences.reminderEmail} onChange={(checked) => updatePreferences({ reminderEmail: checked })} label="Email reminders" description="Send one reminder per task and due date." /><Toggle checked={preferences.assignmentEmails} onChange={(checked) => updatePreferences({ assignmentEmails: checked })} label="Task assignments" description="Email me when a task is assigned to me." /><Toggle checked={preferences.mentionEmails} onChange={(checked) => updatePreferences({ mentionEmails: checked })} label="Mentions and comments" description="Email me when someone mentions me." /><Toggle checked={preferences.overdueEmails} onChange={(checked) => updatePreferences({ overdueEmails: checked })} label="Overdue reminders" description="Send a daily reminder for overdue work." /><Toggle checked={preferences.dailyDigest} onChange={(checked) => updatePreferences({ dailyDigest: checked })} label="Daily digest" description={`Deliver a summary at ${preferences.dailyDigestTime} in ${preferences.timezone}.`} /></div></section>
      <section className="settings-card firebase-card"><header><h2>Firebase project</h2><p>Connection used by this application.</p></header><dl><div><dt>Project</dt><dd>Orbit-PM</dd></div><div><dt>Project ID</dt><dd>orbit-pm-79c3b</dd></div><div><dt>Authentication</dt><dd>{isFirebaseConfigured ? "SDK connected" : "Not configured"}</dd></div><div><dt>Data mode</dt><dd>{dataMode === "firestore" ? "Shared Firestore" : "Browser local storage"}</dd></div></dl><p className="firebase-note"><CircleAlert size={15} /> {dataMode === "firestore" ? "Projects, tasks, preferences, and invitations sync through Firestore. Scheduled reminder delivery requires the worker deployment." : "Demo mode keeps data in this browser. Set NEXT_PUBLIC_DEMO_MODE=false to require sign-in and use Firestore."}</p></section>
      <section className="settings-card"><header><h2>Personal views and templates</h2><p>Manage the shortcuts and reusable project plans you created.</p></header><div className="resource-list">{(data.savedViews ?? []).map((item) => <div key={item.id}><Save size={14} /><span><strong>{item.name}</strong><small>Saved view · {data.projects.find((project) => project.id === item.projectId)?.name}</small></span><button className="icon-button" onClick={() => update({ savedViews: data.savedViews.filter((viewItem) => viewItem.id !== item.id) })}><Trash2 size={13} /></button></div>)}{(data.customTemplates ?? []).map((item) => <div key={item.id}><FolderPlus size={14} /><span><strong>{item.name}</strong><small>Project template · {item.tasks.length} tasks</small></span><button className="icon-button" onClick={() => update({ customTemplates: data.customTemplates.filter((template) => template.id !== item.id) })}><Trash2 size={13} /></button></div>)}{!data.savedViews.length && !data.customTemplates.length && <p className="drawer-empty">Saved views and custom templates will appear here.</p>}</div></section>
    </div></div>
  </div>;
}

function ProfileMenu({ member, firebaseConnected, close, openSettings, switchAccount, signOut }: { member: Member; firebaseConnected: boolean; close: () => void; openSettings: () => void; switchAccount: () => void; signOut: () => void }) {
  return <><button className="popover-scrim" onClick={close} aria-label="Close account menu" /><aside className="profile-menu"><header><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></header><div className="profile-status"><i className={firebaseConnected ? "connected" : ""} />{firebaseConnected ? "Firebase connected" : "Local demo session"}</div><nav><button onClick={close}><UserRound size={16} /> My profile</button><button onClick={openSettings}><Settings size={16} /> Workspace settings</button><button onClick={switchAccount}><RefreshCw size={16} /> Switch account</button><button onClick={signOut}><LogOut size={16} /> Sign out</button></nav></aside></>;
}

function ListView({ data, tasks, onTask, onStatus }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void; onStatus: (id: string, patch: Partial<Task>) => void }) {
  return <div className="list-view">{TASK_STATUSES.map((status) => { const group = tasks.filter((task) => task.status === status); return <section className="list-group" key={status}><header><span className={`status-symbol ${statusTone[status]}`}><StatusIcon status={status} /></span><strong>{status}</strong><em>{group.length}</em><div /><button><Plus size={15} /></button><button><MoreHorizontal size={16} /></button></header>{group.length ? group.map((task) => <TaskRow key={task.id} task={task} member={data.members.find((member) => member.id === task.assigneeId)} onClick={() => onTask(task.id)} onStatus={(next) => onStatus(task.id, { status: next })} />) : <div className="empty-group">No tasks here</div>}</section>; })}</div>;
}

function TaskRow({ task, member, onClick, onStatus }: { task: Task; member?: Member; onClick: () => void; onStatus: (status: TaskStatus) => void }) {
  return <div className="task-row"><button className={`task-check ${statusTone[task.status]}`} onClick={() => onStatus(task.status === "Complete" ? "Not Started" : "Complete")} aria-label="Toggle task"><StatusIcon status={task.status} /></button><button className="task-row-main" onClick={onClick}><strong>{task.title}</strong><span>{task.labels.map((label) => <em key={label}>{label}</em>)}</span></button><span className={`priority-chip ${priorityTone[task.priority]}`}><Flag size={12} />{task.priority}</span><span className={`row-date ${isOverdue(task) ? "overdue" : ""}`}><CalendarDays size={13} />{dateLabel(task.dueDate)}</span><Avatar member={member} small /><button className="row-more"><MoreHorizontal size={16} /></button></div>;
}

function BoardView({ data, tasks, onTask, onStatus }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void; onStatus: (id: string, patch: Partial<Task>) => void }) {
  const columns: TaskStatus[] = ["Not Started", "In Progress", "In Review", "Complete"];
  return <div className="board-view">{columns.map((status) => { const group = tasks.filter((task) => task.status === status || (status === "In Progress" && task.status === "Blocked")); return <section className="board-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const id = event.dataTransfer.getData("task-id"); if (id) onStatus(id, { status }); }}><header><span className={`status-symbol ${statusTone[status]}`}><StatusIcon status={status} /></span><strong>{status}</strong><em>{group.length}</em><button><Plus size={15} /></button><button><MoreHorizontal size={16} /></button></header><div className="board-cards">{group.map((task) => <article key={task.id} className="task-card" draggable onDragStart={(event) => event.dataTransfer.setData("task-id", task.id)} onClick={() => onTask(task.id)}><div className="card-labels">{task.labels.slice(0, 2).map((label) => <span key={label}>{label}</span>)}<button><MoreHorizontal size={15} /></button></div><h3>{task.title}</h3><p>{task.description}</p><div className="card-meta"><span className={`priority-dot ${priorityTone[task.priority]}`} /><span className={isOverdue(task) ? "overdue" : ""}><CalendarDays size={13} />{dateLabel(task.dueDate)}</span><div /><Avatar member={data.members.find((member) => member.id === task.assigneeId)} small /></div>{(task.comments > 0 || task.attachments > 0) && <div className="card-footer">{task.comments > 0 && <span><MessageSquare size={12} />{task.comments}</span>}{task.attachments > 0 && <span><Paperclip size={12} />{task.attachments}</span>}</div>}</article>)}</div><button className="add-column-task"><Plus size={14} /> Add task</button></section>; })}</div>;
}

function TimelineView({ data, project, tasks, onTask, importCsv }: { data: WorkspaceData; project: Project; tasks: Task[]; onTask: (id: string) => void; importCsv: (file?: File) => void }) {
  const projectStart = new Date(`${project.startDate}T12:00:00`).getTime();
  const projectEnd = new Date(`${project.dueDate}T12:00:00`).getTime();
  const span = Math.max(1, projectEnd - projectStart);
  const weeks = Array.from({ length: 6 }, (_, index) => { const date = new Date(projectStart + (span / 5) * index); return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date); });
  return <div className="timeline-view panel">
    <div className="timeline-import-toolbar"><div><strong>Project timeline</strong><span>Import tasks, dates, durations, and predecessors from CSV.</span></div><label className="sheet-import-button"><UploadCloud size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { importCsv(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></div>
    <div className="timeline-header"><div className="timeline-task-col">Task</div><div className="timeline-weeks">{weeks.map((week) => <span key={week}>{week}</span>)}</div></div>
    {tasks.map((task) => {
      const left = Math.max(0, ((new Date(`${task.startDate}T12:00:00`).getTime() - projectStart) / span) * 100);
      const width = Math.max(5, ((new Date(`${task.dueDate}T12:00:00`).getTime() - new Date(`${task.startDate}T12:00:00`).getTime()) / span) * 100);
      return <button className="timeline-row" key={task.id} onClick={() => onTask(task.id)}><span className="timeline-task-col"><StatusIcon status={task.status} /><span><strong>{task.title}</strong><small>{data.members.find((member) => member.id === task.assigneeId)?.name}</small></span></span><span className="timeline-track"><i className={statusTone[task.status]} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}><b>{task.estimate}h</b></i></span></button>;
    })}
    <div className="timeline-today" style={{ left: `calc(260px + ${Math.max(0, Math.min(100, ((Date.now() - projectStart) / span) * 100))}% * (100% - 260px) / 100)` }}><span>Today</span></div>
  </div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BulkTableView({ data, tasks, onTask, onTaskUpdate, onBulkUpdate, onBulkDelete, exportCsv }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void; onTaskUpdate: (id: string, patch: Partial<Task>) => void; onBulkUpdate: (ids: string[], patch: Partial<Task>) => void; onBulkDelete: (ids: string[]) => void; exportCsv: () => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected((current) => current.filter((id) => tasks.some((task) => task.id === id))), [tasks]);
  const allSelected = tasks.length > 0 && selected.length === tasks.length;
  return <div className="table-panel panel"><div className="table-tools">{selected.length ? <div className="bulk-tools"><strong>{selected.length} selected</strong><select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { status: event.target.value as TaskStatus }); event.target.value = ""; }}><option value="">Set status…</option>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { assigneeId: event.target.value }); event.target.value = ""; }}><option value="">Assign to…</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><select defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate(selected, { priority: event.target.value as Priority }); event.target.value = ""; }}><option value="">Set priority…</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><button className="danger-button" onClick={() => { onBulkDelete(selected); setSelected([]); }}><Trash2 size={13} /> Delete</button></div> : <span>{tasks.length} tasks</span>}<button onClick={exportCsv}><Download size={14} /> Export CSV</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" checked={allSelected} onChange={(event) => setSelected(event.target.checked ? tasks.map((task) => task.id) : [])} aria-label="Select all" /></th><th>Task</th><th>Status</th><th>Assignee</th><th>Priority</th><th>Start</th><th>Due</th><th>Estimate</th><th /></tr></thead><tbody>{tasks.map((task) => <tr key={task.id} className={selected.includes(task.id) ? "selected-row" : ""}><td><input type="checkbox" checked={selected.includes(task.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id))} aria-label={`Select ${task.title}`} /></td><td><button onClick={() => onTask(task.id)}><strong>{task.title}</strong><small>{task.labels.join(" · ")}</small></button></td><td><select className={`table-select ${statusTone[task.status]}`} value={task.status} onChange={(event) => onTaskUpdate(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td><td><select className="table-select" value={task.assigneeId} onChange={(event) => onTaskUpdate(task.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></td><td><select className={`table-select ${priorityTone[task.priority]}`} value={task.priority} onChange={(event) => onTaskUpdate(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td><td><input type="date" value={task.startDate} onChange={(event) => onTaskUpdate(task.id, { startDate: event.target.value })} /></td><td><input type="date" className={isOverdue(task) ? "overdue-input" : ""} value={task.dueDate} onChange={(event) => onTaskUpdate(task.id, { dueDate: event.target.value })} /></td><td>{task.estimate}h</td><td><button onClick={() => onTask(task.id)}><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table></div></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TableView({ data, tasks, onTask, onTaskUpdate, exportCsv }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void; onTaskUpdate: (id: string, patch: Partial<Task>) => void; exportCsv: () => void }) {
  return <div className="table-panel panel"><div className="table-tools"><span>{tasks.length} tasks</span><button onClick={exportCsv}><Download size={14} /> Export CSV</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Select all" /></th><th>Task</th><th>Status</th><th>Assignee</th><th>Priority</th><th>Start</th><th>Due</th><th>Estimate</th><th /></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><input type="checkbox" aria-label={`Select ${task.title}`} /></td><td><button onClick={() => onTask(task.id)}><strong>{task.title}</strong><small>{task.labels.join(" · ")}</small></button></td><td><select className={`table-select ${statusTone[task.status]}`} value={task.status} onChange={(event) => onTaskUpdate(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td><td><span className="table-person"><Avatar member={data.members.find((member) => member.id === task.assigneeId)} small />{data.members.find((member) => member.id === task.assigneeId)?.name}</span></td><td><select className={`table-select ${priorityTone[task.priority]}`} value={task.priority} onChange={(event) => onTaskUpdate(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td><td><input type="date" value={task.startDate} onChange={(event) => onTaskUpdate(task.id, { startDate: event.target.value })} /></td><td><input type="date" className={isOverdue(task) ? "overdue-input" : ""} value={task.dueDate} onChange={(event) => onTaskUpdate(task.id, { dueDate: event.target.value })} /></td><td>{task.estimate}h</td><td><button><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table></div></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CalendarView({ data, tasks, onTask }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => index - firstDay + 1);
  return <div className="calendar-panel panel"><header><div><button><ChevronDown size={15} /></button><h2>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(now)}</h2></div><button className="secondary-button">Today</button></header><div className="calendar-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <strong className="calendar-weekday" key={day}>{day}</strong>)}{cells.map((day, index) => { const inMonth = day > 0 && day <= daysInMonth; const date = inMonth ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : ""; const dayTasks = tasks.filter((task) => task.dueDate === date); return <div className={`calendar-day ${!inMonth ? "muted" : ""} ${day === now.getDate() ? "today" : ""}`} key={index}>{inMonth && <span>{day}</span>}{dayTasks.slice(0, 3).map((task) => <button key={task.id} className={statusTone[task.status]} onClick={() => onTask(task.id)}><i style={{ background: data.members.find((member) => member.id === task.assigneeId)?.color }} />{task.title}</button>)}{dayTasks.length > 3 && <small>+{dayTasks.length - 3} more</small>}</div>; })}</div></div>;
}

function NotificationPanel({ data, close, markAll, openInbox, openSettings }: { data: WorkspaceData; close: () => void; markAll: () => void; openInbox: () => void; openSettings: () => void }) {
  return <div className="notification-panel panel"><header><div><h2>Notifications</h2><span>{data.notifications.filter((item) => !item.read).length} new</span></div><button className="icon-button" onClick={close}><X size={17} /></button></header><button className="mark-read" onClick={markAll}><Check size={14} /> Mark all as read</button><div className="notification-list">{data.notifications.map((notification) => <button key={notification.id} className={!notification.read ? "unread" : ""}><span className={`notification-icon ${notification.tone}`}><Bell size={15} /></span><span><strong>{notification.title}</strong><p>{notification.body}</p><small>{notification.time}</small></span>{!notification.read && <i />}</button>)}</div><footer><button onClick={openInbox}>Open inbox <ArrowRight size={14} /></button><button onClick={openSettings}>Settings</button></footer></div>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AdvancedTaskDrawer({ data, task, currentUserId, close, update, remove, addComment, uploadAttachment, removeAttachment }: { data: WorkspaceData; task: Task; currentUserId: string; close: () => void; update: (id: string, patch: Partial<Task>) => void; remove: (id: string) => void; addComment: (id: string, body: string) => void; uploadAttachment: (id: string, file: File) => Promise<void>; removeAttachment: (id: string, attachment: TaskAttachment) => Promise<void> }) {
  const [comment, setComment] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const comments = task.commentItems ?? [];
  const attachments = task.attachmentItems ?? [];
  const dependencyIds = task.dependencyIds ?? (task.dependencyId ? [task.dependencyId] : []);
  const blockers = dependencyIds.map((id) => data.tasks.find((item) => item.id === id)).filter((item): item is Task => Boolean(item));
  const projectTasks = data.tasks.filter((item) => item.projectId === task.projectId && item.id !== task.id);
  function addSubtask(event: FormEvent) {
    event.preventDefault();
    if (!newSubtask.trim()) return;
    update(task.id, { subtasks: [...task.subtasks, { id: uid("sub"), title: newSubtask.trim(), complete: false, assigneeId: task.assigneeId }] });
    setNewSubtask("");
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    setUploading(true); setFileError("");
    try { await uploadAttachment(task.id, file); } catch (error) { setFileError(error instanceof Error ? error.message : "The file could not be uploaded."); } finally { setUploading(false); }
  }
  return <><button className="drawer-backdrop" aria-label="Close task" onClick={close} /><aside className="task-drawer advanced-drawer"><header><div><span className="breadcrumb">{data.projects.find((project) => project.id === task.projectId)?.name}</span><ChevronRight size={13} /><span>{task.id.slice(0, 8).toUpperCase()}</span></div><div><button className="icon-button" onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/?task=${task.id}`)}><Link2 size={16} /></button><button className="icon-button" onClick={() => remove(task.id)}><Trash2 size={16} /></button><button className="icon-button" onClick={close}><X size={18} /></button></div></header><div className="drawer-body"><div className="drawer-title"><button className={`task-check ${statusTone[task.status]}`} onClick={() => update(task.id, { status: task.status === "Complete" ? "Not Started" : "Complete" })}><StatusIcon status={task.status} /></button><textarea value={task.title} onChange={(event) => update(task.id, { title: event.target.value })} rows={2} /></div><textarea className="description-edit" value={task.description} onChange={(event) => update(task.id, { description: event.target.value })} rows={3} placeholder="Add a description…" /><div className="task-properties"><label><span>Status</span><select value={task.status} onChange={(event) => update(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Assignee</span><select value={task.assigneeId} onChange={(event) => update(task.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label><span>Priority</span><select value={task.priority} onChange={(event) => update(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label><span>Start date</span><input type="date" value={task.startDate} onChange={(event) => update(task.id, { startDate: event.target.value })} /></label><label><span>Due date</span><input type="date" value={task.dueDate} onChange={(event) => update(task.id, { dueDate: event.target.value })} /></label><label><span>Estimate</span><input type="number" min="0" value={task.estimate} onChange={(event) => update(task.id, { estimate: Number(event.target.value) })} /></label><label><span>Milestone</span><select value={task.milestoneId ?? ""} onChange={(event) => update(task.id, { milestoneId: event.target.value || undefined })}><option value="">No milestone</option>{(data.milestones ?? []).filter((item) => item.projectId === task.projectId).map((milestone) => <option value={milestone.id} key={milestone.id}>{milestone.name}</option>)}</select></label><label><span>Repeats</span><select value={task.recurrence?.frequency ?? (task.recurring ? "monthly" : "")} onChange={(event) => update(task.id, { recurring: Boolean(event.target.value), recurrence: event.target.value ? { frequency: event.target.value as "daily" | "weekly" | "monthly", interval: 1 } : undefined, recurrenceGeneratedAt: undefined })}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div>{task.recurrence && <p className="feature-note"><Repeat2 size={14} /> The next occurrence is created once when this task is completed.</p>}<div className="drawer-section"><h3>Dependencies <span>{blockers.filter((item) => item.status !== "Complete").length} blocking</span></h3><details className="dependency-picker"><summary><Link2 size={14} /> Choose tasks this work depends on</summary><div>{projectTasks.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={dependencyIds.includes(candidate.id)} onChange={(event) => update(task.id, { dependencyIds: event.target.checked ? [...dependencyIds, candidate.id] : dependencyIds.filter((id) => id !== candidate.id), dependencyId: undefined })} /><span><strong>{candidate.title}</strong><small>{candidate.status}</small></span></label>)}</div></details>{blockers.map((blocker) => <button className={`blocker-row ${blocker.status === "Complete" ? "resolved" : ""}`} key={blocker.id}><StatusIcon status={blocker.status} /><span>{blocker.title}</span><small>{blocker.status === "Complete" ? "Resolved" : "Blocking"}</small></button>)}</div><div className="drawer-section"><h3>Subtasks <span>{task.subtasks.filter((subtask) => subtask.complete).length}/{task.subtasks.length}</span></h3><div className="subtask-editor">{task.subtasks.map((subtask) => <div className="subtask-edit-row" key={subtask.id}><button className={`mini-check ${subtask.complete ? "complete" : ""}`} onClick={() => update(task.id, { subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, complete: !item.complete } : item) })}>{subtask.complete && <Check size={11} />}</button><input className={subtask.complete ? "done" : ""} value={subtask.title} onChange={(event) => update(task.id, { subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, title: event.target.value } : item) })} aria-label="Subtask title" /><select value={subtask.assigneeId ?? ""} onChange={(event) => update(task.id, { subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, assigneeId: event.target.value || undefined } : item) })} aria-label={`Assignee for ${subtask.title}`}><option value="">Unassigned</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><button className="icon-button" onClick={() => update(task.id, { subtasks: task.subtasks.filter((item) => item.id !== subtask.id) })} aria-label={`Delete ${subtask.title}`}><Trash2 size={13} /></button></div>)}</div><form className="add-subtask-form" onSubmit={addSubtask}><input value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} placeholder="Add a subtask…" /><button disabled={!newSubtask.trim()}><Plus size={14} /> Add</button></form></div><div className="drawer-section"><h3>Attachments <span>{attachments.length || task.attachments}</span></h3><div className="attachment-list">{attachments.map((attachment) => <div key={attachment.id}><Paperclip size={14} /><a href={attachment.url} target="_blank" rel="noreferrer"><strong>{attachment.name}</strong><small>{Math.max(1, Math.round(attachment.size / 1024))} KB · {timeAgo(attachment.createdAt)}</small></a><button className="icon-button" onClick={() => void removeAttachment(task.id, attachment)}><Trash2 size={13} /></button></div>)}</div><label className="attachment-upload secondary-button"><UploadCloud size={14} /> {uploading ? "Uploading…" : "Attach file"}<input type="file" disabled={uploading} onChange={(event) => void chooseFile(event.target.files?.[0])} /></label>{fileError && <p className="form-error">{fileError}</p>}</div><div className="drawer-section"><h3>Comments and activity <span>{comments.length}</span></h3><div className="comment-thread">{comments.map((item) => { const author = data.members.find((member) => member.id === item.authorId); return <div key={item.id}><Avatar member={author} small /><span><p><strong>{author?.name ?? "A teammate"}</strong> {item.body}</p><small>{timeAgo(item.createdAt)}</small></span></div>; })}</div><div className="activity-thread">{(task.activity ?? []).slice(-5).reverse().map((event) => <div key={event.id}><Avatar member={data.members.find((member) => member.id === event.actorId)} small /><span><p>{event.summary}</p><small>{timeAgo(event.createdAt)}</small></span></div>)}</div><div className="comment-box"><Avatar member={data.members.find((member) => member.id === currentUserId)} small /><div><textarea placeholder="Leave a comment or @mention a full name…" value={comment} onChange={(event) => setComment(event.target.value)} /><button disabled={!comment.trim()} onClick={() => { addComment(task.id, comment); setComment(""); }}>Comment</button></div></div></div></div></aside></>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TaskDrawer({ data, task, close, update, remove }: { data: WorkspaceData; task: Task; close: () => void; update: (id: string, patch: Partial<Task>) => void; remove: (id: string) => void }) {
  const [comment, setComment] = useState("");
  return <><button className="drawer-backdrop" aria-label="Close task" onClick={close} /><aside className="task-drawer"><header><div><span className="breadcrumb">{data.projects.find((project) => project.id === task.projectId)?.name}</span><ChevronRight size={13} /><span>{task.id.slice(0, 8).toUpperCase()}</span></div><div><button className="icon-button"><Link2 size={16} /></button><button className="icon-button" onClick={() => remove(task.id)}><Trash2 size={16} /></button><button className="icon-button" onClick={close}><X size={18} /></button></div></header><div className="drawer-body"><div className="drawer-title"><button className={`task-check ${statusTone[task.status]}`} onClick={() => update(task.id, { status: task.status === "Complete" ? "Not Started" : "Complete" })}><StatusIcon status={task.status} /></button><textarea value={task.title} onChange={(event) => update(task.id, { title: event.target.value })} rows={2} /></div><textarea className="description-edit" value={task.description} onChange={(event) => update(task.id, { description: event.target.value })} rows={3} placeholder="Add a description…" /><div className="task-properties"><label><span>Status</span><select value={task.status} onChange={(event) => update(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Assignee</span><select value={task.assigneeId} onChange={(event) => update(task.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label><span>Priority</span><select value={task.priority} onChange={(event) => update(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label><span>Start date</span><input type="date" value={task.startDate} onChange={(event) => update(task.id, { startDate: event.target.value })} /></label><label><span>Due date</span><input type="date" value={task.dueDate} onChange={(event) => update(task.id, { dueDate: event.target.value })} /></label><label><span>Estimate</span><input type="number" min="0" value={task.estimate} onChange={(event) => update(task.id, { estimate: Number(event.target.value) })} /></label></div><div className="drawer-section"><h3>Subtasks <span>{task.subtasks.filter((subtask) => subtask.complete).length}/{task.subtasks.length}</span></h3>{task.subtasks.length ? task.subtasks.map((subtask) => <button key={subtask.id} onClick={() => update(task.id, { subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, complete: !item.complete } : item) })}><span className={`mini-check ${subtask.complete ? "complete" : ""}`}>{subtask.complete && <Check size={11} />}</span><span className={subtask.complete ? "done" : ""}>{subtask.title}</span></button>) : <p className="drawer-empty">No subtasks yet.</p>}<button className="add-subtask" onClick={() => { const title = window.prompt("Subtask name"); if (title) update(task.id, { subtasks: [...task.subtasks, { id: uid("sub"), title, complete: false }] }); }}><Plus size={14} /> Add subtask</button></div><div className="drawer-section"><h3>Activity</h3><div className="activity-comment"><Avatar member={data.members[1]} small /><span><p><strong>Maya Chen</strong> updated the status to <b>{task.status}</b></p><small>Today at 10:24 AM</small></span></div><div className="comment-box"><Avatar member={data.members[0]} small /><div><textarea placeholder="Leave a comment or @mention someone…" value={comment} onChange={(event) => setComment(event.target.value)} /><button disabled={!comment.trim()} onClick={() => { update(task.id, { comments: task.comments + 1 }); setComment(""); }}>Comment</button></div></div></div></div></aside></>;
}

function ModalShell({ title, subtitle, close, children, className = "", dismissible = true }: { title: string; subtitle: string; close: () => void; children: React.ReactNode; className?: string; dismissible?: boolean }) {
  return <div className="modal-layer">{dismissible ? <button className="modal-backdrop" onClick={close} aria-label="Close modal" /> : <div className="modal-backdrop" />}<section className={`modal ${className}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div>{dismissible && <button className="icon-button" onClick={close}><X size={18} /></button>}</header>{children}</section></div>;
}

function TaskModal({ data, projectId, close, save }: { data: WorkspaceData; projectId: string; close: () => void; save: (task: Task) => void }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [status, setStatus] = useState<TaskStatus>("Not Started"); const [priority, setPriority] = useState<Priority>("Medium"); const [assignee, setAssignee] = useState(data.members[0].id); const [dueDate, setDueDate] = useState(today(7)); const [estimate, setEstimate] = useState(2); const [recurrence, setRecurrence] = useState<"" | "daily" | "weekly" | "monthly">("");
  function submit(event: FormEvent) { event.preventDefault(); const timestamp = new Date().toISOString(); save({ id: uid("task"), projectId, title: title.trim(), description: description.trim(), status, priority, assigneeId: assignee, startDate: today(), dueDate, durationDays: inclusiveDuration(today(), dueDate), estimate, labels: [], subtasks: [], comments: 0, attachments: 0, commentItems: [], attachmentItems: [], activity: [], recurring: Boolean(recurrence), recurrence: recurrence ? { frequency: recurrence, interval: 1 } : undefined, createdAt: timestamp, updatedAt: timestamp }); }
  return <ModalShell title="Create a new task" subtitle="Add the essentials now—you can fill in details later." close={close}><form className="modal-form" onSubmit={submit}><label className="wide">Task name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" required /></label><label className="wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, a goal, or acceptance criteria…" rows={3} /></label><div className="form-grid"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>{TASK_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Assignee<select value={assignee} onChange={(event) => setAssignee(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label>Estimate (hours)<input type="number" min="0" max="999" value={estimate} onChange={(event) => setEstimate(Number(event.target.value))} /></label><label>Repeats<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as typeof recurrence)}><option value="">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label></div><footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit"><Plus size={16} /> Create task</button></footer></form></ModalShell>;
}

type StarterTaskDraft = ImportedTask & { id: string; parentDraftId?: string; dependencyDraftIds?: string[]; subtasks?: Task["subtasks"] };

function ProjectModal({ data, close, save, onboarding = false }: { data: WorkspaceData; close: () => void; save: (project: Project, tasks: Task[]) => void; onboarding?: boolean }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6d5bd0");
  const [dueDate, setDueDate] = useState(today(30));
  const [drafts, setDrafts] = useState<StarterTaskDraft[]>([]);
  const [sourceLabel, setSourceLabel] = useState("Blank project");
  const [importNote, setImportNote] = useState("");
  const allTemplates: ProjectTemplate[] = [...projectTemplates, ...(data.customTemplates ?? [])];

  function applyTemplate(template: ProjectTemplate) {
    setSourceLabel(template.name);
    setName(template.id === "blank" ? "" : template.name);
    setDescription(template.id === "blank" ? "" : template.description);
    setColor(template.color);
    setDueDate(today(template.durationDays));
    setDrafts(template.tasks.map((task) => {
      const templateTask = task as typeof task & { subtasks?: CustomTemplate["tasks"][number]["subtasks"] };
      return {
        id: uid("draft"), title: task.title, description: task.description, status: task.status, priority: task.priority,
        assigneeId: data.members[0].id, startDate: today(), dueDate: today(task.dueOffset), durationDays: inclusiveDuration(today(), today(task.dueOffset)), estimate: task.estimate, labels: task.labels,
        subtasks: templateTask.subtasks?.map((subtask) => ({ ...subtask, id: uid("sub"), assigneeId: subtask.assigneeId && data.members.some((member) => member.id === subtask.assigneeId) ? subtask.assigneeId : data.members[0].id })) ?? [],
      };
    }));
    setStep(2);
  }

  function importFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseTaskCsv(String(reader.result ?? ""), data.members, today());
      if (!result.tasks.length) {
        setImportNote(result.warnings[0] ?? "No tasks could be imported.");
        return;
      }
      const draftIds = result.tasks.map(() => uid("draft"));
      setDrafts(result.tasks.map((task, index) => ({
        ...task,
        id: draftIds[index],
        parentDraftId: task.parentIndex === undefined ? undefined : draftIds[task.parentIndex],
        dependencyDraftIds: task.dependencyIndexes?.map((dependencyIndex) => draftIds[dependencyIndex]).filter(Boolean),
      })));
      setSourceLabel(`${file.name} import`);
      setName(file.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
      if (result.projectNotes) setDescription(result.projectNotes);
      setDueDate(result.tasks.map((task) => task.dueDate).sort().at(-1) ?? today(30));
      setImportNote(`${result.tasks.length} task${result.tasks.length === 1 ? "" : "s"} ready${result.skipped ? ` · ${result.skipped} blank row${result.skipped === 1 ? "" : "s"} skipped` : ""}${result.warnings.length ? ` · ${result.warnings[0]}` : ""}`);
      setStep(2);
    };
    reader.readAsText(file);
  }

  function downloadSample() {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([sampleCsv], { type: "text/csv" }));
    link.download = "orbit-task-import-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function addDraft() {
    setDrafts((current) => [...current, { id: uid("draft"), title: "", description: "", status: "Not Started", priority: "Medium", assigneeId: data.members[0].id, startDate: today(), dueDate: dueDate || today(7), durationDays: inclusiveDuration(today(), dueDate || today(7)), estimate: 0, labels: [] }]);
  }

  function updateDraft(id: string, patch: Partial<StarterTaskDraft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }

  const projectStartDate = drafts.map((draft) => draft.startDate).filter(Boolean).sort()[0] ?? today();
  const assignedPeopleCount = new Set(drafts.map((draft) => draft.assigneeId).filter(Boolean)).size;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) {
      if (step === 2 && name.trim() && drafts.every((draft) => draft.title.trim())) setStep(3);
      return;
    }
    const projectId = uid("project");
    const timestamp = new Date().toISOString();
    const project: Project = { id: projectId, name: name.trim(), description: description.trim() || "A new team project.", icon: name.trim().charAt(0).toUpperCase(), color, status: "Planning", startDate: projectStartDate, dueDate, ownerId: data.members[0].id, memberIds: [data.members[0].id] };
    const taskIds = new Map(drafts.map((draft) => [draft.id, uid("task")]));
    const tasks: Task[] = drafts.map((draft) => ({
        id: taskIds.get(draft.id)!,
        projectId,
        title: draft.title.trim(),
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        assigneeId: draft.assigneeId,
        startDate: draft.startDate,
        dueDate: draft.dueDate,
        durationDays: Math.max(1, Math.floor(draft.durationDays)),
        estimate: draft.estimate,
        labels: draft.labels,
        parentTaskId: draft.parentDraftId ? taskIds.get(draft.parentDraftId) : undefined,
        dependencyIds: draft.dependencyDraftIds?.map((dependencyDraftId) => taskIds.get(dependencyDraftId)).filter((id): id is string => Boolean(id)) ?? [],
        subtasks: draft.subtasks ?? [], comments: 0, attachments: 0, commentItems: [], attachmentItems: [], activity: [], createdAt: timestamp, updatedAt: timestamp,
      }));
    save(project, tasks);
  }

  return <ModalShell title={onboarding ? "Set up your first project" : "Create a project"} subtitle={onboarding ? "Choose a template, import your existing work, or start clean." : "Start with a proven plan, your spreadsheet, or a clean slate."} close={close} className="project-setup-modal" dismissible={!onboarding}>
    <div className="setup-progress" aria-label={`Step ${step} of 3`}>{["Start", "Customize", "Review"].map((label, index) => <div className={step >= index + 1 ? "active" : ""} key={label}><span>{step > index + 1 ? <Check size={12} /> : index + 1}</span><small>{label}</small></div>)}</div>
    <form className="modal-form project-setup-form" onSubmit={submit}>
      {step === 1 && <div className="setup-step"><div className="setup-heading"><span><Sparkles size={16} /></span><div><h3>How would you like to start?</h3><p>You can edit every task before the project is created.</p></div></div><div className="template-grid">{allTemplates.map((template) => <button type="button" className="template-card" key={template.id} onClick={() => applyTemplate(template)}><i style={{ background: template.color }}>{template.icon}</i><span><em>{template.category}</em><strong>{template.name}</strong><small>{template.description}</small><b>{template.tasks.length ? `${template.tasks.length} starter tasks` : "Add your own tasks"}</b></span><ChevronRight size={16} /></button>)}</div><div className="csv-import-card"><span className="csv-icon"><FileSpreadsheet size={22} /></span><div><strong>Import a task spreadsheet</strong><p>Upload a CSV and review every row before creating the project.</p><small>Columns: {csvColumns.join(", ")}. Parent tasks, durations, and predecessors are connected automatically.</small>{importNote && <em className="import-note">{importNote}</em>}</div><div className="csv-actions"><label className="primary-button"><UploadCloud size={15} /> Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => importFile(event.target.files?.[0])} /></label><button type="button" className="secondary-button" onClick={downloadSample}><FileDown size={14} /> Sample</button></div></div></div>}
      {step === 2 && <div className="setup-step"><div className="setup-heading"><span><FolderPlus size={16} /></span><div><h3>Customize your project</h3><p>Started from {sourceLabel}. Adjust the details and starter tasks.</p></div></div><div className="project-detail-grid"><label>Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fall campaign" required /></label><label>Target date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label className="wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you trying to accomplish?" rows={2} /></label><label>Project color<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div><div className="starter-task-section"><header><div><h3>Starter tasks <span>{drafts.length}</span></h3><p>Create the first assignments now, or add them later.</p></div><button type="button" className="secondary-button" onClick={addDraft}><Plus size={14} /> Add task</button></header>{drafts.length ? <div className="starter-task-list">{drafts.map((draft, index) => <div className="starter-task-row" key={draft.id}><span className="task-number">{index + 1}</span><input className="starter-title" aria-label={`Task ${index + 1} title`} value={draft.title} onChange={(event) => updateDraft(draft.id, { title: event.target.value })} placeholder="Task name" required /><select aria-label={`Task ${index + 1} status`} value={draft.status} onChange={(event) => updateDraft(draft.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><select aria-label={`Task ${index + 1} priority`} value={draft.priority} onChange={(event) => updateDraft(draft.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><select aria-label={`Task ${index + 1} assignee`} value={draft.assigneeId} onChange={(event) => updateDraft(draft.id, { assigneeId: event.target.value })}><option value="">Unassigned</option>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><input aria-label={`Task ${index + 1} due date`} type="date" value={draft.dueDate} onChange={(event) => updateDraft(draft.id, { dueDate: event.target.value, durationDays: inclusiveDuration(draft.startDate, event.target.value) })} /><button type="button" className="icon-button remove-draft" aria-label={`Remove ${draft.title || `task ${index + 1}`}`} onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}><Trash2 size={15} /></button></div>)}</div> : <button type="button" className="empty-task-state" onClick={addDraft}><Plus size={18} /><strong>Add your first task</strong><small>Projects can also start empty.</small></button>}</div></div>}
      {step === 3 && <div className="setup-step review-step"><div className="setup-heading"><span><CheckCircle2 size={16} /></span><div><h3>Ready to create</h3><p>Here’s what Orbit will add to your workspace.</p></div></div><div className="project-review-card"><i style={{ background: color }}>{name.charAt(0).toUpperCase()}</i><div><span>PROJECT</span><h3>{name}</h3><p>{description || "A new team project."}</p><small><CalendarDays size={13} /> {formatDate(projectStartDate)} – {formatDate(dueDate)}</small></div></div><div className="review-stats"><div><strong>{drafts.length}</strong><span>Starter tasks</span></div><div><strong>{drafts.reduce((sum, draft) => sum + draft.estimate, 0)}h</strong><span>Estimated work</span></div><div><strong>{assignedPeopleCount}</strong><span>People assigned</span></div></div>{drafts.length > 0 && <div className="review-task-list">{drafts.slice(0, 6).map((draft) => <div key={draft.id}><StatusIcon status={draft.status} /><span><strong>{draft.title}</strong><small>{draft.priority} · due {dateLabel(draft.dueDate)}</small></span><Avatar member={data.members.find((member) => member.id === draft.assigneeId)} small /></div>)}{drafts.length > 6 && <p>+ {drafts.length - 6} more tasks</p>}</div>}</div>}
      <footer className="setup-footer">{step === 1 && onboarding ? <span /> : <button type="button" className="secondary-button" onClick={step === 1 ? close : () => setStep((current) => current - 1)}>{step === 1 ? "Cancel" : "Back"}</button>}<span>Step {step} of 3</span>{step === 1 ? <span /> : step === 2 ? <button className="primary-button" type="submit" disabled={!name.trim() || drafts.some((draft) => !draft.title.trim())}>Review project <ArrowRight size={15} /></button> : <button className="primary-button" type="submit"><FolderPlus size={15} /> Create project</button>}</footer>
    </form>
  </ModalShell>;
}

function InviteModal({ dataMode, close, save }: { dataMode: "loading" | "local" | "firestore"; close: () => void; save: (email: string, role: Role) => Promise<void> }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("Member"); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { await save(email.trim(), role); } catch (caught) { setError(caught instanceof Error ? caught.message : "The invitation could not be sent."); setSaving(false); } }
  return <ModalShell title="Invite a teammate" subtitle="They’ll be added after accepting the secure email invitation." close={close}><form className="modal-form" onSubmit={(event) => void submit(event)}><label className="wide">Email address<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" required /></label><label className="wide">Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option>Admin</option><option>Member</option><option>Viewer</option></select><small className="field-help">Members can create and update tasks. Viewers have read-only access.</small></label><div className="invite-note"><UserPlus size={18} /><span><strong>{dataMode === "firestore" ? "Invite-only access" : "Local preview"}</strong><p>{dataMode === "firestore" ? "The invitation remains valid until it is accepted or revoked. Email delivery uses the Firebase Trigger Email extension." : "The teammate is added to this browser demo immediately."}</p></span></div>{error && <p className="form-error">{error}</p>}<footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit" disabled={saving || dataMode === "loading"}>{saving ? "Sending…" : dataMode === "firestore" ? "Send invitation" : "Add demo teammate"} <ArrowRight size={16} /></button></footer></form></ModalShell>;
}
