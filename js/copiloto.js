/**
 * Mosca OS: el Copiloto. Traduce lo que le dices en español a comandos de la shell (mosh) y acciones de la mosca.
 *
 * Es local y determinista: un intérprete de reglas, sin cuenta ni clave (funciona sin internet, como el resto de
 * Mosca OS). Si configuras un endpoint de IA propio, app.js puede usarlo y caer a estas reglas si falla; pero no hace
 * falta: estas reglas ya entienden lo común.
 *
 *   «cada mañana mándame el precio de bitcoin»  → cada 24h curl -s "…coingecko…" > ~/bandeja/precio-bitcoin.txt
 *   «manda hola a discord»                      → echo "hola" > /apps/discord
 *   «las facturas van al webhook»               → ruta facturas webhook
 *   «cuánta batería tengo»                      → nexus bateria
 *   «toca en el centro de la pantalla»          → nexus tocar 540 1200   (el navegador avisa que eso es del núcleo nativo)
 *
 * No ejecuta nada: solo arma el plan. Quien lo corre es la terminal (app.js), que muestra cada comando como si lo
 * hubieras escrito tú. Funciona igual en Node, para las pruebas.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) { module.exports = fabrica(); } else { raiz.MoscaCopiloto = fabrica(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APPS = ['celular', 'discord', 'webhook', 'avisos', 'archivo', 'papelera'];
  const ALIAS_APP = [
    [/\b(celular|tel[eé]fono|m[oó]vil|ntfy|notificaci[oó]n al (?:cel|tel)|mi (?:cel|tel))\b/i, 'celular'],
    [/\bdiscord\b/i, 'discord'],
    [/\b(webhook|n8n|zapier|make|hook)\b/i, 'webhook'],
    [/\b(avisos?|notificaci[oó]n(?:es)?|alerta)\b/i, 'avisos'],
    [/\b(archiv\w*|guard\w*)\b/i, 'archivo'],
    [/\b(papelera|basura|tirar|borrar)\b/i, 'papelera']
  ];
  const MONEDAS = { btc: 'bitcoin', bitcoin: 'bitcoin', eth: 'ethereum', ethereum: 'ethereum', doge: 'dogecoin',
    dogecoin: 'dogecoin', xrp: 'ripple', ripple: 'ripple', sol: 'solana', solana: 'solana', ada: 'cardano',
    cardano: 'cardano', ltc: 'litecoin', litecoin: 'litecoin', usdt: 'tether', tether: 'tether', bnb: 'binancecoin' };

  function sinTildes(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function slug(s) {
    return sinTildes(String(s)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'nota';
  }
  function citar(s) { return '"' + String(s).replace(/(["\\$`])/g, '\\$1') + '"'; }
  function appEn(t) {
    for (const [re, app] of ALIAS_APP) { if (re.test(t)) { return app; } }
    return null;
  }
  function limpiarAccion(t) {
    // Quita cortesías y conectores del principio: «por favor, oye mosca, quiero que…».
    return t.replace(/^\s*(por favor|porfa|oye|hey|mosca|mosquita|che|dale|quiero que|puedes|podr[ií]as|me (?:puedes|podr[ií]as)|haz que|has que)[\s,]+/i, '').trim();
  }

  /** «cada 10 minutos», «cada hora», «cada mañana/día» → "10m", "1h", "24h"; o null. */
  function intervalo(t) {
    let m = /\bcada\s+(\d+)\s*(segundos?|seg|s|minutos?|min|m|horas?|hrs?|hs?|h)\b/i.exec(t);
    if (m) {
      const n = Math.max(1, parseInt(m[1], 10));
      const u = /^s|^seg/i.test(m[2]) ? 's' : (/^h/i.test(m[2]) ? 'h' : 'm');
      let seg = n * (u === 's' ? 1 : (u === 'm' ? 60 : 3600));
      if (seg < 10) { seg = 10; }
      return seg % 3600 === 0 ? (seg / 3600) + 'h' : (seg % 60 === 0 ? (seg / 60) + 'm' : seg + 's');
    }
    if (/\bcada\s+(minuto)\b/i.test(t)) { return '1m'; }
    if (/\bcada\s+(hora)\b/i.test(t)) { return '1h'; }
    if (/\bcada\s+(d[ií]a|ma[nñ]ana|jornada)\b/i.test(t)) { return '24h'; }
    if (/\bcada\s+semana\b/i.test(t)) { return '168h'; }
    return null;
  }

  function plan(di, comandos, op) {
    return Object.assign({ ok: true, di, comandos: Array.isArray(comandos) ? comandos : [comandos], confirmar: false }, op || {});
  }

  // --- reglas, en orden; la primera que entiende, gana. Cada una recibe t (texto) y ctx y devuelve un plan o null.
  const REGLAS = [
    // Ayuda / saludo.
    function (t) {
      if (!/^\s*(hola|buenas|qu[eé] (puedes|sabes) hacer|ayuda|help|qu[eé] haces|en qu[eé] me ayudas)\b/i.test(t)) { return null; }
      return plan('Soy el copiloto de la mosca. Dime cosas como: «cada mañana mándame el precio de bitcoin», ' +
        '«manda hola a discord», «las facturas van al webhook», «anota comprar pan», «cuánta batería tengo», ' +
        '«qué tienes pendiente». Para controlar el teléfono (tocar, abrir apps, leer notificaciones) hace falta ' +
        'Mosca OS nativo; yo ya armo esas órdenes con nexus.', []);
    },

    // «cada <intervalo> <acción>»: arma la tarea repetida con la acción de adentro.
    function (t, ctx) {
      const iv = intervalo(t);
      if (!iv) { return null; }
      const resto = limpiarAccion(t.replace(/\bcada\s+(\d+\s*\w+|minuto|hora|d[ií]a|ma[nñ]ana|jornada|semana)\b[,:]?/i, '').trim());
      if (!resto) { return { ok: false, pregunta: '¿Qué quieres que haga cada ' + iv + '? Ej: «cada ' + iv + ' mándame el precio de bitcoin».' }; }
      const dentro = interpretarUna(resto, ctx);
      if (!dentro || !dentro.comandos || dentro.comandos.length !== 1) {
        return { ok: false, pregunta: 'Puedo repetir una sola acción. Prueba algo como «cada ' + iv + ' mándame el precio de bitcoin».' };
      }
      let cmd = dentro.comandos[0];
      // Si es un curl que imprimiría, lo dejo como trabajo en ~/bandeja para que lo recibas.
      if (/^curl\b/.test(cmd) && !/[>|]/.test(cmd)) { cmd += ' > ~/bandeja/' + slug(resto) + '.txt'; }
      return plan('cada ' + iv + ' haré: ' + (dentro.di || resto), ['cada ' + iv + ' ' + cmd]);
    },

    // Precio de una cripto.
    function (t) {
      const m = /\b(?:precio|cotizaci[oó]n|cu[aá]nto\s+(?:vale|est[aá]|cuesta))\b[\s\S]*?\b([a-z]{3,8})\b/i.exec(t) ||
        /\b([a-z]{3,8})\b[\s\S]*\b(?:precio|cotizaci[oó]n)\b/i.exec(t);
      let id = null;
      if (m) { id = MONEDAS[m[1].toLowerCase()]; }
      if (!id) {
        if (!/\b(precio|cotizaci[oó]n|cu[aá]nto\s+(?:vale|est[aá]|cuesta))\b/i.test(t)) { return null; }
        for (const k of Object.keys(MONEDAS)) { if (new RegExp('\\b' + k + '\\b', 'i').test(t)) { id = MONEDAS[k]; break; } }
      }
      if (!id) { return null; }
      const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + id + '&vs_currencies=usd&include_24hr_change=true';
      const app = appEn(t);
      const cmd = 'curl -s ' + citar(url) + (app ? ' > /apps/' + app : '');
      return plan('te traigo el precio de ' + id + (app ? ', a ' + app : ''), [cmd]);
    },

    // Clima de una ciudad (wttr.in da una línea y deja que la página lo lea).
    function (t) {
      const m = /\b(?:clima|tiempo|temperatura|pron[oó]stico)\b.*?\b(?:en|de|para)\s+([a-zA-ZÁÉÍÓÚáéíóúñÑ .'-]{2,40})/i.exec(t);
      if (!m) { return null; }
      const ciudad = m[1].trim().replace(/\?+$/, '');
      const url = 'https://wttr.in/' + encodeURIComponent(ciudad) + '?format=3&lang=es&m';
      const app = appEn(t);
      return plan('el clima en ' + ciudad, ['curl -s ' + citar(url) + (app ? ' > /apps/' + app : '')]);
    },

    // Mandar texto a una app.
    function (t) {
      const m = /\b(?:manda|env[ií]a|mand[aá](?:me|le)?|p[aá]sa(?:le)?|escribe(?:le)?)\b\s+(.+?)\s+(?:a|al|por|a la|a mi)\s+(.+)$/i.exec(t);
      if (!m) { return null; }
      const app = appEn(m[2]) || appEn(t);
      if (!app) { return null; }
      const texto = m[1].replace(/^["']|["']$/g, '').trim();
      return plan('mando «' + texto + '» a ' + app, ['echo ' + citar(texto) + ' > /apps/' + app]);
    },

    // Recordatorio / avísame (sin intervalo aquí: con intervalo lo toma la regla «cada»).
    function (t) {
      const m = /\b(?:recu[eé]rdame|recordar(?:me)?|av[ií]same|no me dejes olvidar(?:me)?)\b\s+(?:que\s+|de\s+)?(.+)$/i.exec(t);
      if (!m) { return null; }
      const texto = m[1].replace(/\s+en\s+.+$/i, '').replace(/[.?!]+$/, '').trim();
      const app = appEn(t);
      if (app) { return plan('te aviso: ' + texto, ['echo ' + citar('⏰ ' + texto) + ' > /apps/' + app]); }
      return plan('te lo dejo como recordatorio', ['trabajo ' + citar('#recordatorio ' + texto)]);
    },

    // Enseñarle una ruta: «las facturas van al webhook» / «enséñale que ventas va al celular».
    function (t, ctx) {
      const m = /(?:ens[eé]ñale que\s+)?(?:las?\s+|los?\s+|el\s+|#)?([\wáéíóúñ-]{3,20})\s+(?:van?|ir[ií]an?|se mandan?|se env[ií]an?)\s+(?:a|al|a la|a los|a las|para)\s+(.+)$/i.exec(t);
      if (!m) { return null; }
      const app = appEn(m[2]);
      if (!app) { return null; }
      return plan('#' + slug(m[1]) + ' irá a ' + app, ['ruta ' + slug(m[1]) + ' ' + app]);
    },

    // Nota / apuntar.
    function (t) {
      let m = /\b(?:crea\s+(?:una?\s+)?nota|nota|apunta|an[oó]ta|escribe\s+en\s+notas)\b[:\s]+(.+)$/i.exec(t);
      if (m) {
        const texto = m[1].replace(/^(que diga|diciendo|que)\s+/i, '').replace(/^["']|["']$/g, '').trim();
        return plan('lo apunto en ~/notas.txt', ['echo ' + citar(texto) + ' >> ~/notas.txt']);
      }
      return null;
    },

    // Leer algo (y «abre» / «lee notificaciones», que son del dispositivo).
    function (t) {
      const m = /\b(l[eé]eme|lee|mu[eé]strame|abre|abrir|qu[eé] dice[n]?)\b\s+(?:el\s+|la\s+|mis?\s+|el archivo\s+)?(.+)$/i.exec(t);
      if (!m) { return null; }
      const verbo = m[1].toLowerCase();
      let destino = m[2].trim().replace(/[.?!]+$/, '');
      if (/notificaci/i.test(destino)) { return plan('leer tus notificaciones (lo cumple el núcleo nativo)', ['nexus notifs']); }
      if (/\bnotas?\b/i.test(destino)) { destino = '~/notas.txt'; } else if (/\b(bandeja|trabajos?|pendientes?)\b/i.test(destino)) {
        return plan('tus trabajos pendientes', ['ls ~/bandeja']);
      } else if (/\b(log|registro|historial)\b/i.test(destino)) { destino = '/var/log/mosca.log'; } else {
        destino = destino.replace(/^["']|["']$/g, '');
        // «abre <algo>» que no es un archivo ni una ruta: abrir una app (lo cumple el núcleo nativo).
        if (/^abr/.test(verbo) && !/[/.]|~/.test(destino)) { return plan('abrir ' + destino + ' (lo cumple el núcleo nativo)', ['nexus abrir ' + citar(destino)]); }
      }
      return plan('te muestro ' + destino, ['cat ' + destino]);
    },

    // Estado / pendientes / qué hace.
    function (t) {
      if (/\b(qu[eé]\s+(tienes|hay|falta|est[aá]s haciendo)|c[oó]mo\s+(vas|est[aá]s)|pendientes?|estado|trabajos?)\b/i.test(t)) {
        return plan('cómo va la mosca', ['cat /proc/mosca/estado']);
      }
      return null;
    },

    // Mover a la mosca / premio / castigo.
    function (t) {
      if (/\b(ponte? a trabajar|ve a trabajar|a trabajar|al trabajo)\b/i.test(t)) { return plan('la mando a trabajar', ['mosca trabajar']); }
      if (/\b(al laboratorio|a jugar|deja de trabajar|descansa un poco|ven aqu[ií])\b/i.test(t)) { return plan('la traigo al laboratorio', ['mosca laboratorio']); }
      if (/\b(dale un premio|prem[ií]ala|dale azúcar|bien hecho)\b/i.test(t)) { return plan('le doy un premio', ['mosca premio']); }
      if (/\b(cast[ií]gala|rega[ñn]ala|eso est[aá] mal)\b/i.test(t)) { return plan('la castigo', ['mosca castigo']); }
      return null;
    },

    // Control del dispositivo (nexus): web donde se puede, núcleo nativo para lo demás.
    function (t) {
      if (/\b(bater[ií]a|carga|pila|cu[aá]nta bater)/i.test(t)) { return plan('miro la batería', ['nexus bateria']); }
      if (/\b(d[oó]nde estoy|mi ubicaci[oó]n|ubicaci[oó]n|localiza|gps|d[oó]nde me encuentro)\b/i.test(t)) { return plan('busco tu ubicación', ['nexus ubicacion']); }
      if (/\b(qu[eé] red|conexi[oó]n|wifi|datos m[oó]viles|estoy conectad)/i.test(t)) { return plan('reviso la red', ['nexus red']); }
      if (/\b(vibra|haz vibrar|vibraci[oó]n)\b/i.test(t)) { return plan('hago vibrar el teléfono', ['nexus vibrar']); }
      let m = /\bcopia(?:r|me)?\b\s+(.+)$/i.exec(t);
      if (m) { return plan('copio al portapapeles', ['nexus copiar ' + citar(m[1].replace(/^["']|["']$/g, '').trim())]); }
      if (/\b(pega|qu[eé] copi[eé]|qu[eé] hay en el portapapeles|portapapeles)\b/i.test(t)) { return plan('leo el portapapeles', ['nexus pegar']); }
      m = /\b(comparte|compartir)\b\s+(.+)$/i.exec(t);
      if (m) { return plan('abro el menú de compartir', ['nexus compartir ' + citar(m[2].replace(/^["']|["']$/g, '').trim())]); }
      if (/\b(no apagues la pantalla|mant[eé]n(?:la)? despierta|pantalla siempre encendida)\b/i.test(t)) { return plan('mantengo la pantalla encendida', ['nexus despierta on']); }
      if (/\b(ya puedes apagar la pantalla|deja apagar la pantalla|suelta la pantalla)\b/i.test(t)) { return plan('suelto la pantalla', ['nexus despierta off']); }
      // Intenciones que hoy son del núcleo nativo: armo la orden igual (el navegador avisará).
      m = /\btoca(?:r)?\b.*?\b(\d{1,4})\D+(\d{1,4})\b/i.exec(t);
      if (m) { return plan('toque en la pantalla (lo cumple el núcleo nativo)', ['nexus tocar ' + m[1] + ' ' + m[2]], { confirmar: true }); }
      m = /\b(?:abre|abr[ií]r|lanza)\b\s+(?:la\s+app\s+)?([\wáéíóúñ. -]{2,40})$/i.exec(t);
      if (m && !/\b(archivo|nota|bandeja|log|registro)\b/i.test(m[1])) { return plan('abrir ' + m[1].trim() + ' (lo cumple el núcleo nativo)', ['nexus abrir ' + citar(m[1].trim())]); }
      if (/\b(mis )?notificaciones\b/i.test(t)) { return plan('leer tus notificaciones (lo cumple el núcleo nativo)', ['nexus notifs']); }
      return null;
    },

    // Tareas programadas.
    function (t) {
      if (/\b(qu[eé] tareas|mis tareas|tareas programadas|qu[eé] est[aá] program)/i.test(t)) { return plan('tus tareas', ['cada']); }
      const m = /\b(?:cancela|detén|deten|para|quita|borra)\s+(?:la\s+)?tarea\s+(\d+)/i.exec(t);
      if (m) { return plan('cancelo la tarea ' + m[1], ['kill ' + m[1]]); }
      if (/\b(cancela|det[eé]n|para|quita)\s+(todas\s+)?(las\s+)?tareas\b/i.test(t)) { return plan('no tengo «cancelar todas» en un paso; mira «cada» y usa «cancela la tarea N».', []); }
      return null;
    }
  ];

  function interpretarUna(texto, ctx) {
    const t = limpiarAccion(String(texto == null ? '' : texto).trim());
    if (!t) { return null; }
    for (const regla of REGLAS) {
      let r;
      try { r = regla(t, ctx || {}); } catch (e) { r = null; }
      if (r) { return r; }
    }
    return null;
  }

  /**
   * Entiende una orden en español. Devuelve:
   *   { ok:true, di, comandos:[…], confirmar }  o  { ok:false, pregunta }
   * ctx (opcional): { apps, temaSalida, olores }.
   */
  function interpretar(texto, ctx) {
    const r = interpretarUna(texto, ctx);
    if (r) { return r; }
    return { ok: false, comandos: [],
      pregunta: 'No te entendí. Prueba: «cada mañana mándame el precio de bitcoin», «manda hola a discord», ' +
        '«las facturas van al webhook», «anota comprar pan», «cuánta batería tengo», «qué tienes pendiente».' };
  }

  return { interpretar, slug, intervalo, APPS, MONEDAS, _reglas: REGLAS };
});
