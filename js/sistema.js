/**
 * Mosca OS: el sistema. Un sistema de archivos y una shell («mosh»), como un Linux de bolsillo dentro del navegador
 * (al estilo de Termux), conectados a la mosca:
 *
 *   ~/bandeja/     sus trabajos pendientes son archivos. Crear uno = mandarle un trabajo;
 *                  mv a /apps/x = llevarlo tú ahí (y ella aprende mirándote); rm = a la papelera.
 *   /apps/         sus apps son dispositivos: echo hola > /apps/celular te manda una notificación.
 *   /proc/mosca/   su cerebro en vivo: estado, neuronas, valencias, rutas, memoria.
 *   /var/log/      lo que hizo (mosca.log) y lo que corrió solo (cada.log).
 *
 * No es Linux: no hay kernel ni programas de verdad. Es una shell hecha para la mosca, con los comandos de siempre
 * (tuberías, redirecciones, variables, comodines), que vive en esta página y se guarda en este dispositivo.
 * Funciona igual en Node, para las pruebas: todo lo de afuera llega por el objeto «entorno».
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) { module.exports = fabrica(); } else { raiz.MoscaSistema = fabrica(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HOME = '/home/mosca';
  const LIMITE = 400 * 1024;
  const VERSION = '2.0';
  const APPS = ['celular', 'discord', 'webhook', 'avisos', 'archivo', 'papelera'];
  const EMOJI_APP = { celular: '📱', discord: '💬', webhook: '🔗', avisos: '🔔', archivo: '🗂️', papelera: '🗑️' };

  const LEEME = [
    'Bienvenido a Mosca OS.',
    '',
    'Esta terminal es una shell hecha para la mosca (mosh). No es Linux: no hay kernel ni',
    'programas de verdad, pero tiene los comandos de siempre y vive en tu dispositivo.',
    'Y está conectada a ella:',
    '',
    '  ~/bandeja/      sus trabajos pendientes son archivos',
    '                  echo "Llegó un pedido" > ~/bandeja/ventas.txt   le llega un trabajo #ventas',
    '                  mv ~/bandeja/ventas-ab12.txt /apps/celular        lo llevas tú (aprende mirándote)',
    '  /apps/          sus apps son dispositivos',
    '                  echo hola > /apps/celular                         notificación a tu celular',
    '  /proc/mosca/    su cerebro en vivo:  cat /proc/mosca/estado',
    '  /var/log/       lo que hizo:  tail /var/log/mosca.log',
    '',
    'Prueba:  neofetch · top · ls ~/bandeja · ruta ventas celular',
    '         cada 10m curl -s https://... > ~/bandeja/datos.txt',
    'Escribe «ayuda» para ver todos los comandos.',
    ''
  ].join('\n');

  const FORTUNAS = [
    'Thomas Hunt Morgan ganó el Nobel de 1933 por descubrir, con moscas de la fruta, que los genes están en los cromosomas.',
    'Los genes del reloj biológico (period, timeless) se descubrieron en Drosophila: Nobel de Medicina 2017.',
    'Cerca de tres cuartas partes de los genes ligados a enfermedades humanas tienen un pariente en la mosca.',
    'En 2024, FlyWire publicó el mapa completo del cerebro de una mosca adulta: unas 140 000 neuronas.',
    'Los genes Hox, que ordenan el cuerpo de cabeza a cola, se estudiaron primero en moscas: Nobel 1995.',
    'Una mosca de la fruta vive unas siete semanas a 25 °C.',
    'Cada célula de Kenyon recibe de unas pocas neuronas del lóbulo antenal: por eso cada olor deja una huella distinta.',
    'Las moscas también duermen: de noche se quedan quietas y cuesta más despertarlas.'
  ];

  function error(msg) { return new Error(msg); }
  function hhmm(t) {
    const d = new Date(t);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function barra(x, n) {
    const k = Math.max(0, Math.min(n, Math.round(x * n)));
    return '█'.repeat(k) + '░'.repeat(n - k);
  }
  const pct = (x) => Math.round(Math.max(0, Math.min(1, x)) * 100) + ' %';
  const num = (x) => (x >= 0 ? '+' : '') + x.toFixed(2);

  /** Nombre de archivo de un trabajo en ~/bandeja: ventas-ab12.txt */
  function nombreTrabajo(t) { return t.olor + '-' + String(t.id).slice(-4) + '.txt'; }

  // ================================================================================================ archivos
  function arbolInicial() {
    const m = Date.now();
    return {
      '/': { t: 'd', m }, '/home': { t: 'd', m }, [HOME]: { t: 'd', m }, '/etc': { t: 'd', m }, '/tmp': { t: 'd', m },
      [HOME + '/LEEME.txt']: { t: 'f', c: LEEME, m },
      '/etc/hostname': { t: 'f', c: 'moscaos\n', m }
    };
  }

  class SistemaArchivos {
    /** nodos: lo guardado ({ ruta: { t: 'd' | 'f', c, m } }); sin nada, arranca con el árbol inicial. */
    constructor(nodos) {
      this.nodos = nodos && nodos['/'] ? nodos : arbolInicial();
      this.montajes = [];
      this.alCambiar = null;
    }

    /**
     * Monta un directorio virtual. h: { tipo(sub), listar(), leer(sub), escribir(sub, texto, agregar), borrar(sub),
     * mover?(sub, destino) }. Todos opcionales menos tipo y listar; lo que falta, no se puede.
     */
    montar(ruta, h) {
      this.montajes.push({ ruta, h });
      this.montajes.sort((a, b) => b.ruta.length - a.ruta.length);
    }

    resolver(ruta, cwd) {
      if (ruta == null || ruta === '') { return cwd || '/'; }
      const partes = (ruta[0] === '/' ? ruta : (cwd || '/') + '/' + ruta).split('/');
      const pila = [];
      for (const p of partes) {
        if (!p || p === '.') { continue; }
        if (p === '..') { pila.pop(); } else { pila.push(p); }
      }
      return '/' + pila.join('/');
    }

    _montaje(r) {
      for (const m of this.montajes) {
        if (r === m.ruta) { return { m, sub: '' }; }
        if (r.startsWith(m.ruta + '/')) { return { m, sub: r.slice(m.ruta.length + 1) }; }
      }
      return null;
    }

    /** 'd' (directorio), 'f' (archivo), 'dev' (dispositivo) o null. */
    tipo(r) {
      const mt = this._montaje(r);
      if (mt) { return mt.sub === '' ? 'd' : (mt.sub.indexOf('/') >= 0 ? null : mt.m.h.tipo(mt.sub)); }
      if (this.nodos[r]) { return this.nodos[r].t; }
      if (this.montajes.some((m) => m.ruta.startsWith(r === '/' ? '/' : r + '/'))) { return 'd'; }
      return null;
    }

    listar(r) {
      const mt = this._montaje(r);
      if (mt) {
        if (mt.sub !== '') { throw error('no es un directorio'); }
        return mt.m.h.listar().map((x) => Object.assign({ m: Date.now() }, x));
      }
      if (this.tipo(r) !== 'd') { throw error(this.tipo(r) ? 'no es un directorio' : 'no existe'); }
      const pref = r === '/' ? '/' : r + '/';
      const vistos = new Map();
      for (const k of Object.keys(this.nodos)) {
        if (k === r || !k.startsWith(pref)) { continue; }
        const resto = k.slice(pref.length);
        if (resto.indexOf('/') >= 0) { continue; }
        const n = this.nodos[k];
        vistos.set(resto, { nombre: resto, tipo: n.t, tam: n.t === 'f' ? n.c.length : 0, m: n.m });
      }
      for (const m of this.montajes) {
        if (!m.ruta.startsWith(pref)) { continue; }
        const primero = m.ruta.slice(pref.length).split('/')[0];
        if (!vistos.has(primero)) { vistos.set(primero, { nombre: primero, tipo: 'd', tam: 0, m: Date.now() }); }
      }
      return Array.from(vistos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    }

    leer(r) {
      const mt = this._montaje(r);
      if (mt) {
        if (mt.sub === '') { throw error('es un directorio'); }
        const c = mt.m.h.leer ? mt.m.h.leer(mt.sub) : null;
        if (c == null) { throw error('no existe'); }
        return c;
      }
      const n = this.nodos[r];
      if (!n) { throw error(this.tipo(r) === 'd' ? 'es un directorio' : 'no existe'); }
      if (n.t === 'd') { throw error('es un directorio'); }
      return n.c;
    }

    /** Escribe (o agrega). En un dispositivo puede devolver una promesa con un mensaje («📱 enviado»). */
    escribir(r, texto, agregar) {
      const mt = this._montaje(r);
      if (mt) {
        if (mt.sub === '' || !mt.m.h.escribir) { throw error('no se puede escribir ahí'); }
        return mt.m.h.escribir(mt.sub, String(texto), agregar);
      }
      const n = this.nodos[r];
      if (n && n.t === 'd') { throw error('es un directorio'); }
      const padre = this.resolver('..', r);
      if (this._montaje(padre) || !this.nodos[padre] || this.nodos[padre].t !== 'd') { throw error('no existe la carpeta ' + padre); }
      const c = (agregar && n ? n.c : '') + String(texto);
      if (this.tamano() - (n ? n.c.length : 0) + c.length > LIMITE) { throw error('no hay espacio (el disco de la mosca tiene 400 KB)'); }
      this.nodos[r] = { t: 'f', c, m: Date.now() };
      this._cambio();
      return '';
    }

    mkdir(r, padres) {
      if (this.tipo(r)) {
        if (padres && this.tipo(r) === 'd') { return; }
        throw error('ya existe');
      }
      if (this._montaje(r)) { throw error('no se puede crear ahí'); }
      const padre = this.resolver('..', r);
      if (!this.tipo(padre)) {
        if (!padres) { throw error('no existe la carpeta ' + padre); }
        this.mkdir(padre, true);
      }
      if (this.tipo(padre) !== 'd' || this._montaje(padre)) { throw error('no se puede crear ahí'); }
      this.nodos[r] = { t: 'd', m: Date.now() };
      this._cambio();
    }

    borrar(r, recursivo) {
      const mt = this._montaje(r);
      if (mt) {
        if (mt.sub === '' || !mt.m.h.borrar) { throw error('no se puede borrar'); }
        return mt.m.h.borrar(mt.sub);
      }
      const n = this.nodos[r];
      if (!n) { throw error('no existe'); }
      if (r === '/' || r === HOME) { throw error('mejor no: es su casa'); }
      if (n.t === 'd') {
        const hijos = Object.keys(this.nodos).filter((k) => k.startsWith(r + '/'));
        if (hijos.length && !recursivo) { throw error('la carpeta no está vacía (usa rm -r)'); }
        for (const k of hijos) { delete this.nodos[k]; }
      }
      delete this.nodos[r];
      this._cambio();
      return '';
    }

    /** Mover: si el origen es un montaje que sabe mover (la bandeja), decide él; si no, copiar y borrar. */
    async mover(a, b) {
      const mt = this._montaje(a);
      if (mt && mt.sub && mt.m.h.mover) {
        const r = await mt.m.h.mover(mt.sub, b);
        if (r != null) { return r; }
      }
      const msg = await this.escribir(b, this.leer(a), false);
      await this.borrar(a, false);
      return msg;
    }

    tamano() {
      let t = 0;
      for (const k of Object.keys(this.nodos)) { if (this.nodos[k].t === 'f') { t += this.nodos[k].c.length; } }
      return t;
    }

    _cambio() { if (this.alCambiar) { this.alCambiar(); } }
  }

  // ================================================================================================ la shell
  /** Corta una línea en palabras y operadores (| ; && || > >>), con comillas, \escapes, $VARIABLES y ~. */
  function lexer(linea, env) {
    const toks = [];
    let i = 0;
    let pal = null;
    let glob = false;
    const cerrar = () => {
      if (pal !== null) { toks.push({ t: 'pal', v: pal, glob }); pal = null; glob = false; }
    };
    const agregar = (s) => { pal = (pal || '') + s; };
    const variable = () => {
      let j = i + 1;
      if (linea[j] === '?') { i = j + 1; return String(env['?'] || 0); }
      if (linea[j] === '{') {
        const k = linea.indexOf('}', j);
        if (k > 0) { i = k + 1; return env[linea.slice(j + 1, k)] == null ? '' : String(env[linea.slice(j + 1, k)]); }
      }
      let n = '';
      while (j < linea.length && /[A-Za-z0-9_]/.test(linea[j])) { n += linea[j]; j += 1; }
      if (!n) { i += 1; return '$'; }
      i = j;
      return env[n] == null ? '' : String(env[n]);
    };
    while (i < linea.length) {
      const ch = linea[i];
      if (ch === ' ' || ch === '\t') { cerrar(); i += 1; continue; }
      if (ch === "'") {
        const k = linea.indexOf("'", i + 1);
        if (k < 0) { throw error("falta cerrar la comilla '"); }
        agregar(linea.slice(i + 1, k));
        i = k + 1;
        continue;
      }
      if (ch === '"') {
        let s = '';
        i += 1;
        while (i < linea.length && linea[i] !== '"') {
          if (linea[i] === '\\' && i + 1 < linea.length && '"\\$'.indexOf(linea[i + 1]) >= 0) { s += linea[i + 1]; i += 2; continue; }
          if (linea[i] === '$') { s += variable(); continue; }
          s += linea[i];
          i += 1;
        }
        if (i >= linea.length) { throw error('falta cerrar la comilla "'); }
        agregar(s);
        i += 1;
        continue;
      }
      if (ch === '\\') { if (i + 1 < linea.length) { agregar(linea[i + 1]); } i += 2; continue; }
      if (ch === '|' || ch === ';' || ch === '>' || (ch === '&' && linea[i + 1] === '&')) {
        cerrar();
        const dos = linea.slice(i, i + 2);
        if (dos === '||' || dos === '&&' || dos === '>>') { toks.push({ t: 'op', v: dos }); i += 2; } else { toks.push({ t: 'op', v: ch }); i += 1; }
        continue;
      }
      if (ch === '$') { agregar(variable()); continue; }
      if (ch === '~' && pal === null && (i + 1 === linea.length || linea[i + 1] === '/' || linea[i + 1] === ' ')) {
        agregar(env.HOME || HOME);
        i += 1;
        continue;
      }
      if (ch === '*' || ch === '?') { glob = true; }
      agregar(ch);
      i += 1;
    }
    cerrar();
    return toks;
  }

  /** Palabras y operadores → [{ con: null | ';' | '&&' | '||', tub: [{ args, redir }] }] */
  function analizar(toks) {
    const sec = [];
    let tub = [];
    let cmd = { args: [], redir: null };
    let con = null;
    const finCmd = (antesDe) => {
      if (cmd.args.length || cmd.redir) { tub.push(cmd); } else if (antesDe === '|' || tub.length) { throw error('falta un comando junto a |'); }
      cmd = { args: [], redir: null };
    };
    const finTub = (sig) => {
      finCmd(null);
      if (tub.length) { sec.push({ con, tub }); } else if (sig && sig !== ';') { throw error('falta un comando antes de ' + sig); }
      tub = [];
      con = sig;
    };
    for (let k = 0; k < toks.length; k += 1) {
      const t = toks[k];
      if (t.t === 'pal') { cmd.args.push(t); continue; }
      if (t.v === '>' || t.v === '>>') {
        const d = toks[k + 1];
        if (!d || d.t !== 'pal') { throw error('falta el archivo después de ' + t.v); }
        cmd.redir = { modo: t.v, destino: d.v };
        k += 1;
        continue;
      }
      if (t.v === '|') {
        if (!cmd.args.length) { throw error('falta un comando antes de |'); }
        finCmd('|');
        continue;
      }
      finTub(t.v);
    }
    if (!cmd.args.length && !cmd.redir && tub.length) { throw error('falta un comando después de |'); }
    finTub(null);
    return sec;
  }

  /**
   * Separa las banderas cortas (-la) del resto. valores: las letras que llevan un valor (-n 5, -n5); con «#», -5
   * también vale como -n 5 (head, tail).
   */
  function opciones(args, valores) {
    valores = valores || '';
    const b = {};
    const resto = [];
    let fin = false;
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (fin || a.length < 2 || a[0] !== '-') { resto.push(a); continue; }
      if (a === '--') { fin = true; continue; }
      if (/^-\d+$/.test(a)) {
        if (valores.indexOf('#') >= 0) { b.n = a.slice(1); } else { resto.push(a); }
        continue;
      }
      for (let j = 1; j < a.length; j += 1) {
        const f = a[j];
        if (valores.indexOf(f) >= 0) {
          b[f] = a.slice(j + 1) || args[i + 1];
          if (!a.slice(j + 1)) { i += 1; }
          break;
        }
        b[f] = true;
      }
    }
    return { b, resto };
  }

  function lineas(t) {
    const l = String(t).split('\n');
    if (l.length && l[l.length - 1] === '') { l.pop(); }
    return l;
  }
  const unir = (l) => (l.length ? l.join('\n') + '\n' : '');

  // ------------------------------------------------------------------------------------------------ comandos
  /** Lee los archivos dados (o la entrada, si no hay). */
  async function entrada(c, rutas) {
    if (!rutas.length) { return { texto: c.stdin, err: '' }; }
    let texto = '';
    let err = '';
    for (const r of rutas) {
      try { texto += c.fs.leer(c.sh.ruta(r)); } catch (e) { err += c.nombre + ': ' + r + ': ' + e.message + '\n'; }
    }
    return { texto, err };
  }

  const COMANDOS = {
    ayuda: { ayuda: 'esta lista (ayuda <comando> para más)', uso: 'ayuda [comando]', fn(c) {
      if (c.args[0]) {
        const d = COMANDOS[ALIAS[c.args[0]] || c.args[0]];
        if (!d) { return { err: 'ayuda: no conozco «' + c.args[0] + '»\n', code: 1 }; }
        return unir([d.uso + '  —  ' + d.ayuda].concat(d.mas || []));
      }
      const grupos = [
        ['Archivos', 'ls cd pwd cat echo touch mkdir rm cp mv tee'],
        ['Texto', 'head tail grep wc sort uniq seq'],
        ['La mosca', 'mosca trabajo ruta top neofetch fortuna'],
        ['Copiloto', 'haz'],
        ['El teléfono', 'nexus'],
        ['Red', 'curl ntfy'],
        ['Sistema', 'ps kill free uptime date cada sh env export history clear whoami uname sleep']
      ];
      const l = ['Mosca OS ' + VERSION + ' · mosh, la shell de la mosca', ''];
      for (const [g, cmds] of grupos) {
        l.push(g + ':');
        for (const n of cmds.split(' ')) { l.push('  ' + n.padEnd(9) + COMANDOS[n].ayuda); }
      }
      l.push('', 'Tuberías y más:  cmd | cmd   cmd > archivo   cmd >> archivo   cmd && cmd   cmd ; cmd   $VAR   *.txt');
      return unir(l);
    } },
    ls: { ayuda: 'lista archivos', uso: 'ls [-l] [-a] [ruta…]', fn(c) {
      const { b, resto } = opciones(c.args);
      const rutas = resto.length ? resto : ['.'];
      const out = [];
      let err = '';
      for (const r0 of rutas) {
        const r = c.sh.ruta(r0);
        const t = c.fs.tipo(r);
        if (!t) { err += 'ls: ' + r0 + ': no existe\n'; continue; }
        let items = t === 'd' ? c.fs.listar(r) : [{ nombre: r0, tipo: t, tam: t === 'f' ? c.fs.leer(r).length : 0, m: Date.now() }];
        if (!b.a) { items = items.filter((x) => x.nombre[0] !== '.'); }
        if (rutas.length > 1 && t === 'd') { out.push(r0 + ':'); }
        if (b.l) {
          for (const x of items) {
            const tipo = x.tipo === 'd' ? 'd' : (x.tipo === 'dev' ? 'c' : '-');
            const tam = x.tipo === 'f' ? (x.tam > 1024 ? (x.tam / 1024).toFixed(1) + 'K' : String(x.tam)) : '-';
            out.push(tipo + (x.tipo === 'dev' ? 'rw--' : 'rw-r') + '  ' + tam.padStart(6) + '  ' + hhmm(x.m) + '  ' + x.nombre + (x.tipo === 'd' ? '/' : ''));
          }
        } else if (items.length) {
          out.push(items.map((x) => x.nombre + (x.tipo === 'd' ? '/' : '')).join('  '));
        }
      }
      return { out: unir(out), err, code: err ? 1 : 0 };
    } },
    cd: { ayuda: 'cambia de carpeta', uso: 'cd [ruta | - | ~]', fn(c) {
      const dest = c.args[0] === '-' ? (c.sh.env.OLDPWD || HOME) : c.sh.ruta(c.args[0] || HOME);
      if (c.fs.tipo(dest) !== 'd') { return { err: 'cd: ' + (c.args[0] || '') + ': ' + (c.fs.tipo(dest) ? 'no es una carpeta' : 'no existe') + '\n', code: 1 }; }
      c.sh.env.OLDPWD = c.sh.cwd;
      c.sh.cwd = dest;
      return '';
    } },
    pwd: { ayuda: 'muestra dónde estás', uso: 'pwd', fn: (c) => c.sh.cwd + '\n' },
    cat: { ayuda: 'muestra archivos', uso: 'cat [archivo…]', async fn(c) {
      const r = await entrada(c, c.args);
      return { out: r.texto, err: r.err, code: r.err ? 1 : 0 };
    } },
    echo: { ayuda: 'escribe texto', uso: 'echo [-n] texto…', fn(c) {
      const n = c.args[0] === '-n';
      return (n ? c.args.slice(1) : c.args).join(' ') + (n ? '' : '\n');
    } },
    touch: { ayuda: 'crea un archivo vacío', uso: 'touch archivo…', async fn(c) {
      let notas = '';
      for (const a of c.args) {
        const r = c.sh.ruta(a);
        if (c.fs.tipo(r) === 'f') { c.fs.nodos[r].m = Date.now(); continue; }
        if (!c.fs.tipo(r)) { notas += await c.fs.escribir(r, '', false) || ''; }
      }
      return { out: '', nota: notas };
    } },
    mkdir: { ayuda: 'crea carpetas', uso: 'mkdir [-p] carpeta…', fn(c) {
      const { b, resto } = opciones(c.args);
      for (const a of resto) { c.fs.mkdir(c.sh.ruta(a), !!b.p); }
      return '';
    } },
    rm: { ayuda: 'borra (en ~/bandeja: lo manda a la papelera)', uso: 'rm [-r] [-f] archivo…', async fn(c) {
      const { b, resto } = opciones(c.args);
      let err = '';
      let notas = '';
      for (const a of resto) {
        try { notas += (await c.fs.borrar(c.sh.ruta(a), !!b.r)) || ''; } catch (e) { if (!b.f) { err += 'rm: ' + a + ': ' + e.message + '\n'; } }
      }
      return { out: '', err, nota: notas, code: err ? 1 : 0 };
    } },
    cp: { ayuda: 'copia', uso: 'cp origen destino', async fn(c) {
      if (c.args.length < 2) { throw error('uso: cp origen destino'); }
      const a = c.sh.ruta(c.args[0]);
      let d = c.sh.ruta(c.args[1]);
      if (c.fs.tipo(d) === 'd') { d = d + '/' + a.split('/').pop(); }
      return { out: '', nota: (await c.fs.escribir(d, c.fs.leer(a), false)) || '' };
    } },
    mv: { ayuda: 'mueve o renombra (de ~/bandeja a /apps/x: lo llevas tú)', uso: 'mv origen destino', async fn(c) {
      if (c.args.length < 2) { throw error('uso: mv origen destino'); }
      const a = c.sh.ruta(c.args[0]);
      if (!c.fs.tipo(a)) { throw error(c.args[0] + ': no existe'); }
      let d = c.sh.ruta(c.args[1]);
      if (c.fs.tipo(d) === 'd' && !d.startsWith('/apps')) { d = d + '/' + a.split('/').pop(); }
      return { out: '', nota: (await c.fs.mover(a, d)) || '' };
    } },
    tee: { ayuda: 'copia la entrada a un archivo y la deja pasar', uso: 'tee [-a] archivo', async fn(c) {
      const { b, resto } = opciones(c.args);
      let nota = '';
      for (const a of resto) { nota += (await c.fs.escribir(c.sh.ruta(a), c.stdin, !!b.a)) || ''; }
      return { out: c.stdin, nota };
    } },
    head: { ayuda: 'las primeras líneas', uso: 'head [-n N] [archivo]', async fn(c) {
      const { b, resto } = opciones(c.args, 'n#');
      const n = parseInt(b.n || 10, 10);
      const r = await entrada(c, resto);
      return { out: unir(lineas(r.texto).slice(0, n)), err: r.err };
    } },
    tail: { ayuda: 'las últimas líneas', uso: 'tail [-n N] [archivo]', async fn(c) {
      const { b, resto } = opciones(c.args, 'n#');
      const n = parseInt(b.n || 10, 10);
      const r = await entrada(c, resto);
      return { out: unir(lineas(r.texto).slice(-n)), err: r.err };
    } },
    grep: { ayuda: 'busca líneas', uso: 'grep [-i] [-v] [-c] [-n] patrón [archivo…]', async fn(c) {
      const { b, resto } = opciones(c.args);
      if (!resto.length) { throw error('falta el patrón'); }
      let re;
      try { re = new RegExp(resto[0], b.i ? 'i' : ''); } catch (e) { re = new RegExp(resto[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), b.i ? 'i' : ''); }
      const r = await entrada(c, resto.slice(1));
      const l = lineas(r.texto).map((t, i) => [t, i + 1]).filter(([t]) => re.test(t) !== !!b.v);
      const out = b.c ? String(l.length) + '\n' : unir(l.map(([t, i]) => (b.n ? i + ':' : '') + t));
      return { out, err: r.err, code: l.length ? 0 : 1 };
    } },
    wc: { ayuda: 'cuenta líneas, palabras y letras', uso: 'wc [-l] [-w] [-c] [archivo]', async fn(c) {
      const { b, resto } = opciones(c.args);
      const r = await entrada(c, resto);
      const l = lineas(r.texto).length;
      const w = r.texto.split(/\s+/).filter(Boolean).length;
      const ch = r.texto.length;
      if (b.l) { return l + '\n'; }
      if (b.w) { return w + '\n'; }
      if (b.c) { return ch + '\n'; }
      return l + ' ' + w + ' ' + ch + '\n';
    } },
    sort: { ayuda: 'ordena líneas', uso: 'sort [-r] [-n] [archivo]', async fn(c) {
      const { b, resto } = opciones(c.args);
      const r = await entrada(c, resto);
      const l = lineas(r.texto).sort(b.n ? (x, y) => parseFloat(x) - parseFloat(y) : (x, y) => x.localeCompare(y));
      return unir(b.r ? l.reverse() : l);
    } },
    uniq: { ayuda: 'quita repetidas seguidas', uso: 'uniq [-c] [archivo]', async fn(c) {
      const { b, resto } = opciones(c.args);
      const r = await entrada(c, resto);
      const out = [];
      for (const t of lineas(r.texto)) {
        if (out.length && out[out.length - 1][0] === t) { out[out.length - 1][1] += 1; } else { out.push([t, 1]); }
      }
      return unir(out.map(([t, n]) => (b.c ? String(n).padStart(4) + ' ' : '') + t));
    } },
    seq: { ayuda: 'números en fila', uso: 'seq [desde] hasta', fn(c) {
      const a = c.args.length > 1 ? parseInt(c.args[0], 10) : 1;
      const z = parseInt(c.args[c.args.length - 1], 10);
      if (isNaN(a) || isNaN(z) || Math.abs(z - a) > 10000) { throw error('números del 1 al 10000'); }
      const l = [];
      for (let i = a; a <= z ? i <= z : i >= z; i += a <= z ? 1 : -1) { l.push(String(i)); }
      return unir(l);
    } },
    date: { ayuda: 'fecha y hora (y la de la mosca)', uso: 'date', fn(c) {
      const h = c.ent.hora ? c.ent.hora() : null;
      const mosca = h == null ? 'siempre despierta' : String(Math.floor(h * 24)).padStart(2, '0') + ':' + String(Math.floor(h * 1440) % 60).padStart(2, '0');
      return new Date().toLocaleString('es') + '   (en el día de la mosca: ' + mosca + ')\n';
    } },
    clear: { ayuda: 'limpia la pantalla', uso: 'clear', fn: () => ({ out: '', limpiar: true }) },
    history: { ayuda: 'lo que escribiste', uso: 'history', fn: (c) => unir(c.sh.historia.map((h, i) => String(i + 1).padStart(4) + '  ' + h)) },
    whoami: { ayuda: 'quién eres', uso: 'whoami', fn: (c) => c.sh.env.USER + '\n' },
    uname: { ayuda: 'qué sistema es', uso: 'uname [-a]', fn: (c) => (c.args[0] === '-a' ? 'MoscaOS moscaos ' + VERSION + ' drosophila-283n mosh\n' : 'MoscaOS\n') },
    env: { ayuda: 'variables', uso: 'env', fn: (c) => unir(Object.keys(c.sh.env).sort().map((k) => k + '=' + c.sh.env[k])) },
    export: { ayuda: 'define una variable', uso: 'export NOMBRE=valor', fn(c) {
      for (const a of c.args) {
        const m = /^([A-Za-z_]\w*)=(.*)$/.exec(a);
        if (!m) { throw error('uso: export NOMBRE=valor'); }
        c.sh.env[m[1]] = m[2];
      }
      return '';
    } },
    unset: { ayuda: 'borra una variable', uso: 'unset NOMBRE', fn(c) { for (const a of c.args) { delete c.sh.env[a]; } return ''; } },
    sleep: { ayuda: 'espera unos segundos', uso: 'sleep N', async fn(c) {
      const n = Math.min(600, Math.max(0, parseFloat(c.args[0]) || 0));
      const fin = Date.now() + n * 1000;
      while (Date.now() < fin) {
        if (c.sh.cancelado) { return { out: '', code: 130 }; }
        await new Promise((r) => setTimeout(r, Math.min(100, fin - Date.now())));
      }
      return '';
    } },
    true: { ayuda: 'no hace nada, bien', uso: 'true', fn: () => '' },
    false: { ayuda: 'no hace nada, mal', uso: 'false', fn: () => ({ out: '', code: 1 }) },
    which: { ayuda: 'qué es un comando', uso: 'which comando', fn(c) {
      return unir(c.args.map((a) => (COMANDOS[a] || ALIAS[a] ? '/bin/' + a : a + ': no existe')));
    } },
    sh: { ayuda: 'corre un guion (una orden por línea)', uso: 'sh archivo', async fn(c) {
      if (!c.args[0]) { throw error('uso: sh archivo'); }
      let out = '';
      let err = '';
      let code = 0;
      for (const l of lineas(c.fs.leer(c.sh.ruta(c.args[0])))) {
        if (!l.trim() || l.trim()[0] === '#') { continue; }
        if (l.trim() === 'exit') { break; }
        const r = await c.sh.ejecutar(l, { fondo: true });
        out += r.out;
        err += r.err;
        code = r.code;
        if (c.sh.cancelado) { break; }
      }
      return { out, err, code };
    } },

    // -------------------------------------------------------------------------------------------- la mosca
    mosca: { ayuda: 'habla con la mosca', uso: 'mosca [estado | trabajar | laboratorio | premio | castigo | ruta … | rutas | velocidad N | nombre X | log on|off]',
      mas: ['  estado              cómo está (lo mismo que cat /proc/mosca/estado)',
        '  trabajar            que vaya a su pantalla de trabajo',
        '  laboratorio         que vuelva al laboratorio',
        '  premio | castigo    gota de azúcar o descarga (en el laboratorio)',
        '  ruta OLOR APP       enséñale adónde va un tema (igual que «ruta»)',
        '  rutas               adónde llevaría hoy cada tema',
        '  velocidad N         0 = pausa, 1 = normal, hasta 20',
        '  nombre X            cambiarle el nombre',
        '  log on | off        ver (o no) lo que hace en esta terminal'],
      fn(c) {
        const [sub, ...resto] = c.args;
        const e = c.ent;
        switch (sub || 'estado') {
          case 'estado': return estado(e);
          case 'trabajar': e.mudarA('pantalla'); return '💼 se fue a trabajar a su pantalla\n';
          case 'laboratorio': e.mudarA('lab'); return '🧪 volvió al laboratorio\n';
          case 'premio':
          case 'castigo':
            if (!e[sub]()) { return { err: 'mosca: está trabajando; el premio y el castigo son en el laboratorio\n', code: 1 }; }
            return (sub === 'premio' ? '🍬' : '⚡') + ' hecho\n';
          case 'ruta': return COMANDOS.ruta.fn(Object.assign({}, c, { args: resto }));
          case 'rutas': return rutas(e);
          case 'velocidad': e.velocidad(parseFloat(resto[0])); return 'velocidad ' + (parseFloat(resto[0]) || 0) + '×\n';
          case 'nombre':
            if (!resto.length) { return e.nombre() + '\n'; }
            e.cambiarNombre(resto.join(' '));
            return 'ahora se llama ' + e.nombre() + '\n';
          case 'log':
            c.sh.logMosca = resto[0] !== 'off';
            return 'log de la mosca ' + (c.sh.logMosca ? 'encendido' : 'apagado') + '\n';
          default: return { err: 'mosca: no sé «' + sub + '» (ayuda mosca)\n', code: 1 };
        }
      } },
    trabajo: { ayuda: 'le manda un trabajo (#etiqueta texto)', uso: 'trabajo #etiqueta texto…', fn(c) {
      const texto = c.args.join(' ').trim() || c.stdin.trim();
      if (!texto) { throw error('uso: trabajo #etiqueta texto'); }
      return c.ent.trabajo(texto) + '\n';
    } },
    ruta: { ayuda: 'enséñale adónde va un tema', uso: 'ruta [OLOR APP]', fn(c) {
      if (!c.args.length) { return rutas(c.ent); }
      const [olor, app] = c.args;
      if (APPS.indexOf(app) < 0) { throw error('las apps son: ' + APPS.join(', ')); }
      const antes = c.ent.pantalla.valorRuta(olor, app);
      c.ent.ensenarRuta(olor, app);
      const despues = c.ent.pantalla.valorRuta(olor, app);
      return 'aprendió: #' + c.ent.normalizar(olor) + ' → ' + EMOJI_APP[app] + ' ' + app + '  (' + antes.toFixed(2) + ' → ' + despues.toFixed(2) + ')\n';
    } },
    top: { ayuda: 'sus neuronas en vivo (q para salir)', uso: 'top', fn: (c) => ({ out: '', vivo: { cada: 500, pintar: () => top(c.ent) } }) },
    neofetch: { ayuda: 'el sistema, con estilo', uso: 'neofetch', fn: (c) => neofetch(c.ent, c.sh) },
    fortuna: { ayuda: 'un dato de moscas', uso: 'fortuna', fn: () => FORTUNAS[Math.floor(Math.random() * FORTUNAS.length)] + '\n' },
    ps: { ayuda: 'qué está corriendo', uso: 'ps', fn(c) {
      const l = ['  PID  PROCESO              ESTADO'];
      for (const p of procesos(c)) { l.push(String(p.pid).padStart(5) + '  ' + p.nombre.padEnd(20) + ' ' + p.estado); }
      return unir(l);
    } },
    kill: { ayuda: 'detiene un proceso', uso: 'kill PID', fn(c) {
      const pid = parseInt(c.args[0], 10);
      if (pid === 1 || pid === 2) { return { err: 'kill: no se puede: sin cerebro (o sin cuerpo) no hay mosca 🪰\n', code: 1 }; }
      if (pid >= 100) {
        const i = c.sh.tareas.findIndex((t) => t.pid === pid);
        if (i < 0) { return { err: 'kill: ' + c.args[0] + ': no existe\n', code: 1 }; }
        c.sh.tareas.splice(i, 1);
        c.sh.guardarTareas();
        return '';
      }
      if (!c.ent.matar || !c.ent.matar(pid)) { return { err: 'kill: ' + c.args[0] + ': no existe\n', code: 1 }; }
      return '';
    } },
    free: { ayuda: 'su memoria (corta, media y larga)', uso: 'free', fn: (c) => memoria(c.ent) },
    uptime: { ayuda: 'desde cuándo', uso: 'uptime', fn(c) {
      const min = Math.floor((Date.now() - c.sh.inicio) / 60000);
      return 'arriba hace ' + (min < 60 ? min + ' min' : Math.floor(min / 60) + ' h ' + (min % 60) + ' min') + ' · 283 neuronas · ' + c.ent.cerebro.accion() + '\n';
    } },
    cada: { ayuda: 'repite una orden sola (como cron)', uso: 'cada [INTERVALO orden… | -d PID]',
      mas: ['  cada 10m curl -s https://… > ~/bandeja/precio.txt   cada 10 minutos le llega un trabajo',
        '  cada 30s echo hola >> ~/notas.txt                     intervalos: 10s mínimo, s, m o h',
        '  cada                                                   lista las tareas',
        '  cada -d 101                                            borra la tarea 101 (o kill 101)',
        'Corren mientras Mosca OS esté abierto. Su salida queda en /var/log/cada.log.'],
      fn(c) {
        const sh = c.sh;
        if (!c.args.length) {
          if (!sh.tareas.length) { return 'no hay tareas (ayuda cada)\n'; }
          return unir(sh.tareas.map((t) => String(t.pid).padStart(5) + '  cada ' + t.cada.padEnd(5) + ' ' + t.orden));
        }
        if (c.args[0] === '-d' || c.args[0] === 'borrar') {
          return COMANDOS.kill.fn(Object.assign({}, c, { args: [c.args[1]] }));
        }
        return sh.nuevaTarea(c.args[0], c.args.slice(1).map(citar).join(' '));
      } },
    curl: { ayuda: 'trae algo de internet', uso: 'curl [-s] [-X MÉTODO] [-H "K: V"] [-d datos] URL', async fn(c) {
      const { b, resto } = opciones(c.args, 'XHd');
      const url = resto[0];
      if (!url || !/^https?:\/\//i.test(url)) { throw error('falta una URL http(s)'); }
      const op = { method: b.X || (b.d != null ? 'POST' : 'GET'), headers: {} };
      if (b.H) { const m = /^([^:]+):\s*(.*)$/.exec(b.H); if (m) { op.headers[m[1]] = m[2]; } }
      if (b.d != null) { op.body = b.d === '@-' ? c.stdin : b.d; }
      let r;
      try { r = await c.ent.fetch(url, op); } catch (e) { throw error('no se pudo: sin red, o ese sitio no deja que una página lo lea (CORS)'); }
      let texto = await r.text();
      if (texto.length > 100000) { texto = texto.slice(0, 100000) + '\n…(cortado en 100 KB)'; }
      return { out: texto + (texto.endsWith('\n') ? '' : '\n'), err: r.ok || b.s ? '' : 'curl: el servidor respondió ' + r.status + '\n', code: r.ok ? 0 : 22 };
    } },
    ntfy: { ayuda: 'manda una notificación por ntfy', uso: 'ntfy [-t canal] mensaje…', async fn(c) {
      const { b, resto } = opciones(c.args, 't');
      const tema = b.t || c.ent.temaSalida();
      if (!/^[\w-]{1,64}$/.test(tema)) { throw error('ese canal no vale (letras, números y guiones)'); }
      const texto = resto.join(' ') || c.stdin.trim();
      if (!texto) { throw error('uso: ntfy [-t canal] mensaje'); }
      await c.ent.ntfy(tema, texto);
      return '🔔 enviado a ntfy.sh/' + tema + '\n';
    } },
    haz: { ayuda: 'dile en español qué hacer (copiloto)', uso: 'haz una orden en español…',
      mas: ['  haz cada mañana mándame el precio de bitcoin',
        '  haz manda hola a discord · haz las facturas van al webhook',
        '  haz cuánta batería tengo · haz qué tengo pendiente',
        'El copiloto traduce lo que dices a comandos y los corre. No ejecuta nada sin mostrártelo.'],
      async fn(c) {
        const texto = c.args.join(' ').trim() || c.stdin.trim();
        if (!texto) { return 'dime qué hacer, p. ej.:  haz manda hola a discord\n'; }
        if (!c.ent.copiloto) { return { err: 'el copiloto no está disponible aquí\n', code: 1 }; }
        const r = await c.ent.copiloto(texto, c.ent);
        if (!r || r.ok === false) { return '🤖 ' + ((r && r.pregunta) || 'no te entendí') + '\n'; }
        let out = r.di ? '🤖 ' + r.di + '\n' : '';
        let err = '';
        let code = 0;
        for (const cmd of (r.comandos || [])) {
          out += '$ ' + cmd + '\n';
          const rr = await c.sh.ejecutar(cmd, { fondo: true });
          out += rr.out;
          out += rr.nota ? rr.nota : '';
          err += rr.err;
          code = rr.code;
          if (c.sh.cancelado) { break; }
        }
        return { out, err, code };
      } },
    nexus: { ayuda: 'controla el teléfono (nexus-ctl)', uso: 'nexus bateria|ubicacion|red|vibrar|copiar TEXTO|pegar|compartir TEXTO|despierta on|off',
      mas: ['En el navegador uso las APIs de tu teléfono (con tu permiso):',
        '  bateria · ubicacion · red · vibrar · copiar TEXTO · pegar · compartir TEXTO · despierta on|off',
        'Lo que pide el núcleo nativo Mosca OS (Shizuku/Accesibilidad), aquí solo se anuncia:',
        '  tocar X Y · escribir TEXTO · abrir APP · notifs · apps',
        'Ver ARQUITECTURA-NATIVA.md (misma orden, web y nativo).'],
      async fn(c) {
        const d = c.ent.dispositivo;
        if (!d) { return { err: 'nexus: el puente del teléfono no está disponible aquí\n', code: 1 }; }
        const sub = (c.args[0] || 'estado').toLowerCase();
        const resto = c.args.slice(1).join(' ') || c.stdin.trim();
        const nativo = (q) => ({ out: '⚠️ ' + q + ' lo cumple Mosca OS nativo (nexus-ctl con Shizuku/Accesibilidad). En el navegador no se puede tocar otras apps.\nVer ARQUITECTURA-NATIVA.md\n', code: 0 });
        try {
          switch (sub) {
            case 'estado': return 'nexus-ctl · el puente al teléfono\n' +
              'web (ya funciona): bateria ubicacion red vibrar copiar pegar compartir despierta\n' +
              'núcleo nativo: tocar escribir abrir notifs apps  (ver ARQUITECTURA-NATIVA.md)\n';
            case 'bateria': return (await d.bateria()) + '\n';
            case 'ubicacion': case 'ubicación': return (await d.ubicacion()) + '\n';
            case 'red': return (await d.red()) + '\n';
            case 'vibrar': return (await d.vibrar(resto)) + '\n';
            case 'copiar': if (!resto) { throw error('uso: nexus copiar TEXTO'); } return (await d.copiar(resto)) + '\n';
            case 'pegar': return (await d.pegar()) + '\n';
            case 'compartir': if (!resto) { throw error('uso: nexus compartir TEXTO'); } return (await d.compartir(resto)) + '\n';
            case 'despierta': return (await d.despierta(resto !== 'off' && resto !== '0')) + '\n';
            case 'tocar': case 'escribir': case 'abrir': case 'notifs': case 'notificaciones': case 'apps':
              return d.nativo ? ((await d.nativo(sub, resto)) + '\n') : nativo('«nexus ' + sub + '»');
            default: return { err: 'nexus: no sé «' + sub + '» (ayuda nexus)\n', code: 1 };
          }
        } catch (e) { return { err: 'nexus ' + sub + ': ' + e.message + '\n', code: 1 }; }
      } },
    sudo: { ayuda: 'no hay', uso: 'sudo', fn: () => ({ err: '🪰 En Mosca OS no hay superusuario: aquí manda la dopamina.\n', code: 1 }) },
    exit: { ayuda: 'sale del modo app', uso: 'exit', fn(c) {
      if (c.ent.salir && c.ent.salir()) { return 'chao 👋\n'; }
      return 'no hay de dónde salir: la mosca sigue aquí 🪰\n';
    } },
    editor: { ayuda: 'no hay editor', uso: 'nano', fn: (c) => ({ err: c.nombre + ': no hay editor de texto. Usa  echo "línea" >> archivo  y  cat archivo\n', code: 1 }) },
    pkg: { ayuda: 'no instala paquetes', uso: 'pkg', fn: () => '📦 Mosca OS no instala paquetes: todos sus comandos ya vienen adentro (escribe «ayuda»).\n' },
    nolinux: { ayuda: 'no está', uso: 'python', fn: (c) => ({ err: c.nombre + ': no está. Mosca OS no es un Linux de verdad: es una shell hecha para la mosca.\n', code: 127 }) }
  };
  const ALIAS = { help: 'ayuda', man: 'ayuda', ll: 'ls', dir: 'ls', cls: 'clear', type: 'which', nano: 'editor', vim: 'editor',
    vi: 'editor', emacs: 'editor', apt: 'pkg', 'apt-get': 'pkg', python: 'nolinux', python3: 'nolinux', node: 'nolinux',
    bash: 'nolinux', zsh: 'nolinux', git: 'nolinux', ssh: 'nolinux', crontab: 'cada', cron: 'cada', fortune: 'fortuna', copiloto: 'haz', ia: 'haz', tel: 'nexus', 'nexus-ctl': 'nexus' };
  const OCULTOS = ['editor', 'nolinux'];

  function citar(a) { return /[\s|;&>'"$]/.test(a) ? "'" + a.replace(/'/g, "'\\''") + "'" : a; }

  // Autocompletar subcomandos (índice = qué argumento se está escribiendo).
  const SUBCOMP = {
    nexus: { 1: ['bateria', 'ubicacion', 'red', 'vibrar', 'copiar', 'pegar', 'compartir', 'despierta', 'tocar', 'escribir', 'abrir', 'notifs'] },
    mosca: { 1: ['estado', 'trabajar', 'laboratorio', 'premio', 'castigo', 'ruta', 'rutas', 'velocidad', 'nombre', 'log'] },
    ruta: { 2: APPS.slice() }
  };

  function intervalo(s) {
    const m = /^(\d+(?:\.\d+)?)(s|m|h)$/.exec(String(s || ''));
    if (!m) { return 0; }
    const ms = parseFloat(m[1]) * { s: 1000, m: 60000, h: 3600000 }[m[2]];
    return ms >= 10000 ? ms : 0;
  }

  // ------------------------------------------------------------------------------------------------ lo que muestra
  function estado(e) {
    const c = e.cerebro;
    const p = e.pantalla;
    const h = e.hora ? e.hora() : null;
    const l = ['🪰 ' + e.nombre() + ' · ' + (e.lugar() === 'pantalla' ? 'en su pantalla de trabajo' : 'en el laboratorio') + ' · ' + c.accion(),
      'hambre ' + pct(c.interno.hambre) + ' · sueño ' + pct(c.sueno) + ' · susto ' + pct(c.interno.susto) +
        (h == null ? '' : ' · hora ' + String(Math.floor(h * 24)).padStart(2, '0') + ':' + String(Math.floor(h * 1440) % 60).padStart(2, '0'))];
    if (p.carga) {
      const o = p.carga.trabajo.olor;
      const d = p.destinoPara(o);
      l.push('lleva: #' + o + ' → ' + EMOJI_APP[d] + ' ' + d + ' (' + p.valorRuta(o, d).toFixed(2) + ')');
    }
    l.push('pendientes: ' + p.pendientes().length + ' · hechos: ' + (p.stats.hechos + p.stats.ignorados) + ' · neuronas: 283');
    return unir(l);
  }

  function rutas(e) {
    const l = ['TEMA                 VA A          VALOR   (2.ª opción)'];
    for (const o of e.olores()) {
      if (['fruta', 'menta', 'canela', 'humo'].indexOf(o) >= 0) { continue; }
      const vals = APPS.map((a) => [a, e.pantalla.valorRuta(o, a)]).sort((x, y) => y[1] - x[1]);
      l.push(('#' + o).padEnd(20) + ' ' + (EMOJI_APP[vals[0][0]] + ' ' + vals[0][0]).padEnd(13) + ' ' + vals[0][1].toFixed(2).padStart(5) +
        '   ' + vals[1][0] + ' ' + vals[1][1].toFixed(2));
    }
    if (l.length === 1) { l.push('(todavía no conoce ningún tema: mándale un trabajo o usa «ruta ventas celular»)'); }
    return unir(l);
  }

  function top(e) {
    const c = e.cerebro;
    const ACC = ['explorar', 'acercarse', 'comer', 'huir', 'acicalarse', 'descansar'];
    const ahora = new Date();
    let kc = 0;
    for (let i = 0; i < c.kc.length; i += 1) { kc += c.kc[i]; }
    const l = ['top · ' + hhmm(ahora) + ' · 🪰 ' + e.nombre() + ' · ' + (e.lugar() === 'pantalla' ? 'en su pantalla' : 'en el laboratorio'),
      'hambre ' + barra(c.interno.hambre, 8) + ' ' + pct(c.interno.hambre).padStart(5) + '  sueño ' + barra(c.sueno, 8) + ' ' + pct(c.sueno).padStart(5),
      '',
      'PID NEURONA      ACTIVIDAD'];
    ACC.forEach((a, i) => {
      l.push(String(i + 1).padStart(3) + ' ' + a.padEnd(12) + ' ' + barra(c.dn[i], 8) + ' ' + c.dn[i].toFixed(2) + (c.ganadora === i ? ' ◀' : ''));
    });
    l.push('', 'Kenyon activas ' + kc + '/200 · olor ' + num(c.valCentro + c.lh),
      'brújula ' + Math.round(c.rumbo.ang * 180 / Math.PI) + '° (' + c.rumbo.fuerza.toFixed(2) + ')');
    const p = e.pantalla;
    if (p.carga) { l.push('lleva #' + p.carga.trabajo.olor + ' → ' + EMOJI_APP[p.destinoPara(p.carga.trabajo.olor)]); }
    l.push('(q o Ctrl+C para salir)');
    return l.join('\n');
  }

  function memoria(e) {
    const c = e.cerebro;
    const COMP = [['gamma', 'γ corta', '~1 min'], ['beta', "β' media", '~30 min'], ['alfa', 'α larga', '~1 día']];
    const l = ['              ' + COMP.map((x) => x[1].padStart(10)).join(''),
      'olvida en     ' + COMP.map((x) => x[2].padStart(10)).join('')];
    const aprendidas = COMP.map(([id]) => {
      const m = c.mem[id];
      let n = 0;
      for (let k = 0; k < m.a.length; k += 1) { if (Math.abs(m.a[k] - 1) > 0.05 || Math.abs(m.e[k] - 1) > 0.05) { n += 1; } }
      return n;
    });
    l.push('sinapsis      ' + COMP.map(() => '400'.padStart(10)).join(''));
    l.push('aprendidas    ' + aprendidas.map((n) => (n + ' KC').padStart(10)).join(''));
    return unir(l);
  }

  function neofetch(e, sh) {
    const c = e.cerebro;
    const arte = [
      '   \\\\      //   ',
      '    \\\\_  _//    ',
      '   ( ●(  )● )   ',
      '  <==(    )==>  ',
      '    //(  )\\\\    ',
      '   //  \\/  \\\\   ',
      '                ',
      '                ',
      '                '
    ];
    const min = Math.floor((Date.now() - sh.inicio) / 60000);
    const datos = [
      sh.env.USER + '@moscaos',
      '-----------',
      'OS: Mosca OS ' + VERSION + ' (Drosophila melanogaster)',
      'Kernel: cuerpo fungiforme · 200 células de Kenyon',
      'Shell: mosh · Terminal: termosca',
      'Neuronas: 283 (la mosca real: ~140 000)',
      'Memoria: γ 1 min · β\' 30 min · α 1 día',
      'Batería: ' + pct(1 - c.interno.hambre) + ' (hambre ' + pct(c.interno.hambre) + ')',
      'Lugar: ' + (e.lugar() === 'pantalla' ? 'pantalla de trabajo' : 'laboratorio') + ' · ' + c.accion() + ' · arriba ' + min + ' min'
    ];
    return unir(arte.map((a, i) => a + '  ' + (datos[i] || '')));
  }

  function procesos(c) {
    const e = c.ent;
    const l = [{ pid: 1, nombre: 'cerebro', estado: '283 neuronas · ' + e.cerebro.accion() },
      { pid: 2, nombre: 'cuerpo', estado: e.lugar() === 'pantalla' ? 'en su pantalla de trabajo' : 'en el laboratorio' }];
    for (const p of (e.procesos ? e.procesos() : [])) { l.push(p); }
    for (const t of c.sh.tareas) { l.push({ pid: t.pid, nombre: 'cada ' + t.cada, estado: t.orden }); }
    return l;
  }

  // ================================================================================================ la shell
  class Shell {
    /**
     * fs: el SistemaArchivos. ent (entorno): lo de afuera — cerebro, pantalla, nombre(), lugar(), hora(), mudarA(),
     * trabajo(texto), ensenarRuta(olor, app), normalizar(olor), olores(), fetch(), ntfy(tema, texto), temaSalida(),
     * velocidad(v), premio(), castigo(), cambiarNombre(n), procesos(), matar(pid), salir().
     */
    constructor(fs, ent) {
      this.fs = fs;
      this.ent = ent || {};
      this.cwd = HOME;
      this.env = { HOME, USER: 'tu', HOSTNAME: 'moscaos', SHELL: '/bin/mosh', PATH: '/bin', TERM: 'termosca' };
      this.historia = [];
      this.ultimo = 0;
      this.tareas = [];
      this.logCada = [];
      this.inicio = Date.now();
      this.cancelado = false;
      this.logMosca = true;
      this._cargarTareas();
    }

    ruta(r) { return this.fs.resolver(r, this.cwd); }

    /** La ruta corta para el prompt (~ en vez de /home/mosca). */
    corto(r) {
      r = r || this.cwd;
      if (r === HOME) { return '~'; }
      return r.startsWith(HOME + '/') ? '~' + r.slice(HOME.length) : r;
    }

    cancelar() { this.cancelado = true; }

    /** Corre una línea. Devuelve { out, err, nota, code, limpiar, vivo }. */
    async ejecutar(linea, op) {
      linea = String(linea == null ? '' : linea).trim();
      if (!(op && op.fondo)) { this.cancelado = false; }
      if (!linea || linea[0] === '#') { return { out: '', err: '', nota: '', code: 0 }; }
      if (!(op && op.fondo)) {
        if (this.historia[this.historia.length - 1] !== linea) { this.historia.push(linea); }
        if (this.historia.length > 300) { this.historia.shift(); }
      }
      // «cada 10m orden…»: la orden se guarda tal cual, con sus | y > (se interpreta cada vez que corre).
      const cada = /^(?:cada|cron|crontab)\s+(\d+(?:\.\d+)?[smh])\s+(.+)$/.exec(linea);
      if (cada) {
        try {
          this.ultimo = 0;
          return { out: this.nuevaTarea(cada[1], cada[2].trim()), err: '', nota: '', code: 0 };
        } catch (e) {
          this.ultimo = 1;
          return { out: '', err: 'cada: ' + e.message + '\n', nota: '', code: 1 };
        }
      }
      let sec;
      try {
        sec = analizar(lexer(linea, Object.assign({}, this.env, { '?': this.ultimo })));
      } catch (e) {
        this.ultimo = 2;
        return { out: '', err: 'mosh: ' + e.message + '\n', nota: '', code: 2 };
      }
      const res = { out: '', err: '', nota: '', code: 0 };
      for (const s of sec) {
        if (s.con === '&&' && res.code !== 0) { continue; }
        if (s.con === '||' && res.code === 0) { continue; }
        const r = await this._tuberia(s.tub);
        res.out += r.out;
        res.err += r.err;
        res.nota += r.nota;
        res.code = r.code;
        if (r.limpiar) { res.limpiar = true; res.out = ''; }
        if (r.vivo) { res.vivo = r.vivo; }
        if (this.cancelado) { break; }
      }
      this.ultimo = res.code;
      return res;
    }

    async _tuberia(cmds) {
      let stdin = '';
      const acum = { out: '', err: '', nota: '', code: 0 };
      for (let i = 0; i < cmds.length; i += 1) {
        const r = await this._comando(cmds[i], stdin);
        acum.err += r.err || '';
        acum.nota += r.nota || '';
        acum.code = r.code || 0;
        if (r.limpiar) { acum.limpiar = true; }
        if (r.vivo) { acum.vivo = r.vivo; }
        let out = r.out || '';
        if (cmds[i].redir) {
          try {
            const msg = await this.fs.escribir(this.ruta(cmds[i].redir.destino), out, cmds[i].redir.modo === '>>');
            if (msg) { acum.nota += msg + (msg.endsWith('\n') ? '' : '\n'); }
          } catch (e) {
            acum.err += 'mosh: ' + cmds[i].redir.destino + ': ' + e.message + '\n';
            acum.code = 1;
          }
          out = '';
        }
        stdin = out;
        if (i === cmds.length - 1) { acum.out = out; }
      }
      return acum;
    }

    _glob(patron) {
      try {
        const corte = patron.lastIndexOf('/');
        const dir = corte >= 0 ? patron.slice(0, corte) || '/' : '.';
        const base = corte >= 0 ? patron.slice(corte + 1) : patron;
        if (/[*?]/.test(dir)) { return [patron]; }
        const re = new RegExp('^' + base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        const items = this.fs.listar(this.ruta(dir)).map((x) => x.nombre).filter((n) => re.test(n) && (n[0] !== '.' || base[0] === '.'));
        if (!items.length) { return [patron]; }
        return items.map((n) => (corte >= 0 ? patron.slice(0, corte + 1) : '') + n);
      } catch (e) {
        return [patron];
      }
    }

    async _comando(cmd, stdin) {
      const args = [];
      for (const a of cmd.args) { if (a.glob) { args.push(...this._glob(a.v)); } else { args.push(a.v); } }
      if (!args.length) { return { out: '' }; }
      const asignacion = /^([A-Za-z_]\w*)=(.*)$/.exec(args[0]);
      if (asignacion && args.length === 1) { this.env[asignacion[1]] = asignacion[2]; return { out: '' }; }
      const nombre = args[0];
      const def = COMANDOS[nombre] && OCULTOS.indexOf(nombre) < 0 ? COMANDOS[nombre] : COMANDOS[ALIAS[nombre]];
      if (!def) {
        // Si parece lenguaje natural (varias palabras o acentos), sugiere el copiloto.
        const pista = (args.length > 1 || /[áéíóúñ¿¡]/i.test(nombre)) ? ' ¿Hablarle normal? prueba:  haz ' + args.join(' ') : ' (escribe «ayuda»)';
        return { out: '', err: 'mosh: ' + nombre + ': no existe ese comando.' + pista + '\n', code: 127 };
      }
      const extra = nombre === 'll' ? ['-l'] : [];
      try {
        const r = await def.fn({ args: extra.concat(args.slice(1)), stdin, sh: this, fs: this.fs, ent: this.ent, nombre });
        if (typeof r === 'string') { return { out: r, code: 0 }; }
        return Object.assign({ out: '', err: '', nota: '', code: r.err ? (r.code || 1) : (r.code || 0) }, r);
      } catch (e) {
        return { out: '', err: nombre + ': ' + e.message + '\n', code: 1 };
      }
    }

    /** Autocompletar: comandos al principio, rutas después. Devuelve { linea, opciones }. */
    completar(linea) {
      const m = /(^|\s)(\S*)$/.exec(linea);
      const pal = m ? m[2] : '';
      const antes = linea.slice(0, linea.length - pal.length);
      const esPrimera = !antes.trim() || /[|;&]\s*$/.test(antes);
      let ops;
      if (esPrimera) {
        ops = Object.keys(COMANDOS).concat(Object.keys(ALIAS)).filter((n) => OCULTOS.indexOf(n) < 0 && n.startsWith(pal)).sort();
        ops = ops.map((n) => n + ' ');
      } else {
        // Subcomandos conocidos (nexus, mosca, ruta…): antes de buscar archivos.
        const toks = antes.trim().split(/\s+/);
        const cmd0 = ALIAS[toks[0]] || toks[0];
        const sub = SUBCOMP[cmd0] && SUBCOMP[cmd0][toks.length];
        ops = sub ? sub.filter((n) => n.startsWith(pal)).map((n) => n + ' ') : null;
        if (!ops || !ops.length) {
          const exp = pal.replace(/^~(?=\/|$)/, HOME);
          const corte = exp.lastIndexOf('/');
          const dir = corte >= 0 ? exp.slice(0, corte) || '/' : '.';
          const base = corte >= 0 ? exp.slice(corte + 1) : exp;
          try {
            ops = this.fs.listar(this.ruta(dir)).filter((x) => x.nombre.startsWith(base))
              .map((x) => pal.slice(0, pal.length - base.length) + x.nombre + (x.tipo === 'd' ? '/' : ' '));
          } catch (e) {
            ops = [];
          }
        }
      }
      if (!ops.length) { return { linea, opciones: [] }; }
      if (ops.length === 1) { return { linea: antes + ops[0], opciones: [] }; }
      let comun = ops[0];
      for (const o of ops) { while (!o.startsWith(comun)) { comun = comun.slice(0, -1); } }
      return { linea: antes + (comun.length > pal.length ? comun : pal), opciones: ops.map((o) => o.trim()) };
    }

    // ---------------------------------------------------------------------------------------------- cada
    /** Corre las tareas que tocan (llamar cada segundo). Devuelve las que corrieron con su resultado. */
    async tick(ahora) {
      ahora = ahora || Date.now();
      const corridas = [];
      for (const t of this.tareas.slice()) {
        if (ahora < t.prox) { continue; }
        t.prox = ahora + t.ms;
        const sub = Object.create(this);
        sub.cwd = HOME;
        const r = await sub.ejecutar(t.orden, { fondo: true });
        const linea = hhmm(ahora) + '  [' + t.pid + '] ' + t.orden + '  → ' + (r.code === 0 ? 'ok' : 'código ' + r.code) +
          (r.err ? '  ' + r.err.trim().split('\n')[0] : '') + (r.nota ? '  ' + r.nota.trim().split('\n')[0] : '');
        this.logCada.push(linea);
        if (this.logCada.length > 200) { this.logCada.shift(); }
        corridas.push({ tarea: t, r, linea });
      }
      return corridas;
    }

    nuevaTarea(cada, orden) {
      const ms = intervalo(cada);
      if (!ms) { throw error('intervalo como 30s, 10m o 2h (mínimo 10s)'); }
      if (!orden) { throw error('falta la orden'); }
      if (this.tareas.length >= 20) { throw error('máximo 20 tareas'); }
      const pid = 101 + this.tareas.reduce((m, t) => Math.max(m, t.pid - 101), -1) + 1;
      this.tareas.push({ pid, cada, ms, orden, prox: Date.now() + ms });
      this.guardarTareas();
      return '⏱ tarea ' + pid + ': cada ' + cada + ' → ' + orden + '\n';
    }

    guardarTareas() {
      const txt = this.tareas.map((t) => t.pid + ' ' + t.cada + ' ' + t.orden).join('\n') + (this.tareas.length ? '\n' : '');
      try { this.fs.escribir('/etc/cada', txt, false); } catch (e) { /* sin espacio: se pierde al recargar */ }
    }

    _cargarTareas() {
      let txt = '';
      try { txt = this.fs.leer('/etc/cada'); } catch (e) { return; }
      for (const l of lineas(txt)) {
        const m = /^(\d+) (\S+) (.+)$/.exec(l);
        const ms = m && intervalo(m[2]);
        if (ms) { this.tareas.push({ pid: parseInt(m[1], 10), cada: m[2], ms, orden: m[3], prox: Date.now() + ms }); }
      }
    }
  }

  // ================================================================================================ montajes
  /** Monta /apps, ~/bandeja, /proc/mosca, /var/log, /bin y /dev sobre el entorno de la mosca. */
  function montarMosca(fs, sh, ent) {
    fs.montar('/apps', {
      tipo: (s) => (APPS.indexOf(s) >= 0 ? 'dev' : null),
      listar: () => APPS.map((a) => ({ nombre: a, tipo: 'dev', tam: 0 })),
      leer(s) {
        if (APPS.indexOf(s) < 0) { return null; }
        return EMOJI_APP[s] + ' ' + s + ': ' + (ent.conectada(s) ? 'conectada' : 'sin conectar') +
          '\nEscribe aquí (echo texto > /apps/' + s + ') o mueve un trabajo de ~/bandeja para mandarlo.\n';
      },
      escribir(s, texto) {
        if (APPS.indexOf(s) < 0) { throw error('no existe esa app'); }
        return ent.enviarApp(s, texto.trim());
      }
    });
    const enBandeja = (s) => ent.pendientes().find((t) => nombreTrabajo(t) === s);
    fs.montar(HOME + '/bandeja', {
      tipo: (s) => (enBandeja(s) ? 'f' : null),
      listar: () => ent.pendientes().map((t) => ({ nombre: nombreTrabajo(t), tipo: 'f', tam: t.texto.length, m: t.recibido })),
      leer: (s) => { const t = enBandeja(s); return t ? t.texto + '\n' : null; },
      escribir(s, texto) {
        // Un archivo nuevo en la bandeja es un trabajo nuevo: huele a su #etiqueta o al nombre del archivo.
        const limpio = texto.trim();
        if (!limpio) { throw error('un trabajo vacío no sirve'); }
        const olor = /(?:^|\s)#[\p{L}\p{N}_.-]+/u.test(limpio) ? null : s.replace(/\.[^.]*$/, '').replace(/-[a-z0-9]{4}$/i, '');
        return ent.trabajo(limpio, olor);
      },
      borrar(s) {
        const t = enBandeja(s);
        if (!t) { throw error('no existe'); }
        ent.llevar(t.id, 'papelera');
        return '🗑️ #' + t.olor + ' a la papelera (aprendió mirándote)';
      },
      async mover(s, destino) {
        const t = enBandeja(s);
        if (!t) { throw error('no existe'); }
        const m = /^\/apps\/(\w+)$/.exec(destino);
        if (m) {
          if (APPS.indexOf(m[1]) < 0) { throw error('no existe esa app'); }
          ent.llevar(t.id, m[1]);
          return EMOJI_APP[m[1]] + ' #' + t.olor + ' → ' + m[1] + ' (aprendió mirándote)';
        }
        await fs.escribir(destino, t.texto + '\n', false);
        ent.llevar(t.id, 'archivo');
        return '🗂️ #' + t.olor + ' guardado en ' + sh.corto(destino);
      }
    });
    const PROC = {
      estado: () => estado(ent),
      rutas: () => rutas(ent),
      memoria: () => memoria(ent),
      neuronas: () => unir(Object.keys(ent.Cerebro.NEURONAS).map((k) => k.padEnd(14) + String(ent.Cerebro.NEURONAS[k]).padStart(4))
        .concat(['total'.padEnd(14) + String(ent.Cerebro.TOTAL_NEURONAS).padStart(4)])),
      valencias: () => unir(['OLOR                 INNATO  APRENDIDO   TOTAL'].concat(ent.olores().map((o) => {
        const v = ent.cerebro.valencia(o);
        return ('#' + o).padEnd(20) + num(v.innata).padStart(7) + num(v.aprendida).padStart(11) + num(v.total).padStart(8);
      }))),
      descendentes: () => unir(['explorar', 'acercarse', 'comer', 'huir', 'acicalarse', 'descansar']
        .map((a, i) => a.padEnd(12) + barra(ent.cerebro.dn[i], 12) + ' ' + ent.cerebro.dn[i].toFixed(2))),
      kenyon: () => {
        const act = [];
        for (let i = 0; i < ent.cerebro.kc.length; i += 1) { if (ent.cerebro.kc[i]) { act.push(i); } }
        return 'activas ahora (' + act.length + '/200): ' + (act.join(' ') || 'ninguna: no huele nada') + '\n';
      }
    };
    fs.montar('/proc/mosca', {
      tipo: (s) => (PROC[s] ? 'f' : null),
      listar: () => Object.keys(PROC).map((n) => ({ nombre: n, tipo: 'f', tam: 0 })),
      leer: (s) => (PROC[s] ? PROC[s]() : null)
    });
    const LOGS = {
      'mosca.log': () => unir(ent.registro().slice().reverse().map((e) => hhmm(e.t) + '  #' + e.olor + '  ' +
        (e.resultado === 'ignorado' ? '🗑️ ignorado' : '→ ' + EMOJI_APP[e.app] + ' ' + e.app) + '  (' + (e.quien === 'tu' ? 'tú' : 'ella') + ')  ' +
        e.texto.replace(/\s+/g, ' ').slice(0, 80) + (e.envio ? '  · ' + e.envio : ''))),
      'cada.log': () => unir(sh.logCada)
    };
    fs.montar('/var/log', {
      tipo: (s) => (LOGS[s] ? 'f' : null),
      listar: () => Object.keys(LOGS).map((n) => ({ nombre: n, tipo: 'f', tam: 0 })),
      leer: (s) => (LOGS[s] ? LOGS[s]() : null)
    });
    fs.montar('/bin', {
      tipo: (s) => (COMANDOS[s] && OCULTOS.indexOf(s) < 0 ? 'f' : null),
      listar: () => Object.keys(COMANDOS).filter((n) => OCULTOS.indexOf(n) < 0).map((n) => ({ nombre: n, tipo: 'f', tam: 0 })),
      leer: (s) => (COMANDOS[s] ? '#!/bin/mosh\n# comando interno: ' + COMANDOS[s].ayuda + '\n# uso: ' + COMANDOS[s].uso + '\n' : null)
    });
    fs.montar('/dev', {
      tipo: (s) => (s === 'null' || s === 'zumbido' ? 'dev' : null),
      listar: () => [{ nombre: 'null', tipo: 'dev', tam: 0 }, { nombre: 'zumbido', tipo: 'dev', tam: 0 }],
      leer: (s) => (s === 'null' ? '' : (s === 'zumbido' ? 'bzz' + 'z'.repeat(Math.floor(Math.random() * 12)) + '\n' : null)),
      escribir: () => ''
    });
    // /dev/tel: el teléfono, también como archivos (cat la lee, echo > la usa). Lo mismo que «nexus».
    const TEL_LEE = { bateria: 'bateria', 'ubicacion': 'ubicacion', red: 'red', portapapeles: 'pegar' };
    const TEL_ESC = { vibrar: 'vibrar', portapapeles: 'copiar', compartir: 'compartir', despierta: 'despierta' };
    fs.montar('/dev/tel', {
      tipo: (sub) => ((TEL_LEE[sub] || TEL_ESC[sub]) ? 'dev' : null),
      listar: () => ['bateria', 'ubicacion', 'red', 'portapapeles', 'vibrar', 'compartir', 'despierta']
        .map((n) => ({ nombre: n, tipo: 'dev', tam: 0 })),
      leer(sub) {
        const d = ent.dispositivo;
        if (!d || !TEL_LEE[sub]) { return TEL_ESC[sub] ? '(escribe aquí: echo … > /dev/tel/' + sub + ')\n' : null; }
        // Síncrono para cat: devuelve lo último conocido o una pista (nexus da el valor en vivo).
        return 'usa:  nexus ' + TEL_LEE[sub] + '\n';
      },
      async escribir(sub, texto) {
        const d = ent.dispositivo;
        if (!d || !TEL_ESC[sub]) { throw error('no se puede escribir ahí'); }
        const t = String(texto).trim();
        if (sub === 'vibrar') { return d.vibrar(t); }
        if (sub === 'portapapeles') { return d.copiar(t); }
        if (sub === 'compartir') { return d.compartir(t); }
        if (sub === 'despierta') { return d.despierta(t !== 'off' && t !== '0'); }
        return '';
      }
    });
  }

  return { SistemaArchivos, Shell, montarMosca, lexer, analizar, nombreTrabajo, intervalo, HOME, APPS, EMOJI_APP, VERSION, LEEME };
});
