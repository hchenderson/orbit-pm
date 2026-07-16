export type TaskStatus = "Not Started" | "In Progress" | "Blocked" | "In Review" | "Complete";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type Role = "Owner" | "Admin" | "Member" | "Viewer";
export type ViewMode = "overview" | "list" | "board" | "timeline" | "table" | "calendar";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface WorkspaceSettings {
  defaultView: ViewMode;
  reminderTiming: "1 hour" | "1 day" | "2 days";
  reminderDaysBefore: number;
  reminderTime: string;
  timezone: string;
  dailyDigestTime: string;
  reminderEmail: boolean;
  reminderInApp: boolean;
  dailyDigest: boolean;
  assignmentEmails: boolean;
  mentionEmails: boolean;
  overdueEmails: boolean;
  weekStartsOn: "Sunday" | "Monday";
}

export interface UserNotificationPreferences {
  reminderDaysBefore: number;
  reminderTime: string;
  timezone: string;
  dailyDigestTime: string;
  reminderEmail: boolean;
  reminderInApp: boolean;
  dailyDigest: boolean;
  assignmentEmails: boolean;
  mentionEmails: boolean;
  overdueEmails: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  role: Role;
  preferences?: UserNotificationPreferences;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: "Planning" | "Active" | "On Hold" | "Complete";
  startDate: string;
  dueDate: string;
  ownerId: string;
  memberIds: string[];
  archived?: boolean;
}

export interface TaskSubtask {
  id: string;
  title: string;
  complete: boolean;
  assigneeId?: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  path: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  actorId: string;
  kind: "created" | "updated" | "commented" | "attached" | "completed";
  summary: string;
  createdAt: string;
}

export interface TaskRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  estimate: number;
  labels: string[];
  subtasks: TaskSubtask[];
  comments: number;
  attachments: number;
  commentItems?: TaskComment[];
  attachmentItems?: TaskAttachment[];
  activity?: ActivityEvent[];
  recurring?: boolean;
  recurrence?: TaskRecurrence;
  recurrenceGeneratedAt?: string;
  dependencyId?: string;
  dependencyIds?: string[];
  milestoneId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  dueDate: string;
  description: string;
  complete: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  projectId: string;
  ownerId: string;
  view: ViewMode;
  query: string;
  assigneeId: string;
  priority: Priority | "";
}

export interface CustomTemplateTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueOffset: number;
  estimate: number;
  labels: string[];
  subtasks: Omit<TaskSubtask, "id">[];
}

export interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: "Custom";
  durationDays: number;
  ownerId: string;
  tasks: CustomTemplateTask[];
}

export interface WorkspaceInvitation {
  id: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  createdBy: string;
  inviterName: string;
  acceptedAt?: string;
  revokedAt?: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  tone: "purple" | "amber" | "red" | "green";
  recipientId?: string;
  taskId?: string;
}

export interface WorkspaceData {
  workspaceName: string;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  notifications: Notification[];
  milestones: Milestone[];
  savedViews: SavedView[];
  customTemplates: CustomTemplate[];
  settings?: WorkspaceSettings;
}
