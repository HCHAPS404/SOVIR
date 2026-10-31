# iOS

Aplicación en SwiftUI para iPhone y iPad. El código está en este repositorio. En este Windows no hay Xcode, así que la compilación queda en `NOT_IMPLEMENTED` hasta una Mac.

## Qué hace

La misma estructura que Android, con controles de iOS:

- Tab bar en el iPhone y barra lateral en el iPad.
- Entrar y registro no crean cuenta ni llaman a un servicio. El correo y la clave no se guardan.
- «Perfil de desarrollador» abre la app sin cuenta. La sesión queda en UserDefaults de este aparato.
- Conexiones: este dispositivo, la extensión, la consola web y el escritorio. Empiezan sin enlace. Una nota local no es un enlace.
- Actividad vacía, con un fixture sintético etiquetado.
- Tema sistema, claro u oscuro.
- No hay usage descriptions. No se declara ScreenCaptureKit, micrófono, cámara ni red. El selector del sistema no está dibujado.

## Observador de pantalla

En iOS **no existe API de observación de pantalla para terceros**: ScreenCaptureKit es de macOS y ReplayKit solo sirve para emitir/broadcast de la propia app, no para observar otras. La superficie realista en iOS es una **extensión de Safari** (port de `apps/extension`, mismo modelo de consentimiento por sitio, ADR-0014). Cualquier otra cosa sería fingir capacidad.

## Abrir en una Mac

Abrir `apps/ios/Sovir.xcodeproj` con Xcode 16 o posterior. El destino mínimo es iOS 17, iPhone e iPad. Elegir un equipo de firma en el target Sovir y ejecutar en el simulador o en un dispositivo.

Las pruebas de lógica están en `SovirTests/MobileLogicTests.swift`. No se ejecutaron aquí: `NOT_IMPLEMENTED`.

El boceto HTML de `preview/` sigue siendo un boceto. La aplicación es este proyecto.
