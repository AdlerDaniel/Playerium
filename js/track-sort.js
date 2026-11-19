import {icons} from './design-icons.js';

export function updateSortDirection(button,ascending,description) {
 button.innerHTML=icons.direction;
 button.dataset.ascending=String(ascending);
 button.title=description;
 button.setAttribute('aria-label',description);
}

export function changeTrackSort(ui,field,toggle=true,direction){
 ui.sortAsc=direction ?? (toggle&&ui.sortBy===field?!ui.sortAsc:field!=='dateAdded');
 ui.sortBy=field;ui.tableSortExplicit=true;
 const scroll=document.getElementById('mainScrollContainer'),top=scroll?.scrollTop||0;
 ui.refreshCurrentView();if(scroll)scroll.scrollTop=top;
}
