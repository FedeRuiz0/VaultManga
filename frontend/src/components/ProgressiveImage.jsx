import { useEffect, useState } from 'react';
import clsx from 'clsx';

const FALLBACK_COVER = '/placeholder-cover.jpg';

export default function ProgressiveImage({
  src,
  alt,
  className,
  imgClassName,
}) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src || FALLBACK_COVER);

  useEffect(() => {
    setLoaded(false);
    setCurrentSrc(src || FALLBACK_COVER);
  }, [src]);

  return (
    <div className={clsx('relative h-full w-full overflow-hidden bg-zinc-800', className)}>
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-zinc-800" />
      )}

      <img
        src={currentSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (currentSrc !== FALLBACK_COVER) {
            setCurrentSrc(FALLBACK_COVER);
          }
          setLoaded(true);
        }}
        className={clsx(
          'h-full w-full object-cover transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
          imgClassName
        )}
      />
    </div>
  );
}