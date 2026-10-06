/**
 * Mosca Obrera: la página. Une el cerebro, sus dos lugares (el laboratorio y la pantalla de trabajo), Mosca OS (su
 * sistema de archivos y su terminal), las vistas y las conexiones; guarda todo en este dispositivo; lleva las misiones
 * y el registro de trabajos.
 */
(function () {
  'use strict';

  const Cerebro = window.MoscaCerebro;
  const Mundo = window.MoscaMundo;
  const Pantalla = window.MoscaPantalla;
  const Conexiones = window.MoscaConexiones;
  const Sistema = window.MoscaSistema;
  const Terminal = window.MoscaTerminal;
  const { VistaArena, VistaCerebro, VistaPantalla, EMOJI_ACCION, TEXTO_ACCION, colorOlor } = window.MoscaVista;
  const { normalizarOlor, OLORES, COMPARTIMENTOS } = Cerebro;
  const CLAVE = 'mosca-obrera:v1';
  const CLAVE_FS = 'mosca-obrera:fs';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  /** Qué salida usa cada app de la pantalla. */
  const SALIDA = { celular: 'salidaNtfy', discord: 'discord', webhook: 'webhook', avisos: 'navegador' };
  const INFO_APP = {};
  for (const a of Pantalla.APPS) { INFO_APP[a.id] = a; }

  // ================================================================================================ estado guardado
  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || null; } catch (e) { return null; } }
  function escribir(d) { try { localStorage.setItem(CLAVE, JSON.stringify(d)); return true; } catch (e) { return false; } }

  function mezclar(base, guardada) {
    if (!guardada || typeof guardada !== 'object') { return base; }
    for (const k of Object.keys(base)) {
      if (guardada[k] === undefined) { continue; }
      base[k] = base[k] && typeof base[k] === 'object' ? Object.assign(base[k], guardada[k]) : guardada[k];
    }
    return base;
  }

  const guardado = leer() || {};
  const cerebro = guardado.cerebro ? Cerebro.desde(guardado.cerebro) : new Cerebro();
  const nombrePorDefecto = 'Mosca #' + String(cerebro.semilla % 10000).padStart(4, '0');
  let nombre = guardado.nombre || nombrePorDefecto;
  const config = mezclar(Conexiones.configInicial(), guardado.config);
  const registro = Array.isArray(guardado.registro) ? guardado.registro : [];
  const marcador = Object.assign({ ok: 0, total: 0, racha: 0, sueldo: 0 }, guardado.marcador);
  const hechas = new Set(guardado.misiones || []);
  let turnoAuto = guardado.turnoAuto !== false;
  const reloj = { modoReloj: guardado.modoReloj || 'acelerado', horaInicio: typeof guardado.hora === 'number' ? guardado.hora : 0.35 };
  const mundo = new Mundo(cerebro, Object.assign({ W: 1000, H: 700 }, reloj));
  const pantalla = new Pantalla(cerebro, Object.assign({ W: 600, H: 720, tocar: tocarDeVerdad }, reloj));
  if (guardado.stats) { Object.assign(mundo.stats, guardado.stats); }
  if (guardado.statsPantalla) { Object.assign(pantalla.stats, guardado.statsPantalla); }
  // Mosca OS (se arma más abajo, cuando ya existen las conexiones).
  let shell = null;
  let terminal = null;
  let sfs = null;
  // La mosca está en un solo lugar: el laboratorio o la pantalla.
  let activo = mundo;
  pantalla.salir();
  if (guardado.lugar === 'pantalla') { mundo.salir(); pantalla.entrar(); activo = pantalla; }

  function guardar() {
    escribir({ v: 1, nombre, cerebro: cerebro.exportar(), config, registro: registro.slice(0, 60), marcador,
      misiones: Array.from(hechas), stats: mundo.stats, statsPantalla: pantalla.stats, modoReloj: activo.modoReloj,
      hora: activo.modoReloj === 'acelerado' ? activo.hora() : null, lugar: activo === pantalla ? 'pantalla' : 'lab',
      pendientes: pantalla.pendientes().slice(0, 100), turnoAuto, historia: shell ? shell.historia.slice(-100) : guardado.historia });
    guardarFs();
  }

  function guardarFs() {
    if (!sfs) { return; }
    try { localStorage.setItem(CLAVE_FS, JSON.stringify(sfs.nodos)); } catch (e) { /* sin espacio: queda en memoria */ }
  }
  setInterval(guardar, 15000);
  window.addEventListener('pagehide', guardar);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { guardar(); } });

  // ================================================================================================ vistas
  const vArena = new VistaArena($('#arena'), mundo);
  const vCerebro = new VistaCerebro($('#cerebro'), cerebro);
  const vPantalla = new VistaPantalla($('#zona'), $('#capa-mosca'), pantalla);
  const visible = { arena: true, cerebro: true, zona: true };

  function ajustarArena() {
    const { W, H } = vArena.ajustar();
    mundo.redimensionar(W, H);
  }
  function ajustarPantalla() {
    const r = vPantalla.ajustar();
    if (r) { pantalla.redimensionar(r.W, r.H); }
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(ajustarArena).observe($('#arena-marco'));
    new ResizeObserver(() => vCerebro.ajustar()).observe($('#cerebro'));
    new ResizeObserver(ajustarPantalla).observe($('#zona'));
  } else {
    window.addEventListener('resize', () => { ajustarArena(); vCerebro.ajustar(); ajustarPantalla(); });
  }
  ajustarArena();
  vCerebro.ajustar();
  ajustarPantalla();
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => { for (const e of ents) { visible[e.target.id] = e.isIntersecting; } });
    io.observe($('#arena'));
    io.observe($('#cerebro'));
    io.observe($('#zona'));
  }

  // ================================================================================================ el ciclo
  let velocidad = 1;
  let ultimo = performance.now();
  let tUI = 0;
  let tLento = 0;
  let ventanaPip = null;
  let generacion = 0;

  function cuadro() {
    // El reloj de esta ventana (la flotante tiene otro origen de tiempo).
    const ahora = performance.now();
    const dt = Math.min(0.1, Math.max(0, (ahora - ultimo) / 1000));
    ultimo = ahora;
    if (velocidad > 0) { activo.paso(dt * velocidad); }
    if (visible.arena) { vArena.dibujar(dt, ahora / 1000); }
    if (visible.cerebro) { vCerebro.dibujar(dt, ahora / 1000); }
    if (visible.zona || ventanaPip) { vPantalla.dibujar(dt, ahora / 1000); }
    tUI += dt;
    tLento += dt;
    if (tUI > 0.2) { tUI = 0; pintarEstado(); }
    if (tLento > 1) { tLento = 0; pintarAprendido(); revisarMisiones(); }
  }

  /** Arranca (o rearranca) el ciclo de cuadros en la ventana que se ve: la página o la ventana flotante. */
  function lanzar() {
    const g = ++generacion;
    const ventana = () => (ventanaPip && !ventanaPip.closed ? ventanaPip : window);
    const f = () => {
      if (g !== generacion) { return; }
      cuadro();
      ventana().requestAnimationFrame(f);
    };
    ventana().requestAnimationFrame(f);
  }
  lanzar();
  // Con la pestaña en segundo plano (y sin ventana flotante) no hay cuadros: sigue trabajando a saltos de un segundo.
  setInterval(() => {
    if (!document.hidden || ventanaPip) { return; }
    const ahora = performance.now();
    const dt = (ahora - ultimo) / 1000;
    ultimo = ahora;
    if (velocidad > 0) { activo.paso(Math.min(dt, 120) * velocidad); }
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

  // ================================================================================================ dónde está
  function mudarA(destino) {
    const a = destino === 'pantalla' ? pantalla : mundo;
    if (activo === a) { return; }
    // El día sigue igual en el otro lugar.
    const h = activo.hora();
    activo.salir();
    a.modoReloj = activo.modoReloj;
    if (a.modoReloj === 'acelerado' && h != null) { a.horaInicio = h - a.t / a.diaSeg; }
    a.mosca.vel = 0;
    a.mosca.rastro.length = 0;
    a.entrar();
    activo = a;
    pintarLugar();
    guardar();
  }

  function pintarLugar() {
    const enPantalla = activo === pantalla;
    $('#donde').textContent = enPantalla ? '💼 Está trabajando en su pantalla' : '🧪 Está en el laboratorio';
    $('#mudar').textContent = enPantalla ? '🧪 Traerla al laboratorio' : '💼 Llevarla a trabajar';
    $('#os-ausente').hidden = enPantalla;
    $('#arena-fuera').hidden = !enPantalla;
  }

  $('#mudar').addEventListener('click', () => mudarA(activo === pantalla ? 'lab' : 'pantalla'));
  for (const b of $$('[data-mudar]')) { b.addEventListener('click', () => mudarA(b.dataset.mudar)); }

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
    const enPantalla = activo === pantalla;
    $('#accion-actual').textContent = enPantalla ? '💼 trabajando' : EMOJI_ACCION[a] + ' ' + TEXTO_ACCION[a];
    $('#accion-actual').dataset.accion = a;
    $('#m-hambre').style.width = Math.round(cerebro.interno.hambre * 100) + '%';
    $('#m-sueno').style.width = Math.round(cerebro.sueno * 100) + '%';
    $('#m-susto').style.width = Math.round(cerebro.interno.susto * 100) + '%';
    const h = activo.hora();
    let icono = '⚡';
    if (h != null) { icono = h < 0.22 || h > 0.86 ? '🌙' : (h < 0.3 || h > 0.78 ? '🌅' : '☀️'); }
    const hora = h == null ? '⚡ despierta' : icono + ' ' + formatoHora(h);
    $('#hora-mosca').textContent = hora;
    $('#os-hora').textContent = h == null ? '⚡' : formatoHora(h);
    $('#os-bateria').textContent = '🔋 ' + Math.round((1 - cerebro.interno.hambre) * 100) + '%';
    $('#os-estado').textContent = !enPantalla ? '🧪 fuera' : (a === 'descansar' ? '💤 durmiendo' : '💼 trabajando');
    $('#os-vacia').hidden = !!(pantalla.carga || pantalla.objetos.some((o) => o.tipo === 'carta'));
  }

  /** Los olores que vale la pena mostrar: los del laboratorio, los de los trabajos recientes y los que hay en la arena. */
  function oloresAMostrar() {
    const lista = ['fruta', 'menta', 'canela', 'humo'];
    for (const o of mundo.objetos) { if (o.olor && lista.indexOf(o.olor) < 0) { lista.push(o.olor); } }
    for (const c of registro) {
      if (lista.length >= 12) { break; }
      if (lista.indexOf(c.olor) < 0) { lista.push(c.olor); }
    }
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
      nom.textContent = OLORES[olor] ? info.nombre : '#' + olor + ' → ' + INFO_APP[pantalla.destinoPara(olor)].emoji;
      if (!OLORES[olor]) { nom.title = 'Adónde lo llevaría hoy'; }
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

  // ================================================================================================ laboratorio
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

  function estaFuera() {
    if (activo === mundo) { return false; }
    aviso('💼 Está trabajando en su pantalla. Tráela al laboratorio para jugar.');
    return true;
  }

  function inmediata(a) {
    if (a === 'limpiar') {
      mundo.limpiar();
      aviso('🧹 Arena limpia.');
      return;
    }
    if (estaFuera()) { return; }
    if (a === 'premio') { mundo.premio(); } else if (a === 'castigo') { mundo.castigo(); }
  }

  $('#arena').addEventListener('click', (e) => {
    const p = vArena.aMundo(e.clientX, e.clientY);
    if (!herramienta) {
      if (activo === mundo && !mundo.tocarEn(p.x, p.y)) { aviso('Elige algo abajo para ponerlo, o toca a la mosca.'); }
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
  selReloj.value = activo.modoReloj;
  selReloj.addEventListener('change', () => {
    const h = activo.hora();
    for (const m of [mundo, pantalla]) {
      if (selReloj.value === 'acelerado') { m.horaInicio = (h == null ? 0.35 : h) - m.t / m.diaSeg; }
      m.modoReloj = selReloj.value;
    }
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

  // ================================================================================================ la pantalla de trabajo
  /** El toque de la mosca es un clic de verdad sobre el botón que tiene debajo (el mismo que tocarías tú). */
  let tocaLaMosca = false;
  function tocarDeVerdad(x, y, id) {
    vPantalla.sincronizar(performance.now() / 1000);
    const c = vPantalla.aCliente(x, y);
    const el = vPantalla.zona.ownerDocument.elementFromPoint(c.x, c.y);
    const w = el && el.closest('[data-widget]');
    if (!w || w.dataset.widget !== id) { return false; }
    tocaLaMosca = true;
    try { w.click(); } finally { tocaLaMosca = false; }
    return true;
  }

  $('#zona').addEventListener('click', (e) => {
    const w = e.target.closest('[data-widget]');
    if (w) { pantalla.activar(w.dataset.widget, tocaLaMosca ? 'mosca' : 'tu'); }
  });

  pantalla.on((ev) => {
    switch (ev.tipo) {
      case 'trabajo-llega':
      case 'trabajo-cola':
        if (activo === mundo && turnoAuto) {
          mudarA('pantalla');
          aviso('💼 Se fue a trabajar: llegó #' + ev.trabajo.olor);
        } else if (activo === mundo) {
          aviso('📨 Le llegó un trabajo #' + ev.trabajo.olor + ' a su pantalla');
        }
        break;
      case 'elegido':
        if (ev.trabajo) { aviso('Ahora toca la app adonde va #' + ev.trabajo.olor); }
        break;
      case 'sin-eleccion':
        aviso('Primero toca un trabajo; después, la app adonde va.');
        break;
      case 'trabajo':
        alTerminar(ev);
        break;
      default:
    }
  });

  /** Un trabajo terminó: queda en el registro y, si fue a una app conectada, sale de verdad por ahí. */
  function alTerminar(ev) {
    const t = ev.trabajo;
    const e = { id: t.id, texto: t.texto, olor: t.olor, fuente: t.fuente, meta: t.meta, t: Date.now(), app: ev.app,
      quien: ev.quien, resultado: ev.resultado, motivo: ev.motivo, valencia: Math.round(ev.valencia * 100) / 100,
      envio: null, nivel: 'info', fb: ev.quien === 'tu' ? 1 : null, correcta: null, acierto: null, preguntando: false };
    registro.unshift(e);
    if (registro.length > 60) { registro.length = 60; }
    if (ev.resultado === 'ignorado') {
      e.envio = '🗑️ ' + ev.motivo;
    } else if (SALIDA[ev.app]) {
      e.envio = 'enviando…';
      enviar(e, ev.app).then((r) => { e.envio = r.texto; e.nivel = r.nivel; pintarRegistro(); guardar(); });
    } else {
      e.envio = ev.app === 'archivo' ? '🗂️ guardado en el archivo' : '🗑️ a la papelera';
    }
    if (ev.quien === 'tu') { e.envio += ' · lo hiciste tú: aprendió mirándote'; }
    pintarRegistro();
    guardar();
  }

  /** Manda un trabajo por la salida de una app. Devuelve { texto, nivel } para el registro. */
  async function enviar(e, app) {
    const info = INFO_APP[app];
    const salida = SALIDA[app];
    if (!config[salida].activo) { return { texto: info.emoji + ' sin conectar: quedó en el archivo', nivel: 'info' }; }
    const r = await conexiones.enviarA(salida, {
      titulo: '🪰 ' + nombre + ' te manda #' + e.olor, texto: e.texto, olor: e.olor, evento: 'entregado',
      datos: { app, quien: e.quien, valencia: e.valencia, trabajo: { texto: e.texto, olor: e.olor, fuente: e.fuente, meta: e.meta } }
    });
    return { texto: info.emoji + ' ' + r.detalle, nivel: r.ok ? 'ok' : 'error' };
  }

  function contarAcierto(e, acierto) {
    e.acierto = acierto;
    marcador.total += 1;
    if (acierto) { marcador.ok += 1; marcador.racha += 1; } else { marcador.racha = 0; }
  }

  /** 👍: lo hizo bien. Se refuerza lo que hizo y se le paga con azúcar. */
  function bien(e) {
    e.fb = 1;
    if (e.resultado === 'ignorado') {
      cerebro.condicionar(e.olor, -1, 1.5);
    } else {
      cerebro.condicionarMezcla(e.olor, 'app-' + e.app, 1, 1.5);
      cerebro.condicionar(e.olor, 1, 0.5);
    }
    contarAcierto(e, true);
    cerebro.interno.hambre = Math.max(0, cerebro.interno.hambre - 0.08);
    marcador.sueldo += 1;
    aviso('🍬 Le pagaste con azúcar: «#' + e.olor + ' → ' + INFO_APP[e.app].emoji + '» queda reforzado');
  }

  /** 👎 + adónde iba: se debilita lo que hizo, se refuerza lo correcto y se reenvía ahí. */
  function corregir(e, destino) {
    if (destino === e.app) { bien(e); return; }
    e.fb = -1;
    e.correcta = destino;
    e.preguntando = false;
    if (e.resultado === 'ignorado') {
      if (destino !== 'papelera') { cerebro.condicionar(e.olor, 1, 1.5); }
    } else {
      cerebro.condicionarMezcla(e.olor, 'app-' + e.app, -1, 1.5);
    }
    cerebro.condicionarMezcla(e.olor, 'app-' + destino, 1, 1.5);
    contarAcierto(e, false);
    aviso('👎 Aprendió: #' + e.olor + ' va a ' + INFO_APP[destino].emoji + ' ' + INFO_APP[destino].nombre);
    if (SALIDA[destino]) {
      e.reenvio = 'reenviando…';
      enviar(e, destino).then((r) => { e.reenvio = 'reenviado: ' + r.texto; pintarRegistro(); guardar(); });
    }
  }

  $('#registro').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) { return; }
    const e = registro.find((x) => x.id === b.closest('li').dataset.id);
    if (!e || e.fb != null) { return; }
    if (b.dataset.fb === '1') { bien(e); } else if (b.dataset.fb === '-1') { e.preguntando = true; } else if (b.dataset.fb === 'no') {
      e.preguntando = false;
    } else if (b.dataset.dest) { corregir(e, b.dataset.dest); }
    pintarRegistro();
    guardar();
  });

  function pintarRegistro() {
    const filas = [];
    for (const e of registro.slice(0, 40)) {
      const li = document.createElement('li');
      li.className = 'hecho' + (e.resultado === 'ignorado' ? ' ignorado' : '');
      li.dataset.id = e.id;
      const cab = document.createElement('div');
      cab.className = 'cabeza';
      const olor = document.createElement('span');
      olor.className = 'olor-chip';
      olor.style.setProperty('--c', colorOlor(e.olor));
      olor.textContent = '#' + e.olor;
      const fuente = document.createElement('span');
      fuente.className = 'fuente';
      fuente.textContent = e.fuente;
      const destino = document.createElement('span');
      destino.className = 'destino';
      destino.textContent = e.resultado === 'ignorado' ? '🗑️ lo ignoró' : '→ ' + INFO_APP[e.app].emoji + ' ' + INFO_APP[e.app].nombre +
        (e.quien === 'tu' ? ' (tú)' : '');
      const t = document.createElement('time');
      const d = new Date(e.t);
      t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      cab.append(olor, fuente, destino, t);
      const p = document.createElement('p');
      p.className = 'texto';
      p.textContent = e.texto;
      const envio = document.createElement('p');
      envio.className = 'envio';
      envio.dataset.nivel = e.nivel || 'info';
      envio.textContent = e.envio + (e.reenvio ? ' · ' + e.reenvio : '');
      const fb = document.createElement('div');
      fb.className = 'fb';
      if (e.fb == null && !e.preguntando) {
        fb.append(boton('👍 bien', { fb: '1' }), boton('👎 no', { fb: '-1' }));
      } else if (e.fb == null) {
        const ad = document.createElement('div');
        ad.className = 'adonde';
        ad.append('¿Adónde iba?');
        for (const a of Pantalla.APPS) { ad.append(boton(a.emoji, { dest: a.id }, a.nombre)); }
        ad.append(boton('cancelar', { fb: 'no' }));
        fb.append(ad);
      } else if (e.quien !== 'tu') {
        const v = document.createElement('span');
        v.className = 'veredicto';
        v.textContent = e.acierto ? '👍 bien hecho · 🍬 cobró' : '👎 iba a ' + INFO_APP[e.correcta].emoji + ' ' + INFO_APP[e.correcta].nombre + ' · ya aprendió';
        fb.append(v);
      }
      li.append(cab, p, envio, fb);
      filas.push(li);
    }
    $('#registro').replaceChildren(...filas);
    $('#registro-vacio').hidden = registro.length > 0;
    $('#r-hechos').textContent = String(pantalla.stats.hechos + pantalla.stats.ignorados);
    $('#r-aciertos').textContent = marcador.total ? marcador.ok + '/' + marcador.total : '–';
    $('#r-racha').textContent = String(marcador.racha);
    $('#r-sueldo').textContent = String(marcador.sueldo);
  }

  function boton(texto, data, titulo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chico';
    b.textContent = texto;
    for (const k of Object.keys(data)) { b.dataset[k] = data[k]; }
    if (titulo) { b.title = titulo; b.setAttribute('aria-label', titulo); }
    return b;
  }

  $('#form-prueba').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const texto = $('#texto-prueba').value.trim();
    if (!texto) { return; }
    const r = Conexiones.interpretarMensaje({ texto, fuente: 'prueba' });
    if (r && r.tipo === 'carta') {
      mudarA('pantalla');
      aplicar(r, 'prueba');
    } else {
      aplicar(r, 'prueba');
    }
  });

  const chkTurno = $('#turno-auto');
  chkTurno.checked = turnoAuto;
  chkTurno.addEventListener('change', () => { turnoAuto = chkTurno.checked; guardar(); });

  // ---------------------------------------------------------------------------------------------- ventana flotante
  /** Saca la pantalla a una ventana que flota encima de todo (Document Picture-in-Picture: Chrome y Edge de escritorio). */
  async function flotante() {
    if (ventanaPip) { ventanaPip.close(); return; }
    if (!('documentPictureInPicture' in window)) {
      aviso('Tu navegador no puede sacar ventanas flotantes. Sirve en Chrome o Edge de computadora.', 4000);
      return;
    }
    const disp = $('#dispositivo');
    let pip;
    try {
      pip = await window.documentPictureInPicture.requestWindow({ width: 420, height: 600 });
    } catch (e) {
      aviso('No se pudo abrir la ventana flotante: ' + e.message, 4000);
      return;
    }
    for (const hoja of Array.from(document.styleSheets)) {
      try {
        const st = pip.document.createElement('style');
        st.textContent = Array.from(hoja.cssRules).map((r) => r.cssText).join('\n');
        pip.document.head.appendChild(st);
      } catch (e) {
        if (hoja.href) {
          const l = pip.document.createElement('link');
          l.rel = 'stylesheet';
          l.href = hoja.href;
          pip.document.head.appendChild(l);
        }
      }
    }
    pip.document.title = nombre + ' · Mosca OS';
    pip.document.body.classList.add('en-pip');
    const hueco = document.createElement('div');
    hueco.className = 'panel hueco-pip';
    hueco.textContent = '📺 Su pantalla está en la ventana flotante.';
    disp.before(hueco);
    pip.document.body.append(disp);
    ventanaPip = pip;
    if (activo !== pantalla) { mudarA('pantalla'); }
    pip.addEventListener('resize', ajustarPantalla);
    pip.addEventListener('pagehide', () => {
      hueco.replaceWith(disp);
      ventanaPip = null;
      $('#flotante').textContent = '📺 Sacar en ventana flotante';
      ajustarPantalla();
      lanzar();
    });
    $('#flotante').textContent = '📺 Devolver a la página';
    ajustarPantalla();
    lanzar();
  }
  $('#flotante').addEventListener('click', flotante);
  if (!('documentPictureInPicture' in window)) {
    $('#ayuda-flotante').textContent = 'La ventana flotante (que queda encima de todo mientras usas la compu) funciona en Chrome o Edge de escritorio.';
  }

  // ================================================================================================ misiones
  const MISIONES = [
    { id: 'comer', titulo: 'Primer bocado', pista: 'Pon una 🍌 fruta en la arena y espera a que la encuentre.', ok: () => mundo.stats.comidas >= 1 },
    { id: 'susto', titulo: 'Reflejo de escape', pista: 'Elige 🖐️ Mano y toca cerca de la mosca: mira cómo salta.', ok: () => mundo.stats.huidas >= 1 },
    { id: 'pavlov', titulo: 'Pavlov para moscas', pista: 'Pon 🌿 Olor A pegado a ella y dale 🍬 Premio tres veces mientras lo huele.', ok: () => cerebro.valencia('menta').total >= 0.25 },
    { id: 'aversion', titulo: 'Mala experiencia', pista: 'Pon 🍂 Olor B pegado a ella y dale ⚡ Castigo un par de veces mientras lo huele.', ok: () => cerebro.valencia('canela').total <= -0.2 },
    { id: 'laberinto', titulo: 'El examen', pista: 'Con la memoria fresca, 🧹 limpia y pon Olor A y Olor B lejos de ella, en lados opuestos. ¿A cuál va?' },
    { id: 'trabajo', titulo: 'Primer trabajo', pista: 'En «Su pantalla de trabajo», mándale un trabajo de prueba y mira adónde lo lleva.', ok: () => registro.some((e) => e.quien === 'mosca' && e.resultado === 'entregado') },
    { id: 'ensenar', titulo: 'Enséñale tú', pista: 'En su pantalla, toca un trabajo y después la app adonde va: aprende mirándote.', ok: () => pantalla.stats.porTi >= 1 },
    { id: 'conectada', titulo: 'Conectada', pista: 'Enciende una entrada (ntfy, cripto, clima o GitHub) y que le llegue un trabajo desde afuera.', ok: () => registro.some((c) => ['prueba', 'consola', 'enlace'].indexOf(c.fuente) < 0) },
    { id: 'obrera', titulo: 'Obrera entrenada', pista: 'Califica sus trabajos (👍, o 👎 y adónde iba) hasta que acierte cinco seguidos.', ok: () => marcador.racha >= 5 },
    { id: 'terminal', titulo: 'Hola, terminal', pista: 'En la terminal de Mosca OS escribe neofetch y después ls ~/bandeja.' },
    { id: 'automatiza', titulo: 'Que trabaje sola', pista: 'Crea una tarea que se repita: cada 10m echo "#recordatorio toma agua" > ~/bandeja/agua.txt', ok: () => !!(shell && shell.tareas.length) }
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

  // ================================================================================================ conexiones
  function alEstado(id, texto, nivel) {
    const el = $('[data-estado="' + id + '"]');
    if (el) { el.textContent = texto; el.dataset.nivel = nivel || 'info'; }
  }

  const conexiones = new Conexiones({
    config,
    nombre: () => nombre,
    alMensaje: (r, origen) => aplicar(r, origen),
    alEstado,
    alClima: (c) => {
      mundo.tempAmbiente = Math.max(10, Math.min(29, c.temp));
      if (c.viento >= 3) {
        const hacia = (c.dirViento + 180) * Math.PI / 180;
        mundo.viento.ang = Math.atan2(-Math.cos(hacia), Math.sin(hacia));
        mundo.viento.fuerza = Math.min(1, c.viento / 40);
        mundo.viento.hasta = Infinity;
      } else if (mundo.viento.hasta === Infinity) {
        mundo.viento.fuerza = 0;
      }
    }
  });

  function quitarClima() {
    mundo.tempAmbiente = 23;
    if (mundo.viento.hasta === Infinity) { mundo.viento.fuerza = 0; mundo.viento.hasta = 0; }
  }

  function estadoSalida(id) { alEstado(id, config[id].activo ? 'listo' : 'apagado', config[id].activo ? 'ok' : 'info'); }

  /** En su pantalla, las apps sin salida configurada se ven apagadas. */
  function pintarApps() {
    vPantalla.marcarApagadas(Object.keys(SALIDA).filter((app) => !config[SALIDA[app]].activo));
  }

  for (const inp of $$('[data-cfg]')) {
    const [a, b] = inp.dataset.cfg.split('.');
    if (inp.type === 'checkbox') { inp.checked = !!config[a][b]; } else { inp.value = config[a][b] == null ? '' : config[a][b]; }
    inp.addEventListener('change', () => {
      config[a][b] = inp.type === 'checkbox' ? inp.checked : (inp.type === 'number' ? Number(inp.value) : inp.value.trim());
      if (a === 'navegador' && inp.checked) { pedirPermiso(inp); }
      if (a === 'entrada') { conexiones.escuchar(); pintarApi(); }
      if (a === 'salidaNtfy') { pintarApi(); estadoSalida(a); }
      if (a === 'discord' || a === 'webhook' || a === 'navegador') { estadoSalida(a); }
      if (a === 'cripto' || a === 'clima' || a === 'github') {
        if (a === 'clima' && !config.clima.activo) { quitarClima(); }
        conexiones.fuentes();
      }
      pintarApps();
      guardar();
    });
  }

  function pedirPermiso(inp) {
    if (typeof Notification === 'undefined') {
      config.navegador.activo = false;
      inp.checked = false;
      alEstado('navegador', 'este navegador no tiene notificaciones', 'error');
      pintarApps();
      return;
    }
    Notification.requestPermission().then((p) => {
      if (p !== 'granted') {
        config.navegador.activo = false;
        inp.checked = false;
        alEstado('navegador', 'no diste permiso', 'error');
        pintarApps();
        guardar();
      }
    });
  }

  for (const b of $$('[data-copiar]')) {
    b.addEventListener('click', () => {
      const tema = config[b.dataset.copiar].tema;
      const hecho = () => { b.textContent = '¡Copiado!'; setTimeout(() => { b.textContent = 'Copiar'; }, 1500); };
      if (navigator.clipboard) { navigator.clipboard.writeText(tema).then(hecho, () => {}); }
    });
  }
  for (const b of $$('[data-nuevo-tema]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.nuevoTema;
      config[id].tema = Conexiones.temaAlAzar(id === 'entrada' ? 'entrada' : 'salida');
      $('[data-cfg="' + id + '.tema"]').value = config[id].tema;
      if (id === 'entrada') { conexiones.escuchar(); }
      pintarApi();
      guardar();
    });
  }
  for (const b of $$('[data-probar]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.probar;
      if (!config[id].activo) { alEstado(id, 'enciende primero el interruptor', 'error'); return; }
      alEstado(id, 'enviando…', 'info');
      conexiones.enviarA(id, { titulo: '🪰 Hola desde ' + nombre, texto: 'Si ves esto, la conexión funciona.', olor: 'prueba', evento: 'prueba' });
    });
  }

  $('#ciudad').value = config.clima.ciudad || '';
  $('#form-ciudad').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = $('#ciudad').value.trim();
    if (!q) { return; }
    alEstado('clima', 'buscando…', 'info');
    conexiones.buscarCiudad(q).then((ciudad) => {
      $('#ciudad').value = ciudad;
      config.clima.activo = true;
      $('[data-cfg="clima.activo"]').checked = true;
      guardar();
      conexiones.fuentes();
    }).catch((e) => alEstado('clima', e.message, 'error'));
  });

  function pintarApi() {
    const servidor = config.ntfyServidor.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const tin = config.entrada.tema;
    $('#api-cartas').textContent =
      '# un trabajo que huele a #ventas\n' +
      'curl -d "#ventas Llegó un pedido nuevo" ' + servidor + '/' + tin + '\n\n' +
      '# lo mismo, con etiqueta y título\n' +
      'curl -H "Tags: ventas" -H "Title: Pedido 123" \\\n' +
      '     -d "Cliente: Ana, total 45 USD" ' + servidor + '/' + tin + '\n\n' +
      '# en JSON (n8n, Make o Zapier: un POST con este cuerpo)\n' +
      'curl -d \'{"carta":"Cliente nuevo","olor":"ventas"}\' ' + servidor + '/' + tin;
    $('#api-estimulos').textContent =
      'curl -d "fruta" ' + servidor + '/' + tin + '          # pone fruta en la arena\n' +
      'curl -d "mano" ' + servidor + '/' + tin + '           # la asusta\n' +
      'curl -d "premio ventas" ' + servidor + '/' + tin + '  # 👍 a #ventas\n' +
      'curl -d "castigo spam" ' + servidor + '/' + tin + '   # 👎 a #spam';
    const url = location.protocol === 'file:' ? 'index.html' : location.origin + location.pathname;
    $('#api-enlace').textContent =
      url + '#carta=Hola&olor=saludos\n' +
      url + '#estimulo=fruta\n\n' +
      '// desde la página que la contiene:\n' +
      'iframe.contentWindow.postMessage(\n' +
      '  { mosca: { carta: "Hola", olor: "saludos" } }, "*");\n\n' +
      '// en la consola de esta página:\n' +
      'MoscaObrera.carta("Hola", "saludos");\n' +
      'MoscaObrera.estimulo("luz");';
    $('#abrir-salida').href = config.ntfyServidor.replace(/\/+$/, '') + '/' + encodeURIComponent(config.salidaNtfy.tema);
  }

  // ================================================================================================ lo que llega de afuera
  function aplicar(r, origen) {
    if (!r) { return; }
    if (r.tipo === 'carta') {
      pantalla.trabajoNuevo({ texto: r.texto, olor: r.olor, fuente: r.fuente || origen, meta: r.meta || null });
    } else if (r.tipo === 'feedback') {
      cerebro.condicionar(r.olor, r.signo, 1.5);
      aviso((r.signo > 0 ? '👍 ' : '👎 ') + 'Desde ' + origen + ': ' + (r.signo > 0 ? 'le interesa ' : 'no le interesa ') + '#' + r.olor);
    } else if (r.tipo === 'estimulo') {
      estimular(r.estimulo, r.fuerza, origen);
    }
  }

  function lugarCerca(min, max) {
    const m = mundo.mosca;
    for (let i = 0; i < 30; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const d = min + Math.random() * (max - min);
      const x = m.x + Math.cos(a) * d;
      const y = m.y + Math.sin(a) * d;
      if (x > 40 && x < mundo.W - 40 && y > 40 && y < mundo.H - 40) { return { x, y }; }
    }
    return { x: mundo.W / 2, y: mundo.H / 2 };
  }

  function estimular(e, fuerza, origen) {
    const m = mundo.mosca;
    if (e === 'premio') { mundo.premio(); } else if (e === 'castigo') { mundo.castigo(); } else if (e === 'limpiar') { mundo.limpiar(); } else if (e === 'viento') {
      const a = Math.random() * Math.PI * 2;
      mundo.vientoDesde(mundo.W / 2 + Math.cos(a) * mundo.W, mundo.H / 2 + Math.sin(a) * mundo.H, 0.4 + 0.6 * (fuerza == null ? 1 : fuerza));
    } else if (e === 'amenaza') {
      const a = Math.random() * Math.PI * 2;
      mundo.agregar('amenaza', m.x + Math.cos(a) * 90, m.y + Math.sin(a) * 90);
    } else {
      const p = lugarCerca(160, 320);
      mundo.agregar(e, p.x, p.y);
    }
    if (origen) { aviso('📨 Desde ' + origen + ': ' + e + (activo === mundo ? '' : ' (en el laboratorio)')); }
  }

  // ================================================================================================ memoria
  $('#exportar').addEventListener('click', () => {
    guardar();
    const datos = leer() || {};
    // Las direcciones de Discord y de los webhooks son como contraseñas: no van en el archivo.
    if (datos.config) {
      datos.config = JSON.parse(JSON.stringify(datos.config));
      datos.config.discord.url = '';
      datos.config.webhook.url = '';
    }
    const blob = new Blob([JSON.stringify(datos)], { type: 'application/json' });
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
      const actual = leer();
      if (d.config && actual && actual.config) {
        d.config.discord.url = d.config.discord.url || actual.config.discord.url;
        d.config.webhook.url = d.config.webhook.url || actual.config.webhook.url;
      }
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

  // ================================================================================================ API pública
  function leerHash() {
    if (!location.hash || location.hash.indexOf('=') < 0) { return; }
    const q = new URLSearchParams(location.hash.slice(1));
    let ir = '#jugar';
    if (q.has('carta')) {
      aplicar({ tipo: 'carta', texto: q.get('carta'), olor: normalizarOlor(q.get('olor') || 'enlace'), fuente: 'enlace' }, 'enlace');
      ir = '#oficina';
    } else if (q.has('estimulo')) {
      const e = Conexiones.ESTIMULOS[normalizarOlor(q.get('estimulo'))];
      if (e) { aplicar({ tipo: 'estimulo', estimulo: e, fuerza: 1 }, 'enlace'); }
    } else {
      return;
    }
    history.replaceState(null, '', location.pathname + location.search + ir);
  }
  window.addEventListener('hashchange', leerHash);

  window.addEventListener('message', (e) => {
    const d = e.data && e.data.mosca;
    if (!d || typeof d !== 'object') { return; }
    aplicar(Conexiones.interpretarMensaje({ texto: JSON.stringify(d), fuente: 'iframe' }), 'iframe');
  });

  window.MoscaObrera = {
    carta: (texto, olor) => aplicar({ tipo: 'carta', texto: String(texto), olor: normalizarOlor(olor || 'consola'), fuente: 'consola' }, 'consola'),
    estimulo: (n, fuerza) => {
      const e = Conexiones.ESTIMULOS[normalizarOlor(n)];
      if (!e) { return false; }
      aplicar({ tipo: 'estimulo', estimulo: e, fuerza: fuerza == null ? 1 : fuerza }, 'consola');
      return true;
    },
    ensenar: (olor, signo) => cerebro.condicionar(olor, signo >= 0 ? 1 : -1, 1.5),
    /** «Esto va ahí»: enseñarle una ruta sin esperar a que llegue un trabajo. */
    ruta: (olor, app) => cerebro.condicionarMezcla(normalizarOlor(olor), 'app-' + app, 1, 1.5),
    trabajar: () => mudarA('pantalla'),
    laboratorio: () => mudarA('lab'),
    estado: () => ({ nombre, lugar: activo === pantalla ? 'pantalla' : 'lab', accion: cerebro.accion(),
      interno: Object.assign({}, cerebro.interno), sueno: cerebro.sueno, stats: Object.assign({}, mundo.stats),
      pantalla: Object.assign({}, pantalla.stats), marcador: Object.assign({}, marcador), misiones: Array.from(hechas) }),
    velocidad: ponerVelocidad,
    terminal: (l) => terminal.correr(l),
    cerebro,
    mundo,
    pantalla
  };

  // ================================================================================================ Mosca OS
  let nodosGuardados = null;
  try { nodosGuardados = JSON.parse(localStorage.getItem(CLAVE_FS)); } catch (e) { nodosGuardados = null; }
  sfs = new Sistema.SistemaArchivos(nodosGuardados);
  let tFs = 0;
  sfs.alCambiar = () => { clearTimeout(tFs); tFs = setTimeout(guardarFs, 400); };

  /** Lo que la terminal puede hacer con la mosca y con tus conexiones. */
  const entorno = {
    Cerebro,
    cerebro,
    pantalla,
    nombre: () => nombre,
    cambiarNombre: (n) => {
      nombre = String(n).trim().slice(0, 24) || nombrePorDefecto;
      nombreInput.value = nombre;
      guardar();
    },
    lugar: () => (activo === pantalla ? 'pantalla' : 'lab'),
    hora: () => activo.hora(),
    mudarA,
    normalizar: normalizarOlor,
    trabajo(texto, olor) {
      const r = olor ? { tipo: 'carta', texto, olor: normalizarOlor(olor), fuente: 'terminal' } : Conexiones.interpretarMensaje({ texto, fuente: 'terminal' });
      if (!r) { throw new Error('no entendí el trabajo'); }
      aplicar(r, 'terminal');
      if (r.tipo === 'estimulo') { return '🧪 estímulo en el laboratorio: ' + r.estimulo; }
      if (r.tipo === 'feedback') { return '🧠 aprendió: #' + r.olor + (r.signo > 0 ? ' le interesa' : ' no le interesa'); }
      return '✉️ le llegó un trabajo #' + r.olor;
    },
    pendientes: () => pantalla.pendientes(),
    llevar: (id, app) => pantalla.llevar(id, app, 'tu'),
    ensenarRuta: (o, app) => cerebro.condicionarMezcla(normalizarOlor(o), 'app-' + app, 1, 1.5),
    conectada: (app) => !SALIDA[app] || config[SALIDA[app]].activo,
    async enviarApp(app, texto) {
      if (!texto) { throw new Error('no hay nada que mandar'); }
      if (!SALIDA[app]) { return app === 'archivo' ? '🗂️ archivado' : '🗑️ a la papelera'; }
      if (!config[SALIDA[app]].activo) { throw new Error(INFO_APP[app].emoji + ' ' + app + ' no está conectada (sección Conectar)'); }
      const r = await conexiones.enviarA(SALIDA[app], { titulo: '🪰 ' + nombre + ' · terminal', texto, olor: 'terminal', evento: 'terminal' });
      if (!r.ok) { throw new Error(r.detalle); }
      return INFO_APP[app].emoji + ' ' + r.detalle;
    },
    olores: () => oloresAMostrar(),
    registro: () => registro,
    fetch: (u, o) => fetch(u, o),
    async ntfy(tema, texto) {
      const r = await fetch(config.ntfyServidor.replace(/\/+$/, '') + '/', { method: 'POST',
        body: JSON.stringify({ topic: tema, title: '🪰 ' + nombre, message: texto, tags: [Conexiones.MARCA, 'fly'] }) });
      if (!r.ok) { throw new Error('ntfy respondió ' + r.status); }
    },
    temaSalida: () => config.salidaNtfy.tema,
    velocidad: ponerVelocidad,
    premio: () => { if (activo !== mundo) { return false; } mundo.premio(); return true; },
    castigo: () => { if (activo !== mundo) { return false; } mundo.castigo(); return true; },
    procesos() {
      const l = [];
      if (config.entrada.activo) { l.push({ pid: 10, nombre: 'entrada-ntfy', estado: 'escuchando ' + config.entrada.tema }); }
      if (config.cripto.activo) { l.push({ pid: 11, nombre: 'cripto', estado: config.cripto.monedas + ' (cada 2 min)' }); }
      if (config.clima.activo) { l.push({ pid: 12, nombre: 'clima', estado: (config.clima.ciudad || '¿ciudad?') + ' (cada 10 min)' }); }
      if (config.github.activo) { l.push({ pid: 13, nombre: 'github', estado: (config.github.repo || '¿repo?') + ' (cada 5 min)' }); }
      if (ventanaPip) { l.push({ pid: 20, nombre: 'ventana-flotante', estado: 'abierta' }); }
      return l;
    },
    matar(pid) {
      const id = { 10: 'entrada', 11: 'cripto', 12: 'clima', 13: 'github' }[pid];
      if (id && config[id].activo) {
        config[id].activo = false;
        $('[data-cfg="' + id + '.activo"]').checked = false;
        if (id === 'entrada') { conexiones.escuchar(); } else { conexiones.fuentes(); }
        if (id === 'clima') { quitarClima(); }
        guardar();
        return true;
      }
      if (pid === 20 && ventanaPip) { ventanaPip.close(); return true; }
      return false;
    },
    salir: () => {
      if (!document.body.classList.contains('modo-os')) { return false; }
      salirModoApp();
      return true;
    }
  };
  shell = new Sistema.Shell(sfs, entorno);
  if (Array.isArray(guardado.historia)) { shell.historia = guardado.historia.slice(-100); }
  Sistema.montarMosca(sfs, shell, entorno);
  terminal = new Terminal($('#terminal'), shell, pantalla);
  terminal.alCorrer = (l) => {
    if (/^\s*neofetch/.test(l)) { hechas.add('neofetch'); }
    if (/^\s*ls\s+.*bandeja/.test(l) && hechas.has('neofetch')) { completar('terminal'); }
    guardar();
  };

  // Las tareas de «cada» (como cron): corren mientras Mosca OS esté abierto, aunque la pestaña quede atrás.
  let corriendoCada = false;
  setInterval(() => {
    if (corriendoCada || !shell.tareas.length) { return; }
    corriendoCada = true;
    shell.tick().then((corridas) => {
      for (const c of corridas) { terminal.escribir('⏱ ' + c.linea, c.r.code === 0 ? 'tenue' : 'error'); }
    }).catch(() => {}).then(() => { corriendoCada = false; });
  }, 1000);

  // ---------------------------------------------------------------------------------------------- modo app
  function entrarModoApp(completa) {
    document.body.classList.add('modo-os');
    mudarA('pantalla');
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (completa && !standalone && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    setTimeout(ajustarPantalla, 60);
  }
  function salirModoApp() {
    document.body.classList.remove('modo-os');
    if (document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen().catch(() => {}); }
    setTimeout(() => { ajustarPantalla(); $('#oficina').scrollIntoView(); }, 60);
  }
  $('#modo-app').addEventListener('click', () => entrarModoApp(true));
  $('#salir-os').addEventListener('click', salirModoApp);

  let pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pedidoInstalar = e;
    $('#instalar').hidden = false;
  });
  $('#instalar').addEventListener('click', () => {
    if (!pedidoInstalar) { return; }
    pedidoInstalar.prompt();
    pedidoInstalar.userChoice.then(() => { pedidoInstalar = null; $('#instalar').hidden = true; }, () => {});
  });

  // ================================================================================================ arranque
  for (const n of $$('.n-neuronas')) { n.textContent = String(Cerebro.TOTAL_NEURONAS); }
  // Lo que quedó pendiente cuando se cerró la página vuelve a su pantalla (el trabajo no se pierde).
  const turnoGuardado = turnoAuto;
  turnoAuto = false;
  for (const t of (guardado.pendientes || [])) { pantalla.trabajoNuevo(Object.assign({}, t, { reentrega: true })); }
  turnoAuto = turnoGuardado;
  pintarLugar();
  pintarEstado();
  pintarAprendido();
  pintarMisiones();
  pintarRegistro();
  pintarApi();
  pintarApps();
  for (const id of ['salidaNtfy', 'discord', 'webhook', 'navegador']) { estadoSalida(id); }
  conexiones.escuchar();
  conexiones.fuentes();
  leerHash();
  const instalada = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  if (new URLSearchParams(location.search).has('app') || instalada) { entrarModoApp(false); }
  if (!guardado.cerebro) { setTimeout(() => aviso('👇 Elige una herramienta abajo y toca la arena', 4000), 800); }
  if ('serviceWorker' in navigator && /^https:|^http:\/\/(localhost|127\.)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
