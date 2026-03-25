import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, ArrowLeft } from 'lucide-react';
import { mangaApi, chapterApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';

export default function MangaDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  const [sortOrder, setSortOrder] = useState('asc');
  const [chapterLanguage, setChapterLanguage] = useState('es');

  const mangaQuery = useQuery({
    queryKey: ['manga', id],
    queryFn: ({ signal }) => mangaApi.getById(id, { signal }),
    enabled: Boolean(id),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const languagesQuery = useQuery({
    queryKey: ['mangaLanguages', id],
    queryFn: ({ signal }) => mangaApi.getLanguages(id, { signal }),
    enabled: Boolean(id),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const chaptersQuery = useQuery({
    queryKey: ['chapters', id, sortOrder, chapterLanguage],
    queryFn: ({ signal }) =>
      chapterApi.getByMangaId(
        id,
        {
          sort: sortOrder,
          language: chapterLanguage,
        },
        { signal }
      ),
    enabled: Boolean(id),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const favoriteMutation = useMutation({
    mutationFn: () => mangaApi.toggleFavorite(id),
    onSuccess: (updatedManga) => {
      queryClient.setQueryData(['manga', id], updatedManga);
      queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardRecentManga'] });
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    },
  });

  useEffect(() => {
    const available = languagesQuery.data || [];
    if (!available.length) return;

    const normalized = available.map((entry) => entry.language);
    if (!normalized.includes(chapterLanguage) && chapterLanguage !== 'all') {
      if (normalized.includes('es')) {
        setChapterLanguage('es');
      } else if (normalized.includes('en')) {
        setChapterLanguage('en');
      } else {
        setChapterLanguage(normalized[0]);
      }
    }
  }, [languagesQuery.data, chapterLanguage]);

  const languageOptions = useMemo(() => {
    const raw = languagesQuery.data || [];
    return raw.map((entry) => ({
      value: entry.language,
      label: entry.language.toUpperCase(),
      chapters: entry.chapters,
    }));
  }, [languagesQuery.data]);

  if (mangaQuery.isLoading && !mangaQuery.data) {
    return <LoadingScreen />;
  }

  if (mangaQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
        {mangaQuery.error?.message || 'Unable to load manga details'}
      </div>
    );
  }

  const manga = mangaQuery.data;
  const chapters = chaptersQuery.data || [];

  return (
    <div className="space-y-6">
      <Link
        to="/library"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to library
      </Link>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
          <div className="aspect-[2/3] bg-zinc-800">
            <img
              src={manga.cover_image || '/placeholder-cover.jpg'}
              alt={manga.title}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.src = '/placeholder-cover.jpg';
              }}
              className="h-full w-full object-cover"
            />
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-white">{manga.title}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-zinc-400">
                <span>{manga.status || 'unknown'}</span>
                <span>•</span>
                <span>{manga.year || '—'}</span>
                <span>•</span>
                <span>{manga.total_chapters || 0} chapters</span>
              </div>
            </div>

            <button
              onClick={() => favoriteMutation.mutate()}
              disabled={favoriteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-zinc-900 px-4 py-2.5 text-white transition hover:border-violet-500 disabled:opacity-50"
            >
              <Heart
                className={`h-4 w-4 ${
                  manga.is_favorite ? 'fill-current text-pink-400' : ''
                }`}
              />
              {manga.is_favorite ? 'Favorited' : 'Favorite'}
            </button>
          </div>

          {manga.description && (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                Description
              </h2>
              <p className="whitespace-pre-line text-sm leading-6 text-zinc-200">
                {manga.description}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={chapterLanguage}
              onChange={(e) => setChapterLanguage(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white"
            >
              {languageOptions.length === 0 ? (
                <option value="es">ES</option>
              ) : (
                languageOptions.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label} ({lang.chapters})
                  </option>
                ))
              )}
            </select>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white"
            >
              <option value="asc">Oldest first</option>
              <option value="desc">Newest first</option>
            </select>
          </div>

          {chaptersQuery.isFetching && (
            <div className="text-sm text-zinc-500">Refreshing chapters…</div>
          )}

          {chaptersQuery.isError ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
              {chaptersQuery.error?.message || 'Failed to load chapters'}
            </div>
          ) : chapters.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 text-center text-zinc-400">
              No chapters available for this language yet.
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60">
              <div className="divide-y divide-white/5">
                {chapters.map((chapter) => (
                  <Link
                    key={chapter.id}
                    to={`/reader/${chapter.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-white/5"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">
                        Chapter {chapter.chapter_number}
                        {chapter.title ? ` — ${chapter.title}` : ''}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {String(chapter.language || 'unknown').toUpperCase()}
                      </div>
                    </div>

                    <div className="text-xs text-zinc-500">
                      {chapter.total_pages || chapter.page_count || 0} pages
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}