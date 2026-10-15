const {buildSync}=require('esbuild');
buildSync({stdin:{contents:"export {RealtimeClient} from '@supabase/realtime-js';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',target:'chrome74',minify:true,outfile:'js/vendor/realtime.js',legalComments:'eof'});
const fs=require('node:fs');
const notices=['node_modules/@supabase/realtime-js/LICENSE','node_modules/@supabase/phoenix/LICENSE.md','node_modules/tslib/LICENSE.txt'];
fs.writeFileSync('js/vendor/realtime.LICENSE.txt',notices.map(file=>fs.readFileSync(file,'utf8')).join('\n\n'));
