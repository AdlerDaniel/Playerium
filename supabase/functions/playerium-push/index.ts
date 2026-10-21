import { pushHandler } from './handler.js';
Deno.serve(pushHandler({ env: (key: string) => Deno.env.get(key) }));
