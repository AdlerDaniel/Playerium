// Release experiment IDs are stable so individual changes can be reverted.
export const VISUAL_FEATURES={1:'surfaces',2:'typography',3:'spacing',4:'themePreview',5:'continue',6:'homeSections',7:'portraits',8:'playlistArt',9:'compactHeader',10:'density',11:'placeholders',12:'desktopPlayer',13:'cinema',14:'mobilePlayer',15:'waveform',16:'nextCard',17:'searchHistory',18:'searchHighlight',19:'devices',20:'activity'};
export const DISABLED_FEATURES=[15];
export const enabled=id=>!DISABLED_FEATURES.includes(id);
export function readPreference(key,fallback){try{return JSON.parse(localStorage.getItem('playerium_visual_'+key))??fallback;}catch{return fallback;}}
export function writePreference(key,value){try{localStorage.setItem('playerium_visual_'+key,JSON.stringify(value));}catch{}}
export const rowHeight=()=>64;
