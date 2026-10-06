/**
 * Mosca Obrera: el mundo (la arena donde vive la mosca).
 *
 * Arma lo que sienten sus antenas, ojos, patas y boca a partir de las cosas que hay en la arena (fruta, olores, luz,
 * calor, una mano que se acerca, cartas que mandan otras apps), se lo pasa al cerebro y mueve el cuerpo según la
 * neurona descendente que ganó. No dibuja nada: eso lo hace vista.js. Funciona en Node para las pruebas.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) { module.exports = fabrica(require('./cerebro.js')); } else { raiz.MoscaMundo = fabrica(raiz.MoscaCerebro); }
})(typeof self !== 'undefined' ? self : this, function (Cerebro) {
  'use strict';

  const { N_EPG, envolver, normalizarOlor, clamp01 } = Cerebro;
  /**
   * Lo que se puede poner en la arena. alcance: el olor cae a la mitad cada 0,7·alcance (perfil exponencial: el
   * gradiente relativo es parejo, como en una pluma real); sigma: radio del calor; vida: segundos hasta que se va.
   */
  const TIPOS = {
    fruta: { olor: 'fruta', alcance: 110, vida: 300, comida: 1, emoji: '🍌', nombre: 'fruta' },
    menta: { olor: 'menta', alcance: 100, vida: 120, emoji: '🌿', nombre: 'olor A (menta)' },
    canela: { olor: 'canela', alcance: 100, vida: 120, emoji: '🍂', nombre: 'olor B (canela)' },
    humo: { olor: 'humo', alcance: 90, vida: 45, emoji: '🌫️', nombre: 'humo' },
    luz: { brillo: 1, vida: 60, emoji: '💡', nombre: 'luz' },
    calor: { calor: 14, sigma: 110, vida: 45, emoji: '🔥', nombre: 'calor' },
    amenaza: { vida: 1.5, emoji: '🖐️', nombre: 'mano' },
    carta: { alcance: 150, vida: 45, fuerzaOlor: 1.4, emoji: '✉️', nombre: 'carta' }
  };
  const MAX_OBJETOS = 24;
  const MAX_CARTAS = 3;
  const R_MUESTRA = 45;
  const R_BOCA = 24;

  class Mundo {
    /** op: { W, H, azar (función 0..1, para pruebas repetibles), modoReloj: 'acelerado' | 'real' | 'despierta' } */
    constructor(cerebro, op) {
      op = op || {};
      this.cerebro = cerebro;
      this.W = op.W || 1000;
      this.H = op.H || 700;
      this.azar = op.azar || Math.random;
      this.mosca = { x: this.W / 2, y: this.H / 2, ang: -Math.PI / 2, vel: 0, vAng: 0, salto: 0, alto: 0, fase: 0,
        huyendo: false, rastro: [] };
      this.objetos = [];
      this.cola = [];
      this.viento = { ang: 0, fuerza: 0, hasta: 0 };
      this.tempAmbiente = 23;
      this.t = 0;
      this.modoReloj = op.modoReloj || 'acelerado';
      this.diaSeg = op.diaSeg || 480;
      this.horaInicio = op.horaInicio == null ? 0.35 : op.horaInicio;
      this.stats = { comidas: 0, huidas: 0, cartas: 0, aceptadas: 0, descartadas: 0, toques: 0, premios: 0, castigos: 0,
        eligioMenta: 0 };
      this.oyentes = [];
      this._id = 1;
      this._gotaDulce = 0;
      this._comiendoDe = null;
      this._comiendo = false;
      this._tRastro = 0;
      this._sen = { olores: new Map(), luz: new Float32Array(N_EPG), temp: new Float32Array(N_EPG + 1),
        amenaza: 0, amenazaAng: 0, dulce: 0, hora: null, actividad: 0 };
      this._px = new Float32Array(N_EPG + 1);
      this._py = new Float32Array(N_EPG + 1);
      cerebro.on((ev) => {
        if (ev.tipo === 'accion' && ev.accion === 'huir') { this.stats.huidas += 1; }
        this._emitir(ev);
      });
    }

    on(fn) { this.oyentes.push(fn); return () => { this.oyentes = this.oyentes.filter((f) => f !== fn); }; }
    _emitir(ev) { for (const f of this.oyentes) { f(ev); } }

    /** Hora del día de la mosca (0 = medianoche) o null si está en «siempre despierta». */
    hora() {
      if (this.modoReloj === 'despierta') { return null; }
      if (this.modoReloj === 'real') {
        const d = new Date();
        return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
      }
      return (this.horaInicio + this.t / this.diaSeg) % 1;
    }

    /** Cambia el tamaño de la arena (la pantalla giró): todo se queda adentro. */
    redimensionar(W, H) {
      const fx = W / this.W;
      const fy = H / this.H;
      this.W = W;
      this.H = H;
      const m = this.mosca;
      m.x *= fx; m.y *= fy;
      for (const o of this.objetos) { o.x *= fx; o.y *= fy; }
      m.rastro.length = 0;
    }

    // ------------------------------------------------------------------------------------------------ cosas
    agregar(tipo, x, y, extra) {
      const def = TIPOS[tipo];
      if (!def) { return null; }
      const o = Object.assign({ id: this._id++, tipo, edad: 0, fuerzaOlor: 1 }, def, extra || {});
      o.x = Math.min(this.W - 20, Math.max(20, x));
      o.y = Math.min(this.H - 20, Math.max(20, y));
      o.vida0 = o.vida;
      if (o.olor) { o.olor = normalizarOlor(o.olor); }
      this.objetos.push(o);
      while (this.objetos.length > MAX_OBJETOS) {
        const i = this.objetos.findIndex((v) => v.tipo !== 'carta');
        this.objetos.splice(i < 0 ? 0 : i, 1);
      }
      if (tipo !== 'amenaza') { this.cerebro.despertar(0.35); }
      return o;
    }

    quitar(o) {
      const i = this.objetos.indexOf(o);
      if (i >= 0) { this.objetos.splice(i, 1); }
    }

    /** Quita todo lo que puso el jugador (las cartas pendientes se quedan: son trabajo). */
    limpiar() {
      this.objetos = this.objetos.filter((o) => o.tipo === 'carta');
      this.viento.fuerza = 0;
    }

    /**
     * Llega una carta (de otra app o de prueba). Si ya hay 3 en la arena, espera en la cola.
     * c: { texto, olor, fuente, meta, id?, reentrega? } (reentrega: vuelve a ponerla tras recargar, sin contarla otra vez).
     */
    cartaNueva(c) {
      const carta = { texto: String(c.texto || '').slice(0, 500), olor: normalizarOlor(c.olor || c.fuente || 'carta'),
        fuente: String(c.fuente || 'prueba').slice(0, 40), meta: c.meta || null, recibida: Date.now(),
        id: c.id || 'c' + Date.now().toString(36) + Math.floor(this.azar() * 1e6).toString(36) };
      if (!c.reentrega) { this.stats.cartas += 1; }
      if (this.objetos.filter((o) => o.tipo === 'carta').length >= MAX_CARTAS) {
        this.cola.push(carta);
        this._emitir({ tipo: 'carta-cola', carta, enCola: this.cola.length });
      } else {
        this._ponerCarta(carta);
      }
      return carta;
    }

    _ponerCarta(carta) {
      const m = this.mosca;
      let x = 0;
      let y = 0;
      for (let i = 0; i < 12; i += 1) {
        x = 60 + this.azar() * (this.W - 120);
        y = 60 + this.azar() * (this.H - 120);
        if (Math.hypot(x - m.x, y - m.y) > Math.min(this.W, this.H) * 0.3) { break; }
      }
      const o = this.agregar('carta', x, y, { olor: carta.olor, carta });
      this.cerebro.despertar(0.6);
      this._emitir({ tipo: 'carta-llega', carta, x: o.x, y: o.y });
    }

    _resolverCarta(o, resultado, motivo) {
      this.quitar(o);
      const v = this.cerebro.valOlor.get(o.olor);
      const valencia = v == null ? this.cerebro.valencia(o.olor).total : v;
      if (resultado === 'aceptada') { this.stats.aceptadas += 1; } else { this.stats.descartadas += 1; }
      this._emitir({ tipo: 'carta', resultado, motivo, carta: o.carta, valencia, x: o.x, y: o.y });
      if (this.cola.length) { this._ponerCarta(this.cola.shift()); }
    }

    /** Toque en la arena sin herramienta: si fue sobre la mosca, la siente. */
    tocarEn(x, y) {
      const m = this.mosca;
      if (Math.hypot(x - m.x, y - m.y) < 34) {
        this.cerebro.tocar(1);
        this.stats.toques += 1;
        this._emitir({ tipo: 'toque', x: m.x, y: m.y });
        return true;
      }
      return false;
    }

    premio() {
      this._gotaDulce = 1.5;
      this.stats.premios += 1;
      const olor = this.cerebro.recompensar(1);
      this._emitir({ tipo: 'premio', olor, x: this.mosca.x, y: this.mosca.y });
      return olor;
    }

    castigo() {
      this.stats.castigos += 1;
      const olor = this.cerebro.castigar(1);
      this._emitir({ tipo: 'castigo', olor, x: this.mosca.x, y: this.mosca.y });
      return olor;
    }

    /** Viento que sopla desde (x, y) hacia el centro de la arena, unos segundos. */
    vientoDesde(x, y, fuerza, segundos) {
      this.viento.ang = Math.atan2(this.H / 2 - y, this.W / 2 - x);
      this.viento.fuerza = fuerza == null ? 0.8 : clamp01(fuerza);
      this.viento.hasta = this.t + (segundos || 20);
      this.cerebro.despertar(0.2);
    }

    // ------------------------------------------------------------------------------------------------ tiempo
    /** Avanza la simulación dt segundos (en sub-pasos: si la pestaña estuvo en segundo plano, se pone al día). */
    paso(dt) {
      let resto = Math.min(dt, 120);
      while (resto > 1e-6) {
        const h = Math.min(resto, 0.05);
        this._paso(h);
        resto -= h;
      }
    }

    _fade(o) { return Math.min(1, o.vida / 4, (o.edad + 0.3) / 1.5); }

    /** Centro efectivo del olor de o (el viento lo empuja), su alcance y su fuerza. */
    pluma(o) {
      const v = this.viento;
      return { x: o.x + Math.cos(v.ang) * v.fuerza * o.alcance, y: o.y + Math.sin(v.ang) * v.fuerza * o.alcance,
        alcance: o.alcance * (1 + 0.4 * v.fuerza), fuerza: this._fuerzaOlor(o) };
    }

    _fuerzaOlor(o) {
      const f = o.fuerzaOlor * this._fade(o);
      return o.comida != null ? f * (0.3 + 0.7 * o.comida) : f;
    }

    _sensar() {
      const m = this.mosca;
      const sen = this._sen;
      const px = this._px;
      const py = this._py;
      px[0] = m.x + Math.cos(m.ang) * 8;
      py[0] = m.y + Math.sin(m.ang) * 8;
      for (let i = 0; i < N_EPG; i += 1) {
        const a = m.ang + i * Math.PI * 2 / N_EPG;
        px[i + 1] = m.x + Math.cos(a) * R_MUESTRA;
        py[i + 1] = m.y + Math.sin(a) * R_MUESTRA;
      }
      const olores = new Map();
      sen.luz.fill(0);
      sen.temp.fill(this.tempAmbiente);
      let am = 0;
      let amAng = 0;
      let dulce = 0;
      this._comiendoDe = null;
      for (const o of this.objetos) {
        if (o.olor) {
          let arr = olores.get(o.olor);
          if (!arr) { arr = new Float32Array(N_EPG + 1); olores.set(o.olor, arr); }
          const p = this.pluma(o);
          for (let k = 0; k <= N_EPG; k += 1) {
            arr[k] += p.fuerza * Math.exp(-Math.hypot(px[k] - p.x, py[k] - p.y) / p.alcance);
          }
        }
        const dx = o.x - m.x;
        const dy = o.y - m.y;
        const d = Math.hypot(dx, dy);
        if (o.tipo === 'luz') {
          const rel = envolver(Math.atan2(dy, dx) - m.ang);
          const b = o.brillo * this._fade(o) / (1 + d / 260);
          for (let i = 0; i < N_EPG; i += 1) {
            const c = Math.cos(i * Math.PI * 2 / N_EPG - rel);
            if (c > 0) { sen.luz[i] += b * c * c * c * c; }
          }
        } else if (o.tipo === 'calor') {
          const den = 2 * o.sigma * o.sigma;
          const f = o.calor * this._fade(o);
          for (let k = 0; k <= N_EPG; k += 1) {
            const ex = px[k] - o.x;
            const ey = py[k] - o.y;
            sen.temp[k] += f * Math.exp(-(ex * ex + ey * ey) / den);
          }
        } else if (o.tipo === 'amenaza') {
          // Looming: la silueta crece mientras se acerca. Cuanto más cerca y más grande, más miedo.
          const prog = o.edad / o.vida0;
          const f = clamp01(1 - d / 280) * clamp01(0.45 + prog * 1.2);
          if (f > am) { am = f; amAng = envolver(Math.atan2(dy, dx) - m.ang); }
        } else if (o.tipo === 'fruta' && o.comida > 0 && d < R_BOCA) {
          dulce = 1;
          this._comiendoDe = o;
        }
      }
      sen.olores = olores;
      sen.amenaza = am;
      sen.amenazaAng = amAng;
      sen.dulce = Math.max(dulce, this._gotaDulce > 0 ? 1 : 0);
      sen.hora = this.hora();
      sen.actividad = clamp01(Math.abs(m.vel) / 120);
      this.cerebro.sentir(sen);
    }

    _paso(dt) {
      this.t += dt;
      for (let i = this.objetos.length - 1; i >= 0; i -= 1) {
        const o = this.objetos[i];
        o.edad += dt;
        o.vida -= dt;
        if (o.tipo === 'carta') {
          if (o.vida <= 0) { this._resolverCarta(o, 'descartada', 'nadie la recogió a tiempo'); } else { this._revisarCarta(o, dt); }
        } else if (o.vida <= 0) {
          this.objetos.splice(i, 1);
        }
      }
      if (this.viento.fuerza > 0 && this.t > this.viento.hasta) { this.viento.fuerza = Math.max(0, this.viento.fuerza - dt * 0.5); }
      this._gotaDulce = Math.max(0, this._gotaDulce - dt);

      this._sensar();
      this.cerebro.pensar(dt);
      this._mover(dt);

      const accion = this.cerebro.accion();
      if (accion === 'comer' && this._comiendoDe) {
        const f = this._comiendoDe;
        if (!this._comiendo) {
          this._comiendo = true;
          this.stats.comidas += 1;
          this._emitir({ tipo: 'come', x: f.x, y: f.y });
        }
        f.comida -= 0.06 * dt;
        if (f.comida <= 0) { this.quitar(f); this._emitir({ tipo: 'se-acabo', x: f.x, y: f.y }); }
      } else if (accion !== 'comer') {
        this._comiendo = false;
      }
      this._visitas();
    }

    /** ¿Ya llegó a alguna fuente de olor? (para el examen del laberinto: ¿eligió la menta y no la canela?) */
    _visitas() {
      const m = this.mosca;
      for (const o of this.objetos) {
        if (o.visitado || !o.olor || o.tipo === 'carta') { continue; }
        if (Math.hypot(o.x - m.x, o.y - m.y) < 40) {
          o.visitado = true;
          const hayCanela = this.objetos.some((v) => v.olor === 'canela');
          const hayMenta = this.objetos.some((v) => v.olor === 'menta');
          if (o.olor === 'menta' && hayCanela) { this.stats.eligioMenta += 1; }
          this._emitir({ tipo: 'llego', olor: o.olor, eleccion: hayCanela && hayMenta });
        }
      }
    }

    /**
     * Decide una carta: la recoge si llega hasta ella y le gusta (valencia > 0); si la huele y no le gusta, la deja.
     * Si nunca llega (duerme, huye, está lejos), caduca. La decisión es del cuerpo fungiforme, el cuerpo la hace visible.
     */
    _revisarCarta(o, dt) {
      const m = this.mosca;
      const v = this.cerebro.valOlor.get(o.olor);
      const d = Math.hypot(m.x - o.x, m.y - o.y);
      if (d < 28 && v != null && v > 0.02 && this.cerebro.accion() !== 'huir') {
        this._resolverCarta(o, 'aceptada', 'la recogió');
        return;
      }
      const c = this._sen.olores.get(o.olor);
      o.olida = (o.olida || 0) + (c && c[0] > 0.05 ? dt : 0);
      if (o.olida > 4 && v != null && v <= 0.02) {
        this._resolverCarta(o, 'descartada', 'la olió y no le interesó');
      }
    }

    _mover(dt) {
      const m = this.mosca;
      const c = this.cerebro;
      const accion = c.accion();
      let vObj = 0;
      let giro = 0;
      if (m.salto > 0) {
        // En el aire: la fibra gigante la lanzó; vuela derecho un momento.
        m.salto -= dt;
        vObj = 420;
      } else {
        switch (accion) {
          case 'explorar':
            vObj = 55;
            m.vAng += (this.azar() - 0.5) * 9 * dt;
            m.vAng *= Math.pow(0.4, dt);
            giro = m.vAng * 3 + 1.2 * c.rumbo.fuerza * envolver(c.rumbo.ang);
            break;
          case 'acercarse':
            vObj = 72;
            giro = 3.5 * envolver(c.rumbo.ang) * Math.min(1, c.rumbo.fuerza * 2 + 0.2);
            break;
          case 'huir':
            if (!m.huyendo) {
              m.huyendo = true;
              const s = c.s;
              let dir;
              if (s.amenaza > 0.1) { dir = m.ang + s.amenazaAng + Math.PI; } else if (c.evitar.fuerza > 0.1) { dir = m.ang + c.evitar.ang; } else { dir = m.ang + (this.azar() - 0.5) * Math.PI * 2; }
              m.ang = envolver(dir + (this.azar() - 0.5) * 0.8);
              if (s.amenaza > 0.1 || s.dolor > 0.3) { m.salto = 0.45; }
            }
            vObj = 170;
            if (c.s.amenaza > 0.05) { giro = 3 * envolver(c.s.amenazaAng + Math.PI); }
            break;
          default:
            vObj = 0;
        }
      }
      if (accion !== 'huir') { m.huyendo = false; }
      if (vObj > 0 && m.salto <= 0 && c.evitar.fuerza > 0.05) { giro += 2.5 * c.evitar.fuerza * envolver(c.evitar.ang); }
      // Paredes: si lo que tiene adelante se sale, gira hacia el centro.
      const lx = m.x + Math.cos(m.ang) * 50;
      const ly = m.y + Math.sin(m.ang) * 50;
      if (vObj > 0 && (lx < 30 || lx > this.W - 30 || ly < 30 || ly > this.H - 30)) {
        giro += 4 * envolver(Math.atan2(this.H / 2 - m.y, this.W / 2 - m.x) - m.ang);
      }
      giro = Math.max(-6, Math.min(6, giro));
      m.ang = envolver(m.ang + giro * dt);
      m.vel += (vObj - m.vel) * Math.min(1, dt * (m.salto > 0 ? 20 : 6));
      m.x += Math.cos(m.ang) * m.vel * dt;
      m.y += Math.sin(m.ang) * m.vel * dt;
      if (m.x < 15 || m.x > this.W - 15 || m.y < 15 || m.y > this.H - 15) {
        m.x = Math.min(this.W - 15, Math.max(15, m.x));
        m.y = Math.min(this.H - 15, Math.max(15, m.y));
        m.salto = 0;
      }
      m.alto = m.salto > 0 ? Math.sin(Math.min(1, (0.45 - m.salto) / 0.45) * Math.PI) : 0;
      m.fase += Math.abs(m.vel) * dt * 0.22;
      this._tRastro += dt;
      if (this._tRastro > 0.1) {
        this._tRastro = 0;
        m.rastro.push(m.x, m.y);
        if (m.rastro.length > 240) { m.rastro.splice(0, 2); }
      }
    }
  }

  Mundo.TIPOS = TIPOS;
  Mundo.MAX_CARTAS = MAX_CARTAS;
  return Mundo;
});
