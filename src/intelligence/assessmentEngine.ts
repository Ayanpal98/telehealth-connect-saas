import { Specialty } from '../constants';
import { IntelligenceAssessment, IntelligenceInput, CareCategory } from './types';

const keywordGroups: Array<{category:CareCategory; specialty:Specialty; words:string[]}> = [
  { category:'cardiac', specialty:'Cardiology', words:['chest pain','palpitation','heart pain','heart attack'] },
  { category:'skin', specialty:'Dermatology', words:['rash','itching','skin','acne','eczema','lesion'] },
  { category:'mental-health', specialty:'Psychiatry', words:['anxiety','panic','depression','suicidal','self harm','insomnia'] },
  { category:'pediatric', specialty:'Pediatrics', words:['child','baby','infant','toddler'] },
  { category:'respiratory', specialty:'Pulmonology', words:['breathing','breathlessness','wheezing','asthma','cough'] },
  { category:'digestive', specialty:'Gastroenterology', words:['stomach','abdominal','vomiting','diarrhea','constipation','acid reflux'] },
  { category:'neurological', specialty:'Neurology', words:['seizure','migraine','numbness','weakness','vertigo'] },
  { category:'eye', specialty:'Ophthalmology', words:['eye pain','vision','blurry','red eye'] },
  { category:'musculoskeletal', specialty:'Orthopedics', words:['joint','fracture','back pain','knee pain','bone'] },
];

const emergencyPatterns = ['severe chest pain','difficulty breathing','cannot breathe','loss of consciousness','unconscious','seizure','stroke','heavy bleeding','suicidal','self harm'];

export function assessConcern(input:IntelligenceInput):IntelligenceAssessment {
  const text=input.symptoms.toLowerCase().trim();
  const group=keywordGroups.find(g=>g.words.some(w=>text.includes(w)));
  const redFlags=emergencyPatterns.filter(w=>text.includes(w));
  const specialty=input.requestedSpecialty || group?.specialty || 'General Medicine';
  const category=group?.category || 'general';
  const urgency=redFlags.length ? 'emergency' : (text.length < 12 ? 'priority' : 'routine');
  const confidence=group ? 0.78 : 0.45;
  const explanation=redFlags.length
    ? 'The information provided contains a potential red flag. Seek urgent medical attention rather than relying on automated consultant matching.'
    : 'The information provided appears most compatible with a ' + specialty + ' consultation. This is a care-navigation suggestion, not a diagnosis.';
  return { careCategory:category, recommendedSpecialty:specialty, urgency, redFlags, confidence, explanation };
}
