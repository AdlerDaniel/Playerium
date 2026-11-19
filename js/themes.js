import {SOUNDER_PALETTES} from './sounder-palettes.js';
import {PLAYERIUM_PALETTES} from './playerium-palettes.js';
export const THEMES=[...SOUNDER_PALETTES,...PLAYERIUM_PALETTES].map(t=>({...t,colors:[t.tokens.bg,t.tokens.panel,t.tokens.surface,t.tokens.hover,t.tokens.selection,t.tokens.track,t.tokens.border,t.tokens.text,t.tokens.muted,t.tokens.accent,t.tokens.accent_hover,t.tokens.on_accent,t.tokens.selection]}));
const legacy={'light-brown':'brown-light','dark-brown':'brown-dark',burgundy:'red-dark',green:'green-dark',blue:'blue-dark',yellow:'yellow-dark',dark:'violet-dark',light:'violet-light','fuchsia-dark':'rose-dark','fuchsia-light':'rose-light'};
export function currentTheme(){try{const id=localStorage.getItem('playerium_theme');return THEMES.find(t=>t.id===(legacy[id]||id))||THEMES[0];}catch{return THEMES[0];}}

const rgb=hex=>[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16));
const mix=(a,b,ratio)=>a.map((c,i)=>Math.round(c+(b[i]-c)*ratio));
const luminance=color=>color.reduce((sum,c,i)=>{c/=255;return sum+[.2126,.7152,.0722][i]*(c<=.04045?c/12.92:((c+.055)/1.055)**2.4);},0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const cssRgb=color=>`rgb(${color.join(',')})`;

function playbackColors(theme){
 const panel=rgb(theme.tokens.panel),accent=rgb(theme.tokens.accent);
 let lo=0,hi=1;
 // Retain the accent hue and keep the darker state legible on the dark panel.
 if(theme.scheme==='dark'){
  for(let i=0;i<9;i++){const m=(lo+hi)/2;if(contrast(mix(panel,accent,m),panel)<3)lo=m;else hi=m;}
  return [cssRgb(accent),cssRgb(mix(panel,accent,hi))];
 }
 // A lighter accent reads as active on light palettes, without fading into the panel.
 for(let i=0;i<9;i++){const m=(lo+hi)/2;if(contrast(mix(accent,panel,m),panel)<4)hi=m;else lo=m;}
 const on=mix(accent,panel,lo);
 return [cssRgb(on),cssRgb(mix(on,[0,0,0],.47))];
}
export function applyTheme(id,persist=true){
 const theme=THEMES.find(t=>t.id===(legacy[id]||id))||THEMES[0],p=theme.tokens,root=document.documentElement;
 const [modeOn,modeOff]=playbackColors(theme);
 const [cinemaOn,cinemaOff]=theme.scheme==='dark'?[modeOn,modeOff]:playbackColors(THEMES.find(t=>t.accent===theme.accent&&t.scheme==='dark')||theme);
 const values={'sp-black':p.bg,'sp-dark-900':p.panel,'sp-dark-800':p.surface,'sp-dark-700':p.hover,'sp-dark-600':p.selection,'sp-dark-500':p.track,'sp-dark-400':p.border,'sp-text-primary':p.text,'sp-text-secondary':p.muted,'sp-text-subdued':p.muted,'sp-green':p.accent,'sp-green-hover':p.accent_hover,'sp-green-active':p.accent,'sp-on-accent':p.on_accent,'sp-theme-color':p.accent,'theme-hero':p.selection,'theme-home-top':p.panel,'theme-border':p.line,'theme-accent-soft':p.selection,'theme-hover':p.hover,'theme-selection':p.selection,'surface-control':p.surface,'surface-overlay':p.panel,'surface-selected':p.selection,'surface-control-hover':p.hover,'control-inactive':modeOff,'control-active':modeOn,'cinema-control-active':cinemaOn,'cinema-control-inactive':cinemaOff};
 for(const [key,value] of Object.entries(values))root.style.setProperty('--'+key,value);
 for(const [key,value] of Object.entries(p))root.style.setProperty('--sounder-'+key.replace(/_/g,'-'),value);
 root.dataset.theme=theme.id;root.style.colorScheme=theme.scheme;
 document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.content=p.bg);document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',theme.scheme);
 if(persist)try{localStorage.setItem('playerium_theme',theme.id);}catch{}
 return theme;
}
applyTheme(currentTheme().id,false);
