# Paquetes de prompts — assets fotográficos de la landing

Cada carpeta `NN-nombre/` contiene:

- `prompt.md` — prompt completo en inglés (los generadores responden mejor),
  con notas en español, negative prompt, relación de aspecto y qué archivo
  producir.
- `references/` — capturas reales del producto para que el generador copie
  la UI en vez de inventarla.

## Flujo recomendado

1. Genera la escena con el prompt. Para texto en pantalla, Ideogram/Flux
   son los más fiables; Midjourney sirve pero deforma texto — usa el plan B.
2. **Plan B (recomendado para la pantalla)**: pide la escena con la pantalla
   del teléfono/portátil oscura o desenfocada, luego compone la UI real
   encima en Photoshop/Canva usando las referencias — la pantalla es lo que
   el juez va a mirar de cerca.
3. Exporta `.webp` (o `.jpg`) y déjalo en `apps/website/public/photos/` con
   el nombre indicado en cada prompt.
4. En `page.tsx`, pasa `src="/web/photos/<nombre>"` a cada `PhotoSpot`
   (el `basePath` es `/web`) — el tratamiento duotone ya está aplicado en
   CSS, así que la foto queda en marca sola.

## Slots activos

| Carpeta | Slot en landing | Aspecto |
|---|---|---|
| `01-mano-telefono-cafe` | "El aviso llega donde estás" | 3:4 |
| `02-escritorio-portatil` | "En la consola, el porqué completo" | 3:4 |
| `03-telefono-calle` | "También en la calle, sin ruido" | 3:4 |
| `04-persona-mayor-sofa` | Bonus — cambia un slot si quieres | 3:4 |

## Reglas de marca para juzgar resultados

- Cálido, papel/tinta: crema `#f4f0e6`, tinta `#141311`, acento ámbar
  `#f09436`. Nada de neón, hologramas, matrix verde ni "tech brillante".
- La UI debe parecer SOVIR (referencias adjuntas): fondo casi negro, texto
  crema, tarjetas con borde fino, acento ámbar en el aviso.
- Gente real haciendo cosas normales — no posando para cámara.
