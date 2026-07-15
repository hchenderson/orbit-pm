# Orbit production checklist

## Completed in the repository

- [x] Firebase Authentication client integration and signed-out redirect
- [x] Firestore workspace repository with realtime subscriptions
- [x] Separate workspace, member, project, task, and notification documents
- [x] First-sign-in workspace provisioning
- [x] Local demo mode kept behind `NEXT_PUBLIC_DEMO_MODE`
- [x] Owner/Admin/Member/Viewer Firestore Security Rules
- [x] Firestore indexes and Emulator Suite configuration
- [x] Automated Security Rules tests (requires Java locally)
- [x] App Check client integration using reCAPTCHA Enterprise
- [x] Invite-only token generation, hashed invitation records, acceptance page, and Firestore email queue
- [x] Custom reminder lead time, user timezone, digest time, and email/in-app channel preferences
- [x] Idempotent 15-minute scheduled reminder and daily-digest Cloud Function
- [x] Boilerplate Privacy Policy, Terms, Support, and Account Deletion pages
- [x] Baseline browser security headers
- [x] Unit tests, linting, production build, and zero known npm vulnerabilities
- [x] Firebase App Hosting runtime configuration

## Carter: Firebase Console tasks

- [ ] In **Firestore Database**, create the production database in the region closest to your users.
- [ ] Deploy `firestore.rules` and `firestore.indexes.json` with `npx firebase-tools deploy --only firestore` after logging in.
- [ ] In **Authentication → Sign-in method**, enable Google and Email/Password.
- [ ] In **Authentication → Settings → Authorized domains**, add the App Hosting domain, custom domain, and any preview domains you intend to use.
- [ ] In **App Check**, register the web app with reCAPTCHA Enterprise, copy the public **site key** into `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, monitor metrics, then enable enforcement for Firestore. Never expose the secret key.
- [ ] Upgrade the project to the Blaze plan before using App Hosting, scheduled functions, email extensions, or production backups.
- [ ] Create a billing budget and billing alerts in Google Cloud Billing.
- [ ] Configure scheduled Firestore backups or exports and test one restore.

## Carter: product and service decisions

- [x] Email architecture selected: Firebase Trigger Email extension with Resend SMTP.
- [x] Invitation policy selected: invite-only, valid until accepted or revoked.
- [ ] Decide whether “invite-only” means invite-only membership in an existing workspace (implemented) or that uninvited people must be prevented from creating their own separate workspace. The latter requires an Authentication allowlist/blocking function and a bootstrap owner email.
- [ ] Create a Resend account, verify the sending domain, and install/configure the Firebase Trigger Email extension using `EMAIL_AND_INVITATIONS.md`.
- [ ] Provide the sending domain and sender address for invitation and reminder email.
- [x] Reminder preferences selected: user-customizable timing, user timezone, customizable digest time, email and in-app delivery.
- [ ] Enable Cloud Storage only if task attachments or retained source CSV files are required.
- [ ] Choose the production custom domain.
- [ ] Provide Privacy Policy, Terms, support contact, and data-deletion requirements.
- [ ] Replace every bracketed placeholder in the four legal/support templates with the operator’s legal name, mailing address, support/privacy/security emails, jurisdiction terms, and retention periods; obtain legal review.

## Remaining implementation after those decisions

- [x] Secure invitation creation, hashed acceptance tokens, and acceptance flow
- [ ] Configure transactional email delivery in Firebase/Resend
- [ ] Deploy the completed reminder/digest worker with `npx firebase-tools deploy --only functions`
- [ ] Automated account and workspace deletion workflow (the public request/instructions page is complete)
- [ ] Attachment uploads and Storage Rules, only if attachments are enabled
- [ ] End-to-end tests against a Firebase staging project
- [ ] Error reporting, uptime alerts, and production support workflow

## Local verification

Run the standard checks:

```bash
npm test
npm run lint
npm run build
```

Security Rules tests require Java 21 or newer:

```bash
npm run test:rules
```
