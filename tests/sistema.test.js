// Pruebas de Mosca OS (sistema de archivos y shell), sin navegador: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Cerebro = require('../js/cerebro.js');
const Pantalla = require('../js/pantalla.js');
const Conexiones = require('../js/conexiones.js');
const Copiloto = require('../js/copiloto.js');
const { SistemaArchivos, Shell, montarMosca, lexer, analizar, nombreTrabajo, intervalo, HOME } = require('../js/sistema.js');

/** Un Mosca OS completo con una mosca de verdad y las salidas de mentira (lo que se «envía» queda en enviados). */
function os(semilla) {
  const cerebro = new Cerebro({ semilla: semilla || 7 });
  const pantalla = new Pantalla(cerebro, { W: 600, H: 760, azar: Cerebro.azar(5), modoReloj: 'despierta' });
  pantalla.entrar();
  const registro = [];
  const enviados = [];
  pantalla.on((e) => {
    if (e.tipo === 'trabajo') {
      registro.unshift({ t: Date.now(), olor: e.trabajo.olor, texto: e.trabajo.texto, app: e.app, quien: e.quien, resultado: e.resultado });
    }
  });
  let lugar = 'pantalla';
  const ent = {
    Cerebro, cerebro, pantalla,
    nombre: () => 'Mosca #0007',
    lugar: () => lugar,
    hora: () => null,
    mudarA: (l) => { lugar = l; },
    normalizar: Cerebro.normalizarOlor,
    trabajo(texto, olor) {
      const r = olor ? { tipo: 'carta', texto, olor: Cerebro.normalizarOlor(olor) } : Conexiones.interpretarMensaje({ texto, fuente: 'terminal' });
      const t = pantalla.trabajoNuevo({ texto: r.texto, olor: r.olor, fuente: 'terminal' });
      return '✉️ le llegó un trabajo #' + t.olor;
    },
    pendientes: () => pantalla.pendientes(),
    llevar: (id, app) => pantalla.llevar(id, app, 'tu'),
    ensenarRuta: (o, app) => cerebro.condicionarMezcla(Cerebro.normalizarOlor(o), 'app-' + app, 1, 1.5),
    conectada: (app) => app === 'archivo' || app === 'papelera' || app === 'celular',
    async enviarApp(app, texto) { enviados.push([app, texto]); return '📱 enviado'; },
    olores: () => Array.from(new Set(registro.map((e) => e.olor))),
    registro: () => registro,
    fetch: async (url) => ({ ok: true, status: 200, text: async () => '{"bitcoin":{"usd":85000}}' }),
    async ntfy(tema, texto) { enviados.push(['ntfy:' + tema, texto]); },
    temaSalida: () => 'mosca-prueba-salida',
    velocidad: () => {},
    premio: () => lugar === 'lab',
    castigo: () => lugar === 'lab',
    cambiarNombre: () => {},
    procesos: () => [],
    matar: () => false,
    salir: () => false,
    copiloto: (texto) => Copiloto.interpretar(texto, {}),
    dispositivo: {
      _portapapeles: '',
      _despierta: false,
      _vibro: 0,
      async bateria() { return '🔋 84 % (cargando)'; },
      async ubicacion() { return '📍 4.6097, -74.0817  ·  https://maps.google.com/?q=4.6097,-74.0817'; },
      red() { return '📶 wifi · en línea'; },
      async vibrar() { this._vibro += 1; return '📳 bzz'; },
      async copiar(t) { this._portapapeles = t; return '📋 copiado: ' + t; },
      async pegar() { return '📋 ' + (this._portapapeles || '(vacío)'); },
      async compartir(t) { return '📤 compartido: ' + t; },
      async despierta(on) { this._despierta = on; return on ? '☀️ pantalla encendida' : '🌙 liberada'; }
    }
  };
  const fs = new SistemaArchivos();
  const sh = new Shell(fs, ent);
  montarMosca(fs, sh, ent);
  const run = async (l) => sh.ejecutar(l);
  return { fs, sh, ent, pantalla, cerebro, registro, enviados, run };
}

test('lexer: comillas, escapes, variables, ~ y operadores', () => {
  const env = { HOME: '/home/mosca', X: 'hola', '?': 0 };
  const t = lexer('echo "a $X" \'$X\' b\\ c ~/x > f.txt | grep a && ls || pwd ; date', env);
  assert.deepEqual(t.map((x) => x.v), ['echo', 'a hola', '$X', 'b c', '/home/mosca/x', '>', 'f.txt', '|', 'grep', 'a', '&&', 'ls', '||', 'pwd', ';', 'date']);
  assert.throws(() => lexer('echo "sin cerrar', env), /comilla/);
  assert.throws(() => analizar(lexer('ls |', env)), /después de \|/);
  assert.throws(() => analizar(lexer('| ls', env)), /antes de \|/);
  assert.equal(analizar(lexer('a | b && c ; d', env)).length, 3);
});

test('archivos: crear, leer, listar, mover, copiar, borrar', async () => {
  const { run, fs } = os();
  assert.equal((await run('pwd')).out, HOME + '\n');
  await run('mkdir -p notas/viejas && echo hola > notas/a.txt && echo chao >> notas/a.txt');
  assert.equal(fs.leer(HOME + '/notas/a.txt'), 'hola\nchao\n');
  assert.equal((await run('cat notas/a.txt | wc -l')).out, '2\n');
  assert.equal((await run('ls notas')).out, 'a.txt  viejas/\n');
  await run('cp notas/a.txt notas/viejas && mv notas/a.txt notas/b.txt');
  assert.equal((await run('ls notas/viejas')).out, 'a.txt\n');
  assert.equal((await run('cat notas/b.txt')).out, 'hola\nchao\n');
  assert.equal((await run('rm notas')).code, 1, 'sin -r no borra una carpeta con cosas');
  await run('rm -r notas');
  assert.equal(fs.tipo(HOME + '/notas'), null);
  assert.match((await run('cat no-existe.txt')).err, /no existe/);
  assert.match((await run('rm -r /home/mosca')).err, /su casa/);
});

test('texto: grep, head, tail, sort, uniq, seq, comodines, variables y && ||', async () => {
  const { run } = os();
  await run('seq 5 > n.txt');
  assert.equal((await run('head -n 2 n.txt')).out, '1\n2\n');
  assert.equal((await run('tail -2 n.txt')).out, '4\n5\n');
  assert.equal((await run('sort -r n.txt | head -1')).out, '5\n');
  assert.equal((await run('grep -c 3 n.txt')).out, '1\n');
  assert.equal((await run('echo b; echo a; echo a')).out, 'b\na\na\n');
  await run('echo a > x1.txt; echo a > x2.txt; echo b > x3.txt');
  assert.equal((await run('cat x*.txt | sort | uniq -c')).out, '   2 a\n   1 b\n');
  assert.equal((await run('false && echo no || echo si')).out, 'si\n');
  await run('export NOMBRE=mosca');
  assert.equal((await run('echo "hola $NOMBRE"')).out, 'hola mosca\n');
  assert.equal((await run('noexiste')).code, 127);
  assert.equal((await run('echo $?')).out, '127\n');
});

test('bandeja: escribir un archivo le manda un trabajo; ls lo muestra; cat lo lee', async () => {
  const { run, pantalla } = os();
  assert.match((await run('echo "Llegó un pedido" > ~/bandeja/ventas.txt')).nota, /#ventas/);
  assert.match((await run('echo "#soporte no me llega el paquete" > ~/bandeja/x.txt')).nota, /#soporte/);
  const p = pantalla.pendientes();
  assert.deepEqual(p.map((t) => t.olor), ['ventas', 'soporte']);
  const ls = (await run('ls ~/bandeja')).out;
  assert.ok(ls.includes(nombreTrabajo(p[0])) && ls.includes(nombreTrabajo(p[1])), ls);
  assert.equal((await run('cat ~/bandeja/' + nombreTrabajo(p[0]))).out, 'Llegó un pedido\n');
  assert.match((await run('trabajo "#facturas factura 42"')).out, /#facturas/);
});

test('bandeja: mv a /apps/x lo lleva ahí y la mosca aprende; rm lo manda a la papelera', async () => {
  const { run, pantalla, registro } = os();
  await run('echo pedido > ~/bandeja/ventas.txt');
  const antes = pantalla.valorRuta('ventas', 'celular');
  const f = nombreTrabajo(pantalla.pendientes()[0]);
  const r = await run('mv ~/bandeja/' + f + ' /apps/celular');
  assert.match(r.nota, /celular/);
  assert.equal(registro[0].app, 'celular');
  assert.equal(registro[0].quien, 'tu');
  assert.ok(pantalla.valorRuta('ventas', 'celular') > antes + 0.1, 'aprendió mirándote');
  assert.equal(pantalla.pendientes().length, 0);
  await run('echo compra ya > ~/bandeja/spam.txt');
  await run('rm ~/bandeja/*');
  assert.equal(registro[0].app, 'papelera');
  assert.equal(pantalla.pendientes().length, 0);
});

test('apps: escribir en /apps/x manda un mensaje por esa app', async () => {
  const { run, enviados } = os();
  const r = await run('echo "hola desde la terminal" > /apps/celular');
  assert.equal(r.code, 0);
  assert.deepEqual(enviados[0], ['celular', 'hola desde la terminal']);
  assert.match((await run('cat /apps/discord')).out, /sin conectar/);
  assert.match((await run('ls -l /apps')).out, /^crw--/m);
});

test('/proc/mosca: su cerebro en vivo', async () => {
  const { run, cerebro } = os();
  assert.match((await run('cat /proc/mosca/estado')).out, /Mosca #0007/);
  assert.match((await run('cat /proc/mosca/neuronas')).out, /total\s+283/);
  assert.match((await run('ls /proc/mosca')).out, /kenyon/);
  await run('ruta ventas celular');
  assert.match((await run('cat /proc/mosca/rutas')).out, /todavía no conoce/, 'sin trabajos en el registro no lista temas');
  assert.ok(cerebro.valenciaMezcla('ventas', 'app-celular') > 0.15);
  assert.match((await run('ruta ventas celular')).out, /aprendió: #ventas → 📱 celular/);
  assert.match((await run('ruta ventas telefono')).err, /las apps son/);
});

test('cada: guarda la orden entera (con >), corre sola y se puede matar', async () => {
  const { run, sh, pantalla } = os();
  const r = await run('cada 10s curl -s https://api.ejemplo.com/precio > ~/bandeja/btc.txt');
  assert.match(r.out, /tarea 101/);
  assert.equal(sh.tareas[0].orden, 'curl -s https://api.ejemplo.com/precio > ~/bandeja/btc.txt');
  assert.equal(pantalla.pendientes().length, 0, 'no corrió al crearla');
  await sh.tick(Date.now() + 11000);
  const p = pantalla.pendientes();
  assert.equal(p.length, 1);
  assert.equal(p[0].olor, 'btc');
  assert.match(p[0].texto, /85000/);
  assert.match((await run('cat /var/log/cada.log')).out, /\[101\].*ok/);
  assert.match((await run('ps')).out, /101\s+cada 10s/);
  // Sobrevive a recargar (está en /etc/cada) y se mata con kill.
  const sh2 = new Shell(sh.fs, sh.ent);
  assert.equal(sh2.tareas.length, 1);
  await run('kill 101');
  assert.equal(sh.tareas.length, 0);
  assert.match((await run('cada 1s echo x')).err, /mínimo 10s/);
  assert.equal(intervalo('2h'), 7200000);
});

test('mosca y compañía: estado, top, neofetch, kill 1, sudo, nano, python', async () => {
  const { run } = os();
  assert.match((await run('mosca')).out, /en su pantalla de trabajo/);
  assert.match((await run('mosca premio')).err, /laboratorio/);
  assert.match((await run('neofetch')).out, /Mosca OS/);
  const top = await run('top');
  assert.ok(top.vivo && /PID NEURONA/.test(top.vivo.pintar()));
  assert.match((await run('kill 1')).err, /no hay mosca/);
  assert.match((await run('sudo rm -rf /')).err, /dopamina/);
  assert.match((await run('nano notas.txt')).err, /no hay editor/);
  assert.equal((await run('python')).code, 127);
  assert.match((await run('ntfy hola')).out, /ntfy\.sh\/mosca-prueba-salida/);
  assert.match((await run('curl -s https://api.ejemplo.com | grep -c usd')).out, /^1$/m);
  assert.match((await run('ayuda')).out, /La mosca:/);
  assert.match((await run('ls /bin')).out, /mosca/);
});

test('nexus: control del teléfono por las APIs del navegador', async () => {
  const { run, ent } = os();
  assert.match((await run('nexus bateria')).out, /84 %/);
  assert.match((await run('nexus ubicacion')).out, /4\.6097/);
  assert.match((await run('nexus red')).out, /en línea/);
  await run('nexus copiar hola mosca');
  assert.equal(ent.dispositivo._portapapeles, 'hola mosca');
  assert.match((await run('nexus pegar')).out, /hola mosca/);
  await run('nexus despierta on');
  assert.equal(ent.dispositivo._despierta, true);
  await run('nexus despierta off');
  assert.equal(ent.dispositivo._despierta, false);
  // Lo que es del núcleo nativo se anuncia, no se inventa.
  assert.match((await run('nexus tocar 540 1200')).out, /nativo/);
  assert.match((await run('nexus notifs')).out, /ARQUITECTURA-NATIVA/);
});

test('/dev/tel: el teléfono también como archivos', async () => {
  const { run, ent } = os();
  assert.match((await run('ls /dev/tel')).out, /vibrar/);
  await run('echo bzz > /dev/tel/vibrar');
  assert.equal(ent.dispositivo._vibro, 1);
  await run('echo "para la nota" > /dev/tel/portapapeles');
  assert.equal(ent.dispositivo._portapapeles, 'para la nota');
});

test('haz (copiloto): traduce español a comandos y los corre', async () => {
  const { run, pantalla, enviados } = os();
  let r = await run('haz manda hola a discord');
  assert.match(r.out, /mando «hola» a discord/);
  assert.match(r.out, /echo "hola" > \/apps\/discord/);
  assert.equal(enviados[enviados.length - 1][0], 'discord');
  await run('haz las facturas van al webhook');
  assert.ok(pantalla.valorRuta('facturas', 'webhook') > 0.1, 'aprendió la ruta por el copiloto');
  r = await run('haz cuánta batería tengo');
  assert.match(r.out, /84 %/);
  await run('haz cada 10s manda hola a discord');
  assert.match((await run('cada')).out, /echo "hola" > \/apps\/discord/);
  assert.match((await run('haz ablublu')).out, /🤖/);
});

test('copiloto: entiende lo común (unidad por separado)', () => {
  const c = (t) => Copiloto.interpretar(t).comandos.join(' | ');
  assert.match(c('cada mañana mándame el precio de bitcoin'), /^cada 24h curl .*bitcoin.* > ~\/bandeja\//);
  assert.equal(c('enséñale que ventas va al celular'), 'ruta ventas celular');
  assert.equal(c('anota comprar pan'), 'echo "comprar pan" >> ~/notas.txt');
  assert.equal(c('vibra'), 'nexus vibrar');
  assert.equal(c('abre whatsapp'), 'nexus abrir "whatsapp"');
  assert.equal(Copiloto.interpretar('qwerty zxcvb').ok, false);
});

test('autocompletar comandos y rutas', async () => {
  const { sh, run } = os();
  assert.equal(sh.completar('neof').linea, 'neofetch ');
  await run('echo x > ~/bandeja/ventas.txt');
  assert.equal(sh.completar('cat /proc/mosca/es').linea, 'cat /proc/mosca/estado ');
  assert.match(sh.completar('ls ~/ban').linea, /~\/bandeja\/$/);
  assert.ok(sh.completar('c').opciones.length > 3);
});

test('el disco tiene límite', async () => {
  const { fs } = os();
  assert.throws(() => fs.escribir(HOME + '/grande.txt', 'x'.repeat(500 * 1024)), /espacio/);
});
