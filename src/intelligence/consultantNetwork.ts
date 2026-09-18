import { MedicalCase, UserProfile } from '../types';
import { IntelligenceAssessment } from './types';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';
export type ConsultationMode = 'video' | 'audio' | 'chat' | 'in-person';

export interface ConsultantNetworkProfile {
  verificationStatus?: VerificationStatus;
  verificationSource?: string;
  registrationNumber?: string;
  languages?: string[];
  consultationModes?: ConsultationMode[];
  serviceRadiusKm?: number;
  locality?: string;
  acceptingNewCases?: boolean;
}

export type NetworkConsultant = UserProfile & ConsultantNetworkProfile;

export interface NetworkMatch {
  consultantId: string;
  consultantName: string;
  specialty?: UserProfile['specialty'];
  matchScore: number;
  distanceKm?: number;
  verified: boolean;
  availableNow: boolean;
  acceptingNewCases: boolean;
  languages: string[];
  consultationModes: ConsultationMode[];
  locality?: string;
  reasons: string[];
}

const EARTH_RADIUS_KM = 6371;

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * Math.PI / 180) *
    Math.cos(b.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function rankConsultantNetwork(
  medicalCase: MedicalCase,
  assessment: IntelligenceAssessment,
  consultants: NetworkConsultant[]
): NetworkMatch[] {
  return consultants
    .filter(c => c.role === 'clinician')
    .filter(c => c.verificationStatus !== 'rejected')
    .filter(c => c.acceptingNewCases !== false)
    .map(c => {
      const reasons: string[] = [];
      let score = 0;
      const verified = c.verificationStatus === 'verified';
      const availableNow = c.isAvailable === true;
      const acceptingNewCases = c.acceptingNewCases !== false;
      const languages = c.languages || [];
      const consultationModes = c.consultationModes || [];
      let distance: number | undefined;

      if (verified) {
        score += 15;
        reasons.push('Profile is marked as verified.');
      } else {
        reasons.push('Verification is still pending.');
      }

      if (c.specialty === assessment.recommendedSpecialty) {
        score += 35;
        reasons.push('Specialty matches the suggested care pathway.');
      } else if (assessment.recommendedSpecialty === 'General Medicine') {
        score += 18;
        reasons.push('Suitable for initial general-care navigation.');
      }

      if (medicalCase.location && c.location) {
        distance = distanceKm(medicalCase.location, c.location);
        const radius = c.serviceRadiusKm;
        if (radius !== undefined && distance > radius) {
          reasons.push(`Outside stated service radius of ${radius} km.`);
        } else {
          score += Math.max(0, 25 - Math.min(distance, 25));
          reasons.push(`${distance.toFixed(1)} km from the supplied location.`);
        }
      } else {
        reasons.push('Location data unavailable for proximity matching.');
      }

      if (availableNow) {
        score += 15;
        reasons.push('Currently marked available.');
      } else {
        reasons.push('Not currently marked available.');
      }

      if (acceptingNewCases) score += 5;

      if (assessment.urgency !== 'emergency' && consultationModes.length > 0) {
        score += 5;
        reasons.push(`Consultation modes: ${consultationModes.join(', ')}.`);
      }

      return {
        consultantId: c.uid,
        consultantName: c.displayName || c.email,
        specialty: c.specialty,
        matchScore: Math.min(100, Math.round(score)),
        distanceKm: distance,
        verified,
        availableNow,
        acceptingNewCases,
        languages,
        consultationModes,
        locality: c.locality,
        reasons
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore || (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, 5);
}
