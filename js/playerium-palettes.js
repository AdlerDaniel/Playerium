// Each row follows the same semantic color order as the Sounder palettes.
const roles = 'bg panel surface hover selection line border track text muted disabled accent accent_base on_accent accent_hover'.split(' ');
const palettes = [
 ['neutral','Обычная','dark','#161616 #1e1e1e #292929 #353535 #414141 #4b4b4b #5b5b5b #737373 #f4f4f4 #b8b8b8 #939393 #dedede #ababab #161616 #ededed'],
 ['neutral','Обычная','light','#f4f4f4 #fafafa #ebebeb #e2e2e2 #d8d8d8 #c9c9c9 #b8b8b8 #858585 #161616 #4d4d4d #686868 #303030 #ababab #f4f4f4 #202020'],
 ['sky','Голубая','dark','#10191e #132129 #173240 #1a3e50 #234b5e #2b5c70 #397189 #4c899f #def6ff #a3d7eb #7ba5b5 #99dae9 #4da9c3 #10232a #ade4f0'],
 ['sky','Голубая','light','#f9fdfe #f0faff #e0f3fa #ccecf7 #bae3f1 #a6d7e9 #8ac8dd #56a6be #133746 #286177 #587d8a #21677b #4da9c3 #f5fcff #19576a'],
 ['rose','Нежно-розовая','dark','#1c1419 #241a21 #382631 #48313f #53394b #65465b #7c536e #a16e8a #fae5f0 #e0b6cc #b791a6 #f0b8d4 #d190ae #2b1922 #f6c9e0'],
 ['rose','Нежно-розовая','light','#fffafb #fff3f8 #fbe7f1 #f8daea #f2cfe1 #e7bbd3 #dba6c3 #bc7a9f #492a3d #784664 #946782 #874467 #d190ae #fff8fc #743658'],
 ['fuchsia','Ярко-розовая','dark','#21131d #2b1626 #421e37 #522341 #63264c #78315e #96416e #b7538c #ffdff2 #f9aace #c87ca5 #ff92cb #d64597 #2e1425 #ffa9d6'],
 ['fuchsia','Ярко-розовая','light','#fff9fd #fff0fa #fce0f1 #f8cde7 #f4bddc #e9a8ce #d98ab9 #c65c9b #551638 #832554 #a55782 #a82668 #d64597 #fff8fc #8f1b58']
];

export const PLAYERIUM_PALETTES = palettes.map(([accent,name,scheme,colors]) => {
 const tokens = Object.fromEntries(colors.split(' ').map((color,index) => [roles[index],color]));
 Object.assign(tokens,{thumb:'#f4f4f4',wave:tokens.track,tooltip:tokens.surface,icon:tokens.muted,wave_bg:tokens.panel,cursor:tokens.text});
 return {id:`${accent}-${scheme}`,accent,name,scheme,tokens};
});
