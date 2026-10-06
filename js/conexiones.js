/**
 * Mosca Obrera: conexiones con el mundo de afuera.
 *
 * Entradas (lo que la mosca «huele»): un canal de ntfy que cualquier app puede usar (curl, n8n, Zapier, IFTTT,
 * Atajos de iPhone…), el mercado cripto (CoinGecko), el clima de tu ciudad (Open-Meteo) y la actividad de un repo
 * de GitHub. Cada mensaje se vuelve un estímulo (fruta, mano, premio…) o una carta con un olor.
 * Salidas (a quién le avisa cuando recoge una carta): ntfy (notificación en el celular), Discord, cualquier webhook
 * y las notificaciones del navegador.
 *
 * Todo corre en el navegador: no hay servidor. Las direcciones y canales quedan guardados solo en este dispositivo.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) { module.exports = fabrica(require('./cerebro.js')); } else { raiz.MoscaConexiones = fabrica(raiz.MoscaCerebro); }
})(typeof self !== 'undefined' ? self : this, function (Cerebro) {
  'use strict';

  const { normalizarOlor } = Cerebro;
  /** Palabras que son estímulos directos (y a qué herramienta corresponden). */
  const ESTIMULOS = {
    fruta: 'fruta', comida: 'fruta', banana: 'fruta', platano: 'fruta',
    menta: 'menta', 'olor-a': 'menta', canela: 'canela', 'olor-b': 'canela',
    humo: 'humo', luz: 'luz', calor: 'calor', fuego: 'calor',
    mano: 'amenaza', amenaza: 'amenaza', susto: 'amenaza',
    viento: 'viento',
    premio: 'premio', azucar: 'premio', recompensa: 'premio',
    castigo: 'castigo', descarga: 'castigo',
    limpiar: 'limpiar'
  };
  const MARCA = 'mosca-obrera';

  function desdeJSON(j, fuente) {
    if (!j || typeof j !== 'object') { return null; }
    const f = typeof j.fuerza === 'number' ? Math.max(0, Math.min(1, j.fuerza)) : 1;
    if (j.estimulo) {
      const e = ESTIMULOS[normalizarOlor(j.estimulo)];
      if (!e) { return null; }
      if ((e === 'premio' || e === 'castigo') && j.olor) { return { tipo: 'feedback', olor: normalizarOlor(j.olor), signo: e === 'premio' ? 1 : -1 }; }
      return { tipo: 'estimulo', estimulo: e, fuerza: f };
    }
    const texto = j.carta || j.texto || j.message || j.mensaje;
    if (texto != null) {
      return { tipo: 'carta', texto: String(texto).slice(0, 500), olor: normalizarOlor(j.olor || j.etiqueta || j.tag || fuente),
        fuente: String(j.fuente || fuente).slice(0, 40), titulo: j.titulo || j.title || null };
    }
    return null;
  }

  /**
   * Convierte un mensaje que llega de afuera en algo que la mosca entiende.
   * msg: { texto, titulo, etiquetas: [], fuente }. Devuelve:
   *  { tipo: 'estimulo', estimulo, fuerza } · { tipo: 'feedback', olor, signo } · { tipo: 'carta', texto, olor, fuente } · null
   *
   *  «fruta», «mano», «premio»          → estímulo directo
   *  «premio ventas», «castigo #spam»   → le enseña un olor (como las 👍/👎)
   *  «#ventas Nuevo pedido 123»         → carta que huele a «ventas»
   *  {"estimulo":"luz"} · {"carta":"…","olor":"ventas"} → lo mismo, en JSON
   *  Sin #: huele a la primera etiqueta, al título o a la fuente.
   */
  function interpretarMensaje(msg) {
    msg = msg || {};
    const fuente = String(msg.fuente || 'app').slice(0, 40);
    const texto = String(msg.texto == null ? '' : msg.texto).trim();
    const etiquetas = (Array.isArray(msg.etiquetas) ? msg.etiquetas : []).filter((t) => t && t !== MARCA);
    if (texto[0] === '{') {
      try {
        const r = desdeJSON(JSON.parse(texto), fuente);
        if (r) { return r; }
      } catch (e) { /* no era JSON: se trata como texto */ }
    }
    const palabras = texto.split(/\s+/).filter(Boolean);
    const primera = ESTIMULOS[normalizarOlor(palabras[0] || '')];
    if (primera && !msg.titulo) {
      if ((primera === 'premio' || primera === 'castigo') && palabras.length === 2) {
        return { tipo: 'feedback', olor: normalizarOlor(palabras[1]), signo: primera === 'premio' ? 1 : -1 };
      }
      if (palabras.length === 1) { return { tipo: 'estimulo', estimulo: primera, fuerza: 1 }; }
      if (palabras.length === 2 && !isNaN(parseFloat(palabras[1]))) {
        return { tipo: 'estimulo', estimulo: primera, fuerza: Math.max(0, Math.min(1, parseFloat(palabras[1]))) };
      }
    }
    if (!texto && !msg.titulo) { return null; }
    const hashtag = texto.match(/(?:^|\s)#([\p{L}\p{N}_.-]+)/u);
    const olor = hashtag ? hashtag[1] : (etiquetas[0] || msg.titulo || fuente);
    return { tipo: 'carta', texto: (texto || msg.titulo).slice(0, 500), olor: normalizarOlor(olor), fuente,
      titulo: msg.titulo || null };
  }

  function temaAlAzar(sufijo) {
    const b = new Uint8Array(8);
    (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.random() * 256; });
    return 'mosca-' + Array.from(b, (x) => (x % 36).toString(36)).join('') + '-' + sufijo;
  }

  function configInicial() {
    return {
      ntfyServidor: 'https://ntfy.sh',
      entrada: { activo: false, tema: temaAlAzar('entrada') },
      salidaNtfy: { activo: false, tema: temaAlAzar('salida') },
      discord: { activo: false, url: '' },
      webhook: { activo: false, url: '' },
      navegador: { activo: false },
      reglas: { aceptada: true, descartada: false, huida: false, aprende: false },
      cripto: { activo: false, monedas: 'bitcoin', umbral: 1 },
      clima: { activo: false, ciudad: '', lat: null, lon: null },
      github: { activo: false, repo: '' }
    };
  }

  const SIMBOLOS = { bitcoin: 'BTC', ethereum: 'ETH', dogecoin: 'DOGE', ripple: 'XRP', solana: 'SOL', cardano: 'ADA',
    tether: 'USDT', litecoin: 'LTC' };
  const esUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || ''));
  const esDiscord = (u) => /^https:\/\/(?:\w+\.)?discord(?:app)?\.com\/api\/webhooks\/\S+$/i.test(String(u || ''));

  class Conexiones {
    /**
     * op.config: la configuración (se modifica en su lugar; quien la creó la guarda).
     * op.alMensaje(instruccion, origen): llega algo de afuera (lo que devuelve interpretarMensaje).
     * op.alClima({ temp, viento, dirViento, lluvia, ciudad }): para que la arena tenga el clima de verdad.
     * op.alEstado(id, texto, nivel): para pintar el estado de cada conexión ('ok' | 'error' | 'info').
     * op.nombre(): el nombre de la mosca (va en los avisos).
     */
    constructor(op) {
      this.cfg = op.config;
      this.alMensaje = op.alMensaje;
      this.alClima = op.alClima || function () {};
      this.alEstado = op.alEstado || function () {};
      this.nombre = op.nombre || (() => 'Mosca Obrera');
      this.es = null;
      this.timers = {};
      this.cripto = {};
      this.lluvia = null;
      this.ghUltimo = null;
      this._ultimoEnvio = {};
    }

    // ---------------------------------------------------------------------------------------------- entrada
    escuchar() {
      if (this.es) { this.es.close(); this.es = null; }
      const c = this.cfg.entrada;
      if (!c.activo || !c.tema) { this.alEstado('entrada', 'apagado', 'info'); return; }
      if (typeof EventSource === 'undefined') { this.alEstado('entrada', 'este navegador no puede escuchar', 'error'); return; }
      const url = this.cfg.ntfyServidor.replace(/\/+$/, '') + '/' + encodeURIComponent(c.tema) + '/sse';
      this.alEstado('entrada', 'conectando…', 'info');
      const es = new EventSource(url);
      this.es = es;
      es.onopen = () => this.alEstado('entrada', 'escuchando', 'ok');
      es.onerror = () => this.alEstado('entrada', 'reconectando…', 'error');
      es.onmessage = (e) => {
        let d;
        try { d = JSON.parse(e.data); } catch (err) { return; }
        if (!d || d.event !== 'message') { return; }
        if (Array.isArray(d.tags) && d.tags.indexOf(MARCA) >= 0) { return; } // lo mandó una mosca: no hacer eco
        const r = interpretarMensaje({ texto: d.message, titulo: d.title, etiquetas: d.tags, fuente: 'ntfy' });
        if (r) { this.alMensaje(r, 'ntfy'); }
      };
    }

    // ---------------------------------------------------------------------------------------------- salidas
    /**
     * Avisa a todas las salidas encendidas. ev: { regla, titulo, texto, olor, datos }.
     * Devuelve [{ salida, ok, detalle }].
     */
    async avisar(ev, soloPrueba) {
      if (!soloPrueba && ev.regla && !this.cfg.reglas[ev.regla]) { return []; }
      if (!soloPrueba && ev.regla === 'huida') {
        const ahora = Date.now();
        if (ahora - (this._ultimoEnvio.huida || 0) < 60000) { return []; }
        this._ultimoEnvio.huida = ahora;
      }
      const tareas = [];
      const c = this.cfg;
      if (c.salidaNtfy.activo && (!soloPrueba || soloPrueba === 'salidaNtfy')) { tareas.push(['salidaNtfy', this._ntfy(ev)]); }
      if (c.discord.activo && (!soloPrueba || soloPrueba === 'discord')) { tareas.push(['discord', this._discord(ev)]); }
      if (c.webhook.activo && (!soloPrueba || soloPrueba === 'webhook')) { tareas.push(['webhook', this._webhook(ev)]); }
      if (c.navegador.activo && (!soloPrueba || soloPrueba === 'navegador')) { tareas.push(['navegador', this._navegador(ev)]); }
      const res = [];
      for (const [salida, p] of tareas) {
        try {
          const detalle = await p;
          res.push({ salida, ok: true, detalle });
          this.alEstado(salida, detalle || 'enviado ' + hora(), 'ok');
        } catch (e) {
          res.push({ salida, ok: false, detalle: e.message });
          this.alEstado(salida, 'falló: ' + e.message, 'error');
        }
      }
      return res;
    }

    async _ntfy(ev) {
      const tags = [MARCA, 'fly'];
      if (ev.olor) { tags.push(ev.olor); }
      const cuerpo = { topic: this.cfg.salidaNtfy.tema, title: ev.titulo, message: ev.texto || ' ', tags, priority: 3 };
      if (typeof location !== 'undefined' && /^https:/.test(location.href)) { cuerpo.click = location.origin + location.pathname; }
      const r = await fetch(this.cfg.ntfyServidor.replace(/\/+$/, '') + '/', { method: 'POST', body: JSON.stringify(cuerpo) });
      if (!r.ok) { throw new Error('ntfy respondió ' + r.status); }
      return 'enviado ' + hora();
    }

    async _discord(ev) {
      const url = this.cfg.discord.url;
      if (!esDiscord(url)) { throw new Error('la dirección no es un webhook de Discord'); }
      const contenido = { username: this.nombre(), content: ('**' + ev.titulo + '**\n' + (ev.texto || '')).slice(0, 1900) };
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify(contenido));
      try {
        const r = await fetch(url, { method: 'POST', body: fd });
        if (!r.ok) { throw new Error('Discord respondió ' + r.status); }
        return 'enviado ' + hora();
      } catch (e) {
        if (!(e instanceof TypeError)) { throw e; }
        await fetch(url, { method: 'POST', body: fd, mode: 'no-cors' });
        return 'enviado ' + hora() + ' (sin confirmación)';
      }
    }

    async _webhook(ev) {
      const url = this.cfg.webhook.url;
      if (!esUrl(url)) { throw new Error('falta una dirección http(s)'); }
      const cuerpo = JSON.stringify(Object.assign({ fuente: MARCA, mosca: this.nombre(), titulo: ev.titulo, texto: ev.texto,
        olor: ev.olor || null, evento: ev.regla || 'prueba', hora: new Date().toISOString() }, ev.datos || {}));
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo });
        if (!r.ok) { throw new Error('el webhook respondió ' + r.status); }
        return 'enviado ' + hora();
      } catch (e) {
        if (!(e instanceof TypeError)) { throw e; }
        // El servidor no permite CORS: se manda igual, como texto, y no se puede leer la respuesta.
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: cuerpo, mode: 'no-cors' });
        return 'enviado ' + hora() + ' (sin confirmación)';
      }
    }

    async _navegador(ev) {
      if (typeof Notification === 'undefined') { throw new Error('este navegador no tiene notificaciones'); }
      if (Notification.permission !== 'granted') { throw new Error('falta el permiso de notificaciones'); }
      const op = { body: ev.texto || '', tag: 'mosca-' + (ev.olor || 'aviso'), icon: 'icono.svg' };
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) { await reg.showNotification(ev.titulo, op); } else { new Notification(ev.titulo, op); }
      return 'mostrada ' + hora();
    }

    // ---------------------------------------------------------------------------------------------- fuentes
    /** Enciende o apaga los sondeos de cripto, clima y GitHub según la configuración. */
    fuentes() {
      for (const k of Object.keys(this.timers)) { clearInterval(this.timers[k]); }
      this.timers = {};
      const prog = (id, fn, ms) => {
        if (!this.cfg[id].activo) { this.alEstado(id, 'apagado', 'info'); return; }
        const correr = () => fn.call(this).catch((e) => this.alEstado(id, 'falló: ' + e.message, 'error'));
        correr();
        this.timers[id] = setInterval(correr, ms);
      };
      prog('cripto', this._cripto, 120000);
      prog('clima', this._clima, 600000);
      prog('github', this._github, 300000);
    }

    async _cripto() {
      const ids = String(this.cfg.cripto.monedas || 'bitcoin').toLowerCase().split(/[\s,]+/).filter((x) => /^[a-z0-9-]+$/.test(x)).slice(0, 5);
      if (!ids.length) { throw new Error('escribe al menos una moneda (ej. bitcoin)'); }
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids.join(',') + '&vs_currencies=usd&include_24hr_change=true');
      if (!r.ok) { throw new Error('CoinGecko respondió ' + r.status); }
      const d = await r.json();
      const umbral = Math.max(0.1, Number(this.cfg.cripto.umbral) || 1);
      const partes = [];
      for (const id of ids) {
        if (!d[id] || typeof d[id].usd !== 'number') { continue; }
        const p = d[id].usd;
        const sim = SIMBOLOS[id] || id.toUpperCase();
        partes.push(sim + ' $' + formatoPrecio(p));
        const base = this.cripto[id];
        if (base == null) { this.cripto[id] = p; continue; }
        const cambio = (p - base) / base * 100;
        if (Math.abs(cambio) >= umbral) {
          this.cripto[id] = p;
          const sube = cambio > 0;
          this.alMensaje({ tipo: 'carta', fuente: 'cripto', olor: normalizarOlor(id + (sube ? '-sube' : '-baja')),
            texto: sim + (sube ? ' subió ' : ' bajó ') + Math.abs(cambio).toFixed(2) + ' % → $' + formatoPrecio(p),
            meta: { moneda: id, precio: p, cambio } }, 'cripto');
        }
      }
      if (!partes.length) { throw new Error('CoinGecko no conoce esas monedas'); }
      this.alEstado('cripto', partes.join(' · ') + ' · ' + hora(), 'ok');
    }

    /** Busca una ciudad (Open-Meteo) y la guarda en la configuración. */
    async buscarCiudad(nombre) {
      const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&format=json&name=' + encodeURIComponent(nombre));
      if (!r.ok) { throw new Error('el buscador respondió ' + r.status); }
      const d = await r.json();
      const c = d.results && d.results[0];
      if (!c) { throw new Error('no encontré «' + nombre + '»'); }
      Object.assign(this.cfg.clima, { ciudad: c.name + (c.country ? ', ' + c.country : ''), lat: c.latitude, lon: c.longitude });
      return this.cfg.clima.ciudad;
    }

    async _clima() {
      const c = this.cfg.clima;
      if (c.lat == null || c.lon == null) { throw new Error('primero elige una ciudad'); }
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.lat + '&longitude=' + c.lon +
        '&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto');
      if (!r.ok) { throw new Error('Open-Meteo respondió ' + r.status); }
      const d = (await r.json()).current;
      if (!d) { throw new Error('sin datos del clima'); }
      const lluvia = d.precipitation > 0 || (d.weather_code >= 51 && d.weather_code <= 99);
      const tormenta = d.weather_code >= 95;
      this.alClima({ temp: d.temperature_2m, viento: d.wind_speed_10m, dirViento: d.wind_direction_10m, lluvia, ciudad: c.ciudad });
      if (this.lluvia === false && lluvia) {
        this.alMensaje({ tipo: 'carta', fuente: 'clima', olor: tormenta ? 'tormenta' : 'lluvia',
          texto: (tormenta ? 'Hay tormenta en ' : 'Empezó a llover en ') + c.ciudad + ' (' + d.temperature_2m + ' °C)' }, 'clima');
      }
      this.lluvia = lluvia;
      this.alEstado('clima', c.ciudad + ': ' + d.temperature_2m + ' °C, viento ' + d.wind_speed_10m + ' km/h' + (lluvia ? ', lloviendo' : '') + ' · ' + hora(), 'ok');
    }

    async _github() {
      const repo = String(this.cfg.github.repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '');
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { throw new Error('escribe el repo como usuario/nombre'); }
      const r = await fetch('https://api.github.com/repos/' + repo + '/events?per_page=15', { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) { throw new Error('GitHub respondió ' + r.status); }
      const evs = await r.json();
      const nuevos = [];
      let mayor = this.ghUltimo;
      for (const e of evs) {
        const id = BigInt(e.id);
        if (mayor == null || id > mayor) { mayor = id; }
        if (this.ghUltimo != null && id > this.ghUltimo) { nuevos.push(e); }
      }
      this.ghUltimo = mayor;
      for (const e of nuevos.reverse().slice(-5)) {
        const t = describirGitHub(e, repo);
        this.alMensaje({ tipo: 'carta', fuente: 'github', olor: t.olor, texto: t.texto }, 'github');
      }
      this.alEstado('github', repo + ': ' + (nuevos.length ? nuevos.length + ' novedades' : 'sin novedades') + ' · ' + hora(), 'ok');
    }

    parar() {
      if (this.es) { this.es.close(); this.es = null; }
      for (const k of Object.keys(this.timers)) { clearInterval(this.timers[k]); }
      this.timers = {};
    }
  }

  function describirGitHub(e, repo) {
    const quien = (e.actor && (e.actor.display_login || e.actor.login)) || 'alguien';
    const p = e.payload || {};
    switch (e.type) {
      case 'PushEvent': return { olor: 'github-push', texto: quien + ' subió ' + (p.size || (p.commits || []).length || 1) + ' commit(s) a ' + repo };
      case 'WatchEvent': return { olor: 'github-estrella', texto: quien + ' le dio ⭐ a ' + repo };
      case 'ForkEvent': return { olor: 'github-fork', texto: quien + ' hizo un fork de ' + repo };
      case 'IssuesEvent': return { olor: 'github-issue', texto: quien + ' ' + (p.action || '') + ' el issue «' + ((p.issue && p.issue.title) || '') + '»' };
      case 'IssueCommentEvent': return { olor: 'github-comentario', texto: quien + ' comentó en «' + ((p.issue && p.issue.title) || '') + '»' };
      case 'PullRequestEvent': return { olor: 'github-pr', texto: quien + ' ' + (p.action || '') + ' el PR «' + ((p.pull_request && p.pull_request.title) || '') + '»' };
      case 'ReleaseEvent': return { olor: 'github-release', texto: quien + ' publicó ' + ((p.release && (p.release.name || p.release.tag_name)) || 'una versión') };
      default: return { olor: 'github-otro', texto: quien + ': ' + e.type.replace(/Event$/, '') + ' en ' + repo };
    }
  }

  function hora() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatoPrecio(p) {
    return p >= 100 ? Math.round(p).toLocaleString('es-MX') : p >= 1 ? p.toFixed(2) : p.toPrecision(3);
  }

  Conexiones.interpretarMensaje = interpretarMensaje;
  Conexiones.configInicial = configInicial;
  Conexiones.temaAlAzar = temaAlAzar;
  Conexiones.ESTIMULOS = ESTIMULOS;
  Conexiones.MARCA = MARCA;
  Conexiones.esDiscord = esDiscord;
  Conexiones.esUrl = esUrl;
  return Conexiones;
});
