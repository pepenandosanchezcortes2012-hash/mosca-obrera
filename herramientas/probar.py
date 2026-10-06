"""
Prueba la página en un Chrome sin ventana: que cargue sin errores, un recorrido de verdad (fruta, premio, su pantalla
de trabajo con toques reales, corrección 👎, enseñarle tocando tú, tocar el cerebro, enlace con #estimulo) y capturas en
celular y en escritorio.

  py herramientas/probar.py [--url URL] [--capturas CARPETA] [--red]

Sin --url levanta un servidor local temporal con esta carpeta. Usa un perfil temporal de Chrome (no toca el tuyo).
Sale con 1 si algo falló.
"""
import argparse
import base64
import functools
import http.server
import json
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import websocket  # websocket-client

RAIZ = Path(__file__).resolve().parents[1]
CHROMES = [Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe'),
           Path(r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'),
           Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')]


def puerto_libre():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servidor(puerto):
    h = functools.partial(Silencioso, directory=str(RAIZ))
    httpd = http.server.ThreadingHTTPServer(('127.0.0.1', puerto), h)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


class CDP:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, timeout=30, suppress_origin=True)
        self.n = 0
        self.eventos = []

    def cmd(self, metodo, **params):
        self.n += 1
        mid = self.n
        self.ws.send(json.dumps({'id': mid, 'method': metodo, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == mid:
                if 'error' in msg:
                    raise RuntimeError('%s: %s' % (metodo, msg['error']))
                return msg.get('result', {})
            self.eventos.append(msg)

    def js(self, expr, promesa=False):
        r = self.cmd('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=promesa)
        if 'exceptionDetails' in r:
            raise RuntimeError('JS: %s' % r['exceptionDetails'].get('exception', {}).get('description', r['exceptionDetails']))
        return r.get('result', {}).get('value')

    def esperar(self, seg):
        fin = time.time() + seg
        self.ws.settimeout(0.2)
        while time.time() < fin:
            try:
                self.eventos.append(json.loads(self.ws.recv()))
            except websocket.WebSocketTimeoutException:
                pass
        self.ws.settimeout(30)

    def errores(self):
        malos = []
        for e in self.eventos:
            m = e.get('method')
            p = e.get('params', {})
            if m == 'Runtime.exceptionThrown':
                d = p.get('exceptionDetails', {})
                malos.append('excepción: ' + str(d.get('exception', {}).get('description') or d.get('text')))
            elif m == 'Runtime.consoleAPICalled' and p.get('type') in ('error', 'assert'):
                malos.append('console.error: ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in p.get('args', [])))
            elif m == 'Log.entryAdded' and p.get('entry', {}).get('level') == 'error':
                malos.append('log: ' + p['entry'].get('text', '') + ' ' + p['entry'].get('url', ''))
        return malos

    def captura(self, ruta):
        r = self.cmd('Page.captureScreenshot', format='png')
        Path(ruta).write_bytes(base64.b64decode(r['data']))


def terminal(c, ok, caps):
    """Mosca OS: la terminal de verdad (escribir y Enter), lo que hace la mosca, TAB, top, cada y el modo app."""
    def escribir(cmd, esperar=0.6):
        c.js("""(() => { const i = document.querySelector('#terminal .term-input'); i.value = %s;
            document.querySelector('#terminal .term-linea').requestSubmit(); })()""" % json.dumps(cmd))
        c.esperar(esperar)

    def texto():
        return c.js("document.querySelector('#terminal .term-salida').innerText")

    c.js("MoscaObrera.velocidad(6); document.getElementById('terminal').scrollIntoView({ block: 'center' })")
    escribir('neofetch')
    ok('OS: Mosca OS' in texto(), 'neofetch en la terminal')
    escribir('echo "#ventas pedido desde la terminal" > ~/bandeja/x.txt')
    ok(c.js("MoscaObrera.pantalla.pendientes().some(t => t.texto.includes('desde la terminal'))") or
       'desde la terminal' in c.js("document.getElementById('registro').innerText"), 'escribir en ~/bandeja le manda un trabajo')
    escribir('ls ~/bandeja; cat /proc/mosca/estado', 0.4)
    ok('🪰' in texto() and 'pendientes:' in texto(), 'ls ~/bandeja y cat /proc/mosca/estado')
    for _ in range(40):
        if '🪰 mosca@moscaos' in texto() and 'mv ~/bandeja/' in texto():
            break
        c.esperar(0.25)
    ok('🪰 mosca@moscaos' in texto() and 'mv ~/bandeja/' in texto(), 'lo que hace la mosca aparece en la terminal como comandos suyos')
    c.js("""(() => { const i = document.querySelector('#terminal .term-input'); i.value = 'neof';
        i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); })()""")
    ok(c.js("document.querySelector('#terminal .term-input').value") == 'neofetch ', 'TAB autocompleta')
    c.js("document.querySelector('#terminal .term-input').value = ''; document.querySelector('[data-tecla=\"|\"]').click()")
    ok(c.js("document.querySelector('#terminal .term-input').value") == '|', 'las teclas extra escriben')
    c.js("document.querySelector('#terminal .term-input').value = ''")
    escribir('top', 1.2)
    ok(c.js("!!document.querySelector('#terminal .tl.vivo')") and 'PID NEURONA' in texto(), 'top muestra sus neuronas en vivo')
    c.captura(caps / 'cel-9-terminal.png')
    c.js("document.querySelector('#terminal .term-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }))")
    escribir('cada 10s echo "#recordatorio toma agua" > ~/bandeja/agua.txt')
    ok('tarea 101' in texto(), 'cada crea una tarea')
    llego = False
    for _ in range(60):
        c.esperar(0.25)
        if c.js("MoscaObrera.pantalla.pendientes().some(t => t.olor === 'recordatorio') || document.getElementById('registro').innerText.includes('toma agua')"):
            llego = True
            break
    ok(llego, 'la tarea corrió sola y le mandó un trabajo #recordatorio')
    escribir('kill 101; ps', 0.4)
    ok('cada 10s' not in texto().split('kill 101')[-1], 'kill detiene la tarea')
    # Modo app: pantalla completa con la pantalla arriba y la terminal abajo.
    c.js("document.getElementById('modo-app').click()")
    c.esperar(0.8)
    medidas = c.js("""(() => { const z = document.getElementById('zona').getBoundingClientRect(), t = document.getElementById('terminal').getBoundingClientRect();
        return [document.body.classList.contains('modo-os'), Math.round(z.height), Math.round(t.height), Math.round(t.bottom), innerHeight]; })()""")
    ok(medidas[0] and medidas[1] > 200 and medidas[2] > 200 and medidas[3] <= medidas[4] + 1, 'modo app: pantalla y terminal llenan la pantalla (%s)' % medidas)
    c.esperar(1.5)
    c.captura(caps / 'cel-10-modo-app.png')
    c.js("document.getElementById('salir-os').click()")
    c.esperar(0.4)
    ok(not c.js("document.body.classList.contains('modo-os')"), 'se sale del modo app')


def red(c, ok):
    """Conexiones de verdad: ntfy de ida y vuelta, CoinGecko, Open-Meteo y GitHub (todo público, sin claves)."""
    c.js("""(() => { const i = document.querySelector('[data-cfg="entrada.activo"]'); i.checked = true; i.dispatchEvent(new Event('change')); })()""")
    tema = c.js("document.querySelector('[data-cfg=\"entrada.tema\"]').value")
    for _ in range(40):
        if c.js("document.querySelector('[data-estado=\"entrada\"]').textContent") == 'escuchando':
            break
        c.esperar(0.25)
    ok(c.js("document.querySelector('[data-estado=\"entrada\"]').textContent") == 'escuchando', 'el canal de entrada se conecta a ntfy.sh')
    texto = 'prueba de red %d' % int(time.time())
    req = urllib.request.Request('https://ntfy.sh/' + tema, data=('#red ' + texto).encode('utf-8'), method='POST')
    urllib.request.urlopen(req, timeout=15).read()
    llego = False
    for _ in range(40):
        c.esperar(0.25)
        if c.js("MoscaObrera.pantalla.pendientes().concat(Array.from(document.querySelectorAll('#registro .texto'), p => ({ texto: p.textContent })))"
                ".some(t => t.texto.includes(%s))" % json.dumps(texto)):
            llego = True
            break
    ok(llego, 'un trabajo mandado a ntfy.sh/%s llega a su pantalla' % tema)
    c.js("""(() => { const i = document.querySelector('[data-cfg="salidaNtfy.activo"]'); i.checked = true; i.dispatchEvent(new Event('change'));
        document.querySelector('[data-probar="salidaNtfy"]').click(); })()""")
    for _ in range(40):
        c.esperar(0.25)
        if c.js("document.querySelector('[data-estado=\"salidaNtfy\"]').dataset.nivel") != 'info':
            break
    ok(c.js("document.querySelector('[data-estado=\"salidaNtfy\"]').dataset.nivel") == 'ok',
       'el aviso de salida se publica en ntfy (%s)' % c.js("document.querySelector('[data-estado=\"salidaNtfy\"]').textContent"))
    for fuente, prep in (('cripto', ''), ('github', "document.querySelector('[data-cfg=\"github.repo\"]').value = 'pepenandosanchezcortes2012-hash/midnight-rinse';"
                                                    "document.querySelector('[data-cfg=\"github.repo\"]').dispatchEvent(new Event('change'));")):
        c.js(prep + """(() => { const i = document.querySelector('[data-cfg="%s.activo"]'); i.checked = true; i.dispatchEvent(new Event('change')); })()""" % fuente)
    c.js("document.getElementById('ciudad').value = 'Bogotá'; document.getElementById('form-ciudad').requestSubmit()")
    for _ in range(60):
        c.esperar(0.25)
        niveles = c.js("['cripto', 'clima', 'github'].map(id => document.querySelector('[data-estado=\"' + id + '\"]').dataset.nivel)")
        if 'info' not in niveles:
            break
    for fuente in ('cripto', 'clima', 'github'):
        est = c.js("(() => { const e = document.querySelector('[data-estado=\"%s\"]'); return [e.dataset.nivel, e.textContent]; })()" % fuente)
        ok(est[0] == 'ok', '%s responde desde el navegador (%s)' % (fuente, est[1]))
    for id_ in ('entrada', 'salidaNtfy', 'cripto', 'clima', 'github'):
        c.js("""(() => { const i = document.querySelector('[data-cfg="%s.activo"]'); i.checked = false; i.dispatchEvent(new Event('change')); })()""" % id_)


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    ap = argparse.ArgumentParser()
    ap.add_argument('--url')
    ap.add_argument('--red', action='store_true', help='probar también ntfy, CoinGecko, Open-Meteo y GitHub de verdad')
    ap.add_argument('--capturas', default=str(Path(tempfile.gettempdir()) / 'mosca-capturas'))
    a = ap.parse_args()
    chrome = next((c for c in CHROMES if c.exists()), None)
    if not chrome:
        sys.exit('no encontré Chrome ni Edge')
    httpd = None
    url = a.url
    if not url:
        p = puerto_libre()
        httpd = servidor(p)
        url = 'http://127.0.0.1:%d/index.html' % p
    caps = Path(a.capturas)
    caps.mkdir(parents=True, exist_ok=True)
    fallas = []
    pd = puerto_libre()
    with tempfile.TemporaryDirectory() as perfil:
        proc = subprocess.Popen([str(chrome), '--headless=new', '--no-first-run', '--no-default-browser-check',
                                 '--remote-debugging-port=%d' % pd, '--remote-allow-origins=*', '--user-data-dir=' + perfil,
                                 '--window-size=1280,900', '--mute-audio', 'about:blank'],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            ws = None
            for _ in range(60):
                try:
                    lista = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json/list' % pd, timeout=2))
                    ws = next(t['webSocketDebuggerUrl'] for t in lista if t.get('type') == 'page')
                    break
                except Exception:
                    time.sleep(0.25)
            if not ws:
                sys.exit('Chrome no abrió el puerto de depuración')
            c = CDP(ws)
            for d in ('Runtime.enable', 'Log.enable', 'Page.enable'):
                c.cmd(d)

            def ok(cond, txt):
                print(('✓ ' if cond else '✗ ') + txt)
                if not cond:
                    fallas.append(txt)

            # ---------------------------------------------------------------- celular
            c.cmd('Emulation.setDeviceMetricsOverride', width=390, height=844, deviceScaleFactor=2, mobile=True)
            c.cmd('Page.navigate', url=url)
            for _ in range(60):
                c.esperar(0.25)
                if c.js("typeof MoscaObrera") == 'object':
                    break
            c.esperar(1)
            ok(c.js('typeof MoscaObrera') == 'object', 'la página arrancó (MoscaObrera existe)')
            ancho = c.js('[document.documentElement.scrollWidth, document.documentElement.clientWidth]')
            ok(ancho[0] <= ancho[1], 'sin scroll horizontal en el celular (%s)' % ancho)
            c.captura(caps / 'cel-1-inicio.png')
            c.js("document.getElementById('jugar').scrollIntoView()")
            c.js('MoscaObrera.velocidad(6); MoscaObrera.estimulo("fruta")')
            c.esperar(8)
            st = c.js('MoscaObrera.estado()')
            ok(st['stats']['comidas'] >= 1, 'encontró la fruta y comió (comidas=%s, acción=%s)' % (st['stats']['comidas'], st['accion']))
            c.captura(caps / 'cel-2-arena.png')
            # Herramienta + toque en la arena.
            antes = c.js('MoscaObrera.mundo.objetos.length')
            c.js("document.querySelector('[data-herr=\"luz\"]').click()")
            c.js("""(() => { const r = document.getElementById('arena').getBoundingClientRect();
                document.getElementById('arena').dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width * 0.2, clientY: r.top + r.height * 0.3, bubbles: true })); })()""")
            ok(c.js('MoscaObrera.mundo.objetos.length') == antes + 1, 'la herramienta Luz pone una luz donde se toca')
            c.js("document.querySelector('[data-herr=\"luz\"]').click()")
            # Premio con olor: debe aprender.
            c.js('MoscaObrera.mundo.limpiar(); const m = MoscaObrera.mundo; m.agregar("menta", m.mosca.x + 15, m.mosca.y)')
            c.esperar(0.6)
            c.js("for (let i = 0; i < 3; i++) document.querySelector('[data-accion=\"premio\"]').click()")
            v = c.js('MoscaObrera.cerebro.valencia("menta").total')
            ok(v > 0.2, 'tres premios oliendo menta → le gusta la menta (%.2f)' % v)

            def esperar_registro(n, seg=15):
                for _ in range(int(seg * 4)):
                    if c.js("document.querySelectorAll('#registro li').length") >= n:
                        return True
                    c.esperar(0.25)
                return False

            def primero():
                return c.js("(() => { const li = document.querySelector('#registro li'); return li ? li.querySelector('.destino').textContent : ''; })()")

            # Su pantalla de trabajo: le llega un trabajo, se va sola a trabajar y lo lleva con toques de verdad.
            c.js("document.getElementById('zona').addEventListener('click', e => { if (e.target.closest('[data-widget]')) window.__clics = (window.__clics || 0) + 1; }, true)")
            c.js("MoscaObrera.mundo.limpiar(); document.getElementById('zona').scrollIntoView({ block: 'center' })")
            c.js('MoscaObrera.carta("Llegó un pedido nuevo", "ventas")')
            ok(c.js('MoscaObrera.estado().lugar') == 'pantalla', 'al llegarle un trabajo se va sola a su pantalla')
            ok(not c.js("document.getElementById('arena-fuera').hidden"), 'el laboratorio avisa que está trabajando')
            c.esperar(1.6)
            c.captura(caps / 'cel-4-pantalla.png')
            ok(esperar_registro(1), 'terminó el primer trabajo')
            ok('Archivo' in primero(), 'sin enseñarle nada lo lleva al 🗂️ Archivo (%s)' % primero())
            clics = c.js('window.__clics || 0')
            ok(clics >= 2, 'la mosca tocó la pantalla con clics de verdad (%d)' % clics)
            # 👎 y «iba a 📱».
            c.js("document.querySelector('#registro [data-fb=\"-1\"]').click()")
            c.js("document.querySelector('#registro [data-dest=\"celular\"]').click()")
            mc = c.js('MoscaObrera.estado().marcador')
            ok(mc['total'] == 1 and mc['ok'] == 0 and mc['racha'] == 0, '👎 + «iba a 📱» cuenta como error (%s)' % mc)
            # Le enseñas tocando tú: el trabajo y después la app.
            c.js('MoscaObrera.velocidad(0); MoscaObrera.carta("Otro pedido", "ventas")')
            c.esperar(0.4)
            c.js("""(() => { const z = document.getElementById('zona'); z.querySelector('.os-trabajo').click();
                z.querySelector('[data-widget="app-celular"]').click(); })()""")
            ok(esperar_registro(2, 3) and 'Celular' in primero() and '(tú)' in primero(), 'tocando tú el trabajo y la app, va ahí (%s)' % primero())
            # Ahora sola.
            c.js('MoscaObrera.velocidad(6); MoscaObrera.carta("Tercer pedido", "ventas")')
            ok(esperar_registro(3), 'terminó el tercer trabajo')
            ok('Celular' in primero() and '(tú)' not in primero(), 'después de corregirla y enseñarle, lleva #ventas a 📱 sola (%s)' % primero())
            c.js("document.querySelector('#registro [data-fb=\"1\"]').click()")
            mc = c.js('MoscaObrera.estado().marcador')
            ok(mc['ok'] == 1 and mc['sueldo'] == 1, 'el 👍 cuenta como acierto y le paga con azúcar (%s)' % mc)
            c.js("document.getElementById('registro').scrollIntoView({ block: 'center' })")
            c.esperar(0.3)
            c.captura(caps / 'cel-5-registro.png')
            terminal(c, ok, caps)
            # Cerebro: tocar una región muestra su explicación.
            c.js("document.getElementById('cerebro').scrollIntoView({ block: 'center' })")
            c.esperar(0.5)
            c.js("""(() => { const cv = document.getElementById('cerebro'); const r = cv.getBoundingClientRect();
                const e = Math.min(r.width / 1000, r.height / 720); const ox = (r.width - 1000 * e) / 2, oy = (r.height - 720 * e) / 2;
                cv.dispatchEvent(new MouseEvent('click', { clientX: r.left + ox + 345 * e, clientY: r.top + oy + 160 * e, bubbles: true })); })()""")
            info = c.js("document.getElementById('info-region').textContent")
            ok('Kenyon' in info, 'tocar el cáliz explica las células de Kenyon')
            c.captura(caps / 'cel-3-cerebro.png')
            # Enlace con #estimulo.
            c.js("location.hash = '#estimulo=calor'")
            c.esperar(0.5)
            ok(c.js("MoscaObrera.mundo.objetos.some(o => o.tipo === 'calor')"), 'un enlace #estimulo=calor pone calor')
            c.js("document.getElementById('trabajo').scrollIntoView()")
            c.esperar(0.5)
            c.captura(caps / 'cel-6-conectar.png')
            c.js("document.getElementById('ciencia').scrollIntoView()")
            c.esperar(0.3)
            c.captura(caps / 'cel-7-ciencia.png')
            c.js("document.getElementById('api').scrollIntoView()")
            c.esperar(0.3)
            c.captura(caps / 'cel-8-api.png')
            # Lo guardado sobrevive a recargar.
            c.js('dispatchEvent(new Event("pagehide"))')
            c.cmd('Page.reload')
            c.esperar(2.5)
            v2 = c.js('MoscaObrera.cerebro.valencia("menta").total')
            ok(v2 > 0.1, 'la memoria sobrevive a recargar la página (menta %.2f)' % v2)
            ok(c.js("document.querySelectorAll('#registro li').length") >= 3, 'el registro de trabajos sobrevive a recargar')
            ok(c.js('MoscaObrera.estado().lugar') == 'pantalla', 'sigue en su pantalla después de recargar')
            ok(c.js("MoscaObrera.pantalla.destinoPara('ventas')") == 'celular', 'recuerda que #ventas va a 📱')
            ok(c.js("MoscaObrera.estado().misiones.includes('terminal')"), 'misión «Hola, terminal» cumplida')
            # Se puede instalar como app, y funciona sin internet.
            errores_inst = c.cmd('Page.getInstallabilityErrors').get('installabilityErrors', [])
            ok(not errores_inst, 'Chrome la considera instalable como app %s' % ([e.get('errorId') for e in errores_inst] or ''))
            c.js("navigator.serviceWorker.ready.then(() => { window.__sw = true; })")
            for _ in range(20):
                if c.js('!!window.__sw'):
                    break
                c.esperar(0.25)
            c.cmd('Network.enable')
            c.cmd('Network.emulateNetworkConditions', offline=True, latency=0, downloadThroughput=-1, uploadThroughput=-1)
            c.cmd('Page.navigate', url=url.split('?')[0] + '?app=1')
            c.esperar(2.5)
            ok(c.js("typeof MoscaObrera === 'object' && document.body.classList.contains('modo-os')"), 'sin internet abre igual, directo en modo app (?app=1)')
            c.cmd('Network.emulateNetworkConditions', offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1)
            c.js("document.getElementById('salir-os').click()")

            # ---------------------------------------------------------------- escritorio
            c.cmd('Emulation.setDeviceMetricsOverride', width=1366, height=900, deviceScaleFactor=1, mobile=False)
            c.esperar(1)
            c.js('window.scrollTo(0, 0)')
            c.esperar(0.4)
            c.captura(caps / 'pc-1-inicio.png')
            c.js("MoscaObrera.estimulo('fruta'); MoscaObrera.estimulo('humo'); document.getElementById('jugar').scrollIntoView()")
            c.esperar(2)
            c.captura(caps / 'pc-2-lab.png')
            c.js("MoscaObrera.velocidad(2); MoscaObrera.carta('Cliente pregunta por envío', 'soporte'); MoscaObrera.carta('Pedido 77', 'ventas');"
                 "document.getElementById('oficina').scrollIntoView()")
            c.esperar(2.5)
            c.captura(caps / 'pc-3-pantalla.png')
            c.js("document.getElementById('trabajo').scrollIntoView()")
            c.esperar(0.4)
            c.captura(caps / 'pc-4-conectar.png')
            c.js("document.getElementById('ciencia').scrollIntoView()")
            c.esperar(0.4)
            c.captura(caps / 'pc-5-ciencia.png')
            if a.red:
                c.js('MoscaObrera.velocidad(6)')
                red(c, ok)
            errores = [e for e in c.errores() if 'favicon' not in e]
            ok(not errores, 'sin errores en la consola' + ('' if not errores else ': ' + ' | '.join(errores[:5])))
        finally:
            proc.terminate()
            try:
                proc.wait(5)
            except Exception:
                proc.kill()
            if httpd:
                httpd.shutdown()
    print('capturas en', caps)
    print('fallaron %d' % len(fallas) if fallas else 'todo bien')
    sys.exit(1 if fallas else 0)


if __name__ == '__main__':
    main()
