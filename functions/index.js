const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const EARTH_RADIUS_KM = 6371;

function distanceKm(a, b) {
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) *
    Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function specialtyScore(profile, specialty) {
  if (!specialty) return 10;
  if (profile.specialty === specialty) return 50;
  if (specialty === "General Medicine") return 25;
  return 0;
}

function normaliseLocality(value) {
  return String(value || "").trim().toLowerCase().replace(/\\s+/g, " ");
}

function sameLocality(patientCase, clinician) {
  const patientLocality = normaliseLocality(
    patientCase.locality || patientCase.location?.locality || patientCase.location?.address
  );
  const clinicianLocality = normaliseLocality(clinician.locality);

  if (patientLocality && clinicianLocality) {
    return patientLocality === clinicianLocality ||
      patientLocality.includes(clinicianLocality) ||
      clinicianLocality.includes(patientLocality);
  }

  return Boolean(patientCase.location && clinician.location);
}

exports.routeNewCase = onDocumentCreated(
  { document: "cases/{caseId}", region: "asia-south1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const medicalCase = snapshot.data();
    const caseId = event.params.caseId;

    const existing = await db.collection("caseAssignments")
      .where("caseId", "==", caseId)
      .limit(1)
      .get();

    if (!existing.empty) return;

    const recommendedSpecialty =
      medicalCase.requiredSpecialty ||
      medicalCase.intelligence?.assessment?.recommendedSpecialty ||
      "General Medicine";

    const urgency =
      medicalCase.intelligence?.assessment?.urgency || "routine";

    const cliniciansSnapshot = await db.collection("profiles")
      .where("role", "==", "clinician")
      .get();

    const candidates = [];

    for (const clinicianDoc of cliniciansSnapshot.docs) {
      const clinician = clinicianDoc.data();

      if (clinician.verificationStatus !== "verified") continue;
      if (clinician.acceptingNewCases === false) continue;
      if (clinician.isAvailable === false) continue;

      const specialty = specialtyScore(clinician, recommendedSpecialty);
      if (specialty === 0) continue;

      let proximity = 0;
      let distance;

      if (medicalCase.location && clinician.location) {
        distance = distanceKm(medicalCase.location, clinician.location);

        if (clinician.serviceRadiusKm != null &&
            distance > Number(clinician.serviceRadiusKm)) {
          continue;
        }

        proximity = Math.max(0, 30 - Math.min(distance, 30));
      } else if (!sameLocality(medicalCase, clinician)) {
        continue;
      }

      const verified = 15;
      const availability = clinician.isAvailable === true ? 15 : 0;
      const accepting = 5;

      const score = Math.min(100, Math.round(
        specialty + proximity + verified + availability + accepting
      ));

      const reasons = [
        clinician.specialty === recommendedSpecialty
          ? "Specialty matches the suggested care pathway."
          : "Suitable for initial general-care navigation.",
        clinician.isAvailable === true
          ? "Currently marked available."
          : "Registered clinician.",
        "Verified clinician accepting new consultation requests."
      ];

      if (distance != null) {
        reasons.push(`${distance.toFixed(1)} km from the supplied patient location.`);
      } else if (clinician.locality) {
        reasons.push(`Listed locality: ${clinician.locality}.`);
      }

      candidates.push({
        clinicianId: clinicianDoc.id,
        clinicianName: clinician.displayName || clinician.email,
        score,
        distance,
        reasons
      });
    }

    candidates.sort((a, b) =>
      b.score - a.score || (a.distance ?? 999) - (b.distance ?? 999)
    );

    if (candidates.length === 0) {
      await snapshot.ref.update({
        routingState: "no-match",
        routingUpdatedAt: FieldValue.serverTimestamp()
      });
      return;
    }

    const batch = db.batch();
    const primary = candidates[0];

    batch.update(snapshot.ref, {
      status: "assigned",
      assignedConsultantId: primary.clinicianId,
      assignedConsultantName: primary.clinicianName,
      routingState: "broadcast",
      routingUpdatedAt: FieldValue.serverTimestamp(),
      routedToCount: candidates.length
    });

    for (const candidate of candidates) {
      const assignmentId = `${caseId}_${candidate.clinicianId}`;

      batch.set(db.collection("caseAssignments").doc(assignmentId), {
        id: assignmentId,
        caseId,
        clinicianId: candidate.clinicianId,
        patientId: medicalCase.patientId,
        patientName: medicalCase.patientName,
        specialty: recommendedSpecialty,
        urgency,
        status: candidate.clinicianId === primary.clinicianId ? "primary" : "notified",
        matchScore: candidate.score,
        distanceKm: candidate.distance ?? null,
        reasons: candidate.reasons,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      batch.set(db.collection("clinicianNotifications").doc(), {
        clinicianId: candidate.clinicianId,
        caseId,
        type: "new-case",
        title: candidate.clinicianId === primary.clinicianId
          ? "New case assigned to you"
          : "New nearby case available",
        message: `${medicalCase.patientName || "A patient"} submitted a new consultation request.`,
        specialty: recommendedSpecialty,
        urgency,
        matchScore: candidate.score,
        read: false,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    await batch.commit();
  }
);


exports.syncClinicianApplicationToProfile = onDocumentCreated(
  { document: "clinicianApplications/{uid}", region: "asia-south1" },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const application = snapshot.data();
    const uid = event.params.uid;
    const profileRef = db.collection("profiles").doc(uid);
    const existing = await profileRef.get();

    if (existing.exists) return;

    await profileRef.set({
      uid,
      email: application.email,
      displayName: application.fullName,
      role: "clinician",
      specialty: application.specialty || "General Medicine",
      phone: application.phone || "",
      registrationNumber: application.registrationNumber || "",
      locality: application.locality || "",
      consultationModes: application.consultationModes || [],
      qualifications: application.qualifications || "",
      experience: application.experience || "",
      location: application.location || null,
      verificationStatus: "pending",
      acceptingNewCases: false,
      isAvailable: false,
      serviceRadiusKm: 10,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  }
);
