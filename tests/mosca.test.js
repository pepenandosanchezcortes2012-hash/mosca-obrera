// Pruebas del cerebro, el mundo y los mensajes, sin navegador: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Cerebro = require('../js/cerebro.js');
const Mundo = require('../js/mundo.js');
const Conexiones = require('../js/conexiones.js');
const Pantalla = require('../js/pantalla.js');

const { azar } = Cerebro;

function nuevo(semilla, op) {
  const c = new Cerebro({ semilla });
  const m = new Mundo(c, Object.assign({ W: 1000, H: 700, azar: azar(semilla * 31 + 7), modoReloj: 'despierta' }, op));
  return { c, m };
}

function correr(m, seg, hasta) {
  for (let t = 0; t < seg; t += 0.05) {
    m.paso(0.05);
    if (hasta && hasta()) { return t; }
  }
  return seg;
}

test('el cerebro tiene 283 neuronas y cada mosca su propio cableado', () => {
  assert.equal(Cerebro.TOTAL_NEURONAS, 283);
  const a = new Cerebro({ semilla: 1 });
  const b = new Cerebro({ semilla: 2 });
  assert.notDeepEqual(Array.from(a.kcIn.slice(0, 30)), Array.from(b.kcIn.slice(0, 30)));
  assert.deepEqual(Array.from(new Cerebro({ semilla: 1 }).kcIn), Array.from(a.kcIn));
});

test('código disperso: un olor enciende como mucho el 5 % de las células de Kenyon', () => {
  const c = new Cerebro({ semilla: 3 });
  for (const olor of ['fruta', 'menta', 'canela', 'ventas', 'spam']) {
    const n = c._kenyon(Cerebro.patronOlor(olor), c._kcTmp);
    assert.ok(n > 0 && n <= Cerebro.KC_ACTIVAS, olor + ': ' + n);
  }
});

test('con hambre encuentra la fruta y come (10 de 10)', () => {
  let ok = 0;
  for (let s = 1; s <= 10; s += 1) {
    const { c, m } = nuevo(s);
    c.interno.hambre = 0.6;
    m.mosca.x = 200; m.mosca.y = 350;
    m.agregar('fruta', 480, 350);
    correr(m, 40, () => m.stats.comidas > 0);
    if (m.stats.comidas > 0) { ok += 1; }
  }
  assert.equal(ok, 10);
});

test('una mano que se acerca la hace saltar y alejarse', () => {
  for (let s = 1; s <= 10; s += 1) {
    const { m } = nuevo(s);
    correr(m, 3);
    const x0 = m.mosca.x + 80;
    const y0 = m.mosca.y;
    m.agregar('amenaza', x0, y0);
    correr(m, 1.5);
    assert.ok(m.stats.huidas >= 1, 'semilla ' + s + ' no huyó');
    assert.ok(Math.hypot(m.mosca.x - x0, m.mosca.y - y0) > 140, 'semilla ' + s + ' no se alejó');
  }
});

test('Pavlov: tres premios oliendo menta → le gusta; tres castigos oliendo canela → la evita', () => {
  const { c, m } = nuevo(3);
  m.agregar('menta', m.mosca.x + 20, m.mosca.y);
  correr(m, 2);
  for (let i = 0; i < 3; i += 1) { assert.equal(m.premio(), 'menta'); correr(m, 1.5); }
  assert.ok(c.valencia('menta').total >= 0.25, 'menta ' + c.valencia('menta').total);
  m.limpiar();
  m.agregar('canela', m.mosca.x + 20, m.mosca.y);
  correr(m, 2);
  for (let i = 0; i < 3; i += 1) { m.castigo(); correr(m, 1.5); }
  assert.ok(c.valencia('canela').total <= -0.2, 'canela ' + c.valencia('canela').total);
});

test('un premio sin olor no enseña nada', () => {
  const { c, m } = nuevo(4);
  assert.equal(m.premio(), null);
  assert.equal(c.valencia('menta').aprendida, 0);
});

test('examen en T: después de aprender, elige la menta y no la canela (20 de 20)', () => {
  let ok = 0;
  for (let s = 1; s <= 20; s += 1) {
    const { c, m } = nuevo(s);
    for (let i = 0; i < 3; i += 1) { c.condicionar('menta', 1); c.condicionar('canela', -1); }
    m.mosca.x = 500; m.mosca.y = 600; m.mosca.ang = -Math.PI / 2;
    m.agregar('menta', 250, 200);
    m.agregar('canela', 750, 200);
    let primero = null;
    m.on((e) => { if (e.tipo === 'llego' && !primero) { primero = e.olor; } });
    correr(m, 40, () => primero);
    if (primero === 'menta') { ok += 1; }
  }
  assert.equal(ok, 20);
});

test('la memoria corta se olvida en minutos; la larga queda', () => {
  const c = new Cerebro({ semilla: 5 });
  for (let i = 0; i < 3; i += 1) { c.condicionar('menta', 1); }
  const antes = c.valencia('menta').comp;
  for (let i = 0; i < 3000; i += 1) { c._tick(); } // 5 minutos
  const despues = c.valencia('menta').comp;
  assert.ok(despues.gamma < antes.gamma * 0.1, 'γ ' + antes.gamma + ' → ' + despues.gamma);
  assert.ok(despues.alfa > antes.alfa * 0.95, 'α ' + antes.alfa + ' → ' + despues.alfa);
});

test('esquiva el humo', () => {
  let suma = 0;
  for (let s = 1; s <= 10; s += 1) {
    const { m } = nuevo(s);
    m.agregar('humo', 500, 350);
    m.mosca.x = 560; m.mosca.y = 350;
    let d = 0;
    let n = 0;
    for (let t = 0; t < 20; t += 0.05) { m.paso(0.05); d += Math.hypot(m.mosca.x - 500, m.mosca.y - 350); n += 1; }
    suma += d / n;
  }
  assert.ok(suma / 10 > 250, 'distancia media ' + suma / 10);
});

test('de noche duerme; de día no', () => {
  const noche = nuevo(5, { modoReloj: 'acelerado', horaInicio: 0.95 }).m;
  let durmio = 0;
  correr(noche, 20, () => { durmio += noche.cerebro.accion() === 'descansar' ? 1 : 0; });
  assert.ok(durmio > 300, 'durmió ' + durmio + ' cuadros');
  const dia = nuevo(5, { modoReloj: 'acelerado', horaInicio: 0.35 }).m;
  let desc = 0;
  correr(dia, 20, () => { desc += dia.cerebro.accion() === 'descansar' ? 1 : 0; });
  assert.equal(desc, 0);
});

function oficina(semilla, op) {
  const c = new Cerebro({ semilla });
  const p = new Pantalla(c, Object.assign({ W: semilla % 2 ? 600 : 900, H: 760, azar: azar(semilla * 13 + 1), modoReloj: 'despierta' }, op));
  p.entrar();
  return { c, p };
}

function hacer(p, olor, seg) {
  let res = null;
  const quitar = p.on((e) => { if (e.tipo === 'trabajo') { res = e; } });
  p.trabajoNuevo({ texto: 'trabajo', olor });
  correr(p, seg || 120, () => res);
  quitar();
  return res;
}

test('pantalla: sin que nadie le enseñe, agarra el trabajo y lo archiva (no le escribe a nadie)', () => {
  const tiempos = [];
  for (let s = 1; s <= 20; s += 1) {
    const { p } = oficina(s);
    const t0 = p.t;
    const r = hacer(p, 'cosa-' + s, 90);
    assert.ok(r, 'semilla ' + s + ': no terminó');
    assert.equal(r.resultado, 'entregado', 'semilla ' + s + ': ' + r.motivo);
    assert.equal(r.app, 'archivo', 'semilla ' + s);
    assert.equal(r.quien, 'mosca');
    tiempos.push(p.t - t0);
  }
  tiempos.sort((a, b) => a - b);
  assert.ok(tiempos[10] < 40, 'mediana ' + tiempos[10]);
});

test('pantalla: después de tres lecciones lleva cada tema a su app (≥ 54 de 60)', () => {
  let ok = 0;
  const malos = [];
  for (let s = 1; s <= 20; s += 1) {
    const { c, p } = oficina(s);
    for (let i = 0; i < 3; i += 1) {
      c.condicionarMezcla('ventas', 'app-celular', 1, 1.5);
      c.condicionarMezcla('spam', 'app-papelera', 1, 1.5);
      c.condicionarMezcla('soporte', 'app-discord', 1, 1.5);
    }
    for (const [x, app] of [['ventas', 'celular'], ['spam', 'papelera'], ['soporte', 'discord']]) {
      const r = hacer(p, x);
      if (r && r.app === app) { ok += 1; } else { malos.push(s + ':' + x + '→' + (r && r.app)); }
    }
  }
  assert.ok(ok >= 54, ok + '/60 · ' + malos.join(' '));
});

test('pantalla: el toque pasa por la función de toque (en el navegador, un clic de verdad)', () => {
  const toques = [];
  const c = new Cerebro({ semilla: 5 });
  let p = null;
  p = new Pantalla(c, { W: 600, H: 760, azar: azar(66), modoReloj: 'despierta', tocar: (x, y, id) => {
    const o = p.objetos.find((v) => v.id === id);
    assert.ok(Math.abs(x - o.x) <= o.w / 2 && Math.abs(y - o.y) <= o.h / 2, 'el toque cae dentro del botón');
    toques.push(id);
    p.activar(id, 'mosca');
    return true;
  } });
  p.entrar();
  const r = hacer(p, 'factura');
  assert.equal(r.app, 'archivo');
  assert.equal(toques.length, 2, 'un toque para agarrar y otro para soltar: ' + toques);
  assert.equal(toques[1], 'app-archivo');
});

test('pantalla: aprende mirándote (tocas el trabajo y la app) y después lo hace sola', () => {
  for (let s = 1; s <= 6; s += 1) {
    const { p } = oficina(s);
    for (let i = 0; i < 2; i += 1) {
      const t = p.trabajoNuevo({ texto: 'pedido', olor: 'ventas' });
      p.activar(t.id, 'tu');
      let r = null;
      const q = p.on((e) => { if (e.tipo === 'trabajo') { r = e; } });
      assert.ok(p.activar('app-celular', 'tu'));
      q();
      assert.equal(r.quien, 'tu');
      assert.equal(r.app, 'celular');
    }
    assert.equal(p.destinoPara('ventas'), 'celular');
    assert.equal(hacer(p, 'ventas').app, 'celular', 'semilla ' + s);
  }
});

test('pantalla: si le enseñaste a no tocar algo, lo ignora y se va a la papelera', () => {
  for (let s = 1; s <= 10; s += 1) {
    const { c, p } = oficina(s);
    for (let i = 0; i < 3; i += 1) { c.condicionar('spam', -1, 1.5); }
    const r = hacer(p, 'spam');
    assert.equal(r.resultado, 'ignorado', 'semilla ' + s);
    assert.equal(r.app, 'papelera');
  }
});

test('pantalla: si llegan más trabajos de los que caben, esperan y salen todos', () => {
  const { p } = oficina(8, { W: 600 });
  const ids = [];
  const hechos = [];
  p.on((e) => { if (e.tipo === 'trabajo') { hechos.push(e.trabajo.id); } });
  for (let i = 0; i < 7; i += 1) { ids.push(p.trabajoNuevo({ texto: 'n' + i, olor: 'lote' }).id); }
  assert.equal(p.objetos.filter((o) => o.tipo === 'carta').length, 4);
  assert.equal(p.cola.length, 3);
  assert.deepEqual(p.pendientes().map((t) => t.id).sort(), ids.slice().sort());
  correr(p, 400, () => hechos.length === 7);
  assert.deepEqual(hechos.slice().sort(), ids.slice().sort());
});

test('pantalla: si se va al laboratorio con algo en las patas, lo devuelve', () => {
  const { c, p } = oficina(9);
  p.trabajoNuevo({ texto: 'x', olor: 'cosa' });
  correr(p, 60, () => p.carga);
  assert.ok(p.carga, 'llegó a agarrarlo');
  p.salir();
  assert.equal(p.carga, null);
  assert.equal(c.contexto, null);
  assert.equal(c.valuador, null);
  assert.equal(p.pendientes().length, 1);
});

test('mezclas: aprender «ventas → celular» no enseña «todo → celular» ni «ventas → todo»', () => {
  const c = new Cerebro({ semilla: 42 });
  for (let i = 0; i < 3; i += 1) { c.condicionarMezcla('ventas', 'app-celular', 1, 1.5); }
  const v = c.valenciaMezcla('ventas', 'app-celular');
  assert.ok(v > 0.4, 'ventas→celular ' + v);
  assert.ok(c.valenciaMezcla('ventas', 'app-discord') < v / 2);
  assert.ok(c.valenciaMezcla('soporte', 'app-celular') < v / 2);
});

test('exportar e importar la memoria', () => {
  const a = new Cerebro({ semilla: 11 });
  for (let i = 0; i < 3; i += 1) { a.condicionar('ventas', 1); }
  const datos = JSON.parse(JSON.stringify(a.exportar()));
  const b = Cerebro.desde(datos);
  assert.ok(Math.abs(b.valencia('ventas').total - a.valencia('ventas').total) < 0.01);
  const otra = new Cerebro({ semilla: 12 });
  assert.equal(otra.importar(datos), false, 'no acepta la memoria de otra mosca');
});

test('mensajes de afuera', () => {
  const i = Conexiones.interpretarMensaje;
  assert.deepEqual(i({ texto: 'fruta' }), { tipo: 'estimulo', estimulo: 'fruta', fuerza: 1 });
  assert.deepEqual(i({ texto: 'Azúcar' }), { tipo: 'estimulo', estimulo: 'premio', fuerza: 1 });
  assert.deepEqual(i({ texto: 'luz 0.5' }), { tipo: 'estimulo', estimulo: 'luz', fuerza: 0.5 });
  assert.deepEqual(i({ texto: 'premio Ventas' }), { tipo: 'feedback', olor: 'ventas', signo: 1 });
  assert.deepEqual(i({ texto: 'castigo #spam' }), { tipo: 'feedback', olor: 'spam', signo: -1 });
  const c = i({ texto: '#Pedidos Nuevo pedido 123', fuente: 'ntfy' });
  assert.equal(c.tipo, 'carta');
  assert.equal(c.olor, 'pedidos');
  assert.equal(c.texto, '#Pedidos Nuevo pedido 123');
  assert.equal(i({ texto: 'Cliente nuevo', etiquetas: ['mosca-obrera', 'ventas'] }).olor, 'ventas');
  assert.equal(i({ texto: 'Hola', titulo: 'Soporte técnico' }).olor, 'soporte-tecnico');
  assert.equal(i({ texto: 'Hola', fuente: 'n8n' }).olor, 'n8n');
  assert.equal(i({ texto: 'fruta', titulo: 'Mercado' }).tipo, 'carta', 'con título es una carta, no un estímulo');
  assert.deepEqual(i({ texto: '{"estimulo":"mano","fuerza":0.3}' }), { tipo: 'estimulo', estimulo: 'amenaza', fuerza: 0.3 });
  assert.equal(i({ texto: '{"carta":"Hola","olor":"Saludos"}' }).olor, 'saludos');
  assert.equal(i({ texto: '' }), null);
  assert.equal(i({ texto: 'la fruta está rica' }).tipo, 'carta');
});

test('los nombres de canal al azar no se repiten y son seguros', () => {
  const a = Conexiones.temaAlAzar('entrada');
  assert.match(a, /^mosca-[a-z0-9]{8}-entrada$/);
  assert.notEqual(a, Conexiones.temaAlAzar('entrada'));
  assert.ok(Conexiones.esDiscord('https://discord.com/api/webhooks/123/abc'));
  assert.ok(!Conexiones.esDiscord('https://evil.example/api/webhooks/1'));
});
