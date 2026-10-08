/* BirdNET Web v0.2.0 — ONNX worker. Audio never leaves the browser.
   Acoustics follows the official BirdNET+ web-demo input: [batch, 32000 * seconds].
   Geo follows BirdNET geomodel demo input: [batch, 3] lat/lon/week (1..48).
*/
let ortLib=null, acoustic=null, geo=null, acousticBytes=null, geoBytes=null;
let labels=[], geoLabels=[], currentProvider='ninguno';
const ORT_VERSION='1.26.0';
const ORT_CDN=`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const reply=(id,type,payload={})=>self.postMessage({id,type,...payload});
function errorText(e){return e?.stack || e?.message || String(e)}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('birdnet-web-models-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('assets');req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result)})}
async function dbGet(key){const db=await openDB();try{return await new Promise((res,rej)=>{const q=db.transaction('assets','readonly').objectStore('assets').get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}finally{db.close()}}
async function dbPut(key,val){const db=await openDB();try{await new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').put(val,key);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}finally{db.close()}}
async function dbClear(){const db=await openDB();try{await new Promise((res,rej)=>{const t=db.transaction('assets','readwrite');t.objectStore('assets').clear();t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}finally{db.close()}}
function csvCells(line,delim=';'){let out=[],s='',q=false;for(let i=0;i<line.length;i++){let c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){s+='"';i++}else q=!q}else if(c===delim&&!q){out.push(s);s=''}else s+=c}out.push(s);return out}
function parseAcoustic(text){const rows=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),head=csvCells(rows.shift()),si=head.indexOf('sci_name'),ci=head.indexOf('com_name');if(si<0)throw Error('Etiquetas acústicas: falta columna sci_name.');return rows.map(r=>{let f=csvCells(r);return {sci:f[si]?.trim()||'',common:f[ci]?.trim()||''}}).filter(o=>o.sci)}
function parseGeo(text){return text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(r=>{const v=r.split('\t');return {sci:(v[1]||'').trim(),common:(v[2]||'').trim(),code:(v[0]||'').trim()}}).filter(o=>o.sci)}
function ensureRuntime(){if(!ortLib){importScripts(ORT_CDN+'ort.webgpu.min.js');ortLib=self.ort;if(!ortLib)throw Error('No se pudo cargar ONNX Runtime Web. Comprueba conexión a Internet.');ortLib.env.wasm.wasmPaths=ORT_CDN;ortLib.env.wasm.numThreads=1;ortLib.env.wasm.proxy=false;}return ortLib}
async function acquireAsset(id,url,kind,keep,requestId,localBuffer=null){
 if(localBuffer){reply(requestId,'stage',{stage:`Leyendo ${kind} local`,percent:100});return localBuffer}
 const key=`${id}|${url}`;
 if(keep){try{const cached=await dbGet(key);if(cached){reply(requestId,'stage',{stage:`${kind}: reutilizando caché local`,percent:100});return cached}}catch(e){reply(requestId,'info',{message:`Caché no disponible: ${e.message}`})}}
 reply(requestId,'stage',{stage:`Descargando ${kind}`,percent:0});
 const res=await fetch(url,{cache:keep?'default':'no-store'});
 if(!res.ok)throw Error(`${kind}: descarga HTTP ${res.status} (${url})`);
 const length=Number(res.headers.get('Content-Length')||0);
 if(!res.body){const buf=await res.arrayBuffer();reply(requestId,'stage',{stage:`${kind} descargado`,percent:100});if(keep){try{await dbPut(key,buf)}catch(e){reply(requestId,'info',{message:`No se pudo guardar ${kind}: ${e.message}`})}}return buf}
 const reader=res.body.getReader();let blocks=[],total=0,last=-1;
 while(true){const {done,value}=await reader.read();if(done)break;blocks.push(value);total+=value.byteLength;const pc=length?Math.min(100,Math.floor(total/length*100)):null;if(pc!==last){reply(requestId,'stage',{stage:`Descargando ${kind} · ${(total/1048576).toFixed(1)} MB`,percent:pc});last=pc}}
 const buf=new Uint8Array(total);let pos=0;for(const b of blocks){buf.set(b,pos);pos+=b.length}const out=buf.buffer;
 if(keep){try{await dbPut(key,out)}catch(e){reply(requestId,'info',{message:`Caché llena o bloqueada: ${e.message}`})}}
 return out;
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
 const out=predictionTensor(pred,labels.length),score=out.data;const indices=[];
 for(let j=0;j<Math.min(score.length,labels.length);j++){const v=Number(score[j]);if(v>=msg.minConfidence&&Number.isFinite(v))indices.push(j)}
 indices.sort((a,b)=>score[b]-score[a]);for(const j of indices.slice(0,msg.topK))results.push({start:at/sr,end:Math.min((at+n)/sr,samples.length/sr),species:labels[j].sci,common:labels[j].common,acoustic:score[j],geo:null,kind:'Detección'});
 current++;reply(id,'stage',{stage:`Analizando audio · ${current} de ${starts.length} ventanas`,percent:Math.round(current/starts.length*100),kind:'analysis',current,total:starts.length});await new Promise(resolve=>setTimeout(resolve,0));
 }
 return {detections:results,durationMs:performance.now()-t0,windows:starts.length,provider:currentProvider};
}
async function geoRun(msg,id){if(!Number.isFinite(msg.lat)||!Number.isFinite(msg.lon)||!Number.isFinite(msg.week))throw Error('Geo necesita latitud, longitud y semana');const input=new Float32Array([msg.lat,msg.lon,msg.week]);const feed=new ortLib.Tensor('float32',input,[1,3]);let raw;try{raw=await geo.ses.run({[geo.ses.inputNames[0]]:feed})}catch(e){if(geo.provider==='webgpu'&&geoBytes){reply(id,'info',{message:'Geo WebGPU falló; cambiando a CPU'});geo=await loadSession(geoBytes,'wasm',id,'Geo');raw=await geo.ses.run({[geo.ses.inputNames[0]]:feed})}else throw e}
 const pred=predictionTensor(raw,geoLabels.length).data;const map={};for(let k=0;k<Math.min(pred.length,geoLabels.length);k++)map[geoLabels[k].sci.toLowerCase()]=Number(pred[k]);return map}
self.onmessage=async(e)=>{const m=e.data,id=m.id;try{if(m.type==='clear'){await dbClear();acoustic=null;geo=null;acousticBytes=null;geoBytes=null;reply(id,'result',{ok:true});return}
 if(m.type==='infer'){
 ensureRuntime();if(!acoustic||m.forceModel){const a=await acquireAsset('acoustic-v3-preview3.1',m.acousticUrl,'BirdNET acústico',m.keep,id,m.localAcoustic);const lab=await acquireAsset('labels-v3-preview3.1',m.labelsUrl,'etiquetas acústicas',m.keep,id,m.localLabels);labels=parseAcoustic(new TextDecoder().decode(lab));acousticBytes=a;acoustic=await loadSession(a,m.device,id,'acústico');currentProvider=acoustic.provider==='webgpu'?'GPU · WebGPU':'CPU · WASM';}
 reply(id,'provider',{provider:currentProvider});reply(id,'stage',{stage:'Ejecutando inferencia acústica',percent:0});const output=await acousticRun(m,id);
 let geoStatus='Omitido: no hay fecha/coordenadas válidas';
 if(m.geoEnabled&&Number.isFinite(m.lat)&&Number.isFinite(m.lon)&&Number.isFinite(m.week)){
   try{reply(id,'stage',{stage:'Preparando Geo 3.0',percent:5});if(!geo){const gb=await acquireAsset('geo-v3',m.geoUrl,'BirdNET Geo',m.keep,id,m.localGeo);const gl=await acquireAsset('geo-labels-v3',m.geoLabelsUrl,'etiquetas Geo',m.keep,id,m.localGeoLabels);geoLabels=parseGeo(new TextDecoder().decode(gl));geoBytes=gb;geo=await loadSession(gb,m.device,id,'Geo');}const scores=await geoRun(m,id);for(const row of output.detections){row.geo=scores[row.species.toLowerCase()]??null}geoStatus='Aplicado (scores independientes)';}
   catch(err){geoStatus='No disponible: '+err.message;reply(id,'info',{message:geoStatus})}
 }
 else if(!m.geoEnabled)geoStatus='Desactivado';
 reply(id,'result',{ok:true,...output,geoStatus});return
 }
 throw Error(`Operación no reconocida: ${m.type}`)
}catch(err){reply(id,'result',{ok:false,error:errorText(err)})}}
