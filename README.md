# 🪰 Mosca Obrera

Un cerebro de mosca de la fruta (*Drosophila melanogaster*) que vive en tu navegador. Juegas con ella en el laboratorio y después le das su propia **pantalla de trabajo**: una pantalla dentro de tu pantalla, donde le llegan los mensajes de tus apps. Los toca con la trompa, los lleva a la app que corresponde y aprende de ti qué va dónde.

**En vivo:** https://pepenandosanchezcortes2012-hash.github.io/mosca-obrera/

## Qué hay adentro

283 neuronas de tasa conectadas como en los circuitos mejor estudiados de la mosca real:

| Región | Qué hace aquí |
|---|---|
| Ojos (16 sectores) | Luz y siluetas que crecen (*looming*), la señal que dispara la huida |
| Lóbulo antenal (24 glomérulos) | Cada olor, y cualquier palabra, es un patrón de glomérulos |
| Cuerno lateral | Lo innato: la fruta atrae (más con hambre) y el humo repele |
| Cuerpo fungiforme (200 células de Kenyon + APL) | Código disperso (5 % activas) y memoria |
| 3 compartimentos γ / β' / α | Memoria corta (~1 min), media (~30 min) y larga (~1 día) |
| Dopamina PAM / PPL1 | La recompensa debilita la vía «evitar» y el castigo, la vía «acercarse» |
| Complejo central (anillo E-PG de 16) | Atractor de anillo: la brújula de hacia dónde ir |
| Neuronas reloj (LNv) | Sueño de noche y siesta a mediodía |
| 6 neuronas descendentes | Explorar, acercarse, comer, huir, acicalarse y descansar, que compiten entre sí |

No es el conectoma completo (FlyWire, 2024: ~140 000 neuronas). Es una miniatura que se comporta como mosca: encuentra fruta por el olor, salta cuando algo se le acerca, duerme de noche y aprende asociaciones de olores como en los experimentos de laboratorio.

## Jugar

Elige una herramienta (fruta, olor A, olor B, humo, luz, calor, mano, viento) y toca la arena. **Premio** 🍬 y **Castigo** ⚡ asocian lo que la mosca huele en ese momento con algo bueno o malo. Las misiones van del primer bocado al examen en el laberinto.

## Su pantalla de trabajo («Mosca OS»)

Arriba le llegan los **trabajos** (cada uno huele a su `#etiqueta`); abajo están sus **apps**: 📱 Celular (ntfy), 💬 Discord, 🔗 Webhook, 🔔 Avisos del navegador, 🗂️ Archivo y 🗑️ Papelera.

- **El toque es de verdad:** la mosca camina sobre la pantalla y cuando extiende la trompa hace clic en el botón que tiene debajo, el mismo que tocas tú.
- **Decide con su cuerpo fungiforme:** valora la mezcla «lo que llevo + adónde voy». Las salidas se inhiben entre sí, así que la mejor opción apaga a las demás.
- **Sin enseñarle nada, archiva:** no le escribe a nadie por su cuenta.
- **Le enseñas de tres formas:** 👍 (le pagas con azúcar), 👎 + «adónde iba» (lo reenvía ahí y aprende), o tocando tú un trabajo y luego una app (aprende mirándote). Lo que ya no le interesa lo ignora y se va a la papelera.
- **Ventana flotante:** en Chrome o Edge de escritorio, su pantalla sale a una ventana que queda encima de todo mientras usas la compu.

## Conectarla

Los trabajos le llegan por el canal de entrada de [ntfy](https://ntfy.sh) (cualquier app que haga un POST), del mercado cripto (CoinGecko), del clima de tu ciudad (Open-Meteo) o de un repo de GitHub. Cada app de su pantalla sale de verdad por su conexión.

```sh
# un trabajo que huele a #ventas
curl -d "#ventas Llegó un pedido nuevo" ntfy.sh/<tu-canal-de-entrada>

# estímulos y enseñanza
curl -d "fruta" ntfy.sh/<tu-canal-de-entrada>
curl -d "premio ventas" ntfy.sh/<tu-canal-de-entrada>
```

También entiende enlaces (`#carta=Hola&olor=saludos`, `#estimulo=luz`), `postMessage` si la metes en un iframe y `MoscaObrera` en la consola (`MoscaObrera.ruta('ventas', 'celular')` le enseña una ruta).

Trabaja mientras la página esté abierta. Lo que aprende se guarda en el dispositivo (localStorage) y se puede pasar a otro con «Guardar su memoria en un archivo».

## Desarrollo

Sin dependencias ni compilación: HTML, CSS y JavaScript. El cerebro (`js/cerebro.js`), la arena (`js/mundo.js`), la pantalla de trabajo (`js/pantalla.js`) y los mensajes (`js/conexiones.js`) también corren en Node.

```sh
node --test tests/mosca.test.js         # comportamiento: comer, huir, aprender, examen en T, la pantalla de trabajo…
py herramientas/probar.py               # la página en Chrome sin ventana (toques reales, 👎, enseñarle) con capturas
py herramientas/probar.py --red         # además: ntfy de ida y vuelta, CoinGecko, Open-Meteo y GitHub de verdad
```

`probar.py` necesita `pip install websocket-client`.
