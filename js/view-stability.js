export function viewFingerprint(ui){
 const tracks=ui.library.getTracks().map(t=>[t.id,t.title,t.artist,t.pictureUrl,t.duration,!!t.liked,t.dateAdded]);
 const playlists=ui.library.getPlaylists().map(p=>[p.id,p.name,p.description,p.trackIds,p.coverType,p.coverUrl]);
 const collectionArt=[ui.library.likedArtwork,ui.library.addedArtwork].map(art=>[art?.coverUrl,art?.generating]);
 return JSON.stringify([tracks,playlists,collectionArt,ui.library.folders,!!ui.library.importing,ui.isMobile,ui.homeFilter,ui.libraryTab,ui.librarySort,ui.libraryLayout,ui.sortBy,ui.sortAsc,ui.searchQuery]);
}
export function restoreViewState(container,state){
 for(const [key,left,top] of state){const element=container.querySelector(`[data-scroll-key="${key}"]`);if(element){element.scrollLeft=left;element.scrollTop=top;}}
}
export function captureViewState(container){return [...container.querySelectorAll('[data-scroll-key]')].map(el=>[el.dataset.scrollKey,el.scrollLeft,el.scrollTop]);}
