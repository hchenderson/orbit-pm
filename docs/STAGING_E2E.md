# Firebase staging end-to-end tests

The Playwright suite checks desktop Chromium and a mobile Chromium profile against a separate Firebase staging deployment. Public checks cover invite-only registration and legal routes. Authenticated checks cover sign-in, task creation entry points, Account settings/deletion controls, the spreadsheet, and schedule issue review.

## Required staging environment

Create a separate Firebase project and App Hosting backend. Never point destructive testing or test credentials at production.

1. Deploy the same Firestore rules, indexes, Functions, Authentication providers, App Check configuration, and App Hosting code to staging.
2. Upgrade staging Authentication to Identity Platform before deploying the blocking Function.
3. Create or invite a dedicated staging test member with at least Member access and a stable non-production password.
4. Keep representative projects, tasks, and at least one schedule issue in that account's workspace.

## GitHub configuration

Create a GitHub Environment named `staging` and add:

- environment variable `STAGING_BASE_URL` — the staging App Hosting URL;
- secret `STAGING_TEST_EMAIL` — the dedicated staging member;
- secret `STAGING_TEST_PASSWORD` — its password.

The `Staging end-to-end tests` workflow runs manually and every weekday. Playwright traces, screenshots, videos, and the HTML report are retained as workflow artifacts when tests fail.

## Local execution

Public checks can run against a local server:

```bash
npm run test:e2e
```

Run the complete suite against staging:

```bash
E2E_BASE_URL=https://YOUR-STAGING-URL STAGING_TEST_EMAIL=YOUR_TEST_EMAIL STAGING_TEST_PASSWORD=YOUR_TEST_PASSWORD npm run test:e2e:staging
```
