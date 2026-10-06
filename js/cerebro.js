/**
 * Mosca Obrera: el cerebro.
 *
 * Un cerebro de Drosophila melanogaster en miniatura (283 neuronas de tasa), conectado como en la mosca real en los
 * circuitos mejor estudiados. No es el conectoma completo: FlyWire mapeó ~140 000 neuronas y ~50 millones de sinapsis.
 * Es lo justo para que se la vea pensar y para que aprenda de verdad.
 *
 *  Olfato   antenas → lóbulo antenal (24 glomérulos) → cuerno lateral (lo innato: la fruta atrae, el humo repele)
 *                                                   → cuerpo fungiforme: 200 células de Kenyon, solo el 5 % activas (APL)
 *  Memoria  3 compartimentos (γ corta, β' media, α larga), cada uno con sus MBON «acercarse» y «evitar» y su dopamina:
 *           PAM (recompensa) deprime la vía «evitar» de las células activas; PPL1 (castigo), la vía «acercarse».
 *           Todo vuelve solo a la línea base (extinción), cada compartimento a su ritmo.
 *  Rumbo    complejo central: anillo de 16 neuronas E-PG (atractor de anillo) cuya burbuja apunta adonde quiere ir.
 *  Estado   neuronas reloj (LNv: presión de sueño), hambre, saciedad, fatiga y susto.
 *  Acción   6 neuronas descendentes que se inhiben entre sí: explorar, acercarse, comer, huir, acicalarse, descansar.
 *
 * Funciona igual en el navegador (window.MoscaCerebro) y en Node (require), para poder probarlo sin pantalla.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) { module.exports = fabrica(); } else { raiz.MoscaCerebro = fabrica(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const N_PN = 24;
  const N_KC = 200;
  const KC_ACTIVAS = 10;
  const GARRAS = 6;
  const UMBRAL_KC = 0.3;
  const N_EPG = 16;
  const DT = 0.1;
  const K = DT / 0.15;
  const G_OLOR = 5;
  const NOVEDAD = 0.12;
  const ACCIONES = ['explorar', 'acercarse', 'comer', 'huir', 'acicalarse', 'descansar'];
  /** lr: cuánto aprende con cada dosis de dopamina; olvido: por segundo, hacia la línea base; peso: en la valencia. */
  const COMPARTIMENTOS = [
    { id: 'gamma', nombre: 'γ · memoria corta', lr: 0.4, olvido: 1 / 60, peso: 0.3 },
    { id: 'beta', nombre: "β' · memoria media", lr: 0.2, olvido: 1 / 1800, peso: 0.35 },
    { id: 'alfa', nombre: 'α · memoria larga', lr: 0.08, olvido: 1 / 86400, peso: 0.35 }
  ];
  // Qué tan fuerte inerva cada cluster de dopamina a cada compartimento. La asimetría es de la mosca real:
  // lo malo se graba más en la memoria larga que lo bueno.
  const PAM = { gamma: 0.9, beta: 1.0, alfa: 0.6 };
  const PPL1 = { gamma: 1.0, beta: 0.5, alfa: 0.9 };
  /** Olores con nombre. innata: lo que el cuerno lateral ya sabe sin aprender. comida: atrae más con hambre. */
  const OLORES = {
    fruta: { nombre: 'fruta madura', innata: 0.55, comida: true, color: '#ffc14d' },
    vinagre: { nombre: 'vinagre', innata: 0.35, comida: true, color: '#e6d36a' },
    menta: { nombre: 'olor A · menta', innata: 0, color: '#4fe0b0' },
    canela: { nombre: 'olor B · canela', innata: 0, color: '#ff8a5c' },
    humo: { nombre: 'humo', innata: -0.75, color: '#9aa3b2' }
  };
  /** Cuántas neuronas tiene el modelo, por región (para mostrarlo sin inventar). */
  const NEURONAS = { ojos: N_EPG, glomerulos: N_PN, cuernoLateral: 4, kenyon: N_KC, apl: 1, mbon: 6, dopamina: 6,
    anillo: N_EPG, reloj: 4, descendentes: ACCIONES.length };
  const TOTAL_NEURONAS = Object.keys(NEURONAS).reduce((s, k) => s + NEURONAS[k], 0);

  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  function azar(semilla) {
    let a = semilla >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp01 = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));
  const clamp = (x, a, b) => (x < a ? a : (x > b ? b : x));
  /** Saturación de la concentración (el lóbulo antenal normaliza: importa más qué huele que cuánto). */
  const sat = (x) => x / (x + 0.08);

  /** Ángulo a [-π, π). */
  function envolver(a) {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) { a += Math.PI * 2; }
    return a - Math.PI;
  }

  /** Cualquier texto se vuelve un nombre de olor: minúsculas, sin tildes ni espacios. */
  function normalizarOlor(s) {
    const limpio = String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^#+/, '').trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-_.]/g, '').slice(0, 40);
    return limpio || 'sin-olor';
  }

  const infoCache = new Map();
  /** Nombre, valencia innata y color de un olor. Los que no tienen nombre dan algo de curiosidad (novedad). */
  function infoOlor(nombre) {
    if (OLORES[nombre]) { return OLORES[nombre]; }
    let o = infoCache.get(nombre);
    if (!o) {
      o = { nombre, innata: NOVEDAD, color: 'hsl(' + (hash(nombre) % 360) + ' 75% 66%)', nuevo: true };
      infoCache.set(nombre, o);
    }
    return o;
  }

  const patrones = new Map();
  /** Qué glomérulos activa un olor: 5 de 24, siempre los mismos para el mismo nombre (en cualquier mosca). */
  function patronOlor(nombre) {
    let p = patrones.get(nombre);
    if (!p) {
      const r = azar(hash('glomerulos:' + nombre));
      p = new Float32Array(N_PN);
      let n = 0;
      while (n < 5) {
        const g = Math.floor(r() * N_PN);
        if (!p[g]) { p[g] = 0.55 + 0.45 * r(); n += 1; }
      }
      let m = 0;
      for (let i = 0; i < N_PN; i += 1) { m = Math.max(m, p[i]); }
      for (let i = 0; i < N_PN; i += 1) { p[i] /= m; }
      patrones.set(nombre, p);
    }
    return p;
  }

  // El anillo E-PG: las vecinas se excitan (coseno) y todas se inhiben un poco (inhibición global).
  const ANILLO = new Float32Array(N_EPG * N_EPG);
  const COS = new Float32Array(N_EPG);
  const SEN = new Float32Array(N_EPG);
  for (let i = 0; i < N_EPG; i += 1) {
    COS[i] = Math.cos(i * Math.PI * 2 / N_EPG);
    SEN[i] = Math.sin(i * Math.PI * 2 / N_EPG);
    for (let j = 0; j < N_EPG; j += 1) {
      ANILLO[i * N_EPG + j] = 0.5 * (0.55 * Math.cos((i - j) * Math.PI * 2 / N_EPG) - 0.25);
    }
  }

  /** Presión de sueño según la hora (0 = medianoche): de noche duerme, y a mediodía hace siesta. */
  function presionSueno(h) {
    if (h == null) { return 0; }
    const sube = (a, b, x) => clamp01((x - a) / (b - a));
    const noche = h < 0.5 ? 1 - sube(0.2, 0.27, h) : sube(0.8, 0.88, h);
    const siesta = Math.exp(-Math.pow((h - 0.55) / 0.06, 2));
    return clamp01(0.95 * noche + 0.3 * siesta);
  }

  class Cerebro {
    /** op.semilla fija el cableado de las células de Kenyon (cada mosca, el suyo). op.rasgos: { curiosidad, miedo }. */
    constructor(op) {
      op = op || {};
      this.semilla = (op.semilla >>> 0) || ((Math.random() * 4294967295) >>> 0) || 1;
      this.rasgos = Object.assign({ curiosidad: 0.5, miedo: 0.5 }, op.rasgos);
      const r = azar(this.semilla);
      this.kcIn = new Uint8Array(N_KC * GARRAS);
      this.kcW = new Float32Array(N_KC * GARRAS);
      for (let k = 0; k < N_KC; k += 1) {
        for (let g = 0; g < GARRAS; g += 1) {
          let pn;
          do { pn = Math.floor(r() * N_PN); } while (this._yaConecta(k, g, pn));
          this.kcIn[k * GARRAS + g] = pn;
          this.kcW[k * GARRAS + g] = 0.5 + 0.5 * r();
        }
      }
      this.mem = {};
      for (const c of COMPARTIMENTOS) { this.mem[c.id] = { a: new Float32Array(N_KC).fill(1), e: new Float32Array(N_KC).fill(1) }; }

      this.pn = new Float32Array(N_PN);
      this.kc = new Uint8Array(N_KC);
      this.kcVis = new Float32Array(N_KC);
      this.epg = new Float32Array(N_EPG);
      this.atr = new Float32Array(N_EPG);
      this.rep = new Float32Array(N_EPG);
      this.dn = new Float32Array(ACCIONES.length);
      this.mbon = { gamma: 0, beta: 0, alfa: 0 };
      this.valCentro = 0;
      this.lh = 0;
      this.dan = { pam: 0, ppl1: 0 };
      this.reloj = 0;
      this.sueno = 0;
      this.interno = { hambre: 0.45, saciedad: 0, fatiga: 0, susto: 0 };
      this.s = { amenaza: 0, amenazaAng: 0, dulce: 0, tacto: 0, dolor: 0, calor: 0, hora: null, actividad: 0 };
      this.olores = new Map();
      this.luz = null;
      this.temp = null;
      this.valOlor = new Map();
      this.rumbo = { ang: 0, fuerza: 0 };
      this.evitar = { ang: 0, fuerza: 0 };
      this.resumen = { atraccion: 0, aversion: 0 };
      this.ganadora = 0;
      this.acc = 0;
      this.t = 0;
      this.ticks = 0;
      this.oyentes = [];

      this._pnObj = new Float32Array(N_PN);
      this._drive = new Float32Array(N_KC);
      this._kcTmp = new Uint8Array(N_KC);
      this._epgNuevo = new Float32Array(N_EPG);
      this._entrada = new Float32Array(ACCIONES.length);
      this._cacheVal = new Map();
      this._version = 0;
    }

    _yaConecta(k, g, pn) {
      for (let i = 0; i < g; i += 1) { if (this.kcIn[k * GARRAS + i] === pn) { return true; } }
      return false;
    }

    // ------------------------------------------------------------------------------------------------ eventos
    on(fn) { this.oyentes.push(fn); return () => { this.oyentes = this.oyentes.filter((f) => f !== fn); }; }
    _emitir(ev) { for (const f of this.oyentes) { f(ev); } }

    // ------------------------------------------------------------------------------------------------ entradas
    /**
     * Lo que llega de los sentidos (lo arma el mundo en cada cuadro):
     *  olores: Map nombre → Float32Array(17) (0 = en las antenas, 1..16 = alrededor, sector i a i·22,5° del frente)
     *  luz: Float32Array(16) · temp: Float32Array(17) en °C · amenaza (0..1) y amenazaAng (relativo al frente)
     *  dulce (0..1, azúcar en la boca) · hora (0..1, 0 = medianoche; null = siempre despierta) · actividad (0..1)
     */
    sentir(sen) {
      this.olores = sen.olores || this.olores;
      this.luz = sen.luz || null;
      this.temp = sen.temp || null;
      const s = this.s;
      s.amenaza = sen.amenaza || 0;
      s.amenazaAng = sen.amenazaAng || 0;
      s.dulce = sen.dulce || 0;
      s.hora = sen.hora === undefined ? s.hora : sen.hora;
      s.actividad = sen.actividad || 0;
    }

    /** Alguien la toca: se acicala o se asusta, según su carácter. */
    tocar(f) {
      this.s.tacto = Math.max(this.s.tacto, f == null ? 1 : f);
      this.interno.susto = clamp01(this.interno.susto + 0.25 * this.rasgos.miedo);
    }

    /** Algo nuevo pasa cerca: se despabila (baja el sueño un rato). */
    despertar(f) { this.interno.susto = clamp01(Math.max(this.interno.susto, f == null ? 0.4 : f)); }

    /** Gota de azúcar: dopamina PAM sobre lo que huele ahora. Devuelve el olor que asoció (o null). */
    recompensar(mag) {
      mag = mag == null ? 1 : mag;
      this.dan.pam = 1;
      this.interno.hambre = clamp01(this.interno.hambre - 0.04 * mag);
      return this._aprenderAhora(1, mag);
    }

    /** Descarga: dopamina PPL1 sobre lo que huele ahora, y dolor (huye). Devuelve el olor que asoció (o null). */
    castigar(mag) {
      mag = mag == null ? 1 : mag;
      this.dan.ppl1 = 1;
      this.s.dolor = Math.max(this.s.dolor, clamp01(mag));
      this.interno.susto = clamp01(this.interno.susto + 0.6);
      return this._aprenderAhora(-1, mag);
    }

    /** Enseñarle un olor sin que esté presente (lo usan las 👍/👎 de las cartas): signo +1 acercarse, -1 evitar. */
    condicionar(olor, signo, mag) {
      olor = normalizarOlor(olor);
      const n = this._kenyon(patronOlor(olor), this._kcTmp);
      if (!n) { return false; }
      this._aprender(this._kcTmp, signo, mag == null ? 1 : mag);
      if (signo > 0) { this.dan.pam = 1; } else { this.dan.ppl1 = 1; }
      this._emitir({ tipo: 'aprende', olor, signo, origen: 'condicionar' });
      return true;
    }

    _aprenderAhora(signo, mag) {
      // Lo que huele en este instante (por si el olor llegó después del último tick).
      this._lobuloAntenal(1);
      const n = this._kenyon(this.pn, this.kc);
      const olor = this.olorDominante();
      if (n) { this._aprender(this.kc, signo, mag); }
      this._emitir({ tipo: 'aprende', olor: n ? olor : null, signo, origen: signo > 0 ? 'premio' : 'castigo' });
      return n ? olor : null;
    }

    // ------------------------------------------------------------------------------------------------ dinámica
    /** Avanza el tiempo; el cerebro late a 10 Hz. */
    pensar(dt) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 50) { this.acc -= DT; this._tick(); n += 1; }
      if (n === 50) { this.acc = 0; }
    }

    _lobuloAntenal(k) {
      const obj = this._pnObj;
      obj.fill(0);
      let total = 0;
      for (const [olor, c] of this.olores) {
        const c0 = c[0];
        if (c0 <= 0.001) { continue; }
        total += c0;
        const p = patronOlor(olor);
        for (let i = 0; i < N_PN; i += 1) { obj[i] += c0 * p[i]; }
      }
      let m = 0;
      for (let i = 0; i < N_PN; i += 1) { m = Math.max(m, obj[i]); }
      const mag = sat(total);
      for (let i = 0; i < N_PN; i += 1) {
        const meta = m > 0 ? obj[i] / m * mag : 0;
        this.pn[i] += (meta - this.pn[i]) * k;
      }
      return { total, mag };
    }

    _tick() {
      this.t += DT;
      this.ticks += 1;
      const s = this.s;
      const it = this.interno;
      const ras = this.rasgos;

      // 1. Lóbulo antenal y cuerno lateral (lo innato).
      const { total, mag } = this._lobuloAntenal(K);
      let lh = 0;
      for (const [olor, c] of this.olores) { lh += c[0] * this._innata(olor); }
      this.lh = total > 0.001 ? clamp(lh / (total + 0.05) * mag, -1, 1) : 0;

      // 2. Cuerpo fungiforme: células de Kenyon (APL deja el 5 %) y las MBON de cada compartimento.
      const nAct = this._kenyon(this.pn, this.kc);
      for (let k = 0; k < N_KC; k += 1) { this.kcVis[k] = Math.max(this.kc[k], this.kcVis[k] * 0.8); }
      this.valCentro = this._valencia(this.kc, nAct, this.mbon);

      // 3. Dopamina: el azúcar en la boca es recompensa continua (y asocia lo que huele mientras come).
      if (s.dulce > 0.05 && nAct) { this._aprender(this.kc, 1, 0.06 * s.dulce); }
      this.dan.pam = Math.max(this.dan.pam * 0.85, s.dulce * 0.6);
      this.dan.ppl1 = Math.max(this.dan.ppl1 * 0.85, s.dolor * 0.8);

      // 4. Extinción: cada compartimento vuelve a la línea base a su ritmo.
      for (const c of COMPARTIMENTOS) {
        const r = c.olvido * DT;
        const m = this.mem[c.id];
        for (let k = 0; k < N_KC; k += 1) { m.a[k] += (1 - m.a[k]) * r; m.e[k] += (1 - m.e[k]) * r; }
      }
      if (this.ticks % 10 === 0) { this._version += 1; }

      // 5. Cuánto le gusta cada olor presente (innato + aprendido) y hacia dónde está lo bueno y lo malo.
      this.valOlor.clear();
      for (const [olor] of this.olores) { this.valOlor.set(olor, this._innata(olor) + this._aprendida(olor)); }
      let maxA = 0;
      let maxR = 0;
      const temp = this.temp;
      for (let i = 0; i < N_EPG; i += 1) {
        let d = 0;
        for (const [olor, c] of this.olores) {
          // Gradiente relativo (ley de Weber), pesado por lo fuerte que llega: lo lejano y tenue tira menos.
          const g = (c[i + 1] - c[0]) / (c[0] + 0.03) * (c[0] / (c[0] + 0.1));
          if (g > 0) { d += this.valOlor.get(olor) * g * G_OLOR; }
        }
        if (this.luz) { d += this.luz[i] * 0.35; }
        if (temp && temp[0] > 26) { d += (temp[0] - temp[i + 1]) * 0.1; }
        this.atr[i] += (Math.max(0, d) - this.atr[i]) * K;
        this.rep[i] += (Math.max(0, -d) - this.rep[i]) * K;
        if (this.atr[i] > maxA) { maxA = this.atr[i]; }
        if (this.rep[i] > maxR) { maxR = this.rep[i]; }
      }

      // 6. Complejo central: la burbuja del anillo apunta a lo más atractivo y dura un momento aunque se vaya.
      const e = this.epg;
      const nuevo = this._epgNuevo;
      const fuerzaEntrada = maxA > 0 ? clamp01(maxA * 4) * 1.2 / maxA : 0;
      for (let i = 0; i < N_EPG; i += 1) {
        let x = this.atr[i] * fuerzaEntrada;
        for (let j = 0; j < N_EPG; j += 1) { x += ANILLO[i * N_EPG + j] * e[j]; }
        nuevo[i] = e[i] + (clamp01(x) - e[i]) * K;
      }
      e.set(nuevo);
      let x = 0;
      let y = 0;
      let max = 0;
      let rx = 0;
      let ry = 0;
      for (let i = 0; i < N_EPG; i += 1) {
        x += e[i] * COS[i];
        y += e[i] * SEN[i];
        if (e[i] > max) { max = e[i]; }
        rx += this.rep[i] * COS[i];
        ry += this.rep[i] * SEN[i];
      }
      this.rumbo.ang = Math.atan2(y, x);
      this.rumbo.fuerza = max;
      this.evitar.ang = envolver(Math.atan2(ry, rx) + Math.PI);
      this.evitar.fuerza = clamp01(Math.hypot(rx, ry) * 2);
      const neto = this.valCentro + this.lh;
      const atraccion = clamp01(maxA * 2.5 + Math.max(0, neto) * 0.4 * mag);
      const aversion = clamp01(maxR * 2.5 + Math.max(0, -neto) * 0.9 * mag);
      this.resumen.atraccion = atraccion;
      this.resumen.aversion = aversion;

      // 7. Estado interno y reloj.
      const comiendo = this.ganadora === 2 && s.dulce > 0.05;
      it.hambre = clamp01(it.hambre + 0.0035 * DT - (comiendo ? 0.09 * DT : 0));
      it.saciedad = clamp01(it.saciedad + (comiendo ? 0.15 * DT : 0) - 0.02 * DT);
      it.fatiga = clamp01(it.fatiga + s.actividad * 0.006 * DT - (this.ganadora === 5 ? 0.04 : 0.004) * DT);
      it.susto = clamp01(Math.max(it.susto * 0.985, s.amenaza * 0.9, s.dolor));
      this.reloj = presionSueno(s.hora);
      this.sueno = clamp01(this.reloj * (0.75 + 0.25 * it.fatiga) + 0.25 * it.fatiga - 1.2 * it.susto);
      s.calor = temp ? clamp01((temp[0] - 30) / 6) : 0;

      // 8. Neuronas descendentes: cada una con su entrada; se inhiben entre sí y gana una.
      const en = this._entrada;
      const h = it.hambre;
      const su = this.sueno;
      const am = s.amenaza;
      const dol = s.dolor;
      en[0] = 0.28 + 0.25 * ras.curiosidad + 0.15 * h - 0.7 * su - 0.6 * am;
      en[1] = 1.5 * atraccion - 0.9 * am - 0.6 * su - 0.5 * aversion;
      en[2] = 1.6 * s.dulce * (0.15 + h) - 1.2 * am - 0.8 * dol;
      en[3] = 1.7 * am * (0.6 + 0.8 * ras.miedo) + 1.4 * dol + 1.1 * Math.max(0, aversion - 0.35) + s.calor;
      en[4] = 0.9 * s.tacto + 0.45 * it.saciedad + 0.08 - 0.6 * am - 0.3 * h;
      en[5] = 1.2 * su + 0.35 * it.fatiga - 0.9 * am - 0.4 * h - 0.5 * dol;
      const d = this.dn;
      let suma = 0;
      for (let b = 0; b < d.length; b += 1) { suma += d[b]; }
      let mejor = 0;
      for (let b = 0; b < d.length; b += 1) {
        d[b] += (clamp01(en[b] - 0.5 * (suma - d[b])) - d[b]) * K;
        if (d[b] > d[mejor]) { mejor = b; }
      }
      if (mejor !== this.ganadora && d[mejor] > d[this.ganadora] + 0.04) {
        const antes = ACCIONES[this.ganadora];
        this.ganadora = mejor;
        this._emitir({ tipo: 'accion', accion: ACCIONES[mejor], antes });
      }
      s.tacto *= 0.75;
      s.dolor *= 0.8;
    }

    _innata(olor) {
      const info = infoOlor(olor);
      return info.innata * (info.comida ? 0.35 + this.interno.hambre : 1);
    }

    /** Células de Kenyon que enciende un patrón de glomérulos (la APL deja solo las KC_ACTIVAS más fuertes). */
    _kenyon(pn, out) {
      const d = this._drive;
      for (let k = 0; k < N_KC; k += 1) {
        let x = 0;
        const b = k * GARRAS;
        for (let g = 0; g < GARRAS; g += 1) { x += this.kcW[b + g] * pn[this.kcIn[b + g]]; }
        d[k] = x;
      }
      out.fill(0);
      let n = 0;
      for (; n < KC_ACTIVAS; n += 1) {
        let m = -1;
        for (let q = 0; q < N_KC; q += 1) {
          if (!out[q] && d[q] > UMBRAL_KC && (m < 0 || d[q] > d[m])) { m = q; }
        }
        if (m < 0) { break; }
        out[m] = 1;
      }
      return n;
    }

    /** Valencia aprendida de un código de Kenyon: suma ponderada de (acercarse − evitar) en cada compartimento. */
    _valencia(kc, n, detalle) {
      let total = 0;
      for (const c of COMPARTIMENTOS) {
        let v = 0;
        if (n) {
          const m = this.mem[c.id];
          let a = 0;
          let e = 0;
          for (let k = 0; k < N_KC; k += 1) { if (kc[k]) { a += m.a[k]; e += m.e[k]; } }
          v = (a - e) / (a + e);
        }
        if (detalle) { detalle[c.id] = v; }
        total += v * c.peso;
      }
      return total;
    }

    _aprendida(olor, detalle) {
      if (!detalle) {
        const c = this._cacheVal.get(olor);
        if (c && c.v === this._version) { return c.val; }
      }
      const n = this._kenyon(patronOlor(olor), this._kcTmp);
      const val = this._valencia(this._kcTmp, n, detalle);
      this._cacheVal.set(olor, { v: this._version, val });
      return val;
    }

    /** La dopamina deprime la vía contraria en las células activas: PAM la de «evitar», PPL1 la de «acercarse». */
    _aprender(kc, signo, mag) {
      for (const c of COMPARTIMENTOS) {
        const f = clamp01(c.lr * mag * (signo > 0 ? PAM[c.id] : PPL1[c.id]));
        const tabla = signo > 0 ? this.mem[c.id].e : this.mem[c.id].a;
        for (let k = 0; k < N_KC; k += 1) { if (kc[k]) { tabla[k] = Math.max(0.05, tabla[k] * (1 - f)); } }
      }
      this._version += 1;
    }

    // ------------------------------------------------------------------------------------------------ salidas
    accion() { return ACCIONES[this.ganadora]; }

    /** El olor más fuerte en las antenas ahora (o null). */
    olorDominante() {
      let mejor = null;
      let max = 0.02;
      for (const [olor, c] of this.olores) { if (c[0] > max) { max = c[0]; mejor = olor; } }
      return mejor;
    }

    /** Lo que siente por un olor: innato, aprendido (y por compartimento) y total (de −1 a 1). */
    valencia(olor) {
      olor = normalizarOlor(olor);
      const comp = {};
      const aprendida = this._aprendida(olor, comp);
      const innata = this._innata(olor);
      return { olor, innata, aprendida, total: innata + aprendida, comp };
    }

    exportar() {
      const r = (x) => Math.round(x * 1000) / 1000;
      const mem = {};
      for (const c of COMPARTIMENTOS) { mem[c.id] = { a: Array.from(this.mem[c.id].a, r), e: Array.from(this.mem[c.id].e, r) }; }
      const it = this.interno;
      return { v: 1, semilla: this.semilla, rasgos: this.rasgos, mem,
        interno: { hambre: r(it.hambre), saciedad: r(it.saciedad), fatiga: r(it.fatiga) } };
    }

    /** Recupera la memoria guardada (si es de esta misma mosca: el cableado depende de la semilla). */
    importar(d) {
      if (!d || d.v !== 1 || (d.semilla >>> 0) !== this.semilla || !d.mem) { return false; }
      for (const c of COMPARTIMENTOS) {
        const m = d.mem[c.id];
        if (!m || !m.a || !m.e || m.a.length !== N_KC || m.e.length !== N_KC) { return false; }
      }
      for (const c of COMPARTIMENTOS) { this.mem[c.id].a.set(d.mem[c.id].a); this.mem[c.id].e.set(d.mem[c.id].e); }
      if (d.interno) {
        for (const k of ['hambre', 'saciedad', 'fatiga']) { if (typeof d.interno[k] === 'number') { this.interno[k] = clamp01(d.interno[k]); } }
      }
      this._version += 1;
      return true;
    }

    static desde(d) {
      const c = new Cerebro({ semilla: d && d.semilla, rasgos: d && d.rasgos });
      c.importar(d);
      return c;
    }
  }

  Object.assign(Cerebro, { N_PN, N_KC, KC_ACTIVAS, N_EPG, DT, ACCIONES, COMPARTIMENTOS, OLORES, NEURONAS, TOTAL_NEURONAS,
    envolver, normalizarOlor, infoOlor, patronOlor, presionSueno, hash, azar, clamp01 });
  return Cerebro;
});
