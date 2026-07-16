# Orbit mobile web plan

## Product goal

Give team members a fast, focused way to check their work, update tasks, respond to activity, and receive reminders from a phone. The mobile experience should use the same Firebase project, authentication, Firestore data, permissions, and task scheduling rules as the desktop app.

Orbit should begin as an installable responsive web app. A separate iOS or Android codebase should only be considered after real usage shows that native-only capabilities are needed.

## What is now in place

- A phone-sized bottom navigation for Home, My tasks, Inbox, and New task.
- Mobile-safe spacing, drawers, forms, calendar controls, and horizontal schedule-table scrolling.
- My Tasks now gathers the signed-in user's assignments across every project.
- The mobile calendar now pairs the month grid with a readable agenda list.
- A web app manifest and standalone display metadata so the current app has the foundation of an installable progressive web app.
- One shared parent/child task and scheduling model across desktop and mobile.
- A collapsible desktop sidebar that remembers the user's preference, while phones retain a slide-over navigation drawer.

The app is responsive, but this is only the foundation. Offline work and push notifications still need dedicated implementation and testing.

## Phase 1 — mobile-first core flows

Target: the most common actions should take no more than two taps after opening the app.

Current status:

- Completed: persistent bottom navigation, cross-project My Tasks, month agenda, responsive task drawer, and preserved desktop/tablet layouts.
- Next: a dedicated mobile Home screen with Today, Overdue, and Upcoming sections.
- Next: a compact task detail sheet with complete, status, assignee, comment, and child-task actions above the fold.
- Next: replace the full New Task form on phones with a quick-create sheet requiring only title and project.
- Next: make Inbox items deep-link to the related task, project, comment, or invitation.

Acceptance criteria:

- All primary actions work at 320px through 480px widths without page-level horizontal scrolling.
- Touch targets are at least 44 by 44 CSS pixels for primary actions.
- Completing a task, adding a comment, and changing an assignee each take two taps or fewer.
- Parent and child tasks are clearly identified and navigable.

## Phase 2 — installability and resilient sessions

1. Add final 192px, 512px, and Apple touch icons.
2. Add a service worker for the application shell and safe read caching.
3. Store pending user edits in IndexedDB when the connection drops.
4. Replay queued writes after reconnecting, with a visible syncing state.
5. Define conflict handling using Firestore timestamps and show the user when a newer server edit wins.

Do not cache private Firestore responses in a shared HTTP cache. Offline data must remain scoped to the signed-in user, and local data must be cleared when that user signs out or switches accounts.

## Phase 3 — reminders and push notifications

1. Add Firebase Cloud Messaging for supported mobile browsers.
2. Ask for notification permission only after the user enables reminders, not on first visit.
3. Deep-link reminder notifications directly to the task.
4. Respect each user's timezone, reminder-day choice, channel preferences, and quiet hours.
5. Continue sending email reminders through the existing server-side reminder queue; push and email must share the same idempotency key so each configured reminder is sent only once per channel.

## Phase 4 — mobile schedule tools

1. Keep the complete spreadsheet schedule available through horizontal scrolling.
2. Add a focused mobile schedule editor that exposes one task at a time: parent, predecessors, duration, calculated start, and calculated finish.
3. Completed: add a calendar agenda mode below the month grid so task titles remain readable on small screens.
4. Add a dependency-chain preview before a schedule change is saved.

## Security and quality gates

- Re-run Firestore and Storage rules tests for every mobile data flow.
- Verify viewer/member/admin permissions in both online and offline states.
- Test account switching for local-data leakage.
- Meet WCAG 2.2 AA contrast, focus, labeling, and reduced-motion requirements.
- Test Safari on iPhone, Chrome on Android, and both portrait and landscape tablet widths.
- Add mobile performance budgets: under 2.5 seconds for the largest-content render on a typical 4G connection and no unexpected layout movement during startup.

## Native-app decision point

Review usage after the progressive web app has been in production for at least one release cycle. Consider React Native or another native shell only if the team needs capabilities the web app cannot deliver reliably, such as richer background sync, app-store distribution, or deeper operating-system integrations. Keep scheduling and permission logic in shared TypeScript modules if a native client is added.

## Recommended release sequence

1. Ship the responsive navigation and task flows behind a mobile beta flag.
2. Test with a small invited group on both iPhone and Android.
3. Add installability and offline-safe reads.
4. Add push reminders after delivery, permission, and duplicate-send monitoring are ready.
5. Expand the beta, review support feedback and usage data, then make mobile the default phone experience.
