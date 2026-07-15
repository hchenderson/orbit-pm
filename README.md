# Orbit Project Management

Orbit is a focused project-management app for small teams. This repository contains a polished, interactive local MVP plus a Firebase-first production path using Authentication, Firestore, optional Cloud Storage, and scheduled reminders.

The app runs immediately in demo mode. Set `NEXT_PUBLIC_DEMO_MODE=false` to require Firebase sign-in and persist workspace data to Firestore with realtime updates.

Firebase project `orbit-pm-79c3b` is configured for local authentication and Analytics. The Firebase web configuration is public client configuration; database credentials and server secrets remain intentionally unset.

## What is implemented

- Responsive project workspace with sidebar navigation and global search
- Project overview with progress, due-today, overdue, workload, health, and activity summaries
- Three-step project setup with templates, CSV task import, editable starter tasks, review, duplication, archiving, member invitations, and CSV export
- Built-in Blank, Product launch, Website redesign, Marketing campaign, Client onboarding, and Two-week sprint templates
- Task creation, editing, completion, deletion, subtasks, comments, assignments, dates, priorities, and estimates
- List, drag-and-drop Kanban, timeline/Gantt, editable spreadsheet, and calendar views
- Assignee and priority filters plus a cross-project “My tasks” entry point
- In-app notification center and due-date reminder indicators
- Firebase email/password and Google sign-in with authenticated workspace access
- Realtime Firestore persistence for workspaces, members, projects, tasks, and notifications
- Role-based Firestore Security Rules, indexes, Emulator Suite configuration, and rules tests
- Optional App Check integration using reCAPTCHA Enterprise
- Invite-only email flow with hashed tokens, acceptance page, and Firebase Trigger Email queue
- Per-user reminder timing, timezone, digest time, and email/in-app channel preferences
- Boilerplate Privacy, Terms, Support, and Account Deletion pages
- Unit tests for task filtering, progress, overdue logic, CSV import, and database permissions
- Firebase App Hosting configuration

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No environment variables are required for demo mode. Use the sign-in page at `/sign-in` to preview authentication; with Firebase unconfigured, any valid-looking credentials continue to the local demo.

Useful checks:

```bash
npm test
npm run lint
npm run build
```

To reset the sample workspace, remove the `orbit-workspace-v1` item from browser local storage.

## Create a project from CSV

Choose **New project → Import a task spreadsheet**. Orbit parses the file in the browser, lets you review and edit the tasks, and only creates the project after the final confirmation.

Supported columns are `title`, `description`, `status`, `priority`, `assignee`, `start_date`, `due_date`, `estimate`, and `labels`. `title` is required. Dates use `YYYY-MM-DD`; assignees may be a member name or email; labels may be separated by commas, semicolons, or pipes. Common aliases such as `task`, `name`, `owner`, `deadline`, `hours`, and `tags` are accepted. The import screen includes a downloadable sample file.

The source CSV is not uploaded or retained. Its rows become task records. This means CSV import does not require Cloud Storage.

### Firebase command-line access

The `firebase` JavaScript package and the Firebase command-line tool are different packages. The browser SDK is already installed. You do not need a global CLI installation or `sudo`; use the project command:

```bash
npm run firebase:login
```

This runs a pinned Firebase CLI with `npx` and avoids writing to `/usr/local/lib/node_modules`. If npm asks you to review install scripts, use `npm approve-scripts --allow-scripts-pending` and review the displayed packages. Do not run `npm audit fix --force`; the current dependency tree audits with zero known vulnerabilities, while a forced fix can choose breaking versions.

## Recommended production architecture

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Web application | Next.js App Router + TypeScript | UI, server rendering, route handlers, validation |
| Styling | Tailwind CSS plus application design tokens | Responsive, accessible interface |
| Authentication | Firebase Authentication | Email/password and Google identity |
| Data authorization | Firestore Security Rules | Enforce workspace membership and Owner/Admin/Member/Viewer permissions |
| Structured data | Cloud Firestore | Projects, tasks, memberships, comments, reminders, templates, and searchable file metadata |
| Attachments | Cloud Storage for Firebase, when needed | Uploaded documents, images, videos, and retained source files |
| Reminders | Cloud Scheduler + Cloud Run/Functions | Find pending reminders, send email, and create notifications |
| Email | Firebase Trigger Email extension or a transactional provider | Invitations, due-date reminders, daily digests |
| Hosting | Firebase App Hosting | GitHub-connected Next.js build and deployment |

Firestore and Cloud Storage are complementary, not substitutes. Use Firestore for small structured records and Storage for file bytes. CSV import can remain Firestore-only because the browser turns each row into a task; enable Storage when users can attach files or when the original import must be retained. Enforce Owner/Admin/Member/Viewer access in Firestore Security Rules and test those rules with the Emulator Suite before production.

## Firestore data model

```text
users/{uid}
└── defaultWorkspaceId

workspaces/{workspaceId}
├── members/{uid}
├── projects/{projectId}
├── tasks/{taskId}
├── notifications/{notificationId}
└── invitations/{invitationId}   (reserved for the email invitation backend)
```

Important authorization rules:

- Owners manage workspace billing, deletion, roles, and all projects.
- Admins manage members, projects, and workspace settings except ownership.
- Members create and update work only in projects they can access.
- Viewers can read permitted projects but cannot mutate data.
- Every project query is scoped under its workspace and checked against the caller’s membership by `firestore.rules`.
- Attachment upload paths should include workspace, project, task, and a generated object ID. Uploads should use short-lived server-issued URLs.
- Invitation tokens must be random, expire, and be stored only as hashes.

## Main user flows

1. A user signs in with Google or email and creates or joins a workspace.
2. An Owner/Admin invites teammates by email and assigns a workspace role.
3. A manager creates a project, adds members, dates, a status, and initial tasks.
4. Teammates work from List, Board, Timeline, Table, Calendar, or My Tasks; every view reads the same task records.
5. Task changes create activity records and notify assignees or mentioned teammates.
6. Scheduled workers create due-soon/overdue notifications and optionally email a daily digest.
7. The project overview summarizes delivery health, workload, deadlines, and recent activity.

## Screen map

```text
/                       Project workspace and dashboard
/sign-in                Google/email sign-in and local demo entry
/invite                 Secure invitation acceptance
/privacy                Privacy Policy template
/terms                  Terms of Service template
/support                Support and security contact template
/delete-account         Account deletion instructions template

Workspace shell
├── Home                Project health, deadlines, workload, activity
├── My tasks            Current user’s assigned work
├── Inbox               Mentions, assignments, reminders, status changes
├── Projects
│   ├── Overview
│   ├── List
│   ├── Board
│   ├── Timeline
│   ├── Table
│   └── Calendar
├── People              Members, invitations, roles
└── Settings            Workspace and notification preferences
```

## Enable Firebase Authentication

1. Create a Firebase project and register a Web app.
2. In Firebase Authentication, enable Email/Password and Google providers.
3. The supplied `.env.local` already contains the Orbit-PM public web configuration. Keep it out of Git; `.gitignore` already excludes it.
4. Set `NEXT_PUBLIC_DEMO_MODE=false`.
5. Create Firestore and deploy the supplied rules and indexes.
6. Register App Check with reCAPTCHA Enterprise and set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` before enabling enforcement.

The sign-in page already uses Firebase Authentication when the public configuration is present.

## Optional Prisma reference

The Prisma schema remains in this repository as an optional relational-backend reference. It is not required for the recommended Firestore-first path.

Provision PostgreSQL using a managed provider that Firebase App Hosting can reach. Use separate pooled and direct URLs:

```env
DATABASE_URL="postgresql://...pool..."
DIRECT_URL="postgresql://...direct..."
```

Then run:

```bash
npm run db:generate
npm run db:migrate
```

The active application uses Firestore. The Prisma schema is retained only as a reference if the project later moves to a relational backend.

## Reminder worker

Run a scheduled job every 15 minutes:

1. Select unsent reminders where `remindAt <= now()` using a database lock or atomic claim.
2. Re-check task state and user notification preferences.
3. Create an in-app `Notification` record.
4. Send email when the user enabled that channel.
5. Mark the reminder sent inside the same transaction or with an idempotency key.

Run the daily digest separately in each user’s time zone. Do not rely on a browser tab being open.

## Email invitations

The application uses invite-only membership and queues a named `workspace-invitation` email template for the Firebase Trigger Email extension. Follow [EMAIL_AND_INVITATIONS.md](./EMAIL_AND_INVITATIONS.md) to connect Resend SMTP, verify the sending domain, and create the Firestore template. Invitations remain valid until accepted or revoked; Firestore stores only a SHA-256 token hash.

## Implementation phases

### Phase 1 — Local MVP (included)

Interactive projects, tasks, roles, views, filters, reminders, exports, responsive UI, local persistence, tests, and production schema.

### Phase 2 — Shared backend (included)

Firebase auth-state protection, realtime Firestore repositories, first-user provisioning, workspace/project authorization rules, indexes, and emulator tests.

### Phase 3 — Collaboration

Realtime updates, comments with mentions, file uploads, activity records, optimistic conflict handling, and audit-friendly permission changes.

### Phase 4 — Automation

Scheduled reminders, email delivery, recurring-task generation, daily digests, saved views, and notification preferences.

### Phase 5 — Production hardening

End-to-end tests, rate limits, observability, backups, data export/deletion, accessibility audit, performance budgets, and security review.

## Deploy with Firebase App Hosting

1. Push this repository to GitHub.
2. In Firebase Studio or the Firebase console, create an App Hosting backend and connect the repository.
3. Add the public Firebase variables and App Check site key in App Hosting settings.
4. Deploy `firestore.rules` and `firestore.indexes.json`.
5. Deploy from the selected branch. `apphosting.yaml` contains conservative starter runtime limits that can be adjusted as usage grows.

## Publish this project to GitHub

From `/Users/carterhenderson/Documents/app/Management`:

```bash
git init -b main
git status --ignored
git add .
git commit -m "Initial Orbit project management app"
```

On GitHub, create a new empty repository. Do not initialize it with a README, license, or `.gitignore`, because those already exist locally. Then copy the repository URL and run:

```bash
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git remote -v
git push -u origin main
```

If GitHub CLI is installed and authenticated, the equivalent shortcut is:

```bash
gh repo create --source=. --private --remote=origin --push
```

Before the first push, confirm `.env.local`, `node_modules`, `.next`, and `.firebase` appear as ignored. Firebase web client configuration is designed to be present in client code, but service-account keys, database credentials, email-provider keys, and other server secrets must never be committed.

## Current boundary

Demo mode stores data in browser local storage. Production mode requires Firebase Authentication and stores shared workspace data in Firestore. Secure invitation emails, scheduled reminder delivery, account deletion, and optional file attachments still require the external-service decisions listed in [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md).
