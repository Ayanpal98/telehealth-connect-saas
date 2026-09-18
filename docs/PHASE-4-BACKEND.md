# Clinova Phase 4 — Secure Backend Foundation

Phase 4 introduces a Firebase/Firestore backend adapter while keeping the local prototype available until the production migration is explicitly enabled.

## Data boundaries

- profiles/{uid}: patient and clinician profile metadata.
- cases/{caseId}: care-navigation cases and workflow state.
- auditLogs/{logId}: append-only security/workflow events.
- Authentication: Firebase Authentication.
- Service-account credentials must remain server-side.

## Security model

Firestore rules restrict profile access to the owner or administrators. Cases are readable by the patient, assigned consultant, or administrator. Audit logs are readable only by administrators and cannot be updated/deleted from the client.

These rules are a starting point, not a claim of regulatory compliance. Production deployment still requires security review, consent/privacy controls, retention policy, incident response, backup/recovery, and jurisdiction-specific healthcare/privacy review.

## Migration sequence

1. Create a Firebase project and enable required Authentication providers.
2. Configure VITE_FIREBASE_* variables.
3. Deploy and test firestore.rules in a non-production project.
4. Migrate mockAuth to Firebase Authentication.
5. Migrate mockDb case/profile operations to secureBackend.
6. Move sensitive files/reports to controlled object storage with authenticated access.
7. Add server-side authorization for privileged operations and consultant verification.
8. Enable audit monitoring, backups and retention procedures.
9. Remove sensitive localStorage persistence from production builds.

## Prototype boundary

Until migration is completed, Local Storage Mode remains a demo mechanism. It should not be used for real patient-identifiable or clinical records.
