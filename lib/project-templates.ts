import type { Priority, TaskStatus } from "./types";

export interface StarterTask {
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  estimate: number;
  dueOffset: number;
  labels: string[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  durationDays: number;
  tasks: StarterTask[];
}

const task = (
  title: string,
  dueOffset: number,
  priority: Priority = "Medium",
  estimate = 3,
  labels: string[] = [],
  description = "",
): StarterTask => ({ title, dueOffset, priority, estimate, labels, description, status: "Not Started" });

export const projectTemplates: ProjectTemplate[] = [
  {
    id: "blank",
    name: "Blank project",
    category: "Flexible",
    description: "Start with the essentials and add tasks as you go.",
    icon: "B",
    color: "#6d5bd0",
    durationDays: 30,
    tasks: [],
  },
  {
    id: "product-launch",
    name: "Product launch",
    category: "Product",
    description: "Coordinate positioning, launch readiness, enablement, and follow-up.",
    icon: "P",
    color: "#6d5bd0",
    durationDays: 42,
    tasks: [
      task("Confirm launch goals and success metrics", 3, "High", 3, ["Strategy"]),
      task("Finalize positioning and key messages", 8, "High", 5, ["Marketing"]),
      task("Complete product readiness review", 14, "Urgent", 6, ["Product", "Launch"]),
      task("Prepare sales enablement materials", 20, "Medium", 8, ["Sales"]),
      task("Build launch campaign assets", 25, "High", 12, ["Creative"]),
      task("Run launch-day rehearsal", 32, "High", 3, ["Launch"]),
      task("Publish product and campaign", 35, "Urgent", 4, ["Launch"]),
      task("Review first-week performance", 42, "Medium", 3, ["Analytics"]),
    ],
  },
  {
    id: "website-redesign",
    name: "Website redesign",
    category: "Creative",
    description: "Move from discovery through design, build, QA, and launch.",
    icon: "W",
    color: "#4f78b5",
    durationDays: 56,
    tasks: [
      task("Audit current site and analytics", 5, "High", 6, ["Discovery"]),
      task("Approve sitemap and user journeys", 12, "High", 5, ["UX"]),
      task("Finalize page content", 20, "High", 10, ["Content"]),
      task("Approve visual design system", 26, "High", 8, ["Design"]),
      task("Build responsive page templates", 38, "High", 18, ["Engineering"]),
      task("Complete accessibility and browser QA", 47, "Urgent", 10, ["QA"]),
      task("Prepare redirects and launch checklist", 52, "Medium", 5, ["Launch"]),
      task("Launch and monitor", 56, "Urgent", 4, ["Launch"]),
    ],
  },
  {
    id: "marketing-campaign",
    name: "Marketing campaign",
    category: "Marketing",
    description: "Plan, produce, launch, and measure a multi-channel campaign.",
    icon: "M",
    color: "#d1764d",
    durationDays: 35,
    tasks: [
      task("Approve campaign brief", 4, "High", 4, ["Strategy"]),
      task("Define audiences and channel plan", 8, "High", 5, ["Planning"]),
      task("Draft campaign copy", 14, "Medium", 7, ["Content"]),
      task("Produce creative assets", 21, "High", 12, ["Creative"]),
      task("Build and QA campaign journeys", 27, "High", 8, ["Operations"]),
      task("Launch campaign", 30, "Urgent", 3, ["Launch"]),
      task("Report results and learnings", 35, "Medium", 4, ["Analytics"]),
    ],
  },
  {
    id: "client-onboarding",
    name: "Client onboarding",
    category: "Operations",
    description: "Create a consistent, welcoming handoff from sale to delivery.",
    icon: "C",
    color: "#2f8b72",
    durationDays: 21,
    tasks: [
      task("Confirm stakeholders and communication plan", 2, "High", 2, ["Client"]),
      task("Collect access, files, and requirements", 5, "High", 4, ["Intake"]),
      task("Hold project kickoff", 7, "High", 2, ["Meeting"]),
      task("Publish delivery plan and milestones", 10, "Medium", 4, ["Planning"]),
      task("Complete first deliverable review", 17, "High", 6, ["Delivery"]),
      task("Run onboarding retrospective", 21, "Low", 2, ["Operations"]),
    ],
  },
  {
    id: "two-week-sprint",
    name: "Two-week sprint",
    category: "Engineering",
    description: "A lightweight sprint rhythm from planning to retrospective.",
    icon: "S",
    color: "#8a5ea8",
    durationDays: 14,
    tasks: [
      task("Refine and prioritize sprint backlog", 1, "High", 3, ["Planning"]),
      task("Confirm sprint goal and ownership", 1, "High", 2, ["Planning"]),
      task("Complete primary sprint work", 9, "High", 24, ["Engineering"]),
      task("Run QA and acceptance checks", 11, "High", 8, ["QA"]),
      task("Demo completed work", 13, "Medium", 2, ["Review"]),
      task("Hold retrospective and capture actions", 14, "Medium", 2, ["Retro"]),
    ],
  },
];

export const csvColumns = [
  "title",
  "description",
  "status",
  "priority",
  "assignee",
  "start_date",
  "due_date",
  "estimate",
  "labels",
] as const;

export const sampleCsv = `title,description,status,priority,assignee,start_date,due_date,estimate,labels
Kick off project,Align scope and owners,Not Started,High,carter@example.com,2026-08-03,2026-08-03,2,"Planning,Meeting"
Draft project plan,Define milestones and dependencies,Not Started,Medium,carter@example.com,2026-08-04,2026-08-07,4,Planning`;
