import {computeCreator} from './creator-data.js';
import {fitHairGuides} from './creator-hair.js';
self.onmessage=event=>{const {id,context,input,method='body'}=event.data||{};try{if(!['body','hair'].includes(method))throw Error('Unsupported character worker method.');const result=method==='body'?computeCreator(input):fitHairGuides(input);self.postMessage({id,context,result},result.positions?[result.positions.buffer]:[]);}catch(e){self.postMessage({id,context,error:e.message});}};
