# Clinova Phase 4B — Secure Backend Migration

Phase 4B moves the core authentication, case persistence, patient history, clinician case visibility, audit events, and clinical image uploads behind Firebase Authentication, Firestore, and Firebase Storage when the Firebase environment is configured.

## Production flow

Patient → Firebase Authentication → Firestore case → deterministic care-navigation assessment → trusted assignment workflow → assigned clinician → clinical workflow → immutable audit event.

The browser does not receive a global clinician directory in Firebase mode. Consultant matching/assignment for production must happen through a trusted server/admin workflow rather than exposing every patient's pending case to every clinician.

## Implemented

- Firebase Authentication sign-in adapter with demo fallback.
- Firebase session restoration on application load.
- Firestore profile reads/writes.
- Firestore patient case creation.
- Patient real-time case subscription.
- Clinician real-time subscription to assigned cases only.
- Case updates for the patient/assigned clinician within Firestore rules.
- Append-only audit log writes for case creation and updates.
- Firebase Storage upload of case images instead of storing base64 image payloads inside case documents.
- Storage rules limiting uploads to authenticated users, images, and 5 MB.
- Firestore composite indexes for patient/clinician case timelines.
- Hardened profile rules so users cannot self-promote to clinician/admin or change verification fields.

## Important production boundary

Firebase client configuration is safe to expose in a browser when protected by Firebase rules; service-account/private credentials must never be placed in VITE_* variables.

The Firebase path is still not a healthcare compliance certification. Before real patient-identifiable deployment, complete privacy/consent review, access-control review, retention/deletion policy, backup/recovery, incident response, logging/monitoring, threat modeling, secure storage review, and applicable India healthcare/privacy/legal review.

## Deployment steps

1. Create a dedicated Firebase project for the environment.
2. Enable Email/Password authentication.
3. Create/provision clinician and admin profiles through a trusted administrative process.
4. Configure the VITE_FIREBASE_* variables.
5. Deploy firestore.rules, storage.rules, and firestore.indexes.json.
6. Verify patient sign-in and case creation with a non-production test account.
7. Verify that one patient cannot read another patient's case.
8. Verify that a clinician cannot read an unassigned case.
9. Verify that assigned clinicians can read/update only their assigned cases.
10. Verify Storage access for case images.
11. Verify audit log creation and that audit logs cannot be edited/deleted from the client.
12. Only then enable Firebase mode in the production deployment.

## Remaining Phase 4C work

- Trusted server-side assignment/matching endpoint.
- Admin clinician verification workflow.
- Firebase custom claims or equivalent privileged role provisioning.
- Appointment/consultation session persistence.
- Notifications.
- Secure document/report lifecycle.
- Automated security tests and CI.

## Real-time patient -> clinician routing

The production path now includes a Firebase Cloud Function trigger:

1. Patient creates a case in Firestore.
2. routeNewCase is triggered automatically by the new case.
3. The server reads clinician profiles, applies specialty + locality/service-radius + verification + availability matching, and selects a primary clinician.
4. Server-created caseAssignments records are written for every eligible matching clinician.
5. Server-created clinicianNotifications records are written for the same clinicians.
6. The clinician portal listens to caseAssignments with Firestore onSnapshot, so routed cases appear without refresh.
7. The patient portal listens to its own case stream, so the patient sees the assignment/status update in real time.

The routing function is intentionally server-side because the client must not read the entire clinician directory just to perform matching. Firebase Cloud Functions run in a trusted environment and can read/write Firestore independently of client security rules.

### Deploy the routing trigger

After connecting the Firebase project and installing the Firebase CLI:

    cd functions
    npm install
    cd ..
    firebase deploy --only functions,firestore:rules,firestore:indexes,storage

The function is configured for asia-south1. Make sure the Firebase project has Cloud Functions enabled and billing/plan requirements satisfied before deployment.

### Expected live behavior

Patient portal: Submit Case -> Firestore create -> routing trigger -> assigned/routed status.

Clinician portal: Firestore assignment -> real-time snapshot -> case appears + in-app notification.

No manual refresh or clinician-side polling is required.
