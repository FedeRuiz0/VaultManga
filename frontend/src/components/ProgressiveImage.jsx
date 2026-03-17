import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';

/**
 * ProgressiveImage - A component that loads images progressively
 * Shows a blur placeholder first, then loads the full quality image
 */
export default function ProgressiveImage({
  src,
  alt,
  className,
  placeholderSrc,
  onLoad,
  onError,
  fitMode = 'width' // 'width', 'height', 'contain', 'cover'
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Reset state when src changes
    setIsLoaded(false);
    setIsLoading(true);
    setError(false);
  }, [src]);

  const handleLoad = () => {
    setIsLoading(false);
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setIsLoading(false);
    setError(true);
    onError?.();
  };

  const objectFitClasses = {
    width: 'w-full h-auto',
    height: 'h-screen w-auto object-contain',
    contain: 'object-contain',
    cover: 'object-cover'
  };

  return (
    <div className={clsx('relative', className)}>
      {/* Loading placeholder */}
      {(isLoading || !isLoaded) && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      )}

      {/* Low quality placeholder / blur */}
      {placeholderSrc && !isLoaded && (
        <img
          src={placeholderSrc}
          alt={alt}
          className={clsx(
            'absolute inset-0 w-full h-full object-cover blur-xl scale-110',
            objectFitClasses[fitMode]
          )}
          aria-hidden="true"
        />
      )}

      {/* Main image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        className={clsx(
          objectFitClasses[fitMode],
          'transition-opacity duration-500',
          isLoaded ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-900 text-gray-500">
          <span>Failed to load image</span>
        </div>
      )}
    </div>
  );
}

