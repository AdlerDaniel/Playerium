import {measurePCM} from './loudness.js';
self.onmessage=({data})=>self.postMessage(measurePCM(data.input,data.weighted,data.rate));
