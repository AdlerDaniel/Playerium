import {normalize} from './music-match.js';
import {positionFloating,watchFloating} from './floating-surfaces.js';
import {icons} from './design-icons.js';

export function suggestionItems(library,raw,recent=[]){
  const query=normalize(raw);if(!query)return [];
  const starts=value=>normalize(value).startsWith(query),matches=value=>normalize(value).includes(query),items=[];
  const artists=[...new Set(library.getTracks().flatMap(t=>[t.artist]).filter(Boolean))].filter(matches).sort((a,b)=>Number(starts(b))-Number(starts(a))||a.localeCompare(b,'ru'));
  for(const name of artists.slice(0,2))items.push({kind:'artist',value:name,label:name,detail:'Исполнитель'});
  for(const track of library.getTracks().filter(t=>matches(t.title)||matches(t.artist)).sort((a,b)=>Number(starts(b.title))-Number(starts(a.title))||a.title.localeCompare(b.title,'ru')).slice(0,3))items.push({kind:'track',value:`${track.artist} ${track.title}`,label:track.title,detail:track.artist});
  for(const value of recent.filter(value=>typeof value==='string'&&matches(value)).slice(0,2))items.push({kind:'query',value,label:value,detail:'Недавний запрос'});
  return [...new Map(items.map(item=>[item.kind+'|'+normalize(item.value),item])).values()].slice(0,6);
}

export class SearchSuggestions{
  constructor(ui){this.ui=ui;this.bound=new WeakSet();document.addEventListener('pointerdown',e=>{if(this.panel&&!this.panel.contains(e.target)&&e.target!==this.input)this.close();});document.addEventListener('scroll',e=>{if(this.panel&&!this.panel.contains(e.target))this.close();},true);}
  close(){this.unwatch?.();this.unwatch=null;this.panel?.remove();this.panel=null;this.input?.setAttribute('aria-expanded','false');this.input?.removeAttribute('aria-activedescendant');this.active=-1;}
  bind(input){if(!input||this.bound.has(input))return;this.bound.add(input);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-controls','playerium-search-suggestions');
    input.addEventListener('focus',()=>this.show(input));input.addEventListener('input',()=>queueMicrotask(()=>{const current=input.isConnected?input:document.querySelector('.mobile-search-input');if(current&&document.activeElement===current)this.show(current);}));
    input.addEventListener('blur',()=>setTimeout(()=>{if(this.input===input&&!this.panel?.contains(document.activeElement))this.close();},0));
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&this.panel){e.preventDefault();e.stopImmediatePropagation();this.close();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(!this.panel)this.show(input);if(!this.panel)return;e.preventDefault();e.stopImmediatePropagation();this.active=(this.active+(e.key==='ArrowDown'?1:-1)+this.items.length)%this.items.length;this.highlight();}
      else if(e.key==='Enter'&&this.panel&&this.active>=0){e.preventDefault();e.stopImmediatePropagation();this.choose(this.items[this.active]);}
      else if(e.key==='Tab')this.close();
    },true);
  }
  show(input){let recent=[];try{recent=JSON.parse(localStorage.getItem('playerium_search_history')||'[]');}catch{}const items=suggestionItems(this.ui.library,input.value,Array.isArray(recent)?recent:[]);this.close();if(!items.length||!input.isConnected)return;this.input=input;this.items=items;this.active=-1;
    const panel=document.createElement('div');panel.className='search-suggestions';panel.id='playerium-search-suggestions';panel.setAttribute('role','listbox');panel.setAttribute('aria-label','Подсказки поиска');panel.style.width=input.closest('.mobile-search-bar-box,.search-container')?.getBoundingClientRect().width+'px';
    for(const [i,item] of items.entries()){const option=document.createElement('div');option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.id='search-suggestion-'+i;option.innerHTML=`${item.kind==='artist'?icons.artist:icons.search}<span><strong></strong><small></small></span>`;option.querySelector('strong').textContent=item.label;option.querySelector('small').textContent=item.detail;option.onpointerdown=e=>e.preventDefault();option.onclick=()=>this.choose(item);panel.append(option);}
    this.panel=panel;document.body.append(panel);input.setAttribute('aria-expanded','true');positionFloating(panel,{anchor:input.closest('.mobile-search-bar-box')||input});this.unwatch=watchFloating(panel,{anchor:input.closest('.mobile-search-bar-box')||input});
  }
  highlight(){for(const [i,option] of [...this.panel.children].entries()){option.setAttribute('aria-selected',String(i===this.active));if(i===this.active){this.input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}}}
  choose(item){this.close();if(item.kind==='artist'){this.ui.navigateTo({type:'artist',id:item.value,title:item.value});return;}this.ui.searchQuery=item.value;document.getElementById('mainSearchInput').value=item.value;if(this.ui.currentView.type!=='search')this.ui.navigateTo({type:'search',title:'Поиск'});else this.ui.refreshCurrentView();}
}
