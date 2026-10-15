import {sessionHandler} from './handler.js';
Deno.serve(sessionHandler({env:name=>Deno.env.get(name)}));
