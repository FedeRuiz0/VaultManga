import { Link } from 'react-router-dom';
import { Heart, BookOpen } from 'lucide-react';
import clsx from 'clsx';

export default function MangaCard({ manga, showProgress = false }) {
  const progress = manga.total_chapters > 0 
    ? Math.round((manga.read_chapters / manga.total_chapters) * 100)
    : 0;

  return (
    <Link 
      to={`/manga/${manga.id}`}
      className="group block"
    >
      <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-dark-800 mb-3">
        {/* Cover Image */}
        {manga.cover_image ? (
          <img 
            src={manga.cover_image} 
            alt={manga.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-12 h-12 text-dark-600" />
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-0 left-0 right-0 p-3">
            {showProgress && manga.total_chapters > 0 && (
              <div className="mb-2">
                <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {manga.read_chapters}/{manga.total_chapters} chapters
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Favorite badge */}
        {manga.is_favorite && (
          <div className="absolute top-2 right-2 p-1.5 rounded-lg bg-accent-500/20 backdrop-blur-sm">
            <Heart className="w-4 h-4 text-accent-400 fill-accent-400" />
          </div>
        )}

        {/* Incomplete badge */}
        {manga.is_incomplete && (
          <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-amber-500/20 backdrop-blur-sm text-xs text-amber-400">
            Incomplete
          </div>
        )}
      </div>

      {/* Title */}
      <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary-400 transition-colors">
        {manga.title}
      </h3>

      {/* Progress bar (always visible when showProgress is true) */}
      {showProgress && manga.total_chapters > 0 && (
        <div className="mt-2">
          <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {manga.read_chapters}/{manga.total_chapters} chapters ({progress}%)
          </p>
        </div>
      )}
    </Link>
  );
}

