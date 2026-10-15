const {buildSync}=require('esbuild');
buildSync({stdin:{contents:"export {RealtimeClient} from '@supabase/realtime-js';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',target:'chrome74',minify:true,outfile:'js/vendor/realtime.js',legalComments:'eof'});
require('node:fs').copyFileSync('node_modules/@supabase/realtime-js/LICENSE','js/vendor/realtime.LICENSE.txt');
