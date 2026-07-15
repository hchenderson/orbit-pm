# Email and invitation setup

Orbit uses an invite-only model. Invitations remain valid until accepted or revoked. Raw invitation tokens appear only in the emailed link; Firestore stores a SHA-256 hash.

## Recommended provider

Use the Firebase **Trigger Email** extension with **Resend SMTP**. The application writes a validated `mail` document, the extension renders the `workspace-invitation` template, and Resend delivers it.

## Resend

1. Create a Resend account.
2. Add and verify the production sending domain.
3. Create a restricted API key for Orbit email delivery.
4. Resend SMTP uses host `smtp.resend.com`, username `resend`, and the API key as the password. Use port 465 for implicit TLS or 587 for STARTTLS.

Never place the Resend API key in a `NEXT_PUBLIC_` variable, GitHub, or this repository.

## Firebase Trigger Email extension

Install `firebase/firestore-send-email` from Firebase Console → Extensions. Configure:

- Email documents collection: `mail`
- Email templates collection: `mailTemplates`
- SMTP connection: the Resend SMTP credentials above
- Default from address: a verified address such as `Orbit <notifications@YOUR-DOMAIN>`
- Default reply-to: your support address

Create `mailTemplates/workspace-invitation` in Firestore with fields similar to:

```json
{
  "subject": "{{inviterName}} invited you to Orbit",
  "html": "<h2>You’re invited to Orbit</h2><p>{{inviterName}} invited you to join as a {{role}}.</p><p><a href=\"{{invitationUrl}}\">Accept invitation</a></p><p>This invitation remains valid until accepted or revoked.</p>",
  "text": "{{inviterName}} invited you to Orbit as a {{role}}. Accept: {{invitationUrl}}"
}
```

The scheduled reminder worker also expects these templates:

- `mailTemplates/task-reminder` using `memberName`, `taskTitle`, `dueDate`, and `overdue`.
- `mailTemplates/daily-digest` using `memberName`, `taskCount`, and the `tasks` array.

Use the same subject/HTML/text field structure as the invitation example. Send test messages for all three templates before deploying the worker.

Send a test invitation to an address you control. Confirm that the corresponding `mail` document receives delivery status from the extension and that the link opens `/invite`.

## Invite-only behavior

- A workspace Owner or Admin creates an invitation.
- Orbit generates a 256-bit random token, stores only its SHA-256 hash, and queues the templated email.
- The recipient signs in using the exact invited email address.
- Acceptance atomically adds the membership, marks the invitation accepted, and makes the invited workspace active.
- Owners/Admins can later revoke pending invitations; the management UI for revocation is the next invitation enhancement.
