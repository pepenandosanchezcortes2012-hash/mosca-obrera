/**
 * Mosca Obrera: lo que se ve. Dibuja la arena (olores, cosas, la mosca y su rastro) y el cerebro en vivo
 * (cada región con su actividad, y las señales viajando por las conexiones).
 */
(function (raiz) {
  'use strict';

  const C = raiz.MoscaCerebro;
  const { N_EPG, N_KC, N_PN, ACCIONES, COMPARTIMENTOS, infoOlor } = C;
  const EMOJI_ACCION = { explorar: '🔎', acercarse: '➡️', comer: '🍽️', huir: '💨', acicalarse: '🧼', descansar: '💤' };
  const TEXTO_ACCION = { explorar: 'explorando', acercarse: 'yendo hacia algo', comer: 'comiendo', huir: '¡huyendo!',
    acicalarse: 'acicalándose', descansar: 'durmiendo' };

  function colorOlor(olor) { return infoOlor(olor).color; }

  function conAlfa(color, a) {
    if (color[0] === '#') {
      const n = parseInt(color.slice(1), 16);
      return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    return color.replace(')', ' / ' + a + ')');
  }

  // ================================================================================================ arena
  class VistaArena {
    constructor(canvas, mundo) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.mundo = mundo;
      this.efectos = [];
      this.escala = 1;
      mundo.on((ev) => this._alEvento(ev));
    }

    _alEvento(ev) {
      const m = this.mundo.mosca;
      const fx = { premio: ['🍬', '#4fe0b0'], castigo: ['⚡', '#ff6b6b'], come: ['😋', '#ffc14d'], toque: ['✋', '#cfd8e3'],
        'carta-llega': ['📨', '#9b8cff'] }[ev.tipo];
      if (fx) { this.efectos.push({ x: ev.x == null ? m.x : ev.x, y: ev.y == null ? m.y : ev.y, t: 0, dur: 1.2, emoji: fx[0], color: fx[1] }); }
      if (ev.tipo === 'carta') {
        this.efectos.push({ x: ev.x, y: ev.y, t: 0, dur: 1.4, emoji: ev.resultado === 'aceptada' ? '✅' : '🗑️',
          color: ev.resultado === 'aceptada' ? '#4fe0b0' : '#8b98a8' });
      }
    }

    /** Ajusta el lienzo a su caja y devuelve el tamaño del mundo que le corresponde (más zoom en pantallas chicas). */
    ajustar() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cv.width = Math.round(r.width * dpr);
      this.cv.height = Math.round(r.height * dpr);
      const W = Math.max(480, Math.min(1100, r.width * 1.1));
      const H = W * r.height / r.width;
      this.escala = this.cv.width / W;
      return { W, H };
    }

    /** De coordenadas de la pantalla (evento) a coordenadas del mundo. */
    aMundo(clientX, clientY) {
      const r = this.cv.getBoundingClientRect();
      return { x: (clientX - r.left) / r.width * this.mundo.W, y: (clientY - r.top) / r.height * this.mundo.H };
    }

    dibujar(dt, tReal) {
      const ctx = this.ctx;
      const mu = this.mundo;
      const s = this.escala;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      this._fondo(ctx, mu, tReal);
      this._plumas(ctx, mu);
      if (mu.activo) { this._rastro(ctx, mu.mosca); }
      this._objetos(ctx, mu, tReal);
      if (mu.activo) { this._mosca(ctx, mu, tReal); }
      this._efectos(ctx, dt);
      const hora = mu.hora();
      if (hora != null) {
        const noche = C.presionSueno(hora) - 0.3 * Math.exp(-Math.pow((hora - 0.55) / 0.06, 2));
        if (noche > 0.01) {
          ctx.fillStyle = 'rgba(6, 8, 30,' + (0.45 * Math.min(1, noche)) + ')';
          ctx.fillRect(0, 0, mu.W, mu.H);
        }
      }
    }

    _fondo(ctx, mu, t) {
      const g = ctx.createRadialGradient(mu.W / 2, mu.H / 2, 40, mu.W / 2, mu.H / 2, Math.max(mu.W, mu.H) * 0.7);
      g.addColorStop(0, '#16202b');
      g.addColorStop(1, '#0b1118');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, mu.W, mu.H);
      ctx.strokeStyle = 'rgba(140, 170, 200, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 50; x < mu.W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, mu.H); }
      for (let y = 50; y < mu.H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(mu.W, y); }
      ctx.stroke();
      if (mu.viento.fuerza > 0.02) {
        // Rayas de viento que corren en la dirección en que sopla.
        const v = mu.viento;
        ctx.save();
        ctx.strokeStyle = 'rgba(190, 220, 255,' + (0.18 * v.fuerza) + ')';
        ctx.lineWidth = 2;
        const cx = Math.cos(v.ang);
        const cy = Math.sin(v.ang);
        for (let i = 0; i < 26; i += 1) {
          const base = (i * 137.5) % 1;
          const fase = ((t * 0.25 * (0.6 + v.fuerza) + base) % 1);
          const px = ((i * 211) % mu.W) - cx * mu.W * 0.5 + cx * fase * mu.W;
          const py = ((i * 97) % mu.H) - cy * mu.H * 0.5 + cy * fase * mu.H;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + cx * 40, py + cy * 40);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    _plumas(ctx, mu) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const o of mu.objetos) {
        if (o.olor) {
          const p = mu.pluma(o);
          const r = p.alcance * 2.6;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          const col = colorOlor(o.olor);
          g.addColorStop(0, conAlfa(col, 0.32 * Math.min(1, p.fuerza)));
          g.addColorStop(0.35, conAlfa(col, 0.12 * Math.min(1, p.fuerza)));
          g.addColorStop(1, conAlfa(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.tipo === 'calor' || o.tipo === 'luz') {
          const fade = Math.min(1, o.vida / 4, (o.edad + 0.3) / 1.5);
          const r = o.tipo === 'calor' ? o.sigma * 2 : 230;
          const col = o.tipo === 'calor' ? '#ff5a36' : '#fff2b0';
          const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
          g.addColorStop(0, conAlfa(col, 0.35 * fade));
          g.addColorStop(1, conAlfa(col, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    _rastro(ctx, m) {
      const r = m.rastro;
      if (r.length < 4) { return; }
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      for (let i = 2; i < r.length; i += 2) {
        ctx.strokeStyle = 'rgba(255, 181, 71,' + (0.25 * i / r.length) + ')';
        ctx.beginPath();
        ctx.moveTo(r[i - 2], r[i - 1]);
        ctx.lineTo(r[i], r[i + 1]);
        ctx.stroke();
      }
      ctx.restore();
    }

    _objetos(ctx, mu, t) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const o of mu.objetos) {
        const fade = Math.min(1, o.vida / 4, (o.edad + 0.3) / 1.5);
        ctx.globalAlpha = Math.max(0.15, fade);
        if (o.tipo === 'amenaza') {
          const prog = o.edad / o.vida0;
          const r = 30 + prog * 90;
          ctx.fillStyle = 'rgba(0, 0, 0,' + (0.25 + prog * 0.35) + ')';
          ctx.beginPath();
          ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.font = Math.round(36 + prog * 60) + 'px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.fillText(o.emoji, o.x, o.y);
          continue;
        }
        if (o.tipo === 'carta') {
          // Anillo que se va vaciando: el tiempo que le queda a la mosca para decidir.
          ctx.strokeStyle = 'rgba(155, 140, 255, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(o.x, o.y, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, o.vida / o.vida0));
          ctx.stroke();
          const bote = Math.sin(t * 3 + o.id) * 2;
          ctx.font = '30px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.fillText(o.emoji, o.x, o.y + bote);
          ctx.font = '600 13px system-ui, sans-serif';
          ctx.fillStyle = colorOlor(o.olor);
          ctx.fillText('#' + o.olor, o.x, o.y + 44);
          continue;
        }
        const tam = o.tipo === 'fruta' ? 22 + 12 * Math.max(0, o.comida) : 30;
        ctx.font = Math.round(tam) + 'px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.fillText(o.emoji, o.x, o.y);
      }
      ctx.restore();
    }

    _mosca(ctx, mu, t) {
      const accion = mu.cerebro.accion();
      moscaConEtiqueta(ctx, mu.mosca, accion, t, EMOJI_ACCION[accion] + ' ' + TEXTO_ACCION[accion], mu.W);
    }

    _efectos(ctx, dt) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = this.efectos.length - 1; i >= 0; i -= 1) {
        const e = this.efectos[i];
        e.t += dt;
        if (e.t > e.dur) { this.efectos.splice(i, 1); continue; }
        const p = e.t / e.dur;
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 12 + p * 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '26px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.fillText(e.emoji, e.x, e.y - 30 - p * 30);
      }
      ctx.restore();
    }
  }

  /** La mosca (con su sombra, que se separa cuando salta) y un cartelito encima con lo que está haciendo. */
  function moscaConEtiqueta(ctx, m, accion, t, txt, W) {
    const L = 1.3;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(m.x + 4 + m.alto * 18, m.y + 6 + m.alto * 22, 16 * L, 9 * L, m.ang, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(m.x, m.y - m.alto * 10);
    ctx.rotate(m.ang);
    ctx.scale(L * (1 + m.alto * 0.25), L * (1 + m.alto * 0.25));
    dibujarMosca(ctx, { fase: m.fase, accion, volando: m.salto > 0, t });
    ctx.restore();
    ctx.save();
    ctx.font = '600 13px system-ui, sans-serif';
    const w = ctx.measureText(txt).width + 14;
    // Que no se salga cuando la mosca está pegada a una pared.
    const x = Math.min(W - w / 2 - 4, Math.max(w / 2 + 4, m.x));
    const y = m.y - 40 - m.alto * 10 < 16 ? m.y + 40 : m.y - 40 - m.alto * 10;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.78)';
    redondeado(ctx, x - w / 2, y - 11, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = accion === 'huir' ? '#ff8a8a' : '#e7edf3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y + 1);
    ctx.restore();
  }

  function redondeado(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Una Drosophila vista desde arriba, mirando hacia +x, de ~30 unidades de largo: ojos rojos, tórax ámbar, abdomen
   * con franjas, alas transparentes y seis patas que caminan en trípode (o se frotan cuando se acicala).
   */
  function dibujarMosca(ctx, o) {
    const fase = o.fase;
    const accion = o.accion;
    // Patas: tres pares; trípode A = delantera izq, media der, trasera izq; B, al revés.
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    const pares = [[4, 3.5, 10, 9], [2, 4.5, 2, 11.5], [0, 3.5, -7, 10]];
    for (let lado = -1; lado <= 1; lado += 2) {
      for (let p = 0; p < 3; p += 1) {
        const [ax, ay, tx, ty] = pares[p];
        const grupo = (p % 2 === 0) === (lado < 0) ? 0 : Math.PI;
        let dx = Math.sin(fase + grupo) * 2.6;
        let fx = tx + dx;
        let fy = ty * lado;
        if (accion === 'acicalarse' && p === 0) {
          fx = 13 + Math.sin(o.t * 22) * 1.5;
          fy = lado * (1.5 + Math.cos(o.t * 22) * 1.2);
        } else if (accion === 'acicalarse' && p === 2) {
          fx = -11 + Math.sin(o.t * 18 + lado) * 1.5;
          fy = lado * (4 + Math.cos(o.t * 18) * 1.5);
        }
        const mx = (ax + fx) / 2 + (p === 1 ? 0 : 1.5);
        const my = (ay * lado + fy) / 2 + lado * 2.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay * lado);
        ctx.lineTo(mx, my);
        ctx.lineTo(fx, fy);
        ctx.stroke();
      }
    }
    // Alas: quietas sobre el abdomen, o un borrón cuando vuela.
    const alas = (lado, ang, alfa) => {
      ctx.save();
      ctx.translate(1, 1.8 * lado);
      ctx.rotate(ang * lado);
      ctx.fillStyle = 'rgba(210, 228, 255,' + alfa + ')';
      ctx.strokeStyle = 'rgba(190, 210, 240,' + (alfa + 0.25) + ')';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.ellipse(-10, 0, 11.5, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    if (o.volando) {
      for (let k = 0; k < 3; k += 1) {
        const a = 0.2 + Math.abs(Math.sin(o.t * 60 + k)) * 0.9;
        alas(-1, -a, 0.12);
        alas(1, -a, 0.12);
      }
    } else {
      alas(-1, -0.28, 0.3);
      alas(1, -0.28, 0.3);
    }
    // Abdomen con franjas.
    ctx.fillStyle = '#c9a26a';
    ctx.beginPath();
    ctx.ellipse(-8.5, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#5a3d22';
    for (let i = 0; i < 4; i += 1) { ctx.fillRect(-15 + i * 3.3, -7, 1.4, 14); }
    ctx.restore();
    // Tórax y cabeza.
    ctx.fillStyle = '#a8814e';
    ctx.beginPath();
    ctx.ellipse(2, 0, 6.2, 5.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c6a3f';
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 3.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a07a48';
    ctx.beginPath();
    ctx.ellipse(9.6, 0, 3.4, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ojos compuestos.
    for (let lado = -1; lado <= 1; lado += 2) {
      ctx.fillStyle = '#c4262b';
      ctx.beginPath();
      ctx.ellipse(10.2, 3.2 * lado, 2.7, 2.3, 0.3 * lado, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 200, 0.55)';
      ctx.beginPath();
      ctx.arc(10.8, 2.6 * lado, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Antenas.
    ctx.strokeStyle = '#6b4c2a';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(12.5, -1); ctx.lineTo(14.2, -2);
    ctx.moveTo(12.5, 1); ctx.lineTo(14.2, 2);
    ctx.stroke();
    // Probóscide cuando come.
    if (accion === 'comer') {
      const largo = 3 + Math.abs(Math.sin(o.t * 6)) * 1.5;
      ctx.strokeStyle = '#7a5530';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(13 + largo, 0);
      ctx.stroke();
      ctx.fillStyle = '#7a5530';
      ctx.beginPath();
      ctx.arc(13.5 + largo, 0, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ================================================================================================ cerebro
  /** Regiones del dibujo del cerebro (coordenadas en una caja de 1000 × 720) y lo que se explica al tocarlas. */
  const REGIONES = [
    { id: 'ojos', x: 80, y: 360, r: 70, titulo: 'Ojos y lóbulos ópticos',
      texto: 'Cada ojo compuesto tiene unas 800 omatidias. Aquí son 16 sectores alrededor de la mosca: ven la luz y la silueta que crece de algo que se acerca (looming), la señal que dispara la huida.' },
    { id: 'al', x: 300, y: 590, r: 75, titulo: 'Lóbulo antenal',
      texto: 'Cada olor enciende una combinación de glomérulos (la mosca real tiene ~50; aquí, 24). Cualquier palabra, también las etiquetas que mandan tus apps, se vuelve un olor con su propio patrón.' },
    { id: 'lh', x: 175, y: 215, r: 55, titulo: 'Cuerno lateral',
      texto: 'Lo innato: lo que la mosca sabe sin aprender. La fruta y el vinagre atraen (más con hambre), el humo repele, y lo desconocido le da un poco de curiosidad.' },
    { id: 'kc', x: 345, y: 160, r: 80, titulo: 'Cuerpo fungiforme · 200 células de Kenyon',
      texto: 'La mosca real tiene ~2000 por lado. La neurona APL apaga a casi todas: con cada olor se enciende solo el 5 %. Ese código disperso hace que cada olor tenga su propia huella, y es donde se guarda la memoria.' },
    { id: 'lobulos', x: 600, y: 230, r: 90, titulo: 'Lóbulos y compartimentos',
      texto: 'Tres compartimentos con su propio reloj: γ recuerda un minuto, β\' media hora y α un día. Verde = la vía «acercarse» gana; rojo = gana «evitar», para el olor que siente ahora.' },
    { id: 'dan', x: 600, y: 395, r: 45, titulo: 'Dopamina: PAM y PPL1',
      texto: 'PAM se enciende con la recompensa (azúcar, 🍬, 👍) y debilita la vía «evitar» de las células de Kenyon activas. PPL1 se enciende con el castigo (⚡, 👎) y debilita «acercarse». Así aprende.' },
    { id: 'mbon', x: 790, y: 260, r: 50, titulo: 'Neuronas de salida (MBON)',
      texto: 'Comparan «acercarse» contra «evitar». Su diferencia es la valencia aprendida: lo que la mosca siente por el olor de ahora.' },
    { id: 'cx', x: 500, y: 520, r: 75, titulo: 'Complejo central · anillo E-PG',
      texto: 'Un atractor de anillo de 16 neuronas: una burbuja de actividad que apunta hacia donde la mosca quiere ir, y que dura un momento aunque el estímulo se vaya. Es su brújula.' },
    { id: 'reloj', x: 880, y: 120, r: 45, titulo: 'Neuronas reloj (LNv)',
      texto: 'Llevan la hora del día de la mosca. De noche suben la presión de sueño, y a mediodía, una siesta. Un susto la despierta.' },
    { id: 'dn', x: 640, y: 665, r: 60, titulo: 'Neuronas descendentes',
      texto: 'Los comandos al cuerpo: explorar, acercarse, comer, huir, acicalarse o descansar. Se inhiben entre sí y gana una. Bajan por el cordón nervioso ventral hasta las patas y las alas.' }
  ];

  class VistaCerebro {
    constructor(canvas, cerebro) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.cerebro = cerebro;
      this.sel = null;
      this.particulas = [];
      this.escala = 1;
      this.letra = 19;
      this.ox = 0;
      this.oy = 0;
      // Células de Kenyon en espiral de girasol dentro del cáliz.
      this.kcPos = [];
      for (let i = 0; i < N_KC; i += 1) {
        const r = 72 * Math.sqrt((i + 0.5) / N_KC);
        const a = i * 2.39996;
        this.kcPos.push([345 + r * Math.cos(a), 160 + r * Math.sin(a) * 0.82]);
      }
      this.pnPos = [];
      for (let i = 0; i < N_PN; i += 1) {
        const anillo = i < 8 ? 0 : 1;
        const n = anillo ? 16 : 8;
        const k = anillo ? i - 8 : i;
        const r = anillo ? 55 : 26;
        const a = k / n * Math.PI * 2 + anillo * 0.2;
        this.pnPos.push([300 + r * Math.cos(a), 590 + r * Math.sin(a) * 0.8]);
      }
      this.dnPos = ACCIONES.map((a, i) => [390 + i * 100, 665]);
      // Conexiones: de dónde a dónde y qué actividad las enciende.
      this.vias = [
        { de: [300, 590], a: [175, 215], act: () => this._mediaPN() },
        { de: [300, 590], a: [345, 160], act: () => this._mediaPN(), curva: [250, 380] },
        { de: [345, 160], a: [560, 245], act: () => this._mediaKC() },
        { de: [175, 215], a: [640, 640], act: () => Math.abs(this.cerebro.lh), curva: [200, 520] },
        { de: [790, 230], a: [490, 640], act: () => Math.max(0, this.cerebro.valCentro) * 2, curva: [800, 520], color: '#4fe0b0' },
        { de: [790, 300], a: [690, 640], act: () => Math.max(0, -this.cerebro.valCentro) * 2, curva: [840, 520], color: '#ff6b6b' },
        { de: [80, 360], a: [440, 520], act: () => this._mediaOjo() },
        { de: [920, 360], a: [560, 520], act: () => this._mediaOjo() },
        { de: [500, 520], a: [490, 640], act: () => this.cerebro.rumbo.fuerza },
        { de: [580, 410], a: [610, 260], act: () => this.cerebro.dan.pam, color: '#4fe0b0' },
        { de: [620, 395], a: [560, 140], act: () => this.cerebro.dan.ppl1, color: '#ff6b6b', curva: [700, 300] },
        { de: [880, 120], a: [890, 640], act: () => this.cerebro.reloj, color: '#9b8cff', curva: [960, 400] }
      ];
    }

    _mediaPN() { let s = 0; for (let i = 0; i < N_PN; i += 1) { s += this.cerebro.pn[i]; } return Math.min(1, s / 5); }
    _mediaKC() { let s = 0; for (let i = 0; i < N_KC; i += 1) { s += this.cerebro.kc[i]; } return s / C.KC_ACTIVAS; }
    _mediaOjo() {
      const c = this.cerebro;
      let s = c.s.amenaza;
      for (let i = 0; i < N_EPG; i += 1) { s = Math.max(s, c.atr[i], c.rep[i]); }
      return Math.min(1, s);
    }

    ajustar() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.cv.width = Math.round(r.width * dpr);
      this.cv.height = Math.round(r.height * dpr);
      this.escala = Math.min(this.cv.width / 1000, this.cv.height / 720);
      // Letras de al menos ~10 px en pantalla, aunque el dibujo quede chico (celular).
      this.letra = Math.max(19, 10.5 / (this.escala / dpr));
      this.ox = (this.cv.width - 1000 * this.escala) / 2;
      this.oy = (this.cv.height - 720 * this.escala) / 2;
    }

    /** ¿Qué región hay en este punto de la pantalla? */
    regionEn(clientX, clientY) {
      const r = this.cv.getBoundingClientRect();
      const dpr = this.cv.width / r.width;
      const x = ((clientX - r.left) * dpr - this.ox) / this.escala;
      const y = ((clientY - r.top) * dpr - this.oy) / this.escala;
      let mejor = null;
      let dm = Infinity;
      for (const g of REGIONES) {
        const d = Math.hypot(g.x - x, g.y - y) / g.r;
        if (d < 1.25 && d < dm) { dm = d; mejor = g; }
        if (g.id === 'ojos') {
          const d2 = Math.hypot(920 - x, 360 - y) / g.r;
          if (d2 < 1.25 && d2 < dm) { dm = d2; mejor = g; }
        }
      }
      return mejor;
    }

    dibujar(dt, t) {
      const ctx = this.ctx;
      const c = this.cerebro;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(this.escala, 0, 0, this.escala, this.ox, this.oy);
      // Silueta del cerebro (dos hemisferios y los lóbulos ópticos).
      ctx.fillStyle = 'rgba(120, 150, 190, 0.07)';
      ctx.strokeStyle = 'rgba(140, 170, 210, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(500, 370, 340, 300, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const x of [80, 920]) {
        ctx.beginPath();
        ctx.ellipse(x, 360, 70, 150, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // Conexiones con señales que viajan.
      for (const v of this.vias) {
        const a = Math.min(1, v.act());
        const cx = v.curva ? v.curva[0] : (v.de[0] + v.a[0]) / 2;
        const cy = v.curva ? v.curva[1] : (v.de[1] + v.a[1]) / 2;
        ctx.strokeStyle = conAlfa(v.color || '#ffb547', 0.08 + a * 0.3);
        ctx.lineWidth = 2 + a * 3;
        ctx.beginPath();
        ctx.moveTo(v.de[0], v.de[1]);
        ctx.quadraticCurveTo(cx, cy, v.a[0], v.a[1]);
        ctx.stroke();
        v.ac = (v.ac || 0) + a * dt * 4;
        while (v.ac > 1) { v.ac -= 1; this.particulas.push({ v, p: 0, cx, cy }); }
      }
      for (let i = this.particulas.length - 1; i >= 0; i -= 1) {
        const q = this.particulas[i];
        q.p += dt * 0.9;
        if (q.p >= 1) { this.particulas.splice(i, 1); continue; }
        const u = q.p;
        const x = (1 - u) * (1 - u) * q.v.de[0] + 2 * (1 - u) * u * q.cx + u * u * q.v.a[0];
        const y = (1 - u) * (1 - u) * q.v.de[1] + 2 * (1 - u) * u * q.cy + u * u * q.v.a[1];
        ctx.fillStyle = q.v.color || '#ffd27a';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.particulas.length > 400) { this.particulas.splice(0, this.particulas.length - 400); }

      this._ojos(ctx, c);
      // Lóbulo antenal.
      for (let i = 0; i < N_PN; i += 1) {
        const [x, y] = this.pnPos[i];
        neurona(ctx, x, y, 9, c.pn[i], '#ffb547');
      }
      // Cuerno lateral.
      const lh = c.lh;
      blob(ctx, 175, 215, 48, Math.abs(lh), lh >= 0 ? '#4fe0b0' : '#ff6b6b');
      // Cáliz con las células de Kenyon.
      ctx.fillStyle = 'rgba(255, 181, 71, 0.05)';
      ctx.beginPath();
      ctx.ellipse(345, 160, 82, 68, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < N_KC; k += 1) {
        const [x, y] = this.kcPos[k];
        const a = c.kcVis[k];
        ctx.fillStyle = a > 0.05 ? 'rgba(255, 220, 140,' + (0.35 + a * 0.65) + ')' : 'rgba(150, 170, 200, 0.28)';
        ctx.beginPath();
        ctx.arc(x, y, a > 0.05 ? 3.6 + a * 2 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Pedúnculo y lóbulos: α vertical, β' y γ horizontales; color = valencia del compartimento.
      ctx.strokeStyle = 'rgba(255, 181, 71, 0.18)';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(400, 200);
      ctx.lineTo(540, 255);
      ctx.stroke();
      const comps = { gamma: [[530, 260], [600, 262]], beta: [[612, 262], [730, 262]], alfa: [[540, 245], [560, 120]] };
      for (const comp of COMPARTIMENTOS) {
        const v = c.mbon[comp.id];
        const [[x1, y1], [x2, y2]] = comps[comp.id];
        const col = v >= 0 ? '#4fe0b0' : '#ff6b6b';
        ctx.strokeStyle = conAlfa(col, 0.25 + Math.min(1, Math.abs(v) * 1.5) * 0.7);
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillStyle = '#e7edf3';
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(comp.id === 'gamma' ? 'γ' : (comp.id === 'beta' ? "β'" : 'α'), (x1 + x2) / 2 + (comp.id === 'alfa' ? 26 : 0), (y1 + y2) / 2 + (comp.id === 'alfa' ? 0 : 36));
      }
      // MBON acercarse / evitar.
      neurona(ctx, 790, 230, 16, Math.max(0, c.valCentro) * 2, '#4fe0b0');
      neurona(ctx, 790, 300, 16, Math.max(0, -c.valCentro) * 2, '#ff6b6b');
      // Dopamina.
      for (let i = 0; i < 4; i += 1) { neurona(ctx, 560 + i * 18, 410 + (i % 2) * 10, 7, c.dan.pam, '#4fe0b0'); }
      for (let i = 0; i < 3; i += 1) { neurona(ctx, 612 + i * 16, 382 + (i % 2) * 10, 7, c.dan.ppl1, '#ff6b6b'); }
      // Complejo central: el anillo y la flecha de la burbuja.
      for (let i = 0; i < N_EPG; i += 1) {
        const a = i * Math.PI * 2 / N_EPG - Math.PI / 2;
        neurona(ctx, 500 + Math.cos(a) * 58, 520 + Math.sin(a) * 42, 8, c.epg[i], '#ffb547');
      }
      if (c.rumbo.fuerza > 0.05) {
        const a = c.rumbo.ang - Math.PI / 2;
        ctx.strokeStyle = 'rgba(255, 210, 120,' + Math.min(1, c.rumbo.fuerza) + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(500, 520);
        ctx.lineTo(500 + Math.cos(a) * 40, 520 + Math.sin(a) * 30);
        ctx.stroke();
      }
      // Reloj.
      for (let i = 0; i < 4; i += 1) { neurona(ctx, 862 + (i % 2) * 34, 105 + Math.floor(i / 2) * 30, 9, c.reloj, '#9b8cff'); }
      // Descendentes.
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < ACCIONES.length; i += 1) {
        const [x, y] = this.dnPos[i];
        const gana = c.ganadora === i;
        neurona(ctx, x, y, gana ? 22 : 16, c.dn[i], gana ? '#ffd27a' : '#ffb547');
        ctx.font = '20px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
        ctx.fillText(EMOJI_ACCION[ACCIONES[i]], x, y + 1);
        ctx.font = (gana ? '700 ' : '500 ') + Math.round(this.letra * 0.9) + 'px system-ui, sans-serif';
        ctx.fillStyle = gana ? '#ffd27a' : 'rgba(231, 237, 243, 0.65)';
        if (gana || this.letra < 26) { ctx.fillText(ACCIONES[i], x, y + 22 + this.letra * 0.7); }
      }
      // Etiquetas.
      ctx.font = '600 ' + Math.round(this.letra) + 'px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(231, 237, 243, 0.8)';
      const etiquetas = [['lóbulo antenal', 225, 676], ['cuerno lateral', 175, 285], ['células de Kenyon', 345, 70],
        ['MBON', 790, 345], ['dopamina', 600, 448], ['brújula E-PG', 500, 590], ['reloj', 880, 175], ['ojo', 80, 540], ['ojo', 920, 540]];
      for (const [txt, x, y] of etiquetas) { ctx.fillText(txt, x, y); }
      if (this.sel) {
        ctx.strokeStyle = 'rgba(255, 210, 120, 0.9)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        for (const x of this.sel.id === 'ojos' ? [80, 920] : [this.sel.x]) {
          ctx.beginPath();
          ctx.arc(x, this.sel.y, this.sel.r + 10, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }

    _ojos(ctx, c) {
      // 16 sectores: a la derecha los que miran a la derecha de la mosca, a la izquierda los otros.
      for (let i = 0; i < N_EPG; i += 1) {
        const a = i * Math.PI * 2 / N_EPG;
        const derecha = Math.sin(a) >= 0;
        const k = derecha ? i : N_EPG - i;
        const y = 250 + (k / 8) * 220;
        const x = derecha ? 920 : 80;
        const bueno = c.atr[i];
        const malo = Math.max(c.rep[i], Math.abs(C.envolver(c.s.amenazaAng - a)) < 0.4 ? c.s.amenaza : 0);
        const luz = c.luz ? c.luz[i] : 0;
        const col = malo > bueno ? '#ff6b6b' : (bueno > luz ? '#4fe0b0' : '#fff2b0');
        neurona(ctx, x, y, 10, Math.max(bueno, malo, luz) * 1.5, col);
      }
    }
  }

  function neurona(ctx, x, y, r, a, color) {
    a = Math.max(0, Math.min(1, a || 0));
    if (a > 0.08) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
      g.addColorStop(0, conAlfa(color, 0.55 * a));
      g.addColorStop(1, conAlfa(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = a > 0.08 ? conAlfa(color, 0.35 + 0.65 * a) : 'rgba(120, 140, 170, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function blob(ctx, x, y, r, a, color) {
    ctx.fillStyle = conAlfa(color, 0.1 + Math.min(1, a) * 0.5);
    ctx.strokeStyle = conAlfa(color, 0.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.75, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // ================================================================================================ pantalla de trabajo
  /**
   * La pantalla de trabajo: los trabajos y las apps son botones de verdad (los tocas tú y los toca ella); la mosca se
   * dibuja en una capa transparente encima, que deja pasar tus toques.
   */
  class VistaPantalla {
    constructor(zona, canvas, pantalla) {
      this.zona = zona;
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.p = pantalla;
      this.els = new Map();
      this.ondas = [];
      this.cuentas = {};
      this.escala = 1;
      this.tInteres = 0;
      const APPS = raiz.MoscaPantalla.APPS;
      for (const a of pantalla.apps) {
        const info = APPS.find((x) => x.id === a.app);
        const b = zona.ownerDocument.createElement('button');
        b.type = 'button';
        b.className = 'os-app';
        b.dataset.widget = a.id;
        b.dataset.app = a.app;
        b.innerHTML = '<span class="os-icono">' + info.emoji + '</span><span class="os-nombre">' + info.nombre +
          '</span><small class="os-off">sin conectar</small><b class="os-badge" hidden>0</b>';
        b.setAttribute('aria-label', 'App ' + info.nombre);
        zona.insertBefore(b, canvas);
        this.els.set(a.id, b);
      }
      pantalla.on((ev) => this._alEvento(ev));
    }

    _alEvento(ev) {
      if (ev.tipo === 'toque-mosca') {
        this.ondas.push({ x: ev.x, y: ev.y, t: 0, color: '#ffd27a' });
        const el = this.els.get(ev.objetivo);
        if (el) {
          el.classList.add('tocado');
          setTimeout(() => el.classList.remove('tocado'), 260);
        }
      } else if (ev.tipo === 'trabajo') {
        this.ondas.push({ x: ev.x, y: ev.y, t: 0, color: ev.resultado === 'ignorado' ? '#8b98a8' : '#4fe0b0' });
        this.cuentas[ev.app] = (this.cuentas[ev.app] || 0) + 1;
        const b = this.els.get('app-' + ev.app);
        if (b) {
          const badge = b.querySelector('.os-badge');
          badge.hidden = false;
          badge.textContent = String(this.cuentas[ev.app]);
        }
      }
    }

    /** Apps sin salida configurada: se ven apagadas (lo que llegue ahí se queda en el archivo). */
    marcarApagadas(apagadas) {
      for (const a of this.p.apps) { this.els.get(a.id).classList.toggle('apagada', apagadas.indexOf(a.app) >= 0); }
    }

    ajustar() {
      const r = this.zona.getBoundingClientRect();
      if (!r.width || !r.height) { return null; }
      const win = this.zona.ownerDocument.defaultView || window;
      const dpr = Math.min(win.devicePixelRatio || 1, 2);
      this.cv.width = Math.round(r.width * dpr);
      this.cv.height = Math.round(r.height * dpr);
      const W = Math.max(480, Math.min(1000, r.width * 1.1));
      const H = W * r.height / r.width;
      this.escala = this.cv.width / W;
      return { W, H };
    }

    /** De coordenadas del mundo a la pantalla de verdad (para que el toque de la mosca caiga en el botón). */
    aCliente(x, y) {
      const r = this.zona.getBoundingClientRect();
      return { x: r.left + x / this.p.W * r.width, y: r.top + y / this.p.H * r.height };
    }

    _crearTrabajo(o) {
      const d = this.zona.ownerDocument;
      const t = o.trabajo;
      const b = d.createElement('button');
      b.type = 'button';
      b.className = 'os-trabajo';
      b.dataset.widget = o.id;
      b.style.setProperty('--c', colorOlor(t.olor));
      const olor = d.createElement('span');
      olor.className = 'os-olor';
      olor.textContent = '#' + t.olor;
      const fuente = d.createElement('span');
      fuente.className = 'os-fuente';
      fuente.textContent = t.fuente;
      const texto = d.createElement('span');
      texto.className = 'os-texto';
      texto.textContent = t.texto;
      const vida = d.createElement('i');
      vida.className = 'os-vida';
      b.append(olor, fuente, texto, vida);
      b.setAttribute('aria-label', 'Trabajo #' + t.olor + ': ' + t.texto);
      this.zona.insertBefore(b, this.cv);
      this.els.set(o.id, b);
      return b;
    }

    /** Texto del cartelito de la mosca en la pantalla. */
    _etiqueta(accion) {
      const p = this.p;
      if (p.carga) {
        const destino = raiz.MoscaPantalla.APPS.find((a) => a.id === p.destinoPara(p.carga.trabajo.olor));
        return accion === 'comer' ? '👆 tocando ' + destino.emoji : '✉️ #' + p.carga.trabajo.olor + ' → ' + destino.emoji;
      }
      if (accion === 'comer') { return '👆 agarrando'; }
      if (accion === 'acercarse') { return '➡️ va por un trabajo'; }
      if (accion === 'explorar') { return p.objetos.some((o) => o.tipo === 'carta') ? '🔎 mirando los trabajos' : '🔎 esperando trabajo'; }
      return EMOJI_ACCION[accion] + ' ' + TEXTO_ACCION[accion];
    }

    /** Pone cada botón donde está en el mundo (antes de un toque, para que el clic caiga en el botón correcto). */
    sincronizar(t) {
      const p = this.p;
      const W = p.W;
      const H = p.H;
      const vivos = new Set();
      for (const o of p.objetos) {
        vivos.add(o.id);
        const el = this.els.get(o.id) || this._crearTrabajo(o);
        const cargado = o === p.carga;
        const w = cargado ? o.w * 0.45 : o.w;
        const h = cargado ? o.h * 0.45 : o.h;
        el.style.left = ((o.x - w / 2) / W * 100) + '%';
        el.style.top = ((o.y - h / 2) / H * 100) + '%';
        el.style.width = (w / W * 100) + '%';
        el.style.height = (h / H * 100) + '%';
        if (o.tipo === 'carta') {
          el.classList.toggle('cargado', cargado);
          el.classList.toggle('elegido', p.elegido === o);
          el.style.transform = cargado ? 'rotate(' + (Math.sin(t * 4) * 6).toFixed(1) + 'deg)' : '';
          el.style.setProperty('--vida', cargado ? '1' : Math.max(0, o.vida / o.vida0).toFixed(3));
        }
      }
      for (const [id, el] of this.els) {
        if (!vivos.has(id)) { el.remove(); this.els.delete(id); }
      }
    }

    dibujar(dt, t) {
      const p = this.p;
      const W = p.W;
      this.sincronizar(t);
      // El brillo de cada botón: cuánto le interesa a la mosca ahora (lo que ve su cuerpo fungiforme).
      this.tInteres += dt;
      if (this.tInteres > 0.2) {
        this.tInteres = 0;
        for (const o of p.objetos) {
          const el = this.els.get(o.id);
          let v = 0;
          if (p.activo && ((o.tipo === 'app' && p.carga) || (o.tipo === 'carta' && !p.carga && o.olor))) {
            v = p.cerebro.valOlor.get(o.olor) || 0;
          }
          el.style.setProperty('--interes', Math.min(1, Math.max(0, v * 2.5)).toFixed(2));
        }
      }
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      ctx.setTransform(this.escala, 0, 0, this.escala, 0, 0);
      if (p.activo) {
        const r = p.mosca.rastro;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        for (let i = 2; i < r.length; i += 2) {
          ctx.strokeStyle = 'rgba(255, 181, 71,' + (0.18 * i / r.length) + ')';
          ctx.beginPath();
          ctx.moveTo(r[i - 2], r[i - 1]);
          ctx.lineTo(r[i], r[i + 1]);
          ctx.stroke();
        }
        const accion = p.cerebro.accion();
        moscaConEtiqueta(ctx, p.mosca, accion, t, this._etiqueta(accion), W);
      }
      for (let i = this.ondas.length - 1; i >= 0; i -= 1) {
        const o = this.ondas[i];
        o.t += dt;
        if (o.t > 0.7) { this.ondas.splice(i, 1); continue; }
        ctx.globalAlpha = 1 - o.t / 0.7;
        ctx.strokeStyle = o.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(o.x, o.y, 8 + o.t * 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  raiz.MoscaVista = { VistaArena, VistaCerebro, VistaPantalla, REGIONES, EMOJI_ACCION, TEXTO_ACCION, dibujarMosca, colorOlor };
})(window);
