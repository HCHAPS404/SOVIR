// Photographic slot for the landing. When `src` is set the photo renders
// under a warm duotone so any image sits inside the brand; until then a
// designed field (brand mark over layered ink) holds the composition so
// the layout never looks broken waiting for assets.

export function PhotoSpot({
  src,
  alt,
  caption,
  shot,
  ratio = "4 / 3",
}: {
  src?: string;
  alt: string;
  caption: string;
  shot: string;
  ratio?: string;
}) {
  return (
    <figure className="photo-spot" style={{ aspectRatio: ratio }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <div className="photo-pending" role="img" aria-label={`Espacio reservado: ${shot}`}>
          <span className="mark" aria-hidden="true" />
          <span className="photo-shot">{shot}</span>
        </div>
      )}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
