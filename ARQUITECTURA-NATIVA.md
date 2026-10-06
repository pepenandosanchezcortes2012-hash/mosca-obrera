# Mosca OS nativo — arquitectura (nexus-ctl)

Este documento es el **plan de la app nativa de Android** que completa Mosca OS: le da el Linux de verdad y el control del teléfono que un navegador no puede dar. **No reemplaza la web**: la web (este repo) sigue siendo la cara, el cerebro (`cerebro.js`), la pantalla de trabajo y la terminal. La app nativa es el **backend de superpoderes** detrás de los mismos comandos que ya existen hoy.

> Es un plano, no código para pegar y compilar. Se construye en **Android Studio + NDK** (otro repo), que no es este entorno. Aquí dejo cómo encaja pieza por pieza con lo que ya hicimos, para que nada se duplique ni se rompa.

## 0. La idea que mantiene todo unido: una sola interfaz, dos backends

Hoy, en la web, cuando escribes `nexus bateria` o le dices al copiloto «cuánta batería», se ejecuta `MoscaCopiloto.interpretar` → `nexus bateria` → `entorno.dispositivo.bateria()` → **Web API** (`navigator.getBattery`).

En la app nativa, **el mismo comando** `nexus bateria` llega a un `entorno.dispositivo.bateria()` que, en vez de la Web API, habla con un servicio nativo. **El copiloto, la terminal y la mosca no cambian.** Solo cambia quién responde debajo.

```
  TÚ / la mosca
       │  "manda hola a discord" · "toca en 540 1200" · nexus bateria
       ▼
  MoscaCopiloto.interpretar  (js/copiloto.js)         ← ya existe, no se toca
       │  comandos mosh
       ▼
  mosh / Shell  (js/sistema.js)                       ← ya existe
       │  nexus <sub>   ·   echo > /apps/x   ·   cat /proc/mosca
       ▼
  entorno.dispositivo.*  (el puente)
       ├─ WEB:    navigator.getBattery / geolocation / vibrate …   ← ya existe (app.js)
       └─ NATIVO: puente JS↔Kotlin → servicios Android             ← lo nuevo
```

El contrato ya está fijado por `nexus` en `js/sistema.js`. Lo nuevo solo **implementa ese contrato** con más poder:

| Comando (igual en web y nativo) | Web (hoy) | Nativo (nuevo) |
|---|---|---|
| `nexus bateria` / `red` / `ubicacion` | Web APIs | BatteryManager, ConnectivityManager, FusedLocation |
| `nexus vibrar` / `copiar` / `pegar` / `compartir` / `despierta` | Web APIs | Vibrator, ClipboardManager, Intent.ACTION_SEND, WakeLock |
| `nexus tocar X Y` / `escribir TEXTO` / `abrir APP` | «lo cumple el núcleo nativo» | **AccessibilityService** (gestos, texto, lanzar apps) |
| `nexus notifs` | «lo cumple el núcleo nativo» | **NotificationListenerService** |
| `nexus apps` / shell real | — | **PTY en C++ + PRoot** |

## 1. Auditoría: qué preservamos del proyecto actual

Todo esto se conserva **sin cambios de diseño**; la app nativa lo carga tal cual en un WebView:

- `js/cerebro.js` — las 283 neuronas. **Sigue siendo el que decide.** Es el "copiloto de bajo nivel".
- `js/mundo.js`, `js/pantalla.js` — laboratorio y pantalla de trabajo.
- `js/sistema.js` — el sistema de archivos y la shell `mosh`, con `nexus`, `/apps`, `~/bandeja`, `/proc/mosca`, `cada`.
- `js/copiloto.js` — lenguaje natural → comandos.
- `js/terminal.js`, `js/vista.js`, `js/conexiones.js`, `index.html`, `estilo.css`.

La app nativa **no reescribe** nada de esto. Añade un backend y se lo inyecta por una puerta que ya está abierta: `entorno.dispositivo` y `entorno.dispositivo.nativo(sub, args)`.

## 2. Estructura de archivos (web preservada + app nativa nueva)

```
mosca-obrera/                      ← ESTE repo (web/PWA), intacto
├── index.html  estilo.css  manifest.webmanifest  sw.js
├── js/  cerebro · mundo · pantalla · sistema · copiloto · vista · terminal · conexiones · app
├── herramientas/  probar.py · iconos.py …
└── ARQUITECTURA-NATIVA.md         ← este documento

mosca-os-android/                  ← repo NUEVO (Android Studio), aparte
├── app/src/main/
│   ├── assets/web/                ← COPIA del repo web (o submódulo/симлink en build)
│   ├── java/os/mosca/
│   │   ├── MainActivity.kt        ← WebView a assets/web + puente JS↔Kotlin
│   │   ├── NexusBridge.kt         ← implementa window.NexusNativo.* (el backend de nexus)
│   │   ├── control/
│   │   │   ├── DeviceControlAccessibilityService.kt   ← tocar/escribir/abrir (gestos)
│   │   │   ├── NotificationListener.kt                ← leer notificaciones
│   │   │   └── ShizukuBridge.kt                       ← comandos con permisos ADB
│   │   └── pty/PtyJni.kt          ← carga libpty.so, abre terminales reales
│   └── cpp/
│       ├── CMakeLists.txt
│       └── pty.c                  ← posix_openpt/epoll + JNI (el PTY nativo)
├── proot/                         ← proot + rootfs (Alpine/Debian) por ABI
└── build.gradle (NDK, minSdk 26…)
```

## 3. El núcleo Linux y el PTY (reemplaza "no-linux" de la web por lo real)

Hoy en la web, `python`/`bash` responden «no es un Linux de verdad». En el nativo, `/apps` gana un vecino: `/linux` (o el comando `linux`), servido por un **PTY real**.

**`cpp/pty.c` (esqueleto JNI):**
```c
#include <jni.h>
#include <pty.h>     // forkpty
#include <unistd.h>
JNIEXPORT jint JNICALL
Java_os_mosca_pty_PtyJni_abrir(JNIEnv* e, jobject o, jstring cmd) {
    int master;
    pid_t pid = forkpty(&master, NULL, NULL, NULL);
    if (pid == 0) {                      // hijo: lanza proot + shell
        const char* c = (*e)->GetStringUTFChars(e, cmd, 0);
        execl("/system/bin/sh", "sh", "-c", c, (char*)NULL);
        _exit(127);
    }
    return master;                       // fd maestro: leer/escribir con epoll
}
```
- **`PtyJni.kt`** envuelve `abrir/leer/escribir/cerrar` del fd maestro (lectura con `epoll` en un hilo).
- **PRoot** monta una rootfs real (Alpine o Debian) sin root: ahí viven `python`, `gcc`, `node`, `git`, paquetes de verdad.
- **Integración con mosh:** en `js/sistema.js`, el comando `linux` (o `pkg install`) deja de responder "no está" y en su lugar llama `window.NexusNativo.pty(...)`. La terminal `js/terminal.js` ya sabe pintar streams; solo se le conecta la salida del PTY. **El diseño visual de la terminal no cambia.**

## 4. El motor de control del teléfono (nexus-ctl)

Desacoplado: cada superpoder es un servicio independiente, invocable desde la GUI **o** desde la terminal (`nexus …`) **o** desde el copiloto. Todos pasan por `NexusBridge.kt`, que es lo que la web ve como `window.NexusNativo`.

**`NexusBridge.kt` (puente, resumen):**
```kotlin
class NexusBridge(val ctx: Context, val web: WebView) {
    @JavascriptInterface fun exec(sub: String, args: String): String = when (sub) {
        "tocar"   -> Accesibilidad.gesto(args)          // "540 1200"
        "escribir"-> Accesibilidad.texto(args)
        "abrir"   -> abrirApp(args)                      // PackageManager
        "notifs"  -> NotificationListener.ultimas(20)    // JSON
        "bateria" -> bateria()                           // BatteryManager
        else      -> "nexus: $sub no implementado"
    }
}
```
En `MainActivity`: `webView.addJavascriptInterface(NexusBridge(...), "NexusNativo")`. Y en `app.js`, `entorno.dispositivo.nativo = (sub, args) => window.NexusNativo.exec(sub, args)` (solo cuando existe). Con eso, `nexus tocar 540 1200` deja de decir "núcleo nativo" y **lo hace**.

**Servicios (desacoplados, con consentimiento visible):**
- **`DeviceControlAccessibilityService`** — `dispatchGesture` para toques/deslizamientos; `ACTION_SET_TEXT` para escribir; se activa en Ajustes → Accesibilidad (Android obliga a que lo prendas tú). Para automatizar **tu** teléfono.
- **`NotificationListenerService`** — `onNotificationPosted` guarda las últimas; `nexus notifs` las lee. Se habilita en Ajustes → Acceso a notificaciones.
- **`ShizukuBridge`** — para acciones que piden nivel ADB (p. ej. `input`, `pm`, `settings`) sin root: el usuario corre Shizuku una vez (por ADB inalámbrico) y concede permiso. Es el camino legítimo y estándar.

**Límite de diseño (a propósito):** todo se activa con permisos de Android visibles, en tu propio teléfono, sin esconderse. Nada de operar en segundo plano a espaldas del dueño ni apuntar a otro dispositivo — esa sería la frontera entre una herramienta y un spyware, y la respetamos.

## 5. El copiloto IA sobre las herramientas

Ya existe (`js/copiloto.js`) y es local. En nativo gana dos cosas, **sin cambiar la interfaz**:
1. **Más verbos reales:** `nexus tocar/escribir/abrir/notifs` ahora se cumplen, así que el copiloto ya puede «abre WhatsApp y escribe hola» encadenando comandos que **funcionan**.
2. **IA opcional:** el hook `config.copiloto.url` (ya cableado en `app.js` → `copilotoIA`) apunta a un modelo. El prompt del sistema ya le enseña los comandos de mosh y de `nexus`; devuelve JSON `{di, comandos}`; si falla, cae a las reglas locales. Puede ser un endpoint tuyo, un modelo on-device (p. ej. vía la rootfs de PRoot) o la API de Claude con tu clave — tú decides, y la app nunca manda nada sin que lo hayas configurado.

## 6. Plan de implementación por pasos

1. **Envolver la web:** proyecto Android, WebView a `assets/web`, copiar este repo. *(La app ya "funciona": es Mosca OS tal cual, instalada.)*
2. **Puente básico:** `NexusBridge` con `bateria/red/vibrar/copiar/compartir`; en `app.js`, usar `window.NexusNativo` si existe, si no las Web APIs. *(Sin cambios en la UI.)*
3. **Notificaciones:** `NotificationListenerService` + `nexus notifs`. Las notificaciones entrantes pueden además caer en `~/bandeja` como trabajos — la mosca las clasifica.
4. **Accesibilidad:** `DeviceControlAccessibilityService` + `nexus tocar/escribir/abrir`. Pantalla de consentimiento clara al activarlo.
5. **Shizuku:** acciones ADB para lo que la accesibilidad no cubre.
6. **PTY + PRoot:** `pty.c`/`PtyJni`, rootfs por ABI, comando `linux`/`pkg` conectados a la terminal. *(Aquí entra el Linux "de verdad".)*
7. **IA:** activar `config.copiloto.url` con el backend que elijas.

Cada paso es **incremental y revertible**: si quitas un servicio, Mosca OS sigue funcionando con menos poderes, igual que hoy la web funciona con lo que el navegador permite.

---

*Mantén la regla de oro del proyecto: cada cosa, probada. En nativo eso es tests instrumentados (Espresso) para el puente y pruebas manuales de los servicios en un teléfono tuyo.*
