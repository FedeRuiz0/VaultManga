import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import ProgressiveImage from './ProgressiveImage';

function MangaCard({ manga, showProgress = false }) {
  const progress =
    manga.total_chapters > 0
      ? Math.round((manga.read_chapters / manga.total_chapters) * 100)
      : 0;

  return (
    <Link to={`/manga/${manga.id}`} className="group block">
      <article className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/70 transition hover:border-white/20 hover:bg-zinc-900">
        <div className="relative aspect-[2/3] overflow-hidden bg-zinc-800">
          <ProgressiveImage
            src={manga.cover_image || '/placeholder-cover.jpg'}
            alt={manga.title}
            className="h-full w-full"
            imgClassName="transition-transform duration-300 group-hover:scale-105"
          />

          {manga.is_favorite && (
            <div className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5">
              <Heart className="h-4 w-4 fill-current text-pink-400" />
            </div>
          )}
        </div>

        <div className="space-y-2 p-3">
          <h3 className="line-clamp-2 text-sm font-semibold text-white">
            {manga.title}
          </h3>

          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>{manga.status || 'unknown'}</span>
            <span>{manga.year || '—'}</span>
          </div>

          {showProgress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {manga.read_chapters || 0}/{manga.total_chapters || 0}
                </span>
                <span>{progress}%</span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    progress >= 100 ? 'bg-emerald-500' : 'bg-violet-500'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

export default React.memo(MangaCard);