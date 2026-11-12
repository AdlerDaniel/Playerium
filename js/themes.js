import {SOUNDER_PALETTES} from './sounder-palettes.js';
export const THEMES=SOUNDER_PALETTES.map(t=>({...t,colors:[t.tokens.bg,t.tokens.panel,t.tokens.surface,t.tokens.hover,t.tokens.selection,t.tokens.track,t.tokens.border,t.tokens.text,t.tokens.muted,t.tokens.accent,t.tokens.accent_hover,t.tokens.on_accent,t.tokens.selection]}));
const legacy={'light-brown':'brown-light','dark-brown':'brown-dark',burgundy:'red-dark',green:'green-dark',blue:'blue-dark',yellow:'yellow-dark',dark:'violet-dark',light:'violet-light'};
export function currentTheme(){try{const id=localStorage.getItem('playerium_theme');return THEMES.find(t=>t.id===(legacy[id]||id))||THEMES[0];}catch{return THEMES[0];}}
export function applyTheme(id,persist=true){
 const theme=THEMES.find(t=>t.id===(legacy[id]||id))||THEMES[0],p=theme.tokens,root=document.documentElement;
 const values={'sp-black':p.bg,'sp-dark-900':p.panel,'sp-dark-800':p.surface,'sp-dark-700':p.hover,'sp-dark-600':p.selection,'sp-dark-500':p.track,'sp-dark-400':p.border,'sp-text-primary':p.text,'sp-text-secondary':p.muted,'sp-text-subdued':p.muted,'sp-green':p.accent,'sp-green-hover':p.accent_hover,'sp-green-active':p.accent,'sp-on-accent':p.on_accent,'sp-theme-color':p.accent,'theme-hero':p.selection,'theme-home-top':p.panel,'theme-border':p.line,'theme-accent-soft':p.selection,'theme-hover':p.hover,'theme-selection':p.selection,'surface-control':p.surface,'surface-overlay':p.panel,'surface-selected':p.selection,'surface-control-hover':p.hover,'control-inactive':p.muted,'control-active':p.accent};
 for(const [key,value] of Object.entries(values))root.style.setProperty('--'+key,value);
 for(const [key,value] of Object.entries(p))root.style.setProperty('--sounder-'+key.replace(/_/g,'-'),value);
 root.dataset.theme=theme.id;root.style.colorScheme=theme.scheme;
 document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.content=p.bg);document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',theme.scheme);
 if(persist)try{localStorage.setItem('playerium_theme',theme.id);}catch{}
 return theme;
}
applyTheme(currentTheme().id,false);
