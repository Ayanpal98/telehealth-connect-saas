import { MedicalCase, UserProfile } from '../types';
import { assessConcern } from './assessmentEngine';
import { ConsultantMatch, IntelligenceResult } from './types';

const EARTH_RADIUS_KM=6371;
function distanceKm(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}) {
  const dLat=(b.latitude-a.latitude)*Math.PI/180, dLon=(b.longitude-a.longitude)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a.latitude*Math.PI/180)*Math.cos(b.latitude*Math.PI/180)*Math.sin(dLon/2)**2;
  return EARTH_RADIUS_KM*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

export function runIntelligence(medicalCase:MedicalCase, consultants:UserProfile[]):IntelligenceResult {
  const assessment=assessConcern({symptoms:medicalCase.symptoms,requestedSpecialty:medicalCase.requiredSpecialty,location:medicalCase.location});
  const matches:ConsultantMatch[]=[];
  for(const c of consultants){
    if(c.role!=='clinician' || !c.isAvailable) continue;
    const reasons:string[]=[]; let score=0; let distance:number|undefined;
    if(c.specialty===assessment.recommendedSpecialty){score+=50; reasons.push('Specialty matches the identified care category.');}
    else if(assessment.recommendedSpecialty==='General Medicine'){score+=25; reasons.push('General Medicine is suitable for initial care navigation.');}
    if(medicalCase.location && c.location){
      distance=distanceKm(medicalCase.location,c.location);
      score+=Math.max(0,30-Math.min(distance,30));
      reasons.push(distance.toFixed(1) + ' km from the supplied location.');
    }
    score+=15; reasons.push('Currently marked available.');
    matches.push({consultantId:c.uid,consultantName:c.displayName||c.email,specialty:c.specialty,matchScore:Math.min(100,Math.round(score)),distanceKm:distance,reasons});
  }
  matches.sort((a,b)=>b.matchScore-a.matchScore || (a.distanceKm??999)-(b.distanceKm??999));
  return {assessment,matches:matches.slice(0,5),nextStep:assessment.urgency==='emergency'?'emergency-guidance':'consultation',generatedAt:new Date().toISOString()};
}
