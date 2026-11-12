export function volumeIcon(volume,muted=false){
 const speaker='<path d="M11 5 6 9H3v6h3l5 4Z"/>';
 const waves=muted||volume===0?'<path d="m16 9 5 6m0-6-5 6"/>':volume<.5?'<path d="M15 8a6 6 0 0 1 0 8"/>':'<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>';
 return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${speaker}${waves}</svg>`;
}
