# Invite-only authentication and deletion operations

## Invite-only registration

Orbit now enforces invitation policy twice:

1. `enforceInviteOnlyRegistration` is a Firebase Authentication blocking Function. It permits new Auth users only when their normalized email has a pending workspace invitation, or appears in the optional `INVITE_ONLY_BOOTSTRAP_EMAILS` Function parameter.
2. Email/password invitees must verify ownership of the invited mailbox before Firestore permits invitation acceptance. Google accounts arrive with a provider-verified email claim.
3. The web client no longer provisions a workspace for an arbitrary authenticated user. A user must already have a `defaultWorkspaceId`, accept an invitation, or belong to a legacy owner workspace.

Before deploying the blocking Function, upgrade the Firebase project to **Firebase Authentication with Identity Platform**. Do not deploy the trigger until this upgrade is complete; blocking triggers affect every account-creation attempt in the project.

Existing Firebase Auth users are not deleted. Accounts without a workspace are shown an invitation-required message and cannot provision data through Firestore rules.

For a brand-new staging project, create the initial staging owner before enabling the blocking Function or configure that email in `INVITE_ONLY_BOOTSTRAP_EMAILS`. Remove the bootstrap entry after the owner workspace is established.

## Automated deletion

The callable Functions require:

- an authenticated Firebase user;
- a sign-in no more than ten minutes old;
- exact confirmation text;
- workspace ownership for workspace deletion.

`deleteWorkspace` recursively removes the workspace document and subcollections, clears affected users' default workspace reference, deletes queued invitation mail records, and removes stored task attachments.

`deleteMyAccount` removes the user's memberships, assignments, personal views/templates, notifications, push registrations, authored task comments/activity, Firestore user profile, and Firebase Authentication account. An owner must explicitly delete their current owned workspace with the account. Additional owned workspaces block account deletion until transferred or deleted.

Test deletion only in staging. Firestore recursive deletion and Storage deletion are irreversible and incur normal read/delete operation costs.
