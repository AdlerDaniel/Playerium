export const THEMES=[
 {id:'light-brown',name:'Светло-коричневая',scheme:'light',colors:['#ded0bd','#f6efe5','#eee3d4','#e5d6c1','#dcc9ae','#d0b895','#bea07a','#392b20','#6b5541','#795333','#563923','#ffffff','#bda17a']},
 {id:'dark-brown',name:'Тёмно-коричневая',scheme:'dark',colors:['#160f0c','#251b16','#30231c','#3b2b22','#463228','#574034','#705442','#f4e9da','#c8b49e','#d8ad78','#eac391','#24190f','#76523a']},
 {id:'burgundy',name:'Бургунди',scheme:'dark',colors:['#160a0f','#28131c','#331924','#40202d','#4c2636','#603146','#78455a','#fcebf1','#d3aebd','#f093b5','#ffb2cf','#35111e','#85334f']},
 {id:'green',name:'Зелёная',scheme:'dark',colors:['#08130e','#11251b','#172f22','#1e3a2b','#264635','#325741','#426f55','#eaf8ee','#afc9b8','#68de94','#91efb1','#082414','#347752']},
 {id:'blue',name:'Синяя',scheme:'dark',colors:['#09111e','#122238','#182c46','#203652','#294363','#355477','#48688a','#edf4ff','#adc1db','#85b9ff','#acd0ff','#102c50','#365f96']},
 {id:'yellow',name:'Жёлтая',scheme:'dark',colors:['#181507','#282311','#342d17','#40371d','#4c4224','#61532d','#796b3b','#fff8dc','#d4c797','#f4d45c','#ffe789','#322809','#8a742a']}
];
export function currentTheme(){try{return THEMES.find(t=>t.id===localStorage.getItem('playerium_theme'))||THEMES[3];}catch{return THEMES[3];}}
export function applyTheme(id,persist=true){
 const theme=THEMES.find(t=>t.id===id)||THEMES[3],c=theme.colors,root=document.documentElement;
 const keys=['--sp-black','--sp-dark-900','--sp-dark-800','--sp-dark-700','--sp-dark-600','--sp-dark-500','--sp-dark-400','--sp-text-primary','--sp-text-secondary','--sp-green','--sp-green-hover','--sp-on-accent','--theme-hero'];
 keys.forEach((key,i)=>root.style.setProperty(key,c[i]));
 root.style.setProperty('--sp-text-subdued',c[8]);root.style.setProperty('--sp-green-active',c[9]);root.style.setProperty('--sp-theme-color',c[9]);
 root.style.setProperty('--theme-hover',theme.scheme==='light'?'#392b2010':'#ffffff10');root.style.setProperty('--theme-selection',theme.scheme==='light'?'#79533322':c[9]+'24');
 root.dataset.theme=theme.id;root.style.colorScheme=theme.scheme;
 document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.content=c[0]);document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',theme.scheme);
 if(persist)try{localStorage.setItem('playerium_theme',theme.id);}catch{}
 return theme;
}
applyTheme(currentTheme().id,false);
