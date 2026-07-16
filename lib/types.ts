export type TaskStatus = "Not Started" | "In Progress" | "Blocked" | "In Review" | "Complete";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type Role = "Owner" | "Admin" | "Member" | "Viewer";
export type ViewMode = "overview" | "list" | "board" | "timeline" | "table" | "calendar";

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
  subtasks: { id: string; title: string; complete: boolean }[];
  comments: number;
  attachments: number;
  recurring?: boolean;
  dependencyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  tone: "purple" | "amber" | "red" | "green";
}

export interface WorkspaceData {
  workspaceName: string;
  members: Member[];
  projects: Project[];
  tasks: Task[];
  notifications: Notification[];
  settings?: WorkspaceSettings;
}
