/**
 * Mosca Obrera: la página. Une el cerebro, el laboratorio (la arena) y las vistas; guarda la mosca y lo que aprende
 * en este dispositivo; lleva las misiones. Todo es la simulación: no hay servidores ni conexiones.
 */
(function () {
  'use strict';

  const Cerebro = window.MoscaCerebro;
  const Mundo = window.MoscaMundo;
  const { VistaArena, VistaCerebro, EMOJI_ACCION, TEXTO_ACCION, colorOlor } = window.MoscaVista;
  const { normalizarOlor, OLORES, COMPARTIMENTOS } = Cerebro;
  const CLAVE = 'mosca-obrera:v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ================================================================================================ estado guardado
  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch (e) { return null; } }
  function escribir(d) { try { localStorage.setItem(CLAVE, JSON.stringify(d)); return true; } catch (e) { return false; } }

  const guardado = leer() || {};
  const cerebro = guardado.cerebro ? Cerebro.desde(guardado.cerebro) : new Cerebro();
  const nombrePorDefecto = 'Mosca #' + String(cerebro.semilla % 10000).padStart(4, '0');
  let nombre = guardado.nombre || nombrePorDefecto;
  const hechas = new Set(guardado.misiones || []);
  const mundo = new Mundo(cerebro, { W: 1000, H: 700, modoReloj: guardado.modoReloj || 'acelerado',
    horaInicio: typeof guardado.hora === 'number' ? guardado.hora : 0.35 });
  if (guardado.stats) { Object.assign(mundo.stats, guardado.stats); }

  function guardar() {
    escribir({ v: 1, nombre, cerebro: cerebro.exportar(), misiones: Array.from(hechas), stats: mundo.stats,
      modoReloj: mundo.modoReloj, hora: mundo.modoReloj === 'acelerado' ? mundo.hora() : null });
  }
  setInterval(guardar, 15000);
  window.addEventListener('pagehide', guardar);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { guardar(); } });

  // ================================================================================================ vistas
  const vArena = new VistaArena($('#arena'), mundo);
  const vCerebro = new VistaCerebro($('#cerebro'), cerebro);
  const visible = { arena: true, cerebro: true };

  function ajustarArena() {
    const { W, H } = vArena.ajustar();
    mundo.redimensionar(W, H);
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(ajustarArena).observe($('#arena-marco'));
    new ResizeObserver(() => vCerebro.ajustar()).observe($('#cerebro'));
  } else {
    window.addEventListener('resize', () => { ajustarArena(); vCerebro.ajustar(); });
  }
  ajustarArena();
  vCerebro.ajustar();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => { for (const e of ents) { visible[e.target.id] = e.isIntersecting; } });
    io.observe($('#arena'));
    io.observe($('#cerebro'));
  }

  let velocidad = 1;
  let ultimo = performance.now();
  let tUI = 0;
  let tLento = 0;
  function cuadro(ahora) {
    const dt = Math.min(0.1, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    if (velocidad > 0) { mundo.paso(dt * velocidad); }
    if (visible.arena) { vArena.dibujar(dt, ahora / 1000); }
    if (visible.cerebro) { vCerebro.dibujar(dt, ahora / 1000); }
    tUI += dt;
    tLento += dt;
    if (tUI > 0.2) { tUI = 0; pintarEstado(); }
    if (tLento > 1) { tLento = 0; pintarAprendido(); revisarMisiones(); }
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
  // Con la pestaña en segundo plano no hay cuadros: la mosca sigue viviendo a saltos de un segundo.
  setInterval(() => {
    if (!document.hidden) { return; }
    const ahora = performance.now();
    const dt = (ahora - ultimo) / 1000;
    ultimo = ahora;
    if (velocidad > 0) { mundo.paso(Math.min(dt, 120) * velocidad); }
  }, 1000);

  // ================================================================================================ avisos
  let tAviso = 0;
  function aviso(texto, ms) {
    const el = $('#aviso');
    el.textContent = texto;
    el.classList.toggle('ver', !!texto);
    clearTimeout(tAviso);
    if (texto) { tAviso = setTimeout(() => el.classList.remove('ver'), ms || 2800); }
  }

  // ================================================================================================ estado de la mosca
  const nombreInput = $('#nombre-mosca');
  nombreInput.value = nombre;
  nombreInput.addEventListener('change', () => {
    nombre = nombreInput.value.trim().slice(0, 24) || nombrePorDefecto;
    nombreInput.value = nombre;
    guardar();
  });

  function formatoHora(h) {
    const min = Math.floor(h * 1440);
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }

  function pintarEstado() {
    const a = cerebro.accion();
    $('#accion-actual').textContent = EMOJI_ACCION[a] + ' ' + TEXTO_ACCION[a];
    $('#accion-actual').dataset.accion = a;
    $('#m-hambre').style.width = Math.round(cerebro.interno.hambre * 100) + '%';
    $('#m-sueno').style.width = Math.round(cerebro.sueno * 100) + '%';
    $('#m-susto').style.width = Math.round(cerebro.interno.susto * 100) + '%';
    const h = mundo.hora();
    let icono = '⚡';
    if (h != null) { icono = h < 0.22 || h > 0.86 ? '🌙' : (h < 0.3 || h > 0.78 ? '🌅' : '☀️'); }
    $('#hora-mosca').textContent = h == null ? '⚡ despierta' : icono + ' ' + formatoHora(h);
  }

  /** Los olores que vale la pena mostrar: los del laboratorio y los que hay en la arena. */
  function oloresAMostrar() {
    const lista = ['fruta', 'menta', 'canela', 'humo'];
    for (const o of mundo.objetos) { if (o.olor && lista.indexOf(o.olor) < 0 && lista.length < 12) { lista.push(o.olor); } }
    return lista;
  }

  function pintarAprendido() {
    const filas = [];
    for (const olor of oloresAMostrar()) {
      const v = cerebro.valencia(olor);
      const info = Cerebro.infoOlor(olor);
      const t = Math.max(-1, Math.min(1, v.total));
      const li = document.createElement('li');
      const nom = document.createElement('span');
      nom.className = 'olor-nombre';
      nom.style.setProperty('--c', colorOlor(olor));
      nom.textContent = OLORES[olor] ? info.nombre : '#' + olor;
      const barra = document.createElement('span');
      barra.className = 'val';
      const relleno = document.createElement('span');
      relleno.className = t >= 0 ? 'pos' : 'neg';
      relleno.style.width = Math.round(Math.abs(t) * 50) + '%';
      barra.appendChild(relleno);
      const comps = document.createElement('span');
      comps.className = 'comps';
      comps.title = 'Memoria corta, media y larga';
      for (const c of COMPARTIMENTOS) {
        const x = v.comp[c.id];
        const r = document.createElement('i');
        r.style.background = x >= 0 ? 'var(--verde)' : 'var(--rojo)';
        r.style.opacity = String(0.15 + Math.min(1, Math.abs(x) * 1.6) * 0.85);
        comps.appendChild(r);
      }
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = (t >= 0 ? '+' : '') + t.toFixed(2);
      li.append(nom, barra, comps, num);
      filas.push(li);
    }
    $('#aprendido').replaceChildren(...filas);
  }

  // ================================================================================================ herramientas
  let herramienta = null;
  const NOMBRES_HERR = { fruta: '🍌 fruta', menta: '🌿 olor A', canela: '🍂 olor B', humo: '🌫️ humo', luz: '💡 luz',
    calor: '🔥 calor', amenaza: '🖐️ la mano', viento: '🌬️ viento (sopla desde donde toques)' };
  function elegir(h) {
    herramienta = herramienta === h ? null : h;
    for (const b of $$('[data-herr]')) { b.setAttribute('aria-pressed', String(b.dataset.herr === herramienta)); }
    aviso(herramienta ? 'Toca la arena para poner ' + NOMBRES_HERR[herramienta] : '');
  }
  for (const b of $$('[data-herr]')) { b.addEventListener('click', () => elegir(b.dataset.herr)); }
  for (const b of $$('[data-accion]')) { b.addEventListener('click', () => inmediata(b.dataset.accion)); }

  function inmediata(a) {
    if (a === 'premio') { mundo.premio(); } else if (a === 'castigo') { mundo.castigo(); } else if (a === 'limpiar') {
      mundo.limpiar();
      aviso('🧹 Arena limpia.');
    }
  }

  $('#arena').addEventListener('click', (e) => {
    const p = vArena.aMundo(e.clientX, e.clientY);
    if (!herramienta) {
      if (!mundo.tocarEn(p.x, p.y)) { aviso('Elige algo abajo para ponerlo, o toca a la mosca.'); }
      return;
    }
    if (herramienta === 'viento') { mundo.vientoDesde(p.x, p.y); } else { mundo.agregar(herramienta, p.x, p.y); }
  });

  $('#cerebro').addEventListener('click', (e) => {
    const r = vCerebro.regionEn(e.clientX, e.clientY);
    vCerebro.sel = r;
    const info = $('#info-region');
    if (!r) { info.innerHTML = '<b>Toca una región del cerebro</b> para ver qué hace.'; return; }
    const b = document.createElement('b');
    b.textContent = r.titulo + '. ';
    info.replaceChildren(b, document.createTextNode(r.texto));
  });

  function ponerVelocidad(v) {
    velocidad = Math.max(0, Math.min(20, Number(v) || 0));
    for (const o of $$('[data-vel]')) { o.setAttribute('aria-pressed', String(Number(o.dataset.vel) === velocidad)); }
  }
  for (const b of $$('[data-vel]')) { b.addEventListener('click', () => ponerVelocidad(b.dataset.vel)); }

  const selReloj = $('#modo-reloj');
  selReloj.value = mundo.modoReloj;
  selReloj.addEventListener('change', () => {
    const h = mundo.hora();
    if (selReloj.value === 'acelerado') { mundo.horaInicio = (h == null ? 0.35 : h) - mundo.t / mundo.diaSeg; }
    mundo.modoReloj = selReloj.value;
    guardar();
  });

  mundo.on((ev) => {
    if (ev.tipo === 'aprende' && ev.origen !== 'condicionar') {
      if (ev.signo > 0) {
        aviso(ev.olor ? '🍬 Asoció el premio con ' + nombreOlor(ev.olor) : '🍬 Rico, pero no olía nada: no asoció nada con el premio.');
      } else {
        aviso(ev.olor ? '⚡ Asoció la descarga con ' + nombreOlor(ev.olor) : '⚡ ¡Auch! No olía nada, así que no asoció nada.');
      }
    } else if (ev.tipo === 'se-acabo') {
      aviso('🍌 Se acabó la fruta.');
    } else if (ev.tipo === 'llego' && ev.olor === 'menta' && ev.eleccion &&
      cerebro.valencia('menta').total > cerebro.valencia('canela').total + 0.1) {
      completar('laberinto');
    }
  });

  function nombreOlor(olor) { return OLORES[olor] ? OLORES[olor].nombre : '#' + olor; }

  // ================================================================================================ misiones
  const MISIONES = [
    { id: 'comer', titulo: 'Primer bocado', pista: 'Pon una 🍌 fruta en la arena y espera a que la encuentre por el olor.', ok: () => mundo.stats.comidas >= 1 },
    { id: 'susto', titulo: 'Reflejo de escape', pista: 'Elige 🖐️ Mano y toca cerca de la mosca: mira cómo salta.', ok: () => mundo.stats.huidas >= 1 },
    { id: 'pavlov', titulo: 'Pavlov para moscas', pista: 'Pon 🌿 Olor A pegado a ella y dale 🍬 Premio tres veces mientras lo huele.', ok: () => cerebro.valencia('menta').total >= 0.25 },
    { id: 'aversion', titulo: 'Mala experiencia', pista: 'Pon 🍂 Olor B pegado a ella y dale ⚡ Castigo un par de veces mientras lo huele.', ok: () => cerebro.valencia('canela').total <= -0.2 },
    { id: 'laberinto', titulo: 'El examen', pista: 'Con la memoria fresca, 🧹 limpia y pon Olor A y Olor B lejos de ella, en lados opuestos. ¿A cuál va?' },
    { id: 'siesta', titulo: 'Buenas noches', pista: 'Pon el reloj en «día de 8 minutos» (o «hora real» de noche) y mírala dormir cuando oscurezca.', ok: () => mundo.stats.durmio >= 8 },
    { id: 'aseo', titulo: 'Se arregla', pista: 'Déjala tranquila un rato sin estímulos: cuando esté a gusto se acicala, como una mosca de verdad.', ok: () => mundo.stats.aseo >= 5 }
  ];

  function completar(id) {
    if (hechas.has(id)) { return; }
    hechas.add(id);
    const m = MISIONES.find((x) => x.id === id);
    if (m) { aviso('🏆 Misión cumplida: ' + m.titulo, 3500); }
    pintarMisiones();
    guardar();
  }

  function revisarMisiones() {
    for (const m of MISIONES) { if (!hechas.has(m.id) && m.ok && m.ok()) { completar(m.id); } }
  }

  function pintarMisiones() {
    let actual = false;
    const filas = MISIONES.map((m) => {
      const li = document.createElement('li');
      const hecha = hechas.has(m.id);
      const t = document.createElement('b');
      t.textContent = (hecha ? '✓ ' : '') + m.titulo;
      li.appendChild(t);
      if (hecha) {
        li.className = 'hecha';
      } else if (!actual) {
        actual = true;
        li.className = 'actual';
        const p = document.createElement('span');
        p.textContent = m.pista;
        li.appendChild(p);
      }
      return li;
    });
    $('#misiones').replaceChildren(...filas);
  }

  // ================================================================================================ memoria
  $('#exportar').addEventListener('click', () => {
    guardar();
    const blob = new Blob([JSON.stringify(leer() || {})], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mosca-obrera-' + normalizarOlor(nombre) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  $('#importar').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) { return; }
    f.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!d || d.v !== 1 || !d.cerebro || !d.cerebro.semilla) { throw new Error('ese archivo no es la memoria de una mosca'); }
      window.removeEventListener('pagehide', guardar);
      escribir(d);
      location.reload();
    }).catch((e) => aviso('No pude cargarla: ' + e.message, 4000));
  });

  let confirmar = 0;
  $('#reiniciar').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (Date.now() - confirmar > 4000) {
      confirmar = Date.now();
      b.textContent = '¿Seguro? Se olvida de todo. Toca otra vez';
      setTimeout(() => { b.textContent = 'Nueva mosca'; }, 4000);
      return;
    }
    window.removeEventListener('pagehide', guardar);
    try { localStorage.removeItem(CLAVE); } catch (e) { /* nada que borrar */ }
    location.reload();
  });

  // ================================================================================================ API para jugar
  function estimular(e, fuerza) {
    const m = mundo.mosca;
    if (e === 'premio') { mundo.premio(); } else if (e === 'castigo') { mundo.castigo(); } else if (e === 'limpiar') { mundo.limpiar(); } else if (e === 'viento') {
      const a = Math.random() * Math.PI * 2;
      mundo.vientoDesde(mundo.W / 2 + Math.cos(a) * mundo.W, mundo.H / 2 + Math.sin(a) * mundo.H, 0.4 + 0.6 * (fuerza == null ? 1 : fuerza));
    } else if (e === 'amenaza') {
      const a = Math.random() * Math.PI * 2;
      mundo.agregar('amenaza', m.x + Math.cos(a) * 90, m.y + Math.sin(a) * 90);
    } else if (Mundo.TIPOS[e]) {
      const a = Math.random() * Math.PI * 2;
      const d = 160 + Math.random() * 160;
      mundo.agregar(e, Math.min(mundo.W - 40, Math.max(40, m.x + Math.cos(a) * d)), Math.min(mundo.H - 40, Math.max(40, m.y + Math.sin(a) * d)));
    } else {
      return false;
    }
    return true;
  }

  const ESTIMULOS = { fruta: 'fruta', menta: 'menta', canela: 'canela', humo: 'humo', luz: 'luz', calor: 'calor',
    mano: 'amenaza', amenaza: 'amenaza', viento: 'viento', premio: 'premio', castigo: 'castigo', limpiar: 'limpiar' };

  function leerHash() {
    if (!location.hash || location.hash.indexOf('=') < 0) { return; }
    const q = new URLSearchParams(location.hash.slice(1));
    const e = ESTIMULOS[normalizarOlor(q.get('estimulo') || '')];
    if (e) { estimular(e); history.replaceState(null, '', location.pathname + location.search + '#jugar'); }
  }
  window.addEventListener('hashchange', leerHash);

  window.MoscaObrera = {
    estimulo: (n, fuerza) => { const e = ESTIMULOS[normalizarOlor(n)]; return e ? estimular(e, fuerza) : false; },
    ensenar: (olor, signo) => cerebro.condicionar(olor, signo >= 0 ? 1 : -1, 1.5),
    velocidad: ponerVelocidad,
    estado: () => ({ nombre, accion: cerebro.accion(), interno: Object.assign({}, cerebro.interno), sueno: cerebro.sueno,
      stats: Object.assign({}, mundo.stats), misiones: Array.from(hechas) }),
    cerebro,
    mundo
  };

  // ================================================================================================ arranque
  for (const n of $$('.n-neuronas')) { n.textContent = String(Cerebro.TOTAL_NEURONAS); }
  pintarEstado();
  pintarAprendido();
  pintarMisiones();
  leerHash();
  if (!guardado.cerebro) { setTimeout(() => aviso('👇 Elige una herramienta abajo y toca la arena', 4000), 800); }
  if ('serviceWorker' in navigator && /^https:|^http:\/\/(localhost|127\.)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
