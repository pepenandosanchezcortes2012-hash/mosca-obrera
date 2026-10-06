# 🪰 Mosca Obrera

Un cerebro de mosca de la fruta (*Drosophila melanogaster*) simulado neurona por neurona en tu navegador. Huele por el aire, aprende de lo que le pasa, huye de lo que la asusta y duerme de noche. Juega con ella y mira su cerebro pensar en vivo.

**En vivo:** https://pepenandosanchezcortes2012-hash.github.io/mosca-obrera/

## Qué hay adentro

283 neuronas de tasa conectadas como en los circuitos mejor estudiados de la mosca real:

| Región | Qué hace aquí |
|---|---|
| Ojos (16 sectores) | Luz y siluetas que crecen (*looming*), la señal que dispara la huida |
| Lóbulo antenal (24 glomérulos) | Cada olor es un patrón de glomérulos |
| Cuerno lateral | Lo innato: la fruta atrae (más con hambre) y el humo repele |
| Cuerpo fungiforme (200 células de Kenyon + APL) | Código disperso (5 % activas) y memoria |
| 3 compartimentos γ / β' / α | Memoria corta (~1 min), media (~30 min) y larga (~1 día) |
| Dopamina PAM / PPL1 | La recompensa debilita la vía «evitar» y el castigo, la vía «acercarse» |
| Complejo central (anillo E-PG de 16) | Atractor de anillo: la brújula de hacia dónde ir |
| Neuronas reloj (LNv) | Sueño de noche y siesta a mediodía |
| 6 neuronas descendentes | Explorar, acercarse, comer, huir, acicalarse y descansar, que compiten entre sí |

No es el conectoma completo (FlyWire, 2024: ~140 000 neuronas). Es una miniatura que se comporta como mosca: encuentra fruta por el olor, salta cuando algo se le acerca, duerme de noche y aprende asociaciones de olores como en los experimentos de laboratorio.

## Jugar

Elige una herramienta (fruta, olor A, olor B, humo, luz, calor, mano, viento) y toca la arena. Toca a la mosca para acariciarla. **Premio** 🍬 y **Castigo** ⚡ asocian lo que la mosca huele en ese momento con algo bueno o malo (como en el condicionamiento olfativo real). A la derecha ves su cerebro en vivo; toca una región para ver qué hace. Las misiones van del primer bocado al examen en el laberinto.

Todo corre en tu dispositivo, sin servidores. La mosca y lo que aprende se guardan en el navegador; puedes guardar su memoria en un archivo y cargarla en otro lado. También es instalable como app y funciona sin internet.

Desde la consola del navegador tienes `MoscaObrera` (`estimulo`, `ensenar`, `velocidad`, `estado`), y un enlace como `…/#estimulo=fruta` pone fruta en la arena.

## Desarrollo

Sin dependencias ni compilación: HTML, CSS y JavaScript. El cerebro (`js/cerebro.js`), el laboratorio (`js/mundo.js`) y el dibujo (`js/vista.js`) también corren en Node.

```sh
node --test "tests/*.test.js"      # el cerebro y el laboratorio: comer, huir, aprender, examen en T, dormir…
py herramientas/probar.py          # la página en Chrome sin ventana, con capturas de celular y escritorio
py herramientas/iconos.py          # los íconos PNG de la app, a partir de icono.svg
```

`probar.py` necesita `pip install websocket-client`.
