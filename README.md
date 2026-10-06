# 🪰 Mosca Obrera

Un cerebro de mosca de la fruta (*Drosophila melanogaster*) que vive en tu navegador. Puedes jugar con ella, enseñarle con premios y castigos y conectarla a tus apps para que trabaje para ti: huele los mensajes que le llegan, decide cuáles valen la pena y te los reenvía.

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

## Ponerla a trabajar

1. **Lo que le llega**: el canal de entrada de [ntfy](https://ntfy.sh), el mercado cripto (CoinGecko), el clima de tu ciudad (Open-Meteo) o un repo de GitHub. Cada mensaje llega como una **carta** que huele a su `#etiqueta`.
2. **La mosca decide**: si el olor le gusta (lo innato + lo aprendido), va y la recoge; si no, la deja.
3. **A quién le avisa**: tu celular (app ntfy), Discord, un webhook (n8n, Make, Zapier…) o las notificaciones del navegador.
4. **Tú le enseñas**: 👍 / 👎 en cada carta. Es la misma dopamina que usa para la comida.

```sh
# una carta que huele a #ventas
curl -d "#ventas Llegó un pedido nuevo" ntfy.sh/<tu-canal-de-entrada>

# estímulos y enseñanza
curl -d "fruta" ntfy.sh/<tu-canal-de-entrada>
curl -d "premio ventas" ntfy.sh/<tu-canal-de-entrada>
```

También entiende enlaces (`#carta=Hola&olor=saludos`, `#estimulo=luz`), `postMessage` si la metes en un iframe y `MoscaObrera` en la consola.

Trabaja mientras la página esté abierta. Lo que aprende se guarda en el dispositivo (localStorage) y se puede pasar a otro con «Guardar su memoria en un archivo».

## Desarrollo

Sin dependencias ni compilación: HTML, CSS y JavaScript. El cerebro (`js/cerebro.js`), la arena (`js/mundo.js`) y los mensajes (`js/conexiones.js`) también corren en Node.

```sh
node --test tests/mosca.test.js         # comportamiento: comer, huir, aprender, examen en T, cartas…
py herramientas/probar.py               # la página en Chrome sin ventana, con capturas de celular y escritorio
py herramientas/probar.py --red         # además: ntfy de ida y vuelta, CoinGecko, Open-Meteo y GitHub de verdad
```

`probar.py` necesita `pip install websocket-client`.
