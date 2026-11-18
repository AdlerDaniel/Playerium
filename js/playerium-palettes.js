// Each row follows the same semantic color order as the Sounder palettes.
const roles = 'bg panel surface hover selection line border track text muted disabled accent accent_base on_accent accent_hover'.split(' ');
const palettes = [
 ['neutral','Обычная','dark','#161616 #1e1e1e #292929 #353535 #414141 #4b4b4b #5b5b5b #737373 #f4f4f4 #b8b8b8 #939393 #dedede #ababab #161616 #ededed'],
 ['neutral','Обычная','light','#f4f4f4 #fafafa #ebebeb #e2e2e2 #d8d8d8 #c9c9c9 #b8b8b8 #858585 #161616 #4d4d4d #686868 #303030 #ababab #f4f4f4 #202020'],
 ['sky','Голубая','dark','#10191e #132129 #173240 #1a3e50 #234b5e #2b5c70 #397189 #4c899f #def6ff #a3d7eb #7ba5b5 #99dae9 #4da9c3 #10232a #ade4f0'],
 ['sky','Голубая','light','#f9fdfe #f0faff #e0f3fa #ccecf7 #bae3f1 #a6d7e9 #8ac8dd #56a6be #133746 #286177 #587d8a #21677b #4da9c3 #f5fcff #19576a'],
 ['orange','Оранжевая','dark','#1b130e #231810 #392414 #4b2c15 #59361a #70441f #8c5728 #ad6c34 #ffe6ce #f8b47e #bc8159 #ed9e60 #e07937 #1b130e #f4af7b'],
 ['orange','Оранжевая','light','#fffcfa #fff7ef #ffecd9 #ffe1c5 #fbd2aa #f0bf95 #e5a773 #cf8b52 #522d18 #863f1a #ad7655 #a64a17 #e07937 #fffaf5 #8f3d12'],
 ['rose','Розовая','dark','#1c1219 #241620 #382032 #48253e #572b4a #6a365c #854572 #a4588d #ffe2f0 #f6aacd #ba779d #eca0c8 #d464a0 #1c1219 #f3b2d5'],
 ['rose','Розовая','light','#fffbfd #fff5fa #fae8f2 #f6dcec #f1cce2 #e9b7d6 #dfa2c6 #c77da7 #502639 #81345b #aa6c8d #9d3c6d #d464a0 #fff9fc #87315c']
];

export const PLAYERIUM_PALETTES = palettes.map(([accent,name,scheme,colors]) => {
 const tokens = Object.fromEntries(colors.split(' ').map((color,index) => [roles[index],color]));
 Object.assign(tokens,{thumb:'#f4f4f4',wave:tokens.track,tooltip:tokens.surface,icon:tokens.muted,wave_bg:tokens.panel,cursor:tokens.text});
 return {id:`${accent}-${scheme}`,accent,name,scheme,tokens};
});
