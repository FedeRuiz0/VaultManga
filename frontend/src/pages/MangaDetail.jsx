import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Heart,
  MoreVertical,
  Play,
} from 'lucide-react';
import clsx from 'clsx';
import { mangaApi, chapterApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';

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

function getPagesRead(chapter) {
  const pageCount = Number(chapter?.page_count || 0);
  const readProgress = Number(chapter?.read_progress || 0);

  if (chapter?.is_read) return pageCount;
  if (pageCount <= 0) return 0;

  return Math.min(readProgress, pageCount);
}

function getChapterProgress(chapter) {
  const pageCount = Number(chapter?.page_count || 0);
  const pagesRead = getPagesRead(chapter);

  if (pageCount <= 0) return 0;
  return Math.min(100, Math.round((pagesRead / pageCount) * 100));
}

export default function MangaDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sortOrder, setSortOrder] = useState('asc');

  const {
    data: mangaData,
    isLoading: mangaLoading,
    isError: mangaError,
    error: mangaErrorDetails,
  } = useQuery({
    queryKey: ['manga', id],
    queryFn: ({ signal }) => mangaApi.getById(id, { signal }),
    enabled: !!id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const {
    data: chaptersData = [],
    isLoading: chaptersLoading,
    isError: chaptersError,
    error: chaptersErrorDetails,
  } = useQuery({
    queryKey: ['chapters', id, sortOrder],
    queryFn: ({ signal }) =>
      chapterApi.getByMangaId(
        id,
        { sort: sortOrder },
        { signal }
      ),
    enabled: !!id,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const manga = mangaData?.data || mangaData;
  const chapters = chaptersData?.data || chaptersData || [];
  const genres = normalizeGenres(manga?.genre);

  const readChapters = useMemo(
    () => chapters.filter((chapter) => chapter.is_read).length,
    [chapters]
  );

  const totalChapters = chapters.length;

  const totalPages = useMemo(
    () =>
      chapters.reduce(
        (sum, chapter) => sum + Number(chapter?.page_count || 0),
        0
      ),
    [chapters]
  );

  const totalPagesRead = useMemo(
    () =>
      chapters.reduce((sum, chapter) => sum + getPagesRead(chapter), 0),
    [chapters]
  );

  const overallProgress =
    totalPages > 0 ? Math.min(100, Math.round((totalPagesRead / totalPages) * 100)) : 0;

  const nextChapterToRead = useMemo(() => {
    const inProgress = chapters.find(
      (chapter) => !chapter.is_read && Number(chapter.read_progress || 0) > 0
    );
    if (inProgress) return inProgress;

    return chapters.find((chapter) => !chapter.is_read) || chapters[0] || null;
  }, [chapters]);

  const handleToggleFavorite = async () => {
    try {
      await mangaApi.toggleFavorite(id);
      queryClient.invalidateQueries({ queryKey: ['manga', id] });
      queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleReadChapter = (chapterId) => {
    navigate(`/reader/${chapterId}`);
  };

  const handleContinueReading = () => {
    if (nextChapterToRead) {
      handleReadChapter(nextChapterToRead.id);
    }
  };

  if (mangaLoading || chaptersLoading) {
    return <LoadingScreen />;
  }

  if (mangaError || chaptersError) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)]">
          Unable to load manga details
        </h2>
        <p className="mt-2 text-muted">
          {mangaErrorDetails?.message ||
            chaptersErrorDetails?.message ||
            'Please try again.'}
        </p>
        <button
          onClick={() => navigate('/library')}
          className="mt-4 text-[var(--primary)] hover:opacity-80"
        >
          Back to Library
        </button>
      </div>
    );
  }

  if (!manga) {
    return (
      <div className="py-16 text-center">
        <h2 className="text-xl font-semibold text-[var(--text)]">
          Manga not found
        </h2>
        <button
          onClick={() => navigate('/library')}
          className="mt-4 text-[var(--primary)] hover:opacity-80"
        >
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-8">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-muted transition hover:text-[var(--text)]"
      >
        <ArrowLeft className="h-5 w-5" />
        Back
      </button>

      <div className="relative">
        {manga.cover_image ? (
          <div className="absolute inset-0 overflow-hidden rounded-[28px]">
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/80 to-transparent" />
            <img
              src={manga.cover_image}
              alt=""
              className="h-full w-full scale-110 object-cover opacity-20 blur-3xl"
            />
          </div>
        ) : null}

        <div className="panel relative grid gap-8 p-6 md:grid-cols-[260px_1fr] md:p-8">
          <div className="overflow-hidden rounded-[24px] bg-[var(--surface-2)]">
            {manga.cover_image ? (
              <img
                src={manga.cover_image}
                alt={manga.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center">
                <BookOpen className="h-16 w-16 text-muted" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
                  {manga.title}
                </h1>

                {Array.isArray(manga.alt_titles) && manga.alt_titles.length > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    {manga.alt_titles.slice(0, 3).join(' • ')}
                  </p>
                ) : null}
              </div>

              <button
                onClick={handleToggleFavorite}
                className={clsx(
                  'flex h-12 w-12 items-center justify-center rounded-2xl border transition',
                  manga.is_favorite
                    ? 'border-pink-400/30 bg-pink-400/10 text-pink-400'
                    : 'border-[var(--border)] bg-[var(--surface)] text-muted hover:text-[var(--text)]'
                )}
              >
                <Heart
                  className={clsx('h-5 w-5', manga.is_favorite && 'fill-current')}
                />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3 text-sm text-muted">
              {manga.author ? (
                <span>
                  <span className="font-medium text-[var(--text)]">Author:</span>{' '}
                  {manga.author}
                </span>
              ) : null}

              {manga.artist ? (
                <span>
                  <span className="font-medium text-[var(--text)]">Artist:</span>{' '}
                  {manga.artist}
                </span>
              ) : null}

              {manga.year ? (
                <span>
                  <span className="font-medium text-[var(--text)]">Year:</span>{' '}
                  {manga.year}
                </span>
              ) : null}

              {manga.status ? (
                <span
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]',
                    manga.status === 'completed'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : manga.status === 'ongoing'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-amber-500/15 text-amber-400'
                  )}
                >
                  {manga.status}
                </span>
              ) : null}

              {manga.is_incomplete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Incomplete
                </span>
              ) : null}
            </div>

            {genres.length > 0 ? (
              <div className="mt-6 flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            ) : null}

            {manga.description ? (
              <div className="mt-6">
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted">
                  Description
                </h2>
                <p className="whitespace-pre-line text-sm leading-7 text-[var(--text)]">
                  {manga.description}
                </p>
              </div>
            ) : null}

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted">Reading Progress</span>
                <span className="font-medium text-[var(--text)]">
                  {readChapters}/{totalChapters} chapters completed • {totalPagesRead}/{totalPages} pages ({overallProgress}%)
                </span>
              </div>

              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={handleContinueReading}
                disabled={chapters.length === 0}
                className="accent-button gap-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                {totalPagesRead > 0 ? 'Continue Reading' : 'Start Reading'}
              </button>

              <button className="ghost-button">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <section className="panel-soft p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Chapters</h2>
            <p className="text-sm text-muted">Browse all available chapters.</p>
          </div>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] outline-none"
          >
            <option value="asc">Oldest first</option>
            <option value="desc">Newest first</option>
          </select>
        </div>

        {chapters.length === 0 ? (
          <div className="p-6 text-center text-muted">
            No chapters available yet.
          </div>
        ) : (
          <div className="space-y-3">
            {chapters.map((chapter) => {
              const chapterProgress = getChapterProgress(chapter);
              const pagesRead = getPagesRead(chapter);
              const pageCount = Number(chapter?.page_count || 0);

              return (
                <button
                  key={chapter.id}
                  onClick={() => handleReadChapter(chapter.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left transition hover:bg-[var(--surface-2)]"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="font-medium text-[var(--text)]">
                      Chapter {chapter.chapter_number}
                      {chapter.title ? ` — ${chapter.title}` : ''}
                    </div>

                    <div className="mt-1 text-xs text-muted">
                      {chapter.language
                        ? chapter.language.toUpperCase()
                        : 'Unknown language'}
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                        <span>
                          {chapter.is_read
                            ? 'Completed'
                            : chapterProgress > 0
                            ? `${chapterProgress}% read`
                            : 'Not started'}
                        </span>

                        {pageCount > 0 ? (
                          <span>
                            {pagesRead}/{pageCount} pages
                          </span>
                        ) : null}
                      </div>

                      <div className="progress-track h-1.5">
                        <div
                          className="progress-fill h-1.5"
                          style={{ width: `${chapterProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className={clsx(
                      'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]',
                      chapter.is_read
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : chapterProgress > 0
                        ? 'bg-[var(--primary-soft)] text-[var(--primary)]'
                        : 'bg-[var(--surface-2)] text-muted'
                    )}
                  >
                    {chapter.is_read
                      ? 'Read'
                      : chapterProgress > 0
                      ? 'Reading'
                      : 'Unread'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}