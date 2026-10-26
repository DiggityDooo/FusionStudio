export function isClothContactAudit(audit){
 const counts=['testedPairs','adjacentPairs','crossings','coplanarOverlaps','clearanceViolations','degenerateFaces','pairBudget'];
 return !!audit&&typeof audit.complete==='boolean'&&counts.every(k=>Number.isSafeInteger(audit[k])&&audit[k]>=0)&&Number.isFinite(audit.requiredGapM)&&audit.requiredGapM>0&&Number.isFinite(audit.gapToleranceM)&&audit.gapToleranceM>=0&&Number.isFinite(audit.milliseconds)&&audit.milliseconds>=0&&(audit.minimumTestedGapM===null||Number.isFinite(audit.minimumTestedGapM)&&audit.minimumTestedGapM>=0)&&Array.isArray(audit.samples)&&audit.samples.length<=32&&audit.samples.every(s=>s&&Number.isSafeInteger(s.faceA)&&s.faceA>=0&&Number.isSafeInteger(s.faceB)&&s.faceB>=0&&['crossing','coplanar overlap','clearance'].includes(s.kind));
}
export function clothContactIssues(audit){
 if(!audit)return [];
 if(!isClothContactAudit(audit))return ['Cloth contact inspection is invalid; inspect or re-drape the garment again.'];
 const issues=[];
 if(!audit.complete)issues.push(audit.localSearchComplete===false?'Cloth contact inspection is incomplete: local surface search exceeded its work limit. Reduce mesh density or inspect separate panels.':audit.testedPairs+audit.adjacentPairs>=audit.pairBudget?'Cloth contact inspection is incomplete: the face-pair work limit was reached. Reduce mesh density or inspect separate panels.':'Cloth contact inspection is incomplete. Repair collapsed faces or reduce the mesh size before final use.');
 if(audit.degenerateFaces)issues.push(`${audit.degenerateFaces} collapsed cloth faces need repair.`);
 if(audit.crossings)issues.push(`${audit.crossings} non-adjacent cloth face pairs cross.`);
 if(audit.coplanarOverlaps)issues.push(`${audit.coplanarOverlaps} non-adjacent cloth face pairs overlap in the same plane.`);
 if(audit.clearanceViolations)issues.push(`${audit.clearanceViolations} cloth face pairs are closer than the ${(audit.requiredGapM*1000).toFixed(2)} mm contact gap.`);
 return issues;
}
