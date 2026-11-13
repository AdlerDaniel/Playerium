// Discard connection state without deleting tracks, files, covers or playlists.
export async function retireLibraryFeatures(library){
  await library.deleteFromStore('settings','cloudSync');
  for(const key of ['playerium_cloud_device','playerium_connect_target']){
    try{localStorage.removeItem(key);}catch{/* Storage can be unavailable in private contexts. */}
  }
}
