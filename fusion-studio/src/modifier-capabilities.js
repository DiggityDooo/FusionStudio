import capabilities from '../electron/modifier-capabilities.json' with {type:'json'};
export function modifierCapability(action){return capabilities[action]||null;}
export function stackRequirements(entries){
  const active=entries.filter(e=>e.enabled),requirements={topology:'preserves',uv:'preserves',materials:'preserves',mapping:'preserves'};
  for(const entry of active){const c=modifierCapability(entry.action);if(!c)throw Error('Unsupported modifier: '+entry.action);for(const key of Object.keys(requirements))if(c[key]!=='preserves')requirements[key]=c[key];}
  return requirements;
}
