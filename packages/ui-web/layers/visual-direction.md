# Dirección visual Umbral

Estado: identidad final del esqueleto, definida por el responsable el 27 de octubre de 2026. Umbral es la paleta, el símbolo y la tipografía en uso. `brand-candidates.json` conserva Mineral, Cartográfica y Editorial como archivo de exploración.

## Qué representa SOVIR

SOVIR no es una suite de alarma ni un panel de vigilancia. La promesa es ver lo que influye y elegir lo que importa: evidencia, consentimiento y una acción que la persona puede revocar. El símbolo entregado es una abertura horizontal, dos arcos y un hueco central. Se lee como atención y umbral, no como escudo, candado ni ojo que todo lo mira.

De las tres rutas del taller, esta dirección se queda con el silencio de Mineral y el papel de Editorial. Descarta el azul de Cartográfica: enfría el símbolo y lo convierte en un producto de analítica. El acento no es el terracota editorial, porque ese rojo-arcilla se confunde con una alerta.

## Qué estaba pendiente

- Ruta visual sin elegir. Esta nota la propone como Umbral.
- Rol `brand` nulo y neutros provisionales en `semantic-roles.json`.
- Tipografía de sistema, sin pareja display / texto / evidencia.
- Radio, ritmo, elevación y uso del símbolo sin regla.
- Claro y oscuro existen, pero no como dos ambientes del mismo material.
- El nombre va en Outfit. No hay un wordmark de letras dibujadas a mano.

## Paleta

Un solo material: tinta caliente, papel y bronce. El bronce es marca. El peligro, el aviso y lo desconocido son otras tintas y no se prestan el bronce.

El claro es una mesa de lectura. El oscuro es el campo para el que se dibujó el símbolo blanco: un instrumento, no una terminal. El texto oscuro no es blanco puro, para que el símbolo, cuando va en blanco de archivo, siga siendo la forma más luminosa.

Contraste medido texto/fondo, WCAG 2.2 AA, todos por encima de 4.5:1.

| Rol | Claro | Oscuro | Uso |
|---|---|---|---|
| Fondo | `#F4F0E6` | `#141311` | Página |
| Superficie | `#FBF7F0` | `#1E1C19` | Un escalón, sin sombra |
| Texto | `#1A1714` | `#F4F0E6` | Cuerpo y títulos |
| Texto secundario | `#5E584E` | `#C4BBAE` | Notas, 4.5:1 |
| Línea | `#D8D0C3` | `#3C3832` | Filetes de 1 px |
| Marca | `#7A5B3A` | `#D4B48A` | Símbolo, regla, enlace. Nunca peligro |
| Marca profunda | `#5C4228` | `#D4B48A` | Enlace largo en claro si hace falta más cuerpo |
| Éxito | `#1A6840` | `#9ED4B6` | Hecho verificable |
| Aviso | `#8A5610` | `#E7C48A` | Atención, no marca |
| Peligro | `#8C2E2A` | `#F0B2AC` | Error y revocación |
| Desconocido | `#4E5964` | `#C5CED6` | Gris frío: incertidumbre, no alarma |
| Foco | `#1A1714` | `#F4F0E6` | Anillo de 2 px. No es el bronce |

Pares medidos, entre otros: texto sobre papel 15.68:1; secundario sobre papel 6.19:1; bronce sobre papel 5.45:1; peligro sobre papel 7.27:1; papel sobre fondo oscuro 16.32:1; bronce oscuro sobre fondo 9.46:1.

## Tipografía

Tres voces, no una familia para todo.

- Display, solo sitio público: Newsreader. Serif de lectura. Promesa y títulos de sección. Licencia OFL. No redistribuir el archivo hasta la revisión humana.
- Interfaz, consola, navegación y cuerpo: Source Sans 3. Humanista, neutra, densa sin parecer tablero de métricas. OFL.
- Evidencia: IBM Plex Mono, solo etiquetas cortas (`Observado`, `Inferido`, `Desconocido`, `Sintético`). No párrafos.

Escala del sitio: 72 / 32 / 18 / 13. Interlineado de título 0.98. Cuerpo 18/28, medida máxima 68 caracteres. Escala de consola: 32 / 16 / 13. El tracking amplio (0.12em) queda solo en la palabra SOVIR junto al símbolo.

Si Figma no tiene Newsreader o Source Sans 3, el archivo usa la familia disponible más cercana y esta nota sigue siendo la intención.

## Forma, orden y estilo

- Geometría casi recta. Radio 2 px en botones. Las páginas editoriales no redondean sus bloques.
- Separación por filete, no por tarjeta. Una superficie es un cambio de papel, no una sombra ni un resplandor.
- El símbolo es la única figura. No hay iconos de relleno, gradientes ni ilustración de candado.
- El sitio es una columna. El titular ocupa el ancho de una frase, no una retícula de tres beneficios.
- La consola es un riel y un texto. El vacío se enuncia. Vacío no se dibuja como protección.
- Claro y oscuro cambian el material, no la estructura. El mismo orden, la misma escala, otra tinta.
- Movimiento mínimo. Si el sistema pide menos movimiento, no hay transición.

## Qué no cierra esta nota

La paleta y la tipografía alimentan `tokens.css` y el archivo [SOVIR Umbral](https://www.figma.com/design/ugk030WRnYLejNPEj0kV0K). El responsable la definió como identidad final del esqueleto el 27 de octubre de 2026. El nombre usa Outfit. Las fuentes se cargan para el esqueleto; redistribuir los archivos en un instalador sigue aparte.
