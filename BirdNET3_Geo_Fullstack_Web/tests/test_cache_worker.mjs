import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const messages=[],data=new Map();
const self={postMessage:m=>messages.push(m)};
const db={
  createObjectStore(){return {}},close(){},
  transaction(){const tx={oncomplete:null,onerror:null,objectStore(){return {
    get(key){const req={onsuccess:null,onerror:null,result:null};queueMicrotask(()=>{req.result=data.get(key);req.onsuccess?.()});return req},
    put(value,key){queueMicrotask(()=>{data.set(key,value);tx.oncomplete?.()})},
    delete(key){queueMicrotask(()=>{data.delete(key);tx.oncomplete?.()})},
    clear(){queueMicrotask(()=>{data.clear();tx.oncomplete?.()})}
  }}};return tx}
};
const indexedDB={open(){const req={result:db,onupgradeneeded:null,onsuccess:null,onerror:null};queueMicrotask(()=>{req.onupgradeneeded?.();req.onsuccess?.()});return req}};
const ort={env:{wasm:{}},Tensor:class{constructor(type,data,dims){Object.assign(this,{type,data,dims})}},InferenceSession:{async create(buf){const n=buf.length;return {inputNames:['input'],async run(){return {pred:{dims:[1,2],data:n===3?new Float32Array([.86,.04]):new Float32Array([.74,.15])}}}}}}};
const ctx={self,console,performance,TextDecoder,Float32Array,Uint8Array,ArrayBuffer,Number,Math,Date,Map,Error,Promise,setTimeout,clearTimeout,indexedDB,fetch:async()=>{throw new TypeError('Failed to fetch')},importScripts:()=>{ctx.ort=ort;self.ort=ort}};
vm.createContext(ctx);
const src=fs.readFileSync(new URL('../src/onnx.worker.js',import.meta.url),'utf8').replaceAll('minBytes:55000000','minBytes:1').replaceAll('minBytes:300000','minBytes:1').replaceAll('minBytes:4000000','minBytes:1').replaceAll('minBytes:400000','minBytes:1');
vm.runInContext(src,ctx);
const enc=new TextEncoder();const urls={acousticUrl:'https://zenodo.org/model.onnx',labelsUrl:'https://zenodo.org/labels.csv',geoUrl:'https://birdnet-team.github.io/geomodel/demo/a.onnx',geoLabelsUrl:'https://birdnet-team.github.io/geomodel/demo/labels.txt'};
const send=async(type,args={})=>{messages.length=0;await self.onmessage({data:{type,id:13,...args}});const r=messages.findLast(x=>x.type==='result');assert.ok(r,JSON.stringify(messages));return r};
const base={...urls,device:'wasm',keep:true,audio:new Float32Array(32000*5),window:5,overlap:1,minConfidence:.1,topK:5,geoEnabled:true,lat:-4.6,lon:-79,week:16,
 localAcoustic:new Uint8Array([1,2,3]).buffer,localLabels:enc.encode('sci_name;com_name\nTinamus osgoodi;Black Tinamou\nSaltator grossus;Grosbeak\n').buffer,
 localGeo:new Uint8Array([4,5,6,7]).buffer,localGeoLabels:enc.encode('a\tTinamus osgoodi\tBlack Tinamou\nb\tSaltator grossus\tGrosbeak\n').buffer};
const first=await send('infer',base);assert.equal(first.ok,true,first.error);assert.equal(data.size,4,'Importación local debe persistir 4 recursos');
const status=await send('status',urls);assert.equal(status.assets.filter(a=>a.cached).length,4);
const cleared=await send('clear');assert.equal(cleared.ok,true);assert.equal(data.size,0);
const fail=await send('infer',{...base,localAcoustic:null,localLabels:null,localGeo:null,localGeoLabels:null});assert.equal(fail.ok,false);assert.match(fail.error,/CORS/);assert.match(fail.error,/Archivos locales alternativos/);
console.log('TEST CACHE PASS: importación manual persiste 4 recursos, estado, limpieza y error CORS orientativo');
