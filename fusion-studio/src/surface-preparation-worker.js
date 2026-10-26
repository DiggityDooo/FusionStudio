import {surfacePreparationReply} from './surface-preparation.js';
self.onmessage=({data})=>{self.postMessage(surfacePreparationReply(data,progress=>self.postMessage(progress)));};
