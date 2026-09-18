import { Specialty } from '../constants';

export type CareUrgency = 'routine' | 'priority' | 'urgent' | 'emergency';
export type CareCategory = 'general' | 'cardiac' | 'skin' | 'mental-health' | 'pediatric' | 'women-health' | 'respiratory' | 'musculoskeletal' | 'digestive' | 'neurological' | 'eye' | 'dental' | 'other';

export interface IntelligenceInput { symptoms: string; requestedSpecialty?: Specialty; location?: { latitude:number; longitude:number }; }
export interface IntelligenceAssessment {
  careCategory: CareCategory; recommendedSpecialty: Specialty; urgency: CareUrgency; redFlags: string[]; confidence: number; explanation: string;
}
export interface ConsultantMatch { consultantId:string; consultantName:string; specialty?:Specialty; matchScore:number; distanceKm?:number; reasons:string[]; }
export interface IntelligenceResult { assessment:IntelligenceAssessment; matches:ConsultantMatch[]; nextStep:'emergency-guidance'|'consultation'; generatedAt:string; }
