/**
 * Mosca OS: la terminal (termosca). Muestra la shell con su prompt, historial (↑ ↓), autocompletar (TAB), Ctrl+C y una
 * fila de teclas extra como la de Termux, para el celular. Lo que hace la mosca en su pantalla también aparece aquí,
 * como comandos suyos: agarrar un trabajo es «cat», llevarlo a una app es «mv», ignorarlo es «rm».
 */
(function (raiz) {
  'use strict';

  const { nombreTrabajo, VERSION } = raiz.MoscaSistema;
  const MAX_LINEAS = 800;

  class Terminal {
    /** el: el contenedor (.terminal); shell: la Shell; pantalla: la pantalla de trabajo (para ver lo que hace la mosca). */
    constructor(el, shell, pantalla) {
      this.el = el;
      this.sh = shell;
      this.salida = el.querySelector('.term-salida');
      this.form = el.querySelector('.term-linea');
      this.input = el.querySelector('.term-input');
      this.promptEl = el.querySelector('.term-prompt');
      this.hIdx = null;
      this.borrador = '';
      this.vivo = null;
      this.ocupada = false;
      this.cadena = Promise.resolve();
      this.alCorrer = null;
      this._eventos();
      this._prompt();
      this.escribir('Mosca OS ' + VERSION + ' · mosh, la shell de la mosca', 'tenue');
      this.escribir('escribe «ayuda» · prueba: neofetch · top · ls ~/bandeja · cat LEEME.txt', 'tenue');
      pantalla.on((ev) => this._alMosca(ev));
    }

    _el(tag, clase, texto) {
      const d = this.el.ownerDocument.createElement(tag);
      if (clase) { d.className = clase; }
      if (texto != null) { d.textContent = texto; }
      return d;
    }

    _alFondo() { return this.salida.scrollHeight - this.salida.scrollTop - this.salida.clientHeight < 40; }

    _agregar(nodo) {
      const abajo = this._alFondo();
      this.salida.appendChild(nodo);
      while (this.salida.childNodes.length > MAX_LINEAS) { this.salida.removeChild(this.salida.firstChild); }
      if (abajo) { this.salida.scrollTop = this.salida.scrollHeight; }
    }

    /** Agrega texto a la salida. clase: '' | 'error' | 'nota' | 'tenue' | 'de-mosca'. */
    escribir(texto, clase) {
      texto = String(texto == null ? '' : texto).replace(/\n$/, '');
      this._agregar(this._el('div', 'tl ' + (clase || ''), texto));
    }

    /** Una línea de comando con su prompt (tuyo o de la mosca). */
    lineaPrompt(cmd, quien, comentario) {
      const d = this._el('div', 'tl cmd' + (quien === 'mosca' ? ' de-mosca' : ''));
      d.append(this._el('span', 'term-u', quien === 'mosca' ? '🪰 mosca@moscaos' : 'tu@moscaos'),
        this._el('span', 'term-r', ':' + (quien === 'mosca' ? '~' : this.sh.corto())), this._el('span', 'term-s', '$ '),
        this._el('span', '', cmd));
      if (comentario) { d.append(this._el('span', 'term-com', '  # ' + comentario)); }
      this._agregar(d);
    }

    _prompt() {
      this.promptEl.replaceChildren(this._el('span', 'term-u', 'tu@moscaos'), this._el('span', 'term-r', ':' + this.sh.corto()),
        this._el('span', 'term-s', '$'));
    }

    _eventos() {
      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const l = this.input.value;
        this.input.value = '';
        this.hIdx = null;
        if (this.vivo) { this.detenerVivo(); if (!l.trim()) { return; } }
        this.correr(l);
      });
      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); this.historia(-1); } else if (e.key === 'ArrowDown') { e.preventDefault(); this.historia(1); } else if (e.key === 'Tab') {
          e.preventDefault();
          this.completar();
        } else if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
          e.preventDefault();
          this.ctrlC();
        } else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
          e.preventDefault();
          this.salida.replaceChildren();
        } else if (this.vivo && (e.key === 'q' || e.key === 'Escape') && !this.input.value) {
          e.preventDefault();
          this.detenerVivo();
        }
      });
      this.salida.addEventListener('click', () => {
        const sel = this.el.ownerDocument.getSelection();
        if (!sel || !sel.toString()) { this.input.focus({ preventScroll: true }); }
      });
      for (const b of this.el.querySelectorAll('[data-tecla]')) {
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => this.tecla(b.dataset.tecla));
      }
    }

    /** Las teclas extra (como en Termux). */
    tecla(t) {
      if (t === 'tab') { this.completar(); } else if (t === 'arriba') { this.historia(-1); } else if (t === 'abajo') { this.historia(1); } else if (t === 'ctrl-c') {
        this.ctrlC();
      } else if (t === 'esc') {
        if (this.vivo) { this.detenerVivo(); } else { this.input.value = ''; }
      } else {
        const i = this.input.selectionStart == null ? this.input.value.length : this.input.selectionStart;
        const j = this.input.selectionEnd == null ? i : this.input.selectionEnd;
        this.input.value = this.input.value.slice(0, i) + t + this.input.value.slice(j);
        this.input.setSelectionRange(i + t.length, i + t.length);
      }
      this.input.focus({ preventScroll: true });
    }

    historia(dir) {
      const h = this.sh.historia;
      if (!h.length) { return; }
      if (this.hIdx == null) {
        if (dir > 0) { return; }
        this.borrador = this.input.value;
        this.hIdx = h.length - 1;
      } else {
        this.hIdx += dir;
      }
      if (this.hIdx < 0) { this.hIdx = 0; }
      if (this.hIdx >= h.length) {
        this.hIdx = null;
        this.input.value = this.borrador;
        return;
      }
      this.input.value = h[this.hIdx];
      const n = this.input.value.length;
      setTimeout(() => this.input.setSelectionRange(n, n), 0);
    }

    completar() {
      const r = this.sh.completar(this.input.value);
      this.input.value = r.linea;
      if (r.opciones.length) {
        this.lineaPrompt(r.linea, 'tu');
        this.escribir(r.opciones.join('   '), 'tenue');
      }
    }

    ctrlC() {
      if (this.vivo) { this.detenerVivo(); }
      if (this.ocupada) { this.sh.cancelar(); }
      this.lineaPrompt(this.input.value + '^C', 'tu');
      this.input.value = '';
    }

    /** Corre una línea (en orden: si otra sigue corriendo, espera su turno). */
    correr(l) {
      this.lineaPrompt(l, 'tu');
      this.cadena = this.cadena.then(() => this._correr(l));
      return this.cadena;
    }

    async _correr(l) {
      this.ocupada = true;
      this.el.classList.add('ocupada');
      let r;
      try {
        r = await this.sh.ejecutar(l);
      } catch (e) {
        r = { out: '', err: 'mosh: ' + e.message + '\n', nota: '', code: 1 };
      }
      this.ocupada = false;
      this.el.classList.remove('ocupada');
      if (r.limpiar) { this.salida.replaceChildren(); }
      if (r.out) { this.escribir(r.out, ''); }
      if (r.nota) { this.escribir(r.nota, 'nota'); }
      if (r.err) { this.escribir(r.err, 'error'); }
      if (r.vivo) { this.iniciarVivo(r.vivo); }
      this._prompt();
      if (this.alCorrer) { this.alCorrer(l, r); }
      return r;
    }

    /** Un comando que se refresca solo (top) hasta q, Esc, Ctrl+C o Enter. */
    iniciarVivo(v) {
      const d = this._el('pre', 'tl vivo');
      this._agregar(d);
      const pintar = () => {
        d.textContent = v.pintar();
        this.salida.scrollTop = this.salida.scrollHeight;
      };
      pintar();
      this.vivo = { d, id: setInterval(pintar, v.cada || 500) };
    }

    detenerVivo() {
      if (!this.vivo) { return; }
      clearInterval(this.vivo.id);
      this.vivo = null;
    }

    _alMosca(ev) {
      if (!this.sh.logMosca) { return; }
      if (ev.tipo === 'trabajo-llega') {
        this.escribir('📨 nuevo: ~/bandeja/' + nombreTrabajo(ev.trabajo) + '  (de ' + ev.trabajo.fuente + ')', 'tenue');
      } else if (ev.tipo === 'agarra') {
        this.lineaPrompt('cat ~/bandeja/' + nombreTrabajo(ev.trabajo), 'mosca', 'lo agarró con la trompa');
      } else if (ev.tipo === 'trabajo' && ev.quien === 'mosca') {
        const f = '~/bandeja/' + nombreTrabajo(ev.trabajo);
        if (ev.resultado === 'ignorado') {
          this.lineaPrompt('rm ' + f, 'mosca', ev.motivo);
        } else {
          this.lineaPrompt('mv ' + f + ' /apps/' + ev.app, 'mosca', 'le gustaba ' + ev.valencia.toFixed(2));
        }
      } else if (ev.tipo === 'trabajo' && ev.quien === 'tu' && !this.ocupada) {
        this.lineaPrompt('mv ~/bandeja/' + nombreTrabajo(ev.trabajo) + ' /apps/' + ev.app, 'tu', 'con el dedo: aprendió mirándote');
      }
    }
  }

  raiz.MoscaTerminal = Terminal;
})(window);
