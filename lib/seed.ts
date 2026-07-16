import type { WorkspaceData } from "./types";

function dateFromToday(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

const now = new Date().toISOString();

export const seedData: WorkspaceData = {
  workspaceName: "Northstar Studio",
  settings: {
    defaultView: "overview",
    reminderTiming: "1 day",
    reminderDaysBefore: 1,
    reminderTime: "09:00",
    timezone: "America/New_York",
    dailyDigestTime: "08:00",
    reminderEmail: true,
    reminderInApp: true,
    dailyDigest: true,
    assignmentEmails: true,
    mentionEmails: true,
    overdueEmails: true,
    weekStartsOn: "Monday",
  },
  members: [
    { id: "m1", name: "Carter Henderson", email: "carter@example.com", initials: "CH", color: "#6857d9", role: "Owner" },
    { id: "m2", name: "Maya Chen", email: "maya@example.com", initials: "MC", color: "#dd7c52", role: "Admin" },
    { id: "m3", name: "Theo Brooks", email: "theo@example.com", initials: "TB", color: "#2e8a72", role: "Member" },
    { id: "m4", name: "Aisha Patel", email: "aisha@example.com", initials: "AP", color: "#c15f8d", role: "Member" },
  ],
  projects: [
    { id: "p1", name: "Website Redesign", description: "Refresh the marketing site and launch the new brand story.", icon: "W", color: "#6d5bd0", status: "Active", startDate: dateFromToday(-18), dueDate: dateFromToday(18), ownerId: "m1", memberIds: ["m1", "m2", "m3", "m4"] },
    { id: "p2", name: "Mobile App", description: "Ship the first customer-ready mobile experience.", icon: "M", color: "#2f8b72", status: "Active", startDate: dateFromToday(-7), dueDate: dateFromToday(39), ownerId: "m2", memberIds: ["m1", "m2", "m4"] },
    { id: "p3", name: "Q3 Campaign", description: "Plan and deliver the autumn product campaign.", icon: "Q", color: "#d1764d", status: "Planning", startDate: dateFromToday(9), dueDate: dateFromToday(62), ownerId: "m1", memberIds: ["m1", "m3"] },
  ],
  tasks: [
    { id: "t1", projectId: "p1", title: "Finalize homepage copy", description: "Review the latest positioning and approve the final content pass.", status: "In Progress", priority: "High", assigneeId: "m2", startDate: dateFromToday(-4), dueDate: dateFromToday(0), estimate: 4, labels: ["Content", "Launch"], subtasks: [{ id: "s1", title: "Review value proposition", complete: true, assigneeId: "m2" }, { id: "s2", title: "Approve customer quotes", complete: false, assigneeId: "m1" }], comments: 1, attachments: 0, commentItems: [{ id: "c1", authorId: "m1", body: "@Maya Chen The final review notes are ready.", mentions: ["m2"], createdAt: now, updatedAt: now }], activity: [{ id: "a1", actorId: "m1", kind: "commented", summary: "commented on Finalize homepage copy", createdAt: now }], milestoneId: "milestone-launch", createdAt: now, updatedAt: now },
    { id: "t2", projectId: "p1", title: "Build responsive navigation", description: "Implement the new desktop and mobile navigation states.", status: "In Review", priority: "High", assigneeId: "m3", startDate: dateFromToday(-6), dueDate: dateFromToday(1), estimate: 8, labels: ["Engineering"], subtasks: [], comments: 7, attachments: 1, dependencyId: "t5", createdAt: now, updatedAt: now },
    { id: "t3", projectId: "p1", title: "Accessibility audit", description: "Run keyboard, contrast, and screen reader checks on key pages.", status: "Not Started", priority: "Medium", assigneeId: "m4", startDate: dateFromToday(2), dueDate: dateFromToday(6), estimate: 6, labels: ["QA"], subtasks: [], comments: 1, attachments: 0, createdAt: now, updatedAt: now },
    { id: "t4", projectId: "p1", title: "Optimize launch imagery", description: "Export and compress approved photography for all breakpoints.", status: "Blocked", priority: "Urgent", assigneeId: "m2", startDate: dateFromToday(-2), dueDate: dateFromToday(-1), estimate: 3, labels: ["Design", "Blocked"], subtasks: [], comments: 5, attachments: 4, createdAt: now, updatedAt: now },
    { id: "t5", projectId: "p1", title: "Approve visual direction", description: "Stakeholder sign-off for the final homepage direction.", status: "Complete", priority: "High", assigneeId: "m1", startDate: dateFromToday(-12), dueDate: dateFromToday(-7), estimate: 2, labels: ["Design"], subtasks: [], comments: 8, attachments: 3, createdAt: now, updatedAt: now },
    { id: "t6", projectId: "p1", title: "Configure analytics events", description: "Map and implement the launch measurement plan.", status: "In Progress", priority: "Medium", assigneeId: "m3", startDate: dateFromToday(0), dueDate: dateFromToday(8), estimate: 5, labels: ["Engineering", "Analytics"], subtasks: [], comments: 2, attachments: 0, recurring: true, recurrence: { frequency: "monthly", interval: 1 }, createdAt: now, updatedAt: now },
    { id: "t7", projectId: "p1", title: "Prepare launch checklist", description: "Create the go-live and rollback checklist.", status: "Not Started", priority: "Medium", assigneeId: "m1", startDate: dateFromToday(5), dueDate: dateFromToday(11), estimate: 3, labels: ["Launch"], subtasks: [], comments: 0, attachments: 0, createdAt: now, updatedAt: now },
    { id: "t8", projectId: "p2", title: "Prototype onboarding flow", description: "Create a tappable onboarding prototype for user testing.", status: "In Progress", priority: "High", assigneeId: "m4", startDate: dateFromToday(-3), dueDate: dateFromToday(4), estimate: 8, labels: ["Mobile", "Design"], subtasks: [], comments: 3, attachments: 2, createdAt: now, updatedAt: now },
    { id: "t9", projectId: "p2", title: "Define notification model", description: "Document push notification permissions and event rules.", status: "Not Started", priority: "Medium", assigneeId: "m2", startDate: dateFromToday(3), dueDate: dateFromToday(12), estimate: 5, labels: ["Mobile"], subtasks: [], comments: 0, attachments: 0, createdAt: now, updatedAt: now },
    { id: "t10", projectId: "p3", title: "Draft campaign brief", description: "Align audience, promise, channels, and success measures.", status: "In Progress", priority: "High", assigneeId: "m1", startDate: dateFromToday(1), dueDate: dateFromToday(10), estimate: 4, labels: ["Campaign"], subtasks: [], comments: 2, attachments: 1, createdAt: now, updatedAt: now },
  ],
  notifications: [
    { id: "n1", title: "Task due today", body: "Finalize homepage copy is due today", time: "12 min ago", read: false, tone: "amber" },
    { id: "n2", title: "Maya mentioned you", body: "Can you review the final homepage direction?", time: "1 hr ago", read: false, tone: "purple" },
    { id: "n3", title: "Task blocked", body: "Optimize launch imagery needs attention", time: "Yesterday", read: true, tone: "red" },
  ],
  milestones: [
    { id: "milestone-launch", projectId: "p1", name: "Website launch", dueDate: dateFromToday(18), description: "Public launch readiness", complete: false },
  ],
  savedViews: [],
  customTemplates: [],
};
