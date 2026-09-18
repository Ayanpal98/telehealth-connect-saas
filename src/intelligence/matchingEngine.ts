import { MedicalCase, UserProfile } from '../types';
import { assessConcern } from './assessmentEngine';
import { ConsultantMatch, IntelligenceResult } from './types';
import { rankConsultantNetwork, NetworkConsultant } from './consultantNetwork';

export function runIntelligence(medicalCase: MedicalCase, consultants: UserProfile[]): IntelligenceResult {
  const assessment = assessConcern({
    symptoms: medicalCase.symptoms,
    requestedSpecialty: medicalCase.requiredSpecialty,
    location: medicalCase.location
  });

  const matches = rankConsultantNetwork(
    medicalCase,
    assessment,
    consultants as NetworkConsultant[]
  ).map(match => ({
    consultantId: match.consultantId,
    consultantName: match.consultantName,
    specialty: match.specialty,
    matchScore: match.matchScore,
    distanceKm: match.distanceKm,
    verified: match.verified,
    availableNow: match.availableNow,
    acceptingNewCases: match.acceptingNewCases,
    languages: match.languages,
    consultationModes: match.consultationModes,
    locality: match.locality,
    reasons: match.reasons
  }));

  return {
    assessment,
    matches,
    nextStep: assessment.urgency === 'emergency' ? 'emergency-guidance' : 'consultation',
    generatedAt: new Date().toISOString()
  };
}
