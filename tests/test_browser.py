import io,math,struct,wave,tempfile,subprocess,os,time,re,json
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with tempfile.NamedTemporaryFile(suffix='.wav',prefix='P-BLACKT_20260419_060002_30_',delete=False) as tf:
    wav_path=tf.name
with wave.open(wav_path,'wb') as f:
    f.setnchannels(1);f.setsampwidth(2);f.setframerate(32000)
    f.writeframes(b''.join(struct.pack('<h',int(8000*math.sin(2*math.pi*820*i/32000))) for i in range(32000*12)))
server=subprocess.Popen(['python','-m','http.server','8955','--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    time.sleep(.75)
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage','--no-proxy-server'])
        page=browser.new_page(viewport={'width':1440,'height':960},accept_downloads=True)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.evaluate('''() => {
          window.Worker=class FakeWorker{
            constructor(){this.onmessage=null;}
            postMessage(m){const send=(type,extra)=>this.onmessage?.({data:{id:m.id,type,...extra}});
              if(m.type==='infer'){
                setTimeout(()=>send('stage',{stage:'Descargando BirdNET acústico',percent:25}),60);
                setTimeout(()=>send('provider',{provider:'CPU · WASM'}),120);
                setTimeout(()=>send('stage',{stage:'Analizando audio · 1 de 3 ventanas',percent:33,kind:'analysis'}),350);
                setTimeout(()=>send('result',{ok:true,windows:3,durationMs:450,geoStatus:'Omitido: sin coordenadas',detections:[
                  {start:0,end:5,species:'Scytalopus micropterus',common:'Long-tailed Tapaculo',acoustic:0.81,geo:null,kind:'Detección'},
                  {start:4,end:9,species:'Saltator grossus',common:'Slate-colored Grosbeak',acoustic:0.73,geo:null,kind:'Detección'}]}),950);
              }else if(m.type==='clear')setTimeout(()=>send('result',{ok:true}),10);
            }
            terminate(){}
          };
        }''')
        
        html=(root/'index.html').read_text()
        html=re.sub(r'<link[^>]*stylesheet[^>]*>', '',html)
        html=re.sub(r'<script[^>]*src="./src/app.js"[^>]*></script>', '',html)
        page.set_content(html.replace("<head>","<head><base href=\"https://example.test/\">"))
        page.add_style_tag(content=(root/'style.css').read_text())
        conf=(root/'config.yaml').read_text()
        page.evaluate('(s)=>{window.fetch=async()=>({ok:true,text:async()=>s})}',conf)
        src=(root/'src/app.js').read_text().replace("new URL('./onnx.worker.js',import.meta.url)","'./onnx.worker.js'")
        page.add_script_tag(content='(async()=>{'+src+'})().catch(console.error)')
        page.wait_for_timeout(150)
        
        assert page.locator('#fileInfo').is_visible()
        assert page.locator('#fileProgress').is_hidden()
        page.locator('#audioFile').set_input_files(wav_path)
        page.wait_for_timeout(175)
        assert page.locator('#fileInfo').is_hidden(), 'File name not replaced by progress'
        assert page.locator('#fileProgress').is_visible(), 'Progress missing'
        print('TEST: in-card progress shown and filename hidden: PASS')
        page.wait_for_timeout(1900)
        assert page.locator('#fileProgress').is_hidden()
        assert page.locator('#fileInfo').is_visible()
        assert 'P-BLACKT' in page.locator('#fileInfo').inner_text()
        assert page.locator('#date').input_value()=='2026-04-19'
        assert page.locator('#hour').input_value()=='06:00:02'
        assert page.locator('#zone').input_value()=='-05:00'
        print('TEST: metadata extraction and filename restored: PASS')
        assert page.locator('#detectionsBody tr[data-id]').count()==2
        page.locator('th[data-key="acoustic"]').click()
        page.locator('#detectionsBody tr[data-id="1"] .playrow').click()
        page.wait_for_timeout(250)
        t=page.evaluate('document.querySelector("#audioPlayer").currentTime')
        assert t>=3.8,f'Wrong row playback start {t}'
        print('TEST: row playback seeks to start (4s): PASS, actual',round(t,2))
        assert page.locator('#detectionsBody tr[data-id="1"] .playrow').inner_text()=='❚❚'
        page.locator('#viewAll').click()
        page.locator('#scale').select_option('linear')
        assert not errors,f'Unexpected JS errors: {errors}'
        page.screenshot(path=str(root/'tests/browser_preview.png'),full_page=True)
        print('TEST: sortable table, linear axis, viewport controls; JS errors: NONE')
        browser.close()
finally:
    server.terminate();server.wait(timeout=5)
    os.remove(wav_path)
