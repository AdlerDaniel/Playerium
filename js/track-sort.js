export function changeTrackSort(ui,field,toggle=true){
 ui.sortAsc=toggle&&ui.sortBy===field?!ui.sortAsc:field!=='dateAdded';
 ui.sortBy=field;ui.tableSortExplicit=true;
 const scroll=document.getElementById('mainScrollContainer'),top=scroll?.scrollTop||0;
 ui.refreshCurrentView();if(scroll)scroll.scrollTop=top;
}
