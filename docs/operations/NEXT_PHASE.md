# Fase siguiente

Este commit guarda el esqueleto local: sitio, consola, extensión, vistas de Android e iOS, shell de escritorio y el CLI. Umbral es la identidad de ese esqueleto.

A partir de aquí el trabajo activo tiene tres frentes, y el objetivo es ver hitos de desarrollo:

1. Frente de la página web: la landing pública y la consola operativa.
2. Frente de la extensión.
3. Arquitectura entre backend y frontend en esos mismos campos. El backend no se abre en abstracto: se conecta con la landing, con la consola y con la extensión, para que cada hito tenga una superficie que lo muestre.

Android, iOS y el empaquetado de escritorio con Tauri siguen en `NOT_IMPLEMENTED`. No son el foco de esta fase.

## Hitos de esta fase

- La landing explica el producto sin afirmar protección, precios ni descargas que no existan.
- La consola recorre sus secciones con estados de simulación y una sesión de demostración.
- La extensión muestra pausa y permiso opcional por sitio, sin observar páginas por defecto.
- El primer contrato de backend que alimente a la web o a la extensión queda identificado y probado en local, sin cuentas reales ni captura del sistema.
