// Transactional audio replacements briefly exist beside the real recording.
// Their UUID names are owned by Playerium and must never become library entries.
export function isInternalAudioFile(value){
 const name=String(value||'').split(/[\\/]/).pop();
 return /^\.playerium-(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|normalize-).*/i.test(name);
}
