import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const messages=[];const self={postMessage:m=>messages.push(m)};
const ctx={self,console,performance,TextDecoder,Float32Array,Uint8Array,ArrayBuffer,Number,Math,Date,Map,Error,Promise,setTimeout,clearTimeout,
  indexedDB:null,fetch:async()=>{throw new TypeError('Failed to fetch: CORS')},importScripts:()=>{const ort={env:{wasm:{}},InferenceSession:{},Tensor:class{}};ctx.ort=ort;self.ort=ort}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('../src/onnx.worker.js',import.meta.url),'utf8'),ctx);
await self.onmessage({data:{type:'infer',id:44,audio:new Float32Array(32_000*5),window:5,overlap:1,device:'auto',keep:false,
 acousticUrl:'https://zenodo.org/api/records/20703646/files/BirdNET%2B_model.onnx/content',labelsUrl:'https://zenodo.org/api/records/20703646/files/labels.csv/content'}});
const details=messages.filter(m=>m.type==='trace').map(m=>m.message).join('\n');
assert.match(details,/v0.2.2/);
assert.match(details,/Recurso solicitado: BirdNET acústico/);
assert.match(details,/Iniciando fetch:/);
assert.match(details,/fetch falló/);
assert.match(details,/CORS/);
const r=messages.findLast(m=>m.type==='result');assert.equal(r.ok,false);assert.match(r.error,/Etapa=fetch/);assert.match(r.error,/URL=/);
console.log('TEST DIAGNÓSTICO v0.2.2 PASS: versión, recurso, URL, etapa fetch, CORS y error completo');
