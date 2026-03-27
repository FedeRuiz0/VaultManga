import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Heart } from 'lucide-react';
import clsx from 'clsx';
import ProgressiveImage from './ProgressiveImage';

function normalizeGenres(genre) {
  if (Array.isArray(genre)) return genre;
  if (typeof genre === 'string') {
    try {
      const parsed = JSON.parse(genre);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function MangaCard({ manga, showProgress = false }) {
  const totalChapters = Number(manga?.total_chapters || 0);
  const readChapters = Number(manga?.read_chapters || 0);
  const progress =
    totalChapters > 0 ? Math.round((readChapters / totalChapters) * 100) : 0;

  const genres = normalizeGenres(manga?.genre);
  const visibleGenres = genres.slice(0, 2);
  const remainingGenres = Math.max(genres.length - visibleGenres.length, 0);

  return (
    <Link to={`/manga/${manga.id}`} className="group block">
      <article className="panel-soft overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow)]">
        <div className="relative aspect-[0.78] overflow-hidden rounded-[20px] bg-[var(--surface-2)]">
          <ProgressiveImage
            src={manga.cover_image || '/placeholder-cover.jpg'}
            alt={manga.title}
            className="h-full w-full"
            imgClassName="transition-transform duration-500 group-hover:scale-105"
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {manga.status ? (
              <span className="rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
                {manga.status}
              </span>
            ) : null}

            {manga.is_incomplete ? (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 backdrop-blur-md">
                Incomplete
              </span>
            ) : null}
          </div>

          {manga.is_favorite ? (
            <div className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-2xl bg-black/35 text-white backdrop-blur-md">
              <Heart className="h-4 w-4 fill-current" />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 p-4">
          <div>
            <h3
              className="text-sm font-semibold text-[var(--text)]"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {manga.title}
            </h3>

            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>{manga.year || 'Unknown year'}</span>
              <span>{totalChapters || 0} chapters</span>
            </div>
          </div>

          {visibleGenres.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {visibleGenres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted"
                >
                  {genre}
                </span>
              ))}

              {remainingGenres > 0 ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
                  +{remainingGenres}
                </span>
              ) : null}
            </div>
          ) : null}

          {showProgress ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {readChapters}/{totalChapters || 0}
                </span>
                <span>{progress}%</span>
              </div>

              <div className="progress-track">
                <div
                  className={clsx('progress-fill')}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}

export default React.memo(MangaCard);