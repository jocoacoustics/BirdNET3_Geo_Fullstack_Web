import io,math,struct,wave,tempfile,subprocess,os,time,re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with tempfile.NamedTemporaryFile(suffix='.wav',prefix='P-BLACKT_20260419_060002_30_',delete=False) as tf: wav_path=tf.name
with wave.open(wav_path,'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(32000)
    f.writeframes(b''.join(struct.pack('<h',int(8000*math.sin(2*math.pi*820*i/32000))) for i in range(32000*10)))
server=subprocess.Popen(['python','-m','http.server','8955','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(.7)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--no-proxy-server'])
        page=browser.new_page(viewport={'width':1440,'height':960},accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        html=(root/'index.html').read_text()
        html=re.sub(r'<link[^>]*stylesheet[^>]*>', '',html)
        html=re.sub(r'<script[^>]*src="./src/app.js"[^>]*></script>', '',html)
        page.set_content(html.replace('<head>','<head><base href="https://example.test/">'))
        page.add_style_tag(content=(root/'style.css').read_text())
        conf=(root/'config.yaml').read_text()
        page.evaluate('''''''''() => {
          const memory=new Map();
          Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:(k)=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v))}});
          window.Worker=class FakeWorker{
            constructor(){this.onmessage=null;}
            postMessage(m){
              const send=(type,extra)=>this.onmessage?.({data:{id:m.id,type,...extra}});
              if(m.type==='infer'){
                window.__lastInfer=m;
                setTimeout(()=>send('stage',{stage:'Descargando desde Zenodo',percent:25}),40);
                setTimeout(()=>send('provider',{provider:'CPU · WASM'}),100);
                setTimeout(()=>send('stage',{stage:'Analizando · 1 de 2',percent:50,kind:'analysis'}),200);
                setTimeout(()=>send('result',{ok:true,windows:2,durationMs:280,geoStatus:'Omitido: sin coordenadas',detections:[
                  {start:0,end:5,species:'Scytalopus micropterus',common:'Tapaculo',acoustic:.81,geo:null,kind:'Detección'},
                  {start:4,end:9,species:'Saltator grossus',common:'Grosbeak',acoustic:.73,geo:null,kind:'Detección'}]}),750);
              }else if(m.type==='status')setTimeout(()=>send('result',{ok:true,assets:[{name:'acústico',cached:false,bytes:0},{name:'Geo',cached:false,bytes:0}]}),15);
              else if(m.type==='clear')setTimeout(()=>send('result',{ok:true}),15);
            }
            terminate(){}
          };
        }''''''''' )
        page.evaluate('(s)=>{window.fetch=async()=>({ok:true,text:async()=>s})}',conf)
        src=(root/'src/app.js').read_text().replace("new URL('./onnx.worker.js',import.meta.url)","'./onnx.worker.js'")
        page.add_script_tag(content='(async()=>{'+src+'})().catch(console.error)')
        page.wait_for_timeout(250)
        assert page.locator('#cacheDetail').is_visible()
        assert 'pendiente' in page.locator('#cacheDetail').inner_text()
        page.locator('#keepModels').uncheck()
        assert page.evaluate("localStorage.getItem('birdnet_keep_models_v021')")=='false'
        assert page.evaluate("localStorage.getItem('birdnet_keep_models_v021')")=='false'
        page.locator('#keepModels').check()
        page.locator('#audioFile').set_input_files(wav_path)
        page.wait_for_timeout(120)
        assert page.locator('#fileProgress').is_visible(), 'La barra no aparece en tarjeta audio'
        page.wait_for_timeout(1600)
        assert page.locator('#fileProgress').is_hidden()
        assert 'P-BLACKT' in page.locator('#fileInfo').inner_text()
        assert page.locator('#date').input_value()=='2026-04-19'
        assert page.locator('#hour').input_value()=='06:00:02'
        assert page.locator('#zone').input_value()=='-05:00'
        assert page.locator('#detectionsBody tr[data-id]').count()==2
        urls=page.evaluate('({a:window.__lastInfer.acousticUrl,g:window.__lastInfer.geoUrl,l:window.__lastInfer.labelsUrl})')
        assert 'zenodo.org/records/20703646' in urls['a'],urls
        assert 'birdnet-team.github.io/geomodel/demo/' in urls['g'],urls
        assert '/models/acoustic_fp16.onnx' not in urls['a'],urls
        page.locator('#detectionsBody tr[data-id="1"] .playrow').click()
        page.wait_for_timeout(250)
        assert page.evaluate('document.querySelector("#audioPlayer").currentTime') >=3.8
        page.locator('#viewAll').click()
        page.locator('#scale').select_option('linear')
        assert not errors,errors
        page.screenshot(path=str(root/'tests/browser_preview.png'),full_page=True)
        browser.close()
    print('TEST BROWSER PASS: fuente oficial, caché preferencia persistida, barra/audio, metadatos, predicciones ilustrativas, reproducción, sin errores JS')
finally:
    server.terminate();server.wait(timeout=5)
    os.remove(wav_path)
