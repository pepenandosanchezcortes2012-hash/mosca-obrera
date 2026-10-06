"""
Genera los íconos PNG de la app (192 y 512 px, y la versión «maskable» con margen) a partir de icono.svg, con un
Chrome sin ventana. Android los pide para poder instalar Mosca OS como app.

  py herramientas/iconos.py
"""
import base64
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import probar as P

RAIZ = Path(__file__).resolve().parents[1]
PAGINA = '''<!doctype html><html><body style="margin:0;background:#0b0f14;display:grid;place-items:center;height:100vh">
<img src="icono.svg" style="width:%s;height:%s;display:block"></body></html>'''


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    chrome = next((c for c in P.CHROMES if c.exists()), None)
    if not chrome:
        sys.exit('no encontré Chrome ni Edge')
    (RAIZ / '_icono.html').write_text(PAGINA % ('100vw', '100vh'), encoding='utf-8')
    (RAIZ / '_icono_mask.html').write_text(PAGINA % ('72vw', '72vh'), encoding='utf-8')
    puerto = P.puerto_libre()
    httpd = P.servidor(puerto)
    pd = P.puerto_libre()
    try:
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as perfil:
            proc = subprocess.Popen([str(chrome), '--headless=new', '--remote-debugging-port=%d' % pd, '--remote-allow-origins=*',
                                     '--user-data-dir=' + perfil, '--hide-scrollbars', 'about:blank'],
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
                c = P.CDP(ws)
                c.cmd('Page.enable')
                for pagina, nombre in (('_icono.html', 'icono-%d.png'), ('_icono_mask.html', 'icono-mask-%d.png')):
                    for n in (192, 512):
                        c.cmd('Emulation.setDeviceMetricsOverride', width=n, height=n, deviceScaleFactor=1, mobile=False)
                        c.cmd('Page.navigate', url='http://127.0.0.1:%d/%s' % (puerto, pagina))
                        c.esperar(0.8)
                        r = c.cmd('Page.captureScreenshot', format='png')
                        (RAIZ / (nombre % n)).write_bytes(base64.b64decode(r['data']))
                        print('✓', nombre % n)
            finally:
                proc.terminate()
                try:
                    proc.wait(5)
                except Exception:
                    proc.kill()
    finally:
        httpd.shutdown()
        (RAIZ / '_icono.html').unlink(missing_ok=True)
        (RAIZ / '_icono_mask.html').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
