/* BirdNET Web v0.2.2 — ONNX worker. Audio never leaves the browser.
   Acoustics follows the official BirdNET+ web-demo input: [batch, 32000 * seconds].
   Geo follows BirdNET geomodel demo input: [batch, 3] lat/lon/week (1..48).
*/
let ortLib=null, acoustic=null, geo=null, acousticBytes=null, geoBytes=null;
let labels=[], geoLabels=[], currentProvider='ninguno';
const APP_VERSION='0.2.2';
const ORT_VERSION='1.26.0';
const ORT_CDN=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const reply=(id,type,payload={})=>self.postMessage({id,type,...payload});
const trace=(id,message,level='info')=>reply(id,'trace',{message,level});
function errorText(e){return e?.stack || e?.message || String(e)}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('birdnet-web-models-v2',1);req.onupgradeneeded=()=>req.result.createObjectStore('assets');req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result)})}
async function dbGet(key){const db=await openDB();try{return await new Promise((res,rej)=>{const q=db.transaction('assets','readonly').objectStore('assets').get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}finally{db.close()}}
async function dbPut(key,val){const db=await openDB();try{await new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').put(val,key);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}finally{db.close()}}
async function dbClear(){const db=await openDB();try{await new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').clear();t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}finally{db.close()}}
function csvCells(line,delim=';'){let out=[],s='',q=false;for(let i=0;i<line.length;i++){let c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++}else q=!q}else if(c===delim&&!q){out.push(s);s=''}else s+=c}out.push(s);return out}
function parseAcoustic(text){const rows=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),head=csvCells(rows.shift()),si=head.indexOf('sci_name'),ci=head.indexOf('com_name');if(si<0)throw Error('Etiquetas acústicas: falta columna sci_name.');return rows.map(r=>{let f=csvCells(r);return {sci:f[si]?.trim()||'',common:f[ci]?.trim()||''}}).filter(o=>o.sci)}
function parseGeo(text){return text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(r=>{const v=r.split('\t');return {sci:(v[1]||'').trim(),common:(v[2]||'').trim(),code:(v[0]||'').trim()}}).filter(o=>o.sci)}
function ensureRuntime(){if(!ortLib){importScripts(ORT_CDN+'ort.webgpu.min.js');ortLib=self.ort;if(!ortLib)throw Error('No se pudo cargar ONNX Runtime Web. Comprueba conexión a Internet.');ortLib.env.wasm.wasmPaths=ORT_CDN;ortLib.env.wasm.numThreads=1;ortLib.env.wasm.proxy=false;}return ortLib}
async function dbDelete(key){const db=await openDB();try{await new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').delete(key);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}finally{db.close()}}
const specs={
 'acoustic-v3-preview3.1':{minBytes:55000000,name:'modelo acústico oficial'},
 'labels-v3-preview3.1':{minBytes:300000,name:'etiquetas acústicas'},
 'geo-v3.0.4':{minBytes:4000000,name:'geomodel oficial'},
 'geo-labels-v3.0.4':{minBytes:400000,name:'etiquetas geográficas'}
};
function keyFor(id,url){return `${id}|${url}`}
function validateAsset(id,bytes,url){const n=bytes?.byteLength??0, spec=specs[id];if(spec&&n<spec.minBytes)throw Error(`${spec.name}: se recibieron ${n} bytes, inferior al mínimo esperado (${spec.minBytes}). URL: ${url}. Podría tratarse de una respuesta HTML, una descarga incompleta o un modelo equivocado.`);return n}
async function cachePut(requestId,key,bytes,kind){try{await dbPut(key,bytes);reply(requestId,'info',{message:`${kind}: conservado en IndexedDB (${(bytes.byteLength/1048576).toFixed(1)} MB).`})}catch(e){reply(requestId,'info',{message:`${kind}: no se pudo conservar (${e.message}). Puedes solicitar persistencia o liberar espacio.`})}}
async function acquireAsset(id,url,kind,keep,requestId,localBuffer=null){
 const key=keyFor(id,url);trace(requestId,`Recurso solicitado: ${kind}; id=${id}; URL=${url}; guardar=${keep}; archivoLocal=${!!localBuffer}`);
 // Una importación manual sirve como respaldo cuando la fuente original bloquea CORS.
 if(localBuffer){trace(requestId,`${kind}: utilizando archivo local (${localBuffer.byteLength} bytes)`);validateAsset(id,localBuffer,'archivo local');reply(requestId,'stage',{stage:`Usando ${kind} seleccionado`,percent:100});if(keep)await cachePut(requestId,key,localBuffer,kind);return localBuffer}
 if(keep){try{const cached=await dbGet(key);if(cached){try{validateAsset(id,cached,url);trace(requestId,`${kind}: encontrado en IndexedDB (${cached.byteLength} bytes)`);reply(requestId,'stage',{stage:`${kind}: recuperado de caché`,percent:100});return cached}catch(e){await dbDelete(key);reply(requestId,'info',{message:`Copia en caché no válida, se vuelve a descargar: ${e.message}`})}}}catch(e){reply(requestId,'info',{message:`No se pudo consultar la caché: ${e.message}`})}}
 reply(requestId,'stage',{stage:`Descargando ${kind} desde BirdNET`,percent:0});trace(requestId,`Iniciando fetch: ${url}`);
 let res;
 try{res=await fetch(url,{cache:'default',mode:'cors',redirect:'follow'})}
 catch(e){trace(requestId,`${kind}: fetch falló [${e.name}] ${e.message}; URL=${url}; causas posibles: CORS, red, TLS, bloqueo de extensión`, 'error');throw Error(`${kind}: descarga fallida (${e.name}: ${e.message}). URL=${url}. Etapa=fetch, antes de HTTP/ONNX. Posibles causas: CORS, red o bloqueo del navegador. Prueba el enlace oficial o importa manualmente el ONNX y etiquetas en Modelos ONNX → Archivos locales alternativos.`)}
 trace(requestId,`${kind}: respuesta HTTP ${res.status}; urlFinal=${res.url}; tipo=${res.type}; content-type=${res.headers.get('content-type')||'sin dato'}`);if(!res.ok)throw Error(`${kind}: HTTP ${res.status} ${res.statusText} al descargar ${url}; respuesta final=${res.url}.`);
 const length=Number(res.headers.get('Content-Length')||0);
 let out;
 if(!res.body){out=await res.arrayBuffer();reply(requestId,'stage',{stage:`${kind} descargado`,percent:100})}
 else{const reader=res.body.getReader();let blocks=[],total=0,last=-1;
   while(true){const {done,value}=await reader.read();if(done)break;blocks.push(value);total+=value.byteLength;const pc=length?Math.min(100,Math.floor(total/length*100)):null;
     if(pc!==last){reply(requestId,'stage',{stage:`Descargando ${kind} · ${(total/1048576).toFixed(1)} MB`,percent:pc});last=pc}}
   const buf=new Uint8Array(total);let pos=0;for(const b of blocks){buf.set(b,pos);pos+=b.length}out=buf.buffer;
 }
 validateAsset(id,out,url);trace(requestId,`${kind}: descarga terminada; bytes=${out.byteLength}; recurso validado por tamaño mínimo.`);
 if(keep)await cachePut(requestId,key,out,kind);
 return out;
}
async function cacheStatus(urls){const assets=[['acoustic-v3-preview3.1',urls.acousticUrl,'acústico'],['labels-v3-preview3.1',urls.labelsUrl,'etiquetas'],['geo-v3.0.4',urls.geoUrl,'Geo'],['geo-labels-v3.0.4',urls.geoLabelsUrl,'etiquetas Geo']];const state=[];
 for(const [id,url,name] of assets){try{const bytes=await dbGet(keyFor(id,url));let size=0;if(bytes){try{size=validateAsset(id,bytes,url)}catch(e){await dbDelete(keyFor(id,url))}}state.push({name,cached:size>0,bytes:size})}catch(e){state.push({name,cached:false,bytes:0,error:String(e)})}}
 return state;
}

async function loadSession(buffer,preference,id,kind){const lib=ensureRuntime();const attempts=preference==='wasm'?['wasm']:preference==='webgpu'?['webgpu','wasm']:['webgpu','wasm'];let lastErr=null;
 for(const provider of attempts){try{reply(id,'stage',{stage:`Inicializando ${kind} · ${provider.toUpperCase()}`,percent:92});const ses=await lib.InferenceSession.create(new Uint8Array(buffer),{executionProviders:[provider],graphOptimizationLevel:'all'});return {ses,provider}}
 catch(e){lastErr=e;reply(id,'info',{message:`${kind} ${provider.toUpperCase()} no disponible: ${e.message}; probando alternativa`})}}
 throw Error(`${kind}: no pudo cargarse en GPU ni CPU. ${lastErr?.message||''}`)
}
function predictionTensor(outputs,expected){const items=Object.values(outputs);return items.find(t=>t.dims?.length===2&&t.dims[1]===expected)||items.find(t=>t.dims?.length===2)||items[0]}
async function acousticRun(msg,id){const samples=msg.audio;const sr=32000,n=Math.round(msg.window*sr),hop=Math.max(1,Math.round((msg.window-msg.overlap)*sr));if(!(n>0&&hop>0))throw Error('Ventana o solapamiento inválidos');const starts=[];for(let i=0;i<samples.length;i+=hop){starts.push(i);if(i+n>=samples.length)break}const results=[];const t0=performance.now();let current=0;
 for(const at of starts){const signal=new Float32Array(n);signal.set(samples.subarray(at,Math.min(at+n,samples.length)));const tensor=new ortLib.Tensor('float32',signal,[1,n]);let pred;
 try{pred=await acoustic.ses.run({[acoustic.ses.inputNames[0]]:tensor})}
 catch(e){if(acoustic.provider==='webgpu'&&acousticBytes){reply(id,'info',{message:`WebGPU falló durante inferencia: ${e.message}. Cambiando a WASM.`});acoustic=await loadSession(acousticBytes,'wasm',id,'acústico');currentProvider='CPU · WASM';pred=await acoustic.ses.run({[acoustic.ses.inputNames[0]]:tensor})}else throw e}
 const out=predictionTensor(pred,labels.length),score=out.data;if(score.length!==labels.length)throw Error(`Desajuste acústico: modelo devolvió ${score.length} clases y las etiquetas contienen ${labels.length}. Comprueba que ambos archivos corresponden a la misma versión.`);const indices=[];
 for(let j=0;j<Math.min(score.length,labels.length);j++){const v=Number(score[j]);if(v>=msg.minConfidence&&Number.isFinite(v))indices.push(j)}
 indices.sort((a,b)=>score[b]-score[a]);for(const j of indices.slice(0,msg.topK))results.push({start:at/sr,end:Math.min((at+n)/sr,samples.length/sr),species:labels[j].sci,common:labels[j].common,acoustic:score[j],geo:null,kind:'Detección'});
 current++;reply(id,'stage',{stage:`Analizando audio · ${current} de ${starts.length} ventanas`,percent:Math.round(current/starts.length*100),kind:'analysis',current,total:starts.length});await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {detections:results,durationMs:performance.now()-t0,windows:starts.length,provider:currentProvider};
}
async function geoRun(msg,id){if(!Number.isFinite(msg.lat)||!Number.isFinite(msg.lon)||!Number.isFinite(msg.week))throw Error('Geo necesita latitud, longitud y semana');const input=new Float32Array([msg.lat,msg.lon,msg.week]);const feed=new ortLib.Tensor('float32',input,[1,3]);let raw;try{raw=await geo.ses.run({[geo.ses.inputNames[0]]:feed})}catch(e){if(geo.provider==='webgpu'&&geoBytes){reply(id,'info',{message:'Geo WebGPU falló; cambiando a CPU'});geo=await loadSession(geoBytes,'wasm',id,'Geo');raw=await geo.ses.run({[geo.ses.inputNames[0]]:feed})}else throw e}
 const pred=predictionTensor(raw,geoLabels.length).data;if(pred.length!==geoLabels.length)throw Error(`Desajuste Geo: ${pred.length} clases en ONNX frente a ${geoLabels.length} etiquetas.`);const map={};for(let k=0;k<Math.min(pred.length,geoLabels.length);k++)map[geoLabels[k].sci.toLowerCase()]=Number(pred[k]);return map}
self.onmessage=async(e)=>{const m=e.data,id=m.id;try{if(m.type==='clear'){await dbClear();acoustic=null;geo=null;acousticBytes=null;geoBytes=null;labels=[];geoLabels=[];reply(id,'result',{ok:true});return}
 if(m.type==='status'){reply(id,'result',{ok:true,assets:await cacheStatus(m)});return}
 if(m.type==='infer'){
 trace(id,`BirdNET Web worker v${APP_VERSION}; ONNX Runtime Web v${ORT_VERSION}; device=${m.device}; offline=no; audioSamples=${m.audio?.length||0}`);ensureRuntime();if(!acoustic||m.forceModel||m.localAcoustic||m.localLabels){const a=await acquireAsset('acoustic-v3-preview3.1',m.acousticUrl,'BirdNET acústico',m.keep,id,m.localAcoustic);const lab=await acquireAsset('labels-v3-preview3.1',m.labelsUrl,'etiquetas acústicas',m.keep,id,m.localLabels);labels=parseAcoustic(new TextDecoder().decode(lab));acousticBytes=a;acoustic=await loadSession(a,m.device,id,'acústico');currentProvider=acoustic.provider==='webgpu'?'GPU · WebGPU':'CPU · WASM';}
 reply(id,'provider',{provider:currentProvider});reply(id,'stage',{stage:'Ejecutando inferencia acústica',percent:0});const output=await acousticRun(m,id);
 let geoStatus='Omitido: no hay fecha/coordenadas válidas';
 if(m.geoEnabled&&Number.isFinite(m.lat)&&Number.isFinite(m.lon)&&Number.isFinite(m.week)){
   try{reply(id,'stage',{stage:'Preparando Geo 3.0',percent:5});if(!geo||m.localGeo||m.localGeoLabels){const gb=await acquireAsset('geo-v3.0.4',m.geoUrl,'BirdNET Geo',m.keep,id,m.localGeo);const gl=await acquireAsset('geo-labels-v3.0.4',m.geoLabelsUrl,'etiquetas Geo',m.keep,id,m.localGeoLabels);geoLabels=parseGeo(new TextDecoder().decode(gl));geoBytes=gb;geo=await loadSession(gb,m.device,id,'Geo');}const scores=await geoRun(m,id);for(const row of output.detections){row.geo=scores[row.species.toLowerCase()]??null}geoStatus='Aplicado (scores independientes)';}
   catch(err){geoStatus='No disponible: '+err.message;reply(id,'info',{message:geoStatus})}
 }
 else if(!m.geoEnabled)geoStatus='Desactivado';
 reply(id,'result',{ok:true,...output,geoStatus});return
 }
 throw Error(`Operación no reconocida: ${m.type}`)
}catch(err){reply(id,'result',{ok:false,error:errorText(err)})}}
