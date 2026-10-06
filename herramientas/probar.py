"""
Prueba la página en un Chrome sin ventana: que cargue sin errores, un recorrido de verdad (fruta, carta, 👍, tocar el
cerebro, enlace con #estimulo) y capturas en celular y en escritorio.

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
        if c.js("Array.from(document.querySelectorAll('#bandeja .texto')).some(p => p.textContent.includes(%s))" % json.dumps(texto)):
            llego = True
            break
    ok(llego, 'una carta mandada a ntfy.sh/%s llega a la bandeja' % tema)
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
            c.esperar(3)
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
            # Carta.
            c.js('MoscaObrera.mundo.limpiar(); MoscaObrera.carta("Llegó un pedido nuevo", "ventas")')
            c.esperar(6)
            filas = c.js("Array.from(document.querySelectorAll('#bandeja li')).map(li => li.className)")
            ok(bool(filas) and 'aceptada' in filas[0], 'la carta #ventas llegó a la bandeja y la recogió (%s)' % filas)
            c.js("document.querySelector('#bandeja [data-fb=\"1\"]').click()")
            mc = c.js('MoscaObrera.estado().marcador')
            ok(mc['total'] == 1 and mc['ok'] == 1, 'el 👍 cuenta como acierto (%s)' % mc)
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
            c.captura(caps / 'cel-4-trabajo.png')
            c.js("document.getElementById('bandeja').scrollIntoView({ block: 'center' })")
            c.esperar(0.3)
            c.captura(caps / 'cel-5-bandeja.png')
            c.js("document.getElementById('ciencia').scrollIntoView()")
            c.esperar(0.3)
            c.captura(caps / 'cel-6-ciencia.png')
            c.js("document.getElementById('api').scrollIntoView()")
            c.esperar(0.3)
            c.captura(caps / 'cel-7-api.png')
            # Lo guardado sobrevive a recargar.
            c.js('dispatchEvent(new Event("pagehide"))')
            c.cmd('Page.reload')
            c.esperar(2.5)
            v2 = c.js('MoscaObrera.cerebro.valencia("menta").total')
            ok(v2 > 0.1, 'la memoria sobrevive a recargar la página (menta %.2f)' % v2)
            ok(c.js("document.querySelectorAll('#bandeja li').length") >= 1, 'la bandeja sobrevive a recargar')

            # ---------------------------------------------------------------- escritorio
            c.cmd('Emulation.setDeviceMetricsOverride', width=1366, height=900, deviceScaleFactor=1, mobile=False)
            c.esperar(1)
            c.js('window.scrollTo(0, 0)')
            c.esperar(0.4)
            c.captura(caps / 'pc-1-inicio.png')
            c.js("MoscaObrera.estimulo('fruta'); MoscaObrera.estimulo('humo'); document.getElementById('jugar').scrollIntoView()")
            c.esperar(2)
            c.captura(caps / 'pc-2-lab.png')
            c.js("document.getElementById('trabajo').scrollIntoView()")
            c.esperar(0.4)
            c.captura(caps / 'pc-3-trabajo.png')
            c.js("document.getElementById('ciencia').scrollIntoView()")
            c.esperar(0.4)
            c.captura(caps / 'pc-4-ciencia.png')
            if a.red:
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
