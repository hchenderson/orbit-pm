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
  Plus,
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
import { FormEvent, useEffect, useMemo, useState } from "react";
import { seedData } from "@/lib/seed";
import { enableFirebaseAnalytics, getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import { parseTaskCsv, type ImportedTask } from "@/lib/csv-import";
import { csvColumns, projectTemplates, sampleCsv, type ProjectTemplate } from "@/lib/project-templates";
import { signOut } from "firebase/auth";
import { dateLabel, daysUntil, filterTasks, isDueToday, isOverdue, PRIORITIES, taskProgress, TASK_STATUSES } from "@/lib/task-utils";
import type { Member, Priority, Project, Role, Task, TaskStatus, ViewMode, WorkspaceData } from "@/lib/types";

const STORAGE_KEY = "orbit-workspace-v1";
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
  const [data, setData] = useState<WorkspaceData>(seedData);
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
  const [toast, setToast] = useState("");
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [section, setSection] = useState<AppSection>("project");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WorkspaceData;
        setData({ ...parsed, settings: { ...seedData.settings!, ...parsed.settings } });
      }
    } catch {
      // A malformed local demo record should never prevent the workspace from loading.
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void enableFirebaseAnalytics();
  }, []);

  useEffect(() => {
    if (loaded) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, loaded]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeProject = data.projects.find((project) => project.id === activeProjectId) ?? data.projects[0];
  const projectTasks = data.tasks.filter((task) => task.projectId === activeProject?.id);
  const visibleTasks = useMemo(() => {
    const base = myTasksOnly ? projectTasks.filter((task) => task.assigneeId === "m1") : projectTasks;
    return filterTasks(base, query, assigneeFilter, priorityFilter);
  }, [projectTasks, query, assigneeFilter, priorityFilter, myTasksOnly]);
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const unreadCount = data.notifications.filter((notification) => !notification.read).length;

  function openSection(next: AppSection) {
    setSection(next);
    setMyTasksOnly(false);
    setSidebarOpen(false);
    setNotificationsOpen(false);
    setProfileMenuOpen(false);
  }

  async function handleSignOut() {
    const auth = getFirebaseAuth();
    if (auth?.currentUser) await signOut(auth);
    window.location.href = "/sign-in";
  }

  function updateTask(taskId: string, patch: Partial<Task>) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task),
    }));
  }

  function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task? This can’t be undone.")) return;
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== taskId) }));
    setSelectedTaskId(null);
    setToast("Task deleted");
  }

  function duplicateProject() {
    if (!activeProject) return;
    const projectId = uid("project");
    const copy: Project = { ...activeProject, id: projectId, name: `${activeProject.name} copy`, status: "Planning" };
    const copies = projectTasks.map((task) => ({ ...task, id: uid("task"), projectId, status: "Not Started" as TaskStatus }));
    setData((current) => ({ ...current, projects: [...current.projects, copy], tasks: [...current.tasks, ...copies] }));
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

  function exportCsv() {
    const header = ["Task", "Status", "Priority", "Assignee", "Start", "Due", "Estimate"];
    const rows = visibleTasks.map((task) => [task.title, task.status, task.priority, data.members.find((member) => member.id === task.assigneeId)?.name ?? "", task.startDate, task.dueDate, task.estimate]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `${activeProject.name.toLowerCase().replaceAll(" ", "-")}-tasks.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("CSV exported");
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#"><span className="brand-mark"><Sparkles size={16} /></span><span>orbit</span></a>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="workspace-switcher">
          <span className="workspace-logo">N</span>
          <span><strong>{data.workspaceName}</strong><small>Team workspace</small></span>
          <ChevronDown size={15} />
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={section === "project" && !myTasksOnly && view === "overview" ? "active" : ""} onClick={() => { setSection("project"); setMyTasksOnly(false); setView("overview"); setSidebarOpen(false); }}><LayoutDashboard size={17} /> Home</button>
          <button className={section === "project" && myTasksOnly ? "active" : ""} onClick={() => { setSection("project"); setMyTasksOnly(true); setView("list"); setSidebarOpen(false); }}><CheckCircle2 size={17} /> My tasks <span className="nav-count">{data.tasks.filter((task) => task.assigneeId === "m1" && task.status !== "Complete").length}</span></button>
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
            <Avatar member={data.members[0]} />
            <span><strong>{data.members[0].name}</strong><small>{data.members[0].role}</small></span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, projects, or people…" /><span><Command size={11} /> K</span></label>
          <div className="topbar-actions">
            <button className="icon-button notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Notifications"><Bell size={18} />{unreadCount > 0 && <i>{unreadCount}</i>}</button>
            <button className="avatar-button" onClick={() => setProfileMenuOpen((value) => !value)} aria-expanded={profileMenuOpen} aria-label="Open account menu"><Avatar member={data.members[0]} small /><ChevronDown size={13} /></button>
          </div>
        </header>

        {section === "project" && <section className="project-header">
          <div className="project-title-row">
            <span className="project-icon-large" style={{ background: activeProject.color }}>{activeProject.icon}</span>
            <div className="project-heading">
              <div><h1>{myTasksOnly ? "My tasks" : activeProject.name}</h1><button className="bare-button"><ChevronDown size={17} /></button></div>
              <p>{myTasksOnly ? `Your open work in ${activeProject.name}` : activeProject.description}</p>
            </div>
            <div className="project-actions">
              <div className="avatar-stack">{activeProject.memberIds.slice(0, 4).map((id) => <Avatar key={id} member={data.members.find((member) => member.id === id)} small />)}</div>
              <button className="secondary-button" onClick={() => setInviteModalOpen(true)}><UserPlus size={16} /> Invite</button>
              <button className="primary-button" onClick={() => setTaskModalOpen(true)}><Plus size={17} /> New task</button>
              <details className="more-menu"><summary className="icon-button"><MoreHorizontal size={18} /></summary><div><button onClick={duplicateProject}><Copy size={15} /> Duplicate project</button><button onClick={exportCsv}><Download size={15} /> Export CSV</button><button onClick={archiveProject}><Archive size={15} /> Archive project</button></div></details>
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
              <label className={assigneeFilter ? "filter-active" : ""}><Users size={14} /><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option value="">Assignee</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><ChevronDown size={12} /></label>
              <label className={priorityFilter ? "filter-active" : ""}><Filter size={14} /><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">Priority</option>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><ChevronDown size={12} /></label>
              {(assigneeFilter || priorityFilter || query) && <button className="clear-filter" onClick={() => { setQuery(""); setAssigneeFilter(""); setPriorityFilter(""); }}>Clear</button>}
            </div>
          </div>
        </section>}

        <section className={`workspace-content ${section !== "project" ? "section-page" : ""}`}>
          {section === "project" && view === "overview" && <Overview data={data} project={activeProject} tasks={visibleTasks} onTask={setSelectedTaskId} />}
          {section === "project" && view === "list" && <ListView data={data} tasks={visibleTasks} onTask={setSelectedTaskId} onStatus={updateTask} />}
          {section === "project" && view === "board" && <BoardView data={data} tasks={visibleTasks} onTask={setSelectedTaskId} onStatus={updateTask} />}
          {section === "project" && view === "timeline" && <TimelineView data={data} project={activeProject} tasks={visibleTasks} onTask={setSelectedTaskId} />}
          {section === "project" && view === "table" && <TableView data={data} tasks={visibleTasks} onTask={setSelectedTaskId} onTaskUpdate={updateTask} exportCsv={exportCsv} />}
          {section === "project" && view === "calendar" && <CalendarView data={data} tasks={visibleTasks} onTask={setSelectedTaskId} />}
          {section === "people" && <PeopleView data={data} invite={() => setInviteModalOpen(true)} updateRole={(memberId, role) => setData((current) => ({ ...current, members: current.members.map((member) => member.id === memberId ? { ...member, role } : member) }))} />}
          {section === "inbox" && <InboxView data={data} markAll={() => setData((current) => ({ ...current, notifications: current.notifications.map((notification) => ({ ...notification, read: true })) }))} markOne={(id) => setData((current) => ({ ...current, notifications: current.notifications.map((notification) => notification.id === id ? { ...notification, read: true } : notification) }))} openSettings={() => openSection("settings")} />}
          {section === "settings" && <SettingsView data={data} update={(patch) => setData((current) => ({ ...current, ...patch }))} notify={setToast} />}
        </section>
      </main>

      {notificationsOpen && <NotificationPanel data={data} close={() => setNotificationsOpen(false)} markAll={() => setData((current) => ({ ...current, notifications: current.notifications.map((notification) => ({ ...notification, read: true })) }))} openInbox={() => openSection("inbox")} openSettings={() => openSection("settings")} />}
      {profileMenuOpen && <ProfileMenu member={data.members[0]} firebaseConnected={isFirebaseConfigured} close={() => setProfileMenuOpen(false)} openSettings={() => openSection("settings")} signOut={() => void handleSignOut()} />}
      {selectedTask && <TaskDrawer data={data} task={selectedTask} close={() => setSelectedTaskId(null)} update={updateTask} remove={deleteTask} />}
      {taskModalOpen && <TaskModal data={data} projectId={activeProject.id} close={() => setTaskModalOpen(false)} save={(task) => { setData((current) => ({ ...current, tasks: [...current.tasks, task] })); setTaskModalOpen(false); setToast("Task created"); }} />}
      {projectModalOpen && <ProjectModal data={data} close={() => setProjectModalOpen(false)} save={(project, tasks) => { setData((current) => ({ ...current, projects: [...current.projects, project], tasks: [...current.tasks, ...tasks] })); setActiveProjectId(project.id); setView(data.settings?.defaultView ?? "overview"); setSection("project"); setProjectModalOpen(false); setToast(`Project created with ${tasks.length} starter task${tasks.length === 1 ? "" : "s"}`); }} />}
      {inviteModalOpen && <InviteModal close={() => setInviteModalOpen(false)} save={(email, role) => { const id = uid("member"); const name = email.split("@")[0].split(/[._-]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "); const member: Member = { id, name, email, initials: name.split(" ").map((word) => word[0]).join("").slice(0, 2), color: "#4d799f", role }; setData((current) => ({ ...current, members: [...current.members, member], projects: current.projects.map((project) => project.id === activeProject.id ? { ...project, memberIds: [...project.memberIds, id] } : project) })); setInviteModalOpen(false); setToast(`Invite ready for ${email}`); }} />}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Overview({ data, project, tasks, onTask }: { data: WorkspaceData; project: Project; tasks: Task[]; onTask: (id: string) => void }) {
  const progress = taskProgress(tasks);
  const overdue = tasks.filter((task) => isOverdue(task));
  const dueToday = tasks.filter((task) => isDueToday(task));
  const upcoming = [...tasks].filter((task) => task.status !== "Complete").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  const active = tasks.filter((task) => task.status === "In Progress" || task.status === "In Review");
  const complete = tasks.filter((task) => task.status === "Complete").length;

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
          <div><Avatar member={data.members[1]} small /><span><strong>Maya Chen</strong> moved <b>Homepage copy</b> to In Progress<small>18 minutes ago</small></span></div>
          <div><Avatar member={data.members[2]} small /><span><strong>Theo Brooks</strong> attached <b>nav-specs.pdf</b><small>1 hour ago</small></span></div>
          <div><Avatar member={data.members[3]} small /><span><strong>Aisha Patel</strong> commented on <b>Accessibility audit</b><small>Yesterday</small></span></div>
        </div>
      </article>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="section-header"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

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

function SettingsView({ data, update, notify }: { data: WorkspaceData; update: (patch: Partial<WorkspaceData>) => void; notify: (message: string) => void }) {
  const settings = data.settings ?? seedData.settings!;
  const [workspaceName, setWorkspaceName] = useState(data.workspaceName);
  function updateSettings(patch: Partial<typeof settings>) { update({ settings: { ...settings, ...patch } }); }
  return <div className="management-page"><SectionHeader eyebrow="Workspace" title="Settings" description="Manage workspace details, defaults, and notifications." action={<span className={`connection-badge ${isFirebaseConfigured ? "connected" : ""}`}><i />{isFirebaseConfigured ? "Firebase configured" : "Demo mode"}</span>} /><div className="settings-layout"><nav className="settings-nav"><button className="active"><Settings size={15} /> General</button><button><Bell size={15} /> Notifications</button><button><ShieldCheck size={15} /> Permissions</button><button><Link2 size={15} /> Integrations</button></nav><div className="settings-content"><section className="settings-card"><header><h2>Workspace details</h2><p>The name and identity your team sees throughout Orbit.</p></header><div className="settings-fields"><label>Workspace name<input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /></label><label>Workspace URL<div className="url-input"><span>orbit.app/</span><input value="northstar-studio" readOnly /></div></label><label>Week starts on<select value={settings.weekStartsOn} onChange={(event) => updateSettings({ weekStartsOn: event.target.value as "Sunday" | "Monday" })}><option>Monday</option><option>Sunday</option></select></label><label>Default project view<select value={settings.defaultView} onChange={(event) => updateSettings({ defaultView: event.target.value as ViewMode })}>{viewOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div><footer><button className="primary-button" onClick={() => { if (workspaceName.trim()) update({ workspaceName: workspaceName.trim() }); notify("Workspace settings saved"); }}>Save changes</button></footer></section><section className="settings-card"><header><h2>Reminders and email</h2><p>Decide how Orbit keeps you and your team informed.</p></header><div className="settings-fields single-column"><label>Default due-date reminder<select value={settings.reminderTiming} onChange={(event) => updateSettings({ reminderTiming: event.target.value as typeof settings.reminderTiming })}><option>1 hour</option><option>1 day</option><option>2 days</option></select></label><Toggle checked={settings.assignmentEmails} onChange={(checked) => updateSettings({ assignmentEmails: checked })} label="Task assignments" description="Email me when a task is assigned to me." /><Toggle checked={settings.mentionEmails} onChange={(checked) => updateSettings({ mentionEmails: checked })} label="Mentions and comments" description="Email me when someone mentions me." /><Toggle checked={settings.overdueEmails} onChange={(checked) => updateSettings({ overdueEmails: checked })} label="Overdue reminders" description="Send a daily reminder for overdue work." /><Toggle checked={settings.dailyDigest} onChange={(checked) => updateSettings({ dailyDigest: checked })} label="Daily digest" description="A morning summary of upcoming and overdue tasks." /></div></section><section className="settings-card firebase-card"><header><h2>Firebase project</h2><p>Client configuration used by this local application.</p></header><dl><div><dt>Project</dt><dd>Orbit-PM</dd></div><div><dt>Project ID</dt><dd>orbit-pm-79c3b</dd></div><div><dt>Authentication</dt><dd>{isFirebaseConfigured ? "SDK connected" : "Not configured"}</dd></div><div><dt>Data mode</dt><dd>Local MVP</dd></div></dl><p className="firebase-note"><CircleAlert size={15} /> Firebase Authentication is configured locally. Shared PostgreSQL data, server authorization, email delivery, and scheduled reminders still require backend implementation.</p></section></div></div></div>;
}

function ProfileMenu({ member, firebaseConnected, close, openSettings, signOut }: { member: Member; firebaseConnected: boolean; close: () => void; openSettings: () => void; signOut: () => void }) {
  return <><button className="popover-scrim" onClick={close} aria-label="Close account menu" /><aside className="profile-menu"><header><Avatar member={member} /><span><strong>{member.name}</strong><small>{member.email}</small></span></header><div className="profile-status"><i className={firebaseConnected ? "connected" : ""} />{firebaseConnected ? "Firebase connected" : "Local demo session"}</div><nav><button onClick={close}><UserRound size={16} /> My profile</button><button onClick={openSettings}><Settings size={16} /> Workspace settings</button><button onClick={signOut}><LogOut size={16} /> Sign out</button></nav></aside></>;
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

function TimelineView({ data, project, tasks, onTask }: { data: WorkspaceData; project: Project; tasks: Task[]; onTask: (id: string) => void }) {
  const projectStart = new Date(`${project.startDate}T12:00:00`).getTime();
  const projectEnd = new Date(`${project.dueDate}T12:00:00`).getTime();
  const span = Math.max(1, projectEnd - projectStart);
  const weeks = Array.from({ length: 6 }, (_, index) => { const date = new Date(projectStart + (span / 5) * index); return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date); });
  return <div className="timeline-view panel"><div className="timeline-header"><div className="timeline-task-col">Task</div><div className="timeline-weeks">{weeks.map((week) => <span key={week}>{week}</span>)}</div></div>{tasks.map((task) => { const left = Math.max(0, ((new Date(`${task.startDate}T12:00:00`).getTime() - projectStart) / span) * 100); const width = Math.max(5, ((new Date(`${task.dueDate}T12:00:00`).getTime() - new Date(`${task.startDate}T12:00:00`).getTime()) / span) * 100); return <button className="timeline-row" key={task.id} onClick={() => onTask(task.id)}><span className="timeline-task-col"><StatusIcon status={task.status} /><span><strong>{task.title}</strong><small>{data.members.find((member) => member.id === task.assigneeId)?.name}</small></span></span><span className="timeline-track"><i className={statusTone[task.status]} style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}><b>{task.estimate}h</b></i></span></button>; })}<div className="timeline-today" style={{ left: `calc(260px + ${Math.max(0, Math.min(100, ((Date.now() - projectStart) / span) * 100))}% * (100% - 260px) / 100)` }}><span>Today</span></div></div>;
}

function TableView({ data, tasks, onTask, onTaskUpdate, exportCsv }: { data: WorkspaceData; tasks: Task[]; onTask: (id: string) => void; onTaskUpdate: (id: string, patch: Partial<Task>) => void; exportCsv: () => void }) {
  return <div className="table-panel panel"><div className="table-tools"><span>{tasks.length} tasks</span><button onClick={exportCsv}><Download size={14} /> Export CSV</button></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Select all" /></th><th>Task</th><th>Status</th><th>Assignee</th><th>Priority</th><th>Start</th><th>Due</th><th>Estimate</th><th /></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><input type="checkbox" aria-label={`Select ${task.title}`} /></td><td><button onClick={() => onTask(task.id)}><strong>{task.title}</strong><small>{task.labels.join(" · ")}</small></button></td><td><select className={`table-select ${statusTone[task.status]}`} value={task.status} onChange={(event) => onTaskUpdate(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td><td><span className="table-person"><Avatar member={data.members.find((member) => member.id === task.assigneeId)} small />{data.members.find((member) => member.id === task.assigneeId)?.name}</span></td><td><select className={`table-select ${priorityTone[task.priority]}`} value={task.priority} onChange={(event) => onTaskUpdate(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td><td><input type="date" value={task.startDate} onChange={(event) => onTaskUpdate(task.id, { startDate: event.target.value })} /></td><td><input type="date" className={isOverdue(task) ? "overdue-input" : ""} value={task.dueDate} onChange={(event) => onTaskUpdate(task.id, { dueDate: event.target.value })} /></td><td>{task.estimate}h</td><td><button><MoreHorizontal size={16} /></button></td></tr>)}</tbody></table></div></div>;
}

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

function TaskDrawer({ data, task, close, update, remove }: { data: WorkspaceData; task: Task; close: () => void; update: (id: string, patch: Partial<Task>) => void; remove: (id: string) => void }) {
  const [comment, setComment] = useState("");
  return <><button className="drawer-backdrop" aria-label="Close task" onClick={close} /><aside className="task-drawer"><header><div><span className="breadcrumb">{data.projects.find((project) => project.id === task.projectId)?.name}</span><ChevronRight size={13} /><span>{task.id.slice(0, 8).toUpperCase()}</span></div><div><button className="icon-button"><Link2 size={16} /></button><button className="icon-button" onClick={() => remove(task.id)}><Trash2 size={16} /></button><button className="icon-button" onClick={close}><X size={18} /></button></div></header><div className="drawer-body"><div className="drawer-title"><button className={`task-check ${statusTone[task.status]}`} onClick={() => update(task.id, { status: task.status === "Complete" ? "Not Started" : "Complete" })}><StatusIcon status={task.status} /></button><textarea value={task.title} onChange={(event) => update(task.id, { title: event.target.value })} rows={2} /></div><textarea className="description-edit" value={task.description} onChange={(event) => update(task.id, { description: event.target.value })} rows={3} placeholder="Add a description…" /><div className="task-properties"><label><span>Status</span><select value={task.status} onChange={(event) => update(task.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label><label><span>Assignee</span><select value={task.assigneeId} onChange={(event) => update(task.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><label><span>Priority</span><select value={task.priority} onChange={(event) => update(task.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label><label><span>Start date</span><input type="date" value={task.startDate} onChange={(event) => update(task.id, { startDate: event.target.value })} /></label><label><span>Due date</span><input type="date" value={task.dueDate} onChange={(event) => update(task.id, { dueDate: event.target.value })} /></label><label><span>Estimate</span><input type="number" min="0" value={task.estimate} onChange={(event) => update(task.id, { estimate: Number(event.target.value) })} /></label></div><div className="drawer-section"><h3>Subtasks <span>{task.subtasks.filter((subtask) => subtask.complete).length}/{task.subtasks.length}</span></h3>{task.subtasks.length ? task.subtasks.map((subtask) => <button key={subtask.id} onClick={() => update(task.id, { subtasks: task.subtasks.map((item) => item.id === subtask.id ? { ...item, complete: !item.complete } : item) })}><span className={`mini-check ${subtask.complete ? "complete" : ""}`}>{subtask.complete && <Check size={11} />}</span><span className={subtask.complete ? "done" : ""}>{subtask.title}</span></button>) : <p className="drawer-empty">No subtasks yet.</p>}<button className="add-subtask" onClick={() => { const title = window.prompt("Subtask name"); if (title) update(task.id, { subtasks: [...task.subtasks, { id: uid("sub"), title, complete: false }] }); }}><Plus size={14} /> Add subtask</button></div><div className="drawer-section"><h3>Activity</h3><div className="activity-comment"><Avatar member={data.members[1]} small /><span><p><strong>Maya Chen</strong> updated the status to <b>{task.status}</b></p><small>Today at 10:24 AM</small></span></div><div className="comment-box"><Avatar member={data.members[0]} small /><div><textarea placeholder="Leave a comment or @mention someone…" value={comment} onChange={(event) => setComment(event.target.value)} /><button disabled={!comment.trim()} onClick={() => { update(task.id, { comments: task.comments + 1 }); setComment(""); }}>Comment</button></div></div></div></div></aside></>;
}

function ModalShell({ title, subtitle, close, children, className = "" }: { title: string; subtitle: string; close: () => void; children: React.ReactNode; className?: string }) {
  return <div className="modal-layer"><button className="modal-backdrop" onClick={close} aria-label="Close modal" /><section className={`modal ${className}`}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={close}><X size={18} /></button></header>{children}</section></div>;
}

function TaskModal({ data, projectId, close, save }: { data: WorkspaceData; projectId: string; close: () => void; save: (task: Task) => void }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [status, setStatus] = useState<TaskStatus>("Not Started"); const [priority, setPriority] = useState<Priority>("Medium"); const [assignee, setAssignee] = useState(data.members[0].id); const [dueDate, setDueDate] = useState(today(7)); const [estimate, setEstimate] = useState(2);
  function submit(event: FormEvent) { event.preventDefault(); const timestamp = new Date().toISOString(); save({ id: uid("task"), projectId, title: title.trim(), description: description.trim(), status, priority, assigneeId: assignee, startDate: today(), dueDate, estimate, labels: [], subtasks: [], comments: 0, attachments: 0, createdAt: timestamp, updatedAt: timestamp }); }
  return <ModalShell title="Create a new task" subtitle="Add the essentials now—you can fill in details later." close={close}><form className="modal-form" onSubmit={submit}><label className="wide">Task name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" required /></label><label className="wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, a goal, or acceptance criteria…" rows={3} /></label><div className="form-grid"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>{TASK_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>{PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Assignee<select value={assignee} onChange={(event) => setAssignee(event.target.value)}>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label>Estimate (hours)<input type="number" min="0" max="999" value={estimate} onChange={(event) => setEstimate(Number(event.target.value))} /></label></div><footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit"><Plus size={16} /> Create task</button></footer></form></ModalShell>;
}

type StarterTaskDraft = ImportedTask & { id: string };

function ProjectModal({ data, close, save }: { data: WorkspaceData; close: () => void; save: (project: Project, tasks: Task[]) => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6d5bd0");
  const [dueDate, setDueDate] = useState(today(30));
  const [drafts, setDrafts] = useState<StarterTaskDraft[]>([]);
  const [sourceLabel, setSourceLabel] = useState("Blank project");
  const [importNote, setImportNote] = useState("");

  function applyTemplate(template: ProjectTemplate) {
    setSourceLabel(template.name);
    setName(template.id === "blank" ? "" : template.name);
    setDescription(template.id === "blank" ? "" : template.description);
    setColor(template.color);
    setDueDate(today(template.durationDays));
    setDrafts(template.tasks.map((task) => ({
      id: uid("draft"), title: task.title, description: task.description, status: task.status, priority: task.priority,
      assigneeId: data.members[0].id, startDate: today(), dueDate: today(task.dueOffset), estimate: task.estimate, labels: task.labels,
    })));
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
      setDrafts(result.tasks.map((task) => ({ ...task, id: uid("draft") })));
      setSourceLabel(`${file.name} import`);
      setName(file.name.replace(/\.csv$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
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
    setDrafts((current) => [...current, { id: uid("draft"), title: "", description: "", status: "Not Started", priority: "Medium", assigneeId: data.members[0].id, startDate: today(), dueDate: dueDate || today(7), estimate: 0, labels: [] }]);
  }

  function updateDraft(id: string, patch: Partial<StarterTaskDraft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) {
      if (step === 2 && name.trim() && drafts.every((draft) => draft.title.trim())) setStep(3);
      return;
    }
    const projectId = uid("project");
    const timestamp = new Date().toISOString();
    const project: Project = { id: projectId, name: name.trim(), description: description.trim() || "A new team project.", icon: name.trim().charAt(0).toUpperCase(), color, status: "Planning", startDate: today(), dueDate, ownerId: data.members[0].id, memberIds: [data.members[0].id] };
    const tasks: Task[] = drafts.map((draft) => ({ ...draft, id: uid("task"), projectId, title: draft.title.trim(), subtasks: [], comments: 0, attachments: 0, createdAt: timestamp, updatedAt: timestamp }));
    save(project, tasks);
  }

  return <ModalShell title="Create a project" subtitle="Start with a proven plan, your spreadsheet, or a clean slate." close={close} className="project-setup-modal">
    <div className="setup-progress" aria-label={`Step ${step} of 3`}>{["Start", "Customize", "Review"].map((label, index) => <div className={step >= index + 1 ? "active" : ""} key={label}><span>{step > index + 1 ? <Check size={12} /> : index + 1}</span><small>{label}</small></div>)}</div>
    <form className="modal-form project-setup-form" onSubmit={submit}>
      {step === 1 && <div className="setup-step"><div className="setup-heading"><span><Sparkles size={16} /></span><div><h3>How would you like to start?</h3><p>You can edit every task before the project is created.</p></div></div><div className="template-grid">{projectTemplates.map((template) => <button type="button" className="template-card" key={template.id} onClick={() => applyTemplate(template)}><i style={{ background: template.color }}>{template.icon}</i><span><em>{template.category}</em><strong>{template.name}</strong><small>{template.description}</small><b>{template.tasks.length ? `${template.tasks.length} starter tasks` : "Add your own tasks"}</b></span><ChevronRight size={16} /></button>)}</div><div className="csv-import-card"><span className="csv-icon"><FileSpreadsheet size={22} /></span><div><strong>Import a task spreadsheet</strong><p>Upload a CSV and review every row before creating the project.</p><small>Columns: {csvColumns.join(", ")}</small>{importNote && <em className="import-note">{importNote}</em>}</div><div className="csv-actions"><label className="primary-button"><UploadCloud size={15} /> Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => importFile(event.target.files?.[0])} /></label><button type="button" className="secondary-button" onClick={downloadSample}><FileDown size={14} /> Sample</button></div></div></div>}
      {step === 2 && <div className="setup-step"><div className="setup-heading"><span><FolderPlus size={16} /></span><div><h3>Customize your project</h3><p>Started from {sourceLabel}. Adjust the details and starter tasks.</p></div></div><div className="project-detail-grid"><label>Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Fall campaign" required /></label><label>Target date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label className="wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What are you trying to accomplish?" rows={2} /></label><label>Project color<input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div><div className="starter-task-section"><header><div><h3>Starter tasks <span>{drafts.length}</span></h3><p>Create the first assignments now, or add them later.</p></div><button type="button" className="secondary-button" onClick={addDraft}><Plus size={14} /> Add task</button></header>{drafts.length ? <div className="starter-task-list">{drafts.map((draft, index) => <div className="starter-task-row" key={draft.id}><span className="task-number">{index + 1}</span><input className="starter-title" aria-label={`Task ${index + 1} title`} value={draft.title} onChange={(event) => updateDraft(draft.id, { title: event.target.value })} placeholder="Task name" required /><select aria-label={`Task ${index + 1} status`} value={draft.status} onChange={(event) => updateDraft(draft.id, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><select aria-label={`Task ${index + 1} priority`} value={draft.priority} onChange={(event) => updateDraft(draft.id, { priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select><select aria-label={`Task ${index + 1} assignee`} value={draft.assigneeId} onChange={(event) => updateDraft(draft.id, { assigneeId: event.target.value })}>{data.members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select><input aria-label={`Task ${index + 1} due date`} type="date" value={draft.dueDate} onChange={(event) => updateDraft(draft.id, { dueDate: event.target.value })} /><button type="button" className="icon-button remove-draft" aria-label={`Remove ${draft.title || `task ${index + 1}`}`} onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}><Trash2 size={15} /></button></div>)}</div> : <button type="button" className="empty-task-state" onClick={addDraft}><Plus size={18} /><strong>Add your first task</strong><small>Projects can also start empty.</small></button>}</div></div>}
      {step === 3 && <div className="setup-step review-step"><div className="setup-heading"><span><CheckCircle2 size={16} /></span><div><h3>Ready to create</h3><p>Here’s what Orbit will add to your workspace.</p></div></div><div className="project-review-card"><i style={{ background: color }}>{name.charAt(0).toUpperCase()}</i><div><span>PROJECT</span><h3>{name}</h3><p>{description || "A new team project."}</p><small><CalendarDays size={13} /> {formatDate(today())} – {formatDate(dueDate)}</small></div></div><div className="review-stats"><div><strong>{drafts.length}</strong><span>Starter tasks</span></div><div><strong>{drafts.reduce((sum, draft) => sum + draft.estimate, 0)}h</strong><span>Estimated work</span></div><div><strong>{new Set(drafts.map((draft) => draft.assigneeId)).size || 1}</strong><span>People assigned</span></div></div>{drafts.length > 0 && <div className="review-task-list">{drafts.slice(0, 6).map((draft) => <div key={draft.id}><StatusIcon status={draft.status} /><span><strong>{draft.title}</strong><small>{draft.priority} · due {dateLabel(draft.dueDate)}</small></span><Avatar member={data.members.find((member) => member.id === draft.assigneeId)} small /></div>)}{drafts.length > 6 && <p>+ {drafts.length - 6} more tasks</p>}</div>}</div>}
      <footer className="setup-footer"><button type="button" className="secondary-button" onClick={step === 1 ? close : () => setStep((current) => current - 1)}>{step === 1 ? "Cancel" : "Back"}</button><span>Step {step} of 3</span>{step === 1 ? <span /> : step === 2 ? <button className="primary-button" type="submit" disabled={!name.trim() || drafts.some((draft) => !draft.title.trim())}>Review project <ArrowRight size={15} /></button> : <button className="primary-button" type="submit"><FolderPlus size={15} /> Create project</button>}</footer>
    </form>
  </ModalShell>;
}

function InviteModal({ close, save }: { close: () => void; save: (email: string, role: Role) => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("Member");
  return <ModalShell title="Invite a teammate" subtitle="They’ll be added to this project and your workspace." close={close}><form className="modal-form" onSubmit={(event) => { event.preventDefault(); save(email.trim(), role); }}><label className="wide">Email address<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" required /></label><label className="wide">Role<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option>Admin</option><option>Member</option><option>Viewer</option></select><small className="field-help">Members can create and update tasks. Viewers have read-only access.</small></label><div className="invite-note"><UserPlus size={18} /><span><strong>Local preview</strong><p>The teammate is added to the demo immediately. Connect Firebase email delivery before production invitations.</p></span></div><footer><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" type="submit">Send invite <ArrowRight size={16} /></button></footer></form></ModalShell>;
}
