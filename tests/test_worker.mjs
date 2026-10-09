import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
// Simula SOLO ONNX Runtime para validar integración, etiquetas, geo y fallback.
const messages=[];
const scope={postMessage:m=>messages.push(m)};
const sessionFor=(name)=>({inputNames:['input'],async run(feeds){assert.ok(feeds.input);if(name==='acoustic')return {out:{dims:[1,2],data:new Float32Array([.86,.04])}};return {out:{dims:[1,2],data:new Float32Array([.75,.15])}}}});
const fakeORT={env:{wasm:{}},Tensor:class{constructor(type,data,dims){this.type=type;this.data=data;this.dims=dims}},InferenceSession:{async create(bytes,opts){if(opts.executionProviders[0]==='webgpu')throw Error('Operador STFT no disponible en GPU');return sessionFor(bytes.length===3?'acoustic':'geo')}}};
const ctx={self:scope,console,performance,TextDecoder,Float32Array,Uint8Array,ArrayBuffer,Number,Math,Date,Map,Error,Promise,setTimeout,clearTimeout,indexedDB:null,importScripts:()=>{ctx.ort=fakeORT;ctx.self.ort=fakeORT}};
vm.createContext(ctx);const source=fs.readFileSync(new URL('../src/onnx.worker.js',import.meta.url),'utf8').replace(/minBytes:55000000/g,'minBytes:1').replace(/minBytes:300000/g,'minBytes:1').replace(/minBytes:4000000/g,'minBytes:1').replace(/minBytes:400000/g,'minBytes:1');
vm.runInContext(source,ctx);
const enc=new TextEncoder();const id=17;
await scope.onmessage({data:{type:'infer',id,audio:new Float32Array(6*32000),window:5,overlap:1,minConfidence:.1,topK:100,device:'auto',keep:false,
 localAcoustic:new Uint8Array([1,2,3]).buffer,localLabels:enc.encode('sci_name;com_name\nTinamus osgoodi;Black Tinamou\nSaltator grossus;Grosbeak\n').buffer,
 localGeo:new Uint8Array([2,3,4,5]).buffer,localGeoLabels:enc.encode('a\tTinamus osgoodi\tBlack Tinamou\nb\tSaltator grossus\tGrosbeak\n').buffer,
 lat:-4.65,lon:-79,week:15,geoEnabled:true,acousticUrl:'none',labelsUrl:'none',geoUrl:'none',geoLabelsUrl:'none'}});
const last=messages.findLast(m=>m.type==='result');assert.ok(last,last?.error);assert.equal(last.ok,true);assert.equal(last.detections.length,2);assert.equal(last.detections[0].species,'Tinamus osgoodi');assert.equal(last.detections[0].geo,.75);assert.equal(last.detections[0].start,0);assert.equal(last.detections[1].start,4);assert.ok(messages.some(m=>m.type==='info'&&m.message.toLowerCase().includes('webgpu')));
console.log('TEST trabajador ONNX simulado: 2 ventanas, 1 especie, Geo alineado por nombre, fallback GPU→WASM: PASS');
