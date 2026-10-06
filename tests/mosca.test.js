// Pruebas de la simulación (el cerebro y el laboratorio), sin navegador: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Cerebro = require('../js/cerebro.js');
const Mundo = require('../js/mundo.js');

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
  for (const olor of ['fruta', 'menta', 'canela', 'vinagre', 'humo']) {
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

test('de noche duerme (y lo cuenta); de día no', () => {
  const noche = nuevo(5, { modoReloj: 'acelerado', horaInicio: 0.95 }).m;
  let durmio = 0;
  correr(noche, 20, () => { durmio += noche.cerebro.accion() === 'descansar' ? 1 : 0; });
  assert.ok(durmio > 300, 'durmió ' + durmio + ' cuadros');
  assert.ok(noche.stats.durmio > 5, 'contó el sueño: ' + noche.stats.durmio);
  const dia = nuevo(5, { modoReloj: 'acelerado', horaInicio: 0.35 }).m;
  let desc = 0;
  correr(dia, 20, () => { desc += dia.cerebro.accion() === 'descansar' ? 1 : 0; });
  assert.equal(desc, 0);
});

test('exportar e importar la memoria', () => {
  const a = new Cerebro({ semilla: 11 });
  for (let i = 0; i < 3; i += 1) { a.condicionar('fruta', -1); }
  const datos = JSON.parse(JSON.stringify(a.exportar()));
  const b = Cerebro.desde(datos);
  assert.ok(Math.abs(b.valencia('fruta').total - a.valencia('fruta').total) < 0.01);
  const otra = new Cerebro({ semilla: 12 });
  assert.equal(otra.importar(datos), false, 'no acepta la memoria de otra mosca');
});
