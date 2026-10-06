/**
 * Mosca Obrera: la pantalla de trabajo («Mosca OS»).
 *
 * Otro mundo hecho con la misma física que la arena: una pantalla con trabajos arriba (lo que mandan tus apps) y apps
 * abajo (📱 💬 🔗 🔔 🗂️ 🗑️). La mosca camina sobre ella y toca con la trompa: agarra un trabajo que le interesa, lo
 * lleva a la app que cree que corresponde y la toca. Qué le interesa y adónde va cada cosa lo aprende con dopamina,
 * como la comida: el cuerpo fungiforme valora la mezcla «lo que llevo + adónde voy».
 *
 * Si nadie le enseñó nada, lo archiva (no le escribe a nadie por su cuenta). Tú le enseñas corrigiéndola o haciéndolo
 * tú: tocas un trabajo y luego una app, y ella aprende mirándote.
 *
 * El toque es de verdad: en el navegador cada toque de la mosca es un clic sobre el mismo botón que tocas tú
 * (op.tocar). En Node, sin pantalla, se resuelve por geometría.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) {
    module.exports = fabrica(require('./cerebro.js'), require('./mundo.js'));
  } else {
    raiz.MoscaPantalla = fabrica(raiz.MoscaCerebro, raiz.MoscaMundo);
  }
})(typeof self !== 'undefined' ? self : this, function (Cerebro, Mundo) {
  'use strict';

  const { normalizarOlor } = Cerebro;
  const APPS = [
    { id: 'celular', emoji: '📱', nombre: 'Celular' },
    { id: 'discord', emoji: '💬', nombre: 'Discord' },
    { id: 'webhook', emoji: '🔗', nombre: 'Webhook' },
    { id: 'avisos', emoji: '🔔', nombre: 'Avisos' },
    { id: 'archivo', emoji: '🗂️', nombre: 'Archivo' },
    { id: 'papelera', emoji: '🗑️', nombre: 'Papelera' }
  ];
  /** Sin aprender nada, guarda las cosas en el archivo. */
  const APP_BASE = { 'app-archivo': 0.15 };
  /** Segundos que un trabajo espera en la pantalla antes de irse solo a la papelera. */
  const VIDA_TRABAJO = 120;
  /** Segundos cargando algo sin decidirse: lo archiva. */
  const MAX_CARGA = 60;

  class Pantalla extends Mundo {
    /** op: lo de Mundo, más tocar(x, y, id): el toque de la mosca (en el navegador, un clic de verdad en ese punto). */
    constructor(cerebro, op) {
      op = op || {};
      super(cerebro, Object.assign({ W: 600, H: 760 }, op));
      this.tocarFn = op.tocar || null;
      this.cola = [];
      this.carga = null;
      this.elegido = null;
      this.tCarga = 0;
      this.tSinCarga = 10;
      this.objetivo = null;
      this.refractario = 0;
      Object.assign(this.stats, { recibidos: 0, hechos: 0, porMosca: 0, porTi: 0, ignorados: 0 });
      this.apps = APPS.map((a) => ({ id: 'app-' + a.id, app: a.id, tipo: 'app', olor: 'app-' + a.id, alcance: 170,
        fuerzaOlor: 1.2, vida: Infinity, vida0: Infinity, edad: 10, x: 0, y: 0, w: 0, h: 0 }));
      this.objetos = this.apps.slice();
      this.slots = [];
      this._disponer();
      this.mosca.x = this.W / 2;
      this.mosca.y = this.H * 0.5;
      this._valorar = (olor) => this.valorar(olor);
    }

    // ------------------------------------------------------------------------------------------------ lugar
    /** La mosca llega a la pantalla: desde ahora valora las cosas como trabajadora. */
    entrar() {
      super.entrar();
      this.cerebro.valuador = this._valorar;
      this.cerebro.contexto = this.carga ? this.carga.trabajo.olor : null;
    }

    /** Se va (al laboratorio): lo que cargaba vuelve a la bandeja. */
    salir() {
      if (this.carga) { this._devolver(this.carga); }
      if (this.cerebro.valuador === this._valorar) { this.cerebro.valuador = null; }
      this.cerebro.contexto = null;
      super.salir();
    }

    /**
     * Cómo valora cada olor en la pantalla. Con un trabajo en las patas: las apps según lo aprendido sobre «esto va
     * ahí», con contraste (las salidas se inhiben entre sí: la mejor apaga a las demás y así se decide por una, en vez
     * de quedarse entre dos). Los demás trabajos no le importan. Sin nada en las patas: las apps no le dicen nada y los
     * trabajos, lo de siempre (innato + aprendido).
     */
    valorar(olor) {
      const c = this.cerebro;
      const esApp = olor.slice(0, 4) === 'app-';
      if (!c.contexto) { return esApp ? -0.02 : null; }
      if (!esApp) { return -0.05; }
      if (this._vClave !== c.contexto + '@' + c.ticks) {
        this._vClave = c.contexto + '@' + c.ticks;
        this._vApps = {};
        this._vMax = 0;
        for (const a of this.apps) {
          const v = this.valorRuta(c.contexto, a.app);
          this._vApps[a.olor] = v;
          if (v > this._vMax) { this._vMax = v; }
        }
      }
      return Math.max(0, this._vApps[olor] - 0.7 * this._vMax) * 2.5;
    }

    /** Valor de llevar un trabajo con olor x a una app (lo que la mosca cree ahora). */
    valorRuta(x, app) {
      const o = 'app-' + app;
      return (APP_BASE[o] || 0) + this.cerebro.valenciaMezcla(normalizarOlor(x), o);
    }

    /** Adónde llevaría hoy un trabajo con olor x: la app que más valora. */
    destinoPara(x) {
      let mejor = 'archivo';
      let v = -Infinity;
      for (const a of APPS) { const r = this.valorRuta(x, a.id); if (r > v) { v = r; mejor = a.id; } }
      return mejor;
    }

    // ------------------------------------------------------------------------------------------------ distribución
    redimensionar(W, H) {
      super.redimensionar(W, H);
      this._disponer();
    }

    /** Apps en dos filas abajo; lugares para trabajos en dos filas arriba (2 o 3 columnas según el ancho). */
    _disponer() {
      const W = this.W;
      const H = this.H;
      const aw = Math.min(150, W / 3 * 0.72);
      const ah = Math.min(112, H * 0.14);
      this.apps.forEach((a, i) => {
        a.x = W * ((i % 3) * 2 + 1) / 6;
        a.y = H * (i < 3 ? 0.735 : 0.885);
        a.w = aw;
        a.h = ah;
      });
      const cols = W >= 820 ? 3 : 2;
      const cw = W / cols * 0.88;
      const ch = Math.min(100, H * 0.12);
      this.slots = [];
      for (let f = 0; f < 2; f += 1) {
        for (let c = 0; c < cols; c += 1) { this.slots.push({ x: W * (c * 2 + 1) / (cols * 2), y: H * (0.17 + f * 0.155), w: cw, h: ch }); }
      }
      // Si ahora caben menos (la pantalla se achicó), los que sobran vuelven a la fila.
      for (const o of this.objetos.slice()) {
        if (o.tipo !== 'carta' || o === this.carga) { continue; }
        const s = this.slots[o.slot];
        if (!s) { this.quitar(o); this.cola.unshift(o.trabajo); continue; }
        Object.assign(o, { x: s.x, y: s.y, w: s.w, h: s.h });
      }
      this._rellenar();
    }

    _slotLibre() {
      const usados = new Set();
      for (const o of this.objetos) { if (o.tipo === 'carta' && o !== this.carga) { usados.add(o.slot); } }
      for (let i = 0; i < this.slots.length; i += 1) { if (!usados.has(i)) { return i; } }
      return -1;
    }

    _rellenar() {
      let s = this._slotLibre();
      while (this.cola.length && s >= 0) {
        this._poner(this.cola.shift(), s);
        s = this._slotLibre();
      }
    }

    // ------------------------------------------------------------------------------------------------ trabajos
    /**
     * Llega un trabajo (una carta de otra app). c: { texto, olor, fuente, meta, id?, reentrega? }
     * (reentrega: vuelve a ponerlo tras recargar la página, sin contarlo otra vez).
     */
    trabajoNuevo(c) {
      const t = { texto: String(c.texto || '').slice(0, 500), olor: normalizarOlor(c.olor || c.fuente || 'trabajo'),
        fuente: String(c.fuente || 'prueba').slice(0, 40), meta: c.meta || null, recibido: c.recibido || Date.now(),
        id: c.id || 't' + Date.now().toString(36) + Math.floor(this.azar() * 1e6).toString(36) };
      if (!c.reentrega) { this.stats.recibidos += 1; }
      const s = this._slotLibre();
      if (s < 0) {
        this.cola.push(t);
        this._emitir({ tipo: 'trabajo-cola', trabajo: t, enCola: this.cola.length });
      } else {
        this._poner(t, s);
      }
      return t;
    }

    _poner(t, slot) {
      const s = this.slots[slot];
      this.objetos.push({ id: t.id, tipo: 'carta', trabajo: t, olor: t.olor, slot, x: s.x, y: s.y, w: s.w, h: s.h,
        alcance: 150, fuerzaOlor: 1.3, edad: 0, vida: VIDA_TRABAJO, vida0: VIDA_TRABAJO, olida: 0 });
      this.cerebro.despertar(0.6);
      this._emitir({ tipo: 'trabajo-llega', trabajo: t });
    }

    /** Todo lo que falta hacer, en orden (para guardarlo). */
    pendientes() {
      const enPantalla = this.objetos.filter((o) => o.tipo === 'carta').sort((a, b) => a.trabajo.recibido - b.trabajo.recibido);
      return enPantalla.map((o) => o.trabajo).concat(this.cola);
    }

    /**
     * Un toque sobre un trabajo o una app (de la mosca o tuyo). Tú: tocas un trabajo para elegirlo y luego una app
     * para llevarlo ahí; la mosca aprende mirándote.
     */
    activar(id, quien) {
      const o = this.objetos.find((x) => x.id === id);
      if (!o) { return false; }
      if (o.tipo === 'carta') {
        if (quien === 'mosca') {
          if (!this.carga) { this._agarrar(o); }
          return true;
        }
        this.elegido = this.elegido === o ? null : o;
        this._emitir({ tipo: 'elegido', trabajo: this.elegido ? this.elegido.trabajo : null });
        return true;
      }
      if (quien === 'mosca') {
        if (this.carga) { this._entregar(o, 'mosca', this.carga); }
        return true;
      }
      const c = this.elegido || this.carga;
      if (!c) { this._emitir({ tipo: 'sin-eleccion', app: o.app }); return false; }
      this._entregar(o, 'tu', c);
      return true;
    }

    /**
     * Lleva un trabajo (en la pantalla, en sus patas o esperando en la fila) a una app, como si lo hicieras tú: lo
     * usa la terminal (mv ~/bandeja/… /apps/x, rm ~/bandeja/…). Devuelve false si no existe.
     */
    llevar(id, app, quien) {
      const a = this.apps.find((x) => x.app === app);
      if (!a) { return false; }
      let o = this.objetos.find((x) => x.tipo === 'carta' && x.trabajo.id === id);
      if (!o) {
        const i = this.cola.findIndex((t) => t.id === id);
        if (i < 0) { return false; }
        o = { trabajo: this.cola.splice(i, 1)[0], x: a.x, y: a.y };
      }
      this._entregar(a, quien || 'tu', o);
      return true;
    }

    _agarrar(o) {
      this.carga = o;
      o.slot = -1;
      o.olor = null;
      this.tCarga = 0;
      this.cerebro.contexto = o.trabajo.olor;
      this._emitir({ tipo: 'agarra', trabajo: o.trabajo, x: o.x, y: o.y });
      this._rellenar();
    }

    _devolver(o) {
      this.carga = null;
      this.cerebro.contexto = null;
      this.quitar(o);
      this.cola.unshift(o.trabajo);
      this._rellenar();
    }

    _entregar(app, quien, o, motivo) {
      const t = o.trabajo;
      const valencia = this.valorRuta(t.olor, app.app);
      this.quitar(o);
      if (o === this.carga) {
        this.carga = null;
        this.cerebro.contexto = null;
        this.tSinCarga = 0;
      }
      if (this.elegido === o) { this.elegido = null; }
      if (quien === 'tu') {
        // Aprende mirándote: «esto va ahí» (y si no es la papelera, que vale la pena agarrarlo).
        this.cerebro.condicionarMezcla(t.olor, app.olor, 1, 1.5);
        if (app.app !== 'papelera') { this.cerebro.condicionar(t.olor, 1, 0.6); }
        this.stats.porTi += 1;
      } else {
        this.stats.porMosca += 1;
      }
      this.stats.hechos += 1;
      this._emitir({ tipo: 'trabajo', resultado: 'entregado', trabajo: t, app: app.app, quien, valencia,
        motivo: motivo || (quien === 'tu' ? 'lo hiciste tú' : 'lo llevó ella'), x: app.x, y: app.y });
      this._rellenar();
    }

    _ignorar(o, motivo) {
      this.quitar(o);
      if (this.elegido === o) { this.elegido = null; }
      this.stats.ignorados += 1;
      const v = this.cerebro.valOlor.get(o.trabajo.olor);
      this._emitir({ tipo: 'trabajo', resultado: 'ignorado', trabajo: o.trabajo, app: 'papelera', quien: 'mosca',
        valencia: v == null ? 0 : v, motivo, x: o.x, y: o.y });
      this._rellenar();
    }

    // ------------------------------------------------------------------------------------------------ tiempo
    _objetosPaso(dt) {
      const m = this.mosca;
      this.refractario = Math.max(0, this.refractario - dt);
      if (!this.carga) { this.tSinCarga += dt; }
      for (const o of this.objetos.slice()) {
        if (o.tipo !== 'carta') { continue; }
        o.edad += dt;
        if (o === this.carga) {
          o.x = m.x + Math.cos(m.ang) * 16;
          o.y = m.y + Math.sin(m.ang) * 16;
          this.tCarga += dt;
          if (this.tCarga > MAX_CARGA) { this._entregar(this.apps[4], 'mosca', o, 'no supo adónde llevarlo y lo archivó'); }
          continue;
        }
        o.vida -= dt;
        if (o.vida <= 0) { this._ignorar(o, 'nadie lo tomó a tiempo'); continue; }
        if (this.carga || this.tSinCarga < 0.6) { continue; }
        const c = this._sen.olores.get(o.olor);
        if (c && c[0] > 0.05) { o.olida += dt; }
        const v = this.cerebro.valOlor.get(o.olor);
        if (o.olida > 5 && v != null && v <= 0.02) { this._ignorar(o, 'lo olió y no le interesó'); }
      }
    }

    /** ¿Está parada sobre algo que quiere tocar? Eso es el «contacto» que activa la trompa. */
    _sentidosExtra(sen) {
      this.objetivo = null;
      if (this.refractario > 0) { return; }
      const m = this.mosca;
      const c = this.cerebro;
      for (const o of this.objetos) {
        if (o === this.carga || Math.abs(m.x - o.x) > o.w / 2 + 6 || Math.abs(m.y - o.y) > o.h / 2 + 6) { continue; }
        const v = c.valOlor.get(o.tipo === 'carta' ? o.trabajo.olor : o.olor);
        if (v == null) { continue; }
        if (o.tipo === 'carta' && (this.carga || v <= 0.02)) { continue; }
        // Una app solo si, con el contraste, le sigue pareciendo buena para lo que lleva (la mejor o casi).
        if (o.tipo === 'app' && (!this.carga || v <= 0.04)) { continue; }
        this.objetivo = o;
      }
      sen.contacto = this.objetivo ? 1 : 0;
    }

    _despues() {
      const o = this.objetivo;
      if (!o || this.refractario > 0 || this.cerebro.accion() !== 'comer') { return; }
      this.refractario = 0.8;
      const m = this.mosca;
      // El punto del toque: bajo la mosca, dentro del botón.
      const x = Math.min(o.x + o.w / 2 - 4, Math.max(o.x - o.w / 2 + 4, m.x));
      const y = Math.min(o.y + o.h / 2 - 4, Math.max(o.y - o.h / 2 + 4, m.y));
      this._emitir({ tipo: 'toque-mosca', x, y, objetivo: o.id });
      if (!this.tocarFn || !this.tocarFn(x, y, o.id)) { this.activar(o.id, 'mosca'); }
    }
  }

  Pantalla.APPS = APPS;
  Pantalla.APP_BASE = APP_BASE;
  Pantalla.VIDA_TRABAJO = VIDA_TRABAJO;
  return Pantalla;
});
