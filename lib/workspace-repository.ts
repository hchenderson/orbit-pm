import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { seedData } from "./seed";
import type { Member, Notification, Project, Task, WorkspaceData } from "./types";

type CollectionName = "members" | "projects" | "tasks" | "notifications";

interface WorkspaceDocument {
  workspaceName: string;
  ownerId: string;
  settings: WorkspaceData["settings"];
  createdAt: string;
  updatedAt: string;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "U";
}

function initialWorkspace(user: User): WorkspaceData {
  const name = user.displayName?.trim() || user.email?.split("@")[0] || "Orbit User";
  const member: Member = {
    id: user.uid,
    name,
    email: user.email ?? "",
    initials: initials(name),
    color: "#6857d9",
    role: "Owner",
    preferences: {
      reminderHoursBefore: 24,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      dailyDigestTime: "08:00",
      reminderEmail: true,
      reminderInApp: true,
      dailyDigest: true,
      assignmentEmails: true,
      mentionEmails: true,
      overdueEmails: true,
    },
  };
  return {
    workspaceName: `${name.split(" ")[0]}’s Workspace`,
    settings: { ...seedData.settings!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || seedData.settings!.timezone },
    members: [member],
    projects: [],
    tasks: [],
    notifications: [],
  };
}

function workspaceIdFor(user: User) {
  return `workspace_${user.uid}`;
}

function withoutUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function ensureUserWorkspace(db: Firestore, user: User) {
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);
  const existingWorkspaceId = existing.data()?.defaultWorkspaceId as string | undefined;
  if (existingWorkspaceId) return existingWorkspaceId;

  const workspaceId = workspaceIdFor(user);
  const data = initialWorkspace(user);
  const timestamp = new Date().toISOString();
  const identityBatch = writeBatch(db);
  identityBatch.set(userRef, { displayName: data.members[0].name, email: data.members[0].email, defaultWorkspaceId: workspaceId, createdAt: timestamp, updatedAt: timestamp });
  identityBatch.set(doc(db, "workspaces", workspaceId), { workspaceName: data.workspaceName, ownerId: user.uid, settings: data.settings, createdAt: timestamp, updatedAt: timestamp } satisfies WorkspaceDocument);
  identityBatch.set(doc(db, "workspaces", workspaceId, "members", user.uid), data.members[0]);
  await identityBatch.commit();

  const contentBatch = writeBatch(db);
  for (const project of data.projects) contentBatch.set(doc(db, "workspaces", workspaceId, "projects", project.id), project);
  for (const task of data.tasks) contentBatch.set(doc(db, "workspaces", workspaceId, "tasks", task.id), withoutUndefined(task));
  for (const notification of data.notifications) contentBatch.set(doc(db, "workspaces", workspaceId, "notifications", notification.id), { ...notification, recipientId: user.uid });
  await contentBatch.commit();
  return workspaceId;
}

export function subscribeToWorkspace(db: Firestore, workspaceId: string, userId: string, onData: (data: WorkspaceData) => void, onError: (error: Error) => void): Unsubscribe {
  let workspace: WorkspaceDocument | null = null;
  let members: Member[] = [];
  let projects: Project[] = [];
  let tasks: Task[] = [];
  let notifications: Notification[] = [];
  const ready = new Set<string>();

  function emit(key: string) {
    ready.add(key);
    if (workspace && ready.size === 5) onData({ workspaceName: workspace.workspaceName, settings: workspace.settings, members, projects, tasks, notifications });
  }

  const fail = (error: Error) => onError(error);
  const unsubscribes = [
    onSnapshot(doc(db, "workspaces", workspaceId), (snapshot) => { workspace = snapshot.data() as WorkspaceDocument; emit("workspace"); }, fail),
    onSnapshot(collection(db, "workspaces", workspaceId, "members"), (snapshot) => { members = snapshot.docs.map((item) => item.data() as Member); emit("members"); }, fail),
    onSnapshot(collection(db, "workspaces", workspaceId, "projects"), (snapshot) => { projects = snapshot.docs.map((item) => item.data() as Project); emit("projects"); }, fail),
    onSnapshot(collection(db, "workspaces", workspaceId, "tasks"), (snapshot) => { tasks = snapshot.docs.map((item) => item.data() as Task); emit("tasks"); }, fail),
    onSnapshot(query(collection(db, "workspaces", workspaceId, "notifications"), where("recipientId", "==", userId)), (snapshot) => { notifications = snapshot.docs.map((item) => { const value = item.data(); return { id: value.id, title: value.title, body: value.body, time: value.time, read: value.read, tone: value.tone } as Notification; }); emit("notifications"); }, fail),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

function recordMap<T extends { id: string }>(items: T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

async function syncCollection<T extends { id: string }>(db: Firestore, workspaceId: string, name: CollectionName, previous: T[], next: T[], decorate?: (item: T) => object) {
  const before = recordMap(previous);
  const after = recordMap(next);
  const operations: Promise<void>[] = [];
  for (const [id, item] of after) {
    if (JSON.stringify(before.get(id)) !== JSON.stringify(item)) {
      operations.push(setDoc(doc(db, "workspaces", workspaceId, name, id), withoutUndefined(decorate ? decorate(item) : item)));
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) operations.push(deleteDoc(doc(db, "workspaces", workspaceId, name, id)));
  }
  await Promise.all(operations);
}

export async function syncWorkspace(db: Firestore, workspaceId: string, userId: string, previous: WorkspaceData, next: WorkspaceData) {
  const timestamp = new Date().toISOString();
  const operations: Promise<unknown>[] = [];
  if (previous.workspaceName !== next.workspaceName || JSON.stringify(previous.settings) !== JSON.stringify(next.settings)) {
    operations.push(setDoc(doc(db, "workspaces", workspaceId), { workspaceName: next.workspaceName, settings: next.settings, updatedAt: timestamp }, { merge: true }));
  }
  operations.push(syncCollection(db, workspaceId, "members", previous.members, next.members));
  operations.push(syncCollection(db, workspaceId, "projects", previous.projects, next.projects));
  operations.push(syncCollection(db, workspaceId, "tasks", previous.tasks, next.tasks));
  operations.push(syncCollection(db, workspaceId, "notifications", previous.notifications, next.notifications, (notification) => ({ ...notification, recipientId: userId })));
  await Promise.all(operations);
}
