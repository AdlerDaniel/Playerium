// Runs once at the previous file:// origin before switching to secure app assets.
(async () => {
  const settings = {};
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); settings[key] = localStorage.getItem(key); }
  const request = indexedDB.open('spotify_local_player_db');
  request.onerror = () => window.AndroidBridge.saveLegacyLibrary(JSON.stringify({settings}));
  request.onsuccess = async () => {
    const db = request.result;
    const result = {settings};
    for (const name of ['tracks','playlists','folders']) {
      if (!db.objectStoreNames.contains(name)) continue;
      result[name] = await new Promise(resolve => {
        const req = db.transaction(name).objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result); req.onerror = () => resolve([]);
      });
    }
    db.close();
    window.AndroidBridge.saveLegacyLibrary(JSON.stringify(result));
  };
})();
