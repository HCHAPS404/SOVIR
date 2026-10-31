# Android

Aplicación en Kotlin y Jetpack Compose. Es la superficie nativa del teléfono: entrada, registro, menú y conexiones. No observa la pantalla.

## Qué hace

- Entrar y registro son portales de diseño. Google, GitHub, Microsoft, Apple y el correo no crean una cuenta ni llaman a un servicio. El correo y la clave no se guardan.
- «Perfil de desarrollador» abre la aplicación sin cuenta. La sesión queda solo en este teléfono.
- El menú es la barra inferior: Inicio, Conexiones, Actividad y Cuenta. En un ancho de 600 dp o más, el mismo menú pasa a un rail.
- Conexiones lista este teléfono, la extensión, la consola web y el escritorio. Todas empiezan sin enlace. «Dejar pendiente» guarda una nota local. Esa nota no es un enlace ni un permiso.
- Actividad está vacía. El fixture sintético está etiquetado y no es una detección.
- Tema claro, oscuro o el del sistema. La paleta es la de Umbral ya usada en la web.
- El manifiesto no declara permisos. No hay MediaProjection, accesibilidad, micrófono, cámara, SMS ni red.

## Compilar

Hace falta JDK 17 o superior y Android SDK 35. `local.properties` (no se versiona) apunta al SDK:

```
sdk.dir=C:\\Users\\jesui\\AppData\\Local\\Android\\Sdk
```

Desde `apps/android`:

```
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest
```

El APK de depuración queda en `app/build/outputs/apk/debug/app-debug.apk`. Con un teléfono en depuración USB:

```
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

## Pruebas

`MobileLogicTest` cubre que el acceso no crea cuenta, que la clave no se conserva en el mensaje y que una nota local no es un enlace. UI Automator y la prueba en dispositivo siguen en `NOT_IMPLEMENTED` hasta que haya un teléfono conectado. El arranque, la CPU y la batería están en `NOT_MEASURED`.

El boceto HTML de `preview/` sigue siendo un boceto. La aplicación es este proyecto.
