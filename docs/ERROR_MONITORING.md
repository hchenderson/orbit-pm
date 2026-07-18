# Production error monitoring

Orbit sends authenticated browser failures to the `reportClientError` callable Function. The Function writes a structured `ReportedErrorEvent` to Google Cloud Logging, allowing Google Cloud Error Reporting to group stack traces by release and route. Cloud Function failures already appear in Cloud Logging.

## One-time console setup

1. Open Google Cloud Console → Error Reporting for the production project and confirm a test browser error appears after deployment.
2. Create a notification channel under Monitoring → Alerting → Notification channels.
3. Create an alert for new/high-volume Error Reporting events or a log-based metric matching severity `ERROR` for `orbit-web` and the deployed Functions.
4. Add HTTPS uptime checks for `https://orbitpm.fyi/sign-in` and the Firebase hosted-app URL.
5. Route alerts to the production support owner and document who acknowledges, investigates, and communicates incidents.

## Privacy and safety

The client truncates messages and stack traces, deduplicates identical reports for one minute, and reports only for authenticated production sessions. Do not add task descriptions, comment bodies, email addresses, invitation tokens, or other workspace content to error context.

The reporting path intentionally swallows its own delivery failures so monitoring can never create an application error loop.
