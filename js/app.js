/**
 * Mosca Obrera: la página. Une el cerebro, la arena, las vistas y las conexiones; guarda la memoria en este
 * dispositivo; lleva las misiones y la bandeja de cartas.
 */
(function () {
  'use strict';

  const Cerebro = window.MoscaCerebro;
  const Mundo = window.MoscaMundo;
  const Conexiones = window.MoscaConexiones;
  const { VistaArena, VistaCerebro, EMOJI_ACCION, TEXTO_ACCION, colorOlor } = window.MoscaVista;
  const { normalizarOlor, OLORES, COMPARTIMENTOS } = Cerebro;
  const CLAVE = 'mosca-obrera:v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

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

  const guardado = leer();
  const cerebro = guardado && guardado.cerebro ? Cerebro.desde(guardado.cerebro) : new Cerebro();
  const nombrePorDefecto = 'Mosca #' + String(cerebro.semilla % 10000).padStart(4, '0');
  let nombre = (guardado && guardado.nombre) || nombrePorDefecto;
  const config = mezclar(Conexiones.configInicial(), guardado && guardado.config);
  const bandeja = Array.isArray(guardado && guardado.bandeja) ? guardado.bandeja : [];
  const marcador = Object.assign({ ok: 0, total: 0, racha: 0 }, guardado && guardado.marcador);
  const hechas = new Set((guardado && guardado.misiones) || []);
  const mundo = new Mundo(cerebro, { W: 1000, H: 700, modoReloj: (guardado && guardado.modoReloj) || 'acelerado',
    horaInicio: guardado && typeof guardado.hora === 'number' ? guardado.hora : 0.35 });
  if (guardado && guardado.stats) { Object.assign(mundo.stats, guardado.stats); }

  function guardar() {
    escribir({ v: 1, nombre, cerebro: cerebro.exportar(), config, bandeja: bandeja.slice(0, 40), marcador,
      misiones: Array.from(hechas), stats: mundo.stats, modoReloj: mundo.modoReloj,
      hora: mundo.modoReloj === 'acelerado' ? mundo.hora() : null });
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
  // Con la pestaña en segundo plano no hay cuadros: la mosca sigue trabajando a saltos de un segundo.
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

  /** Los olores que vale la pena mostrar: los del laboratorio, los de las cartas recientes y los que hay en la arena. */
  function oloresAMostrar() {
    const lista = ['fruta', 'menta', 'canela', 'humo'];
    for (const o of mundo.objetos) { if (o.olor && lista.indexOf(o.olor) < 0) { lista.push(o.olor); } }
    for (const c of bandeja) {
      if (lista.length >= 12) { break; }
      if (lista.indexOf(c.olor) < 0) { lista.push(c.olor); }
    }
    return lista;
  }

  function pintarAprendido() {
    const ul = $('#aprendido');
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
    ul.replaceChildren(...filas);
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
      aviso('🧹 Arena limpia (las cartas pendientes se quedan).');
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

  for (const b of $$('[data-vel]')) {
    b.addEventListener('click', () => {
      velocidad = Number(b.dataset.vel);
      for (const o of $$('[data-vel]')) { o.setAttribute('aria-pressed', String(o === b)); }
    });
  }

  const selReloj = $('#modo-reloj');
  selReloj.value = mundo.modoReloj;
  selReloj.addEventListener('change', () => {
    const h = mundo.hora();
    if (selReloj.value === 'acelerado') { mundo.horaInicio = (h == null ? 0.35 : h) - mundo.t / mundo.diaSeg; }
    mundo.modoReloj = selReloj.value;
    guardar();
  });

  // ================================================================================================ eventos del mundo
  mundo.on((ev) => {
    switch (ev.tipo) {
      case 'aprende':
        if (ev.origen === 'condicionar') { break; }
        if (ev.signo > 0) {
          aviso(ev.olor ? '🍬 Asoció el premio con ' + nombreOlor(ev.olor) : '🍬 Rico, pero no olía nada: no asoció nada con el premio.');
        } else {
          aviso(ev.olor ? '⚡ Asoció la descarga con ' + nombreOlor(ev.olor) : '⚡ ¡Auch! No olía nada, así que no asoció nada.');
        }
        if (ev.olor) {
          conexiones.avisar({ regla: 'aprende', olor: ev.olor, titulo: (ev.signo > 0 ? '🍬 ' : '⚡ ') + nombre + ' aprendió algo',
            texto: (ev.signo > 0 ? 'Ahora le gusta más ' : 'Ahora evita más ') + nombreOlor(ev.olor) });
        }
        break;
      case 'carta-llega': entradaCarta(ev.carta, 'arena'); break;
      case 'carta-cola': entradaCarta(ev.carta, 'cola'); break;
      case 'carta': resolverCarta(ev); break;
      case 'accion':
        if (ev.accion === 'huir') {
          conexiones.avisar({ regla: 'huida', titulo: '💨 ' + nombre + ' se asustó', texto: 'Algo la hizo huir.' });
        }
        break;
      case 'se-acabo': aviso('🍌 Se acabó la fruta.'); break;
      case 'llego':
        if (ev.olor === 'menta' && ev.eleccion && cerebro.valencia('menta').total > cerebro.valencia('canela').total + 0.1) {
          completar('laberinto');
        }
        break;
      default:
    }
  });

  function nombreOlor(olor) { return OLORES[olor] ? OLORES[olor].nombre : '#' + olor; }

  // ================================================================================================ cartas y bandeja
  function aplicar(r, origen) {
    if (!r) { return; }
    if (r.tipo === 'carta') {
      mundo.cartaNueva({ texto: r.texto, olor: r.olor, fuente: r.fuente || origen, meta: r.meta || null });
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
    if (origen && origen !== 'herramienta') { aviso('📨 Desde ' + origen + ': ' + e); }
  }

  function entradaCarta(carta, estado) {
    let e = bandeja.find((x) => x.id === carta.id);
    if (!e) {
      e = { id: carta.id, texto: carta.texto, olor: carta.olor, fuente: carta.fuente, t: Date.now(), estado, fb: null, acierto: null };
      bandeja.unshift(e);
      if (bandeja.length > 60) { bandeja.length = 60; }
      if (carta.fuente !== 'prueba') { aviso('📨 Llegó una carta #' + carta.olor + ' (' + carta.fuente + ')'); }
    }
    e.estado = estado;
    pintarBandeja();
  }

  function resolverCarta(ev) {
    const c = ev.carta;
    const e = bandeja.find((x) => x.id === c.id);
    if (e) {
      e.estado = ev.resultado;
      e.motivo = ev.motivo;
      e.valencia = Math.round(ev.valencia * 100) / 100;
    }
    pintarBandeja();
    guardar();
    const datos = { valencia: Math.round(ev.valencia * 100) / 100, carta: { texto: c.texto, olor: c.olor, fuente: c.fuente, meta: c.meta } };
    if (ev.resultado === 'aceptada') {
      conexiones.avisar({ regla: 'aceptada', olor: c.olor, titulo: '🪰 ' + nombre + ' recogió una carta #' + c.olor, texto: c.texto, datos });
    } else {
      conexiones.avisar({ regla: 'descartada', olor: c.olor, titulo: '🗑️ ' + nombre + ' dejó una carta #' + c.olor, texto: c.texto + ' (' + ev.motivo + ')', datos });
    }
  }

  const ESTADOS = { arena: '⏳ oliéndola', cola: '🕓 en espera', aceptada: '✅ la recogió', descartada: '🗑️ la dejó', perdida: '💤 se perdió' };

  function pintarBandeja() {
    const ul = $('#bandeja');
    const filas = [];
    for (const e of bandeja.slice(0, 40)) {
      const li = document.createElement('li');
      li.className = 'carta ' + e.estado;
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
      const res = document.createElement('span');
      res.className = 'res';
      res.textContent = ESTADOS[e.estado] || e.estado;
      if (e.motivo) { res.title = e.motivo; }
      const t = document.createElement('time');
      const d = new Date(e.t);
      t.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      cab.append(olor, fuente, res, t);
      const p = document.createElement('p');
      p.className = 'texto';
      p.textContent = e.texto;
      const fb = document.createElement('div');
      fb.className = 'fb';
      if (e.fb == null) {
        const si = document.createElement('button');
        si.className = 'chico';
        si.dataset.fb = '1';
        si.textContent = '👍 me interesa';
        const no = document.createElement('button');
        no.className = 'chico';
        no.dataset.fb = '-1';
        no.textContent = '👎 no me interesa';
        fb.append(si, no);
      } else {
        const v = document.createElement('span');
        v.className = 'veredicto';
        v.textContent = (e.fb > 0 ? '👍 te interesa' : '👎 no te interesa') +
          (e.acierto === true ? ' · ✅ acertó' : (e.acierto === false ? ' · ❌ se equivocó (ya aprendió)' : ''));
        fb.append(v);
      }
      li.append(cab, p, fb);
      filas.push(li);
    }
    ul.replaceChildren(...filas);
    $('#bandeja-vacia').hidden = bandeja.length > 0;
    $('#b-recibidas').textContent = String(mundo.stats.cartas);
    $('#b-aceptadas').textContent = String(mundo.stats.aceptadas);
    $('#b-aciertos').textContent = marcador.total ? marcador.ok + '/' + marcador.total : '–';
    $('#b-racha').textContent = String(marcador.racha);
  }

  $('#bandeja').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-fb]');
    if (!b) { return; }
    const id = b.closest('li').dataset.id;
    const e = bandeja.find((x) => x.id === id);
    if (!e || e.fb != null) { return; }
    const signo = Number(b.dataset.fb);
    e.fb = signo;
    cerebro.condicionar(e.olor, signo, 1.5);
    if (e.estado === 'aceptada' || e.estado === 'descartada') {
      e.acierto = (e.estado === 'aceptada') === (signo > 0);
      marcador.total += 1;
      if (e.acierto) { marcador.ok += 1; marcador.racha += 1; } else { marcador.racha = 0; }
    }
    aviso(signo > 0 ? '👍 Aprendió que #' + e.olor + ' te interesa' : '👎 Aprendió que #' + e.olor + ' no te interesa');
    pintarBandeja();
    guardar();
  });

  $('#form-prueba').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const texto = $('#texto-prueba').value.trim();
    if (!texto) { return; }
    const r = Conexiones.interpretarMensaje({ texto, fuente: 'prueba' });
    aplicar(r, 'prueba');
    if (r && r.tipo === 'carta') { document.getElementById('arena').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  // ================================================================================================ misiones
  const MISIONES = [
    { id: 'comer', titulo: 'Primer bocado', pista: 'Pon una 🍌 fruta en la arena y espera a que la encuentre.', ok: () => mundo.stats.comidas >= 1 },
    { id: 'susto', titulo: 'Reflejo de escape', pista: 'Elige 🖐️ Mano y toca cerca de la mosca: mira cómo salta.', ok: () => mundo.stats.huidas >= 1 },
    { id: 'pavlov', titulo: 'Pavlov para moscas', pista: 'Pon 🌿 Olor A pegado a ella y dale 🍬 Premio tres veces mientras lo huele.', ok: () => cerebro.valencia('menta').total >= 0.25 },
    { id: 'aversion', titulo: 'Mala experiencia', pista: 'Pon 🍂 Olor B pegado a ella y dale ⚡ Castigo un par de veces mientras lo huele.', ok: () => cerebro.valencia('canela').total <= -0.2 },
    { id: 'laberinto', titulo: 'El examen', pista: 'Con la memoria fresca, 🧹 limpia y pon Olor A y Olor B lejos de ella, en lados opuestos. ¿A cuál va?' },
    { id: 'carta', titulo: 'Primer encargo', pista: 'Baja a «Ponla a trabajar» y mándale una carta de prueba.', ok: () => bandeja.some((c) => c.estado === 'aceptada' || c.estado === 'descartada') },
    { id: 'conectada', titulo: 'Conectada', pista: 'Enciende una entrada (ntfy, cripto, clima o GitHub) y que le llegue una carta desde afuera.', ok: () => bandeja.some((c) => ['prueba', 'consola', 'enlace'].indexOf(c.fuente) < 0) },
    { id: 'obrera', titulo: 'Obrera entrenada', pista: 'Dale 👍 o 👎 a sus cartas hasta que acierte cinco seguidas.', ok: () => marcador.racha >= 5 }
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
    const ol = $('#misiones');
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
    ol.replaceChildren(...filas);
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
      guardar();
    });
  }

  function pedirPermiso(inp) {
    if (typeof Notification === 'undefined') {
      config.navegador.activo = false;
      inp.checked = false;
      alEstado('navegador', 'este navegador no tiene notificaciones', 'error');
      return;
    }
    Notification.requestPermission().then((p) => {
      if (p !== 'granted') {
        config.navegador.activo = false;
        inp.checked = false;
        alEstado('navegador', 'no diste permiso', 'error');
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
      conexiones.avisar({ titulo: '🪰 Hola desde ' + nombre, texto: 'Si ves esto, la conexión funciona.', olor: 'prueba' }, id);
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
      '# una carta que huele a #ventas\n' +
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
    const abrir = $('#abrir-salida');
    abrir.href = config.ntfyServidor.replace(/\/+$/, '') + '/' + encodeURIComponent(config.salidaNtfy.tema);
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
    if (q.has('carta')) {
      aplicar({ tipo: 'carta', texto: q.get('carta'), olor: normalizarOlor(q.get('olor') || 'enlace'), fuente: 'enlace' }, 'enlace');
    } else if (q.has('estimulo')) {
      const e = Conexiones.ESTIMULOS[normalizarOlor(q.get('estimulo'))];
      if (e) { aplicar({ tipo: 'estimulo', estimulo: e, fuerza: 1 }, 'enlace'); }
    } else {
      return;
    }
    history.replaceState(null, '', location.pathname + location.search + '#jugar');
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
    estado: () => ({ nombre, accion: cerebro.accion(), interno: Object.assign({}, cerebro.interno), sueno: cerebro.sueno,
      stats: Object.assign({}, mundo.stats), marcador: Object.assign({}, marcador), misiones: Array.from(hechas) }),
    velocidad: (v) => { velocidad = Math.max(0, Math.min(20, Number(v) || 0)); },
    cerebro,
    mundo
  };

  // ================================================================================================ arranque
  for (const n of $$('.n-neuronas')) { n.textContent = String(Cerebro.TOTAL_NEURONAS); }
  // Las cartas que estaban en la arena cuando se cerró la página vuelven a llegar (el trabajo no se pierde).
  const pendientes = bandeja.filter((e) => e.estado === 'arena' || e.estado === 'cola').reverse();
  for (const e of pendientes) { mundo.cartaNueva({ id: e.id, texto: e.texto, olor: e.olor, fuente: e.fuente, reentrega: true }); }
  pintarEstado();
  pintarAprendido();
  pintarMisiones();
  pintarBandeja();
  pintarApi();
  for (const id of ['salidaNtfy', 'discord', 'webhook', 'navegador']) { estadoSalida(id); }
  conexiones.escuchar();
  conexiones.fuentes();
  leerHash();
  if (!guardado) { setTimeout(() => aviso('👇 Elige una herramienta abajo y toca la arena', 4000), 800); }
  if ('serviceWorker' in navigator && /^https:|^http:\/\/(localhost|127\.)/.test(location.href)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
