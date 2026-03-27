import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Filter, RotateCcw } from 'lucide-react';
import { mangaApi } from '../services/api';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = [];

  for (let year = currentYear; year >= 1980; year -= 1) {
    years.push(String(year));
  }

  return years;
}

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

export default function Library() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('last_read_at');
  const [order, setOrder] = useState('DESC');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const yearOptions = useMemo(() => buildYearOptions(), []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const genresQuery = useQuery({
    queryKey: ['libraryGenres'],
    queryFn: ({ signal }) => mangaApi.getGenres({ signal }),
    staleTime: 10 * 60_000,
    gcTime: 20 * 60_000,
    refetchOnWindowFocus: false,
    retry: 0,
  });

  const queryKey = useMemo(
    () => [
      'libraryManga',
      page,
      search,
      sort,
      order,
      selectedStatus,
      selectedGenre,
      selectedYear,
      favoritesOnly,
      incompleteOnly,
    ],
    [
      page,
      search,
      sort,
      order,
      selectedStatus,
      selectedGenre,
      selectedYear,
      favoritesOnly,
      incompleteOnly,
    ]
  );

  const queryParams = useMemo(
    () => ({
      page,
      limit: 24,
      search: search || undefined,
      sort,
      order,
      status: selectedStatus || undefined,
      genre: selectedGenre || undefined,
      year: selectedYear || undefined,
      favorites: favoritesOnly ? true : undefined,
      incomplete: incompleteOnly ? true : undefined,
    }),
    [
      page,
      search,
      sort,
      order,
      selectedStatus,
      selectedGenre,
      selectedYear,
      favoritesOnly,
      incompleteOnly,
    ]
  );

  const mangaQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => mangaApi.getAll(queryParams, { signal }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: [
        'libraryManga',
        page + 1,
        search,
        sort,
        order,
        selectedStatus,
        selectedGenre,
        selectedYear,
        favoritesOnly,
        incompleteOnly,
      ],
      queryFn: ({ signal }) =>
        mangaApi.getAll(
          {
            ...queryParams,
            page: page + 1,
          },
          { signal }
        ),
      staleTime: 60_000,
    });
  }, [
    page,
    search,
    sort,
    order,
    selectedStatus,
    selectedGenre,
    selectedYear,
    favoritesOnly,
    incompleteOnly,
    queryClient,
    queryParams,
  ]);

  const mangaList = useMemo(() => {
    return mangaQuery.data?.data || [];
  }, [mangaQuery.data]);

  const pagination = useMemo(() => {
    return mangaQuery.data?.pagination || null;
  }, [mangaQuery.data]);

  const availableGenres = useMemo(() => {
    const apiGenresRaw = genresQuery.data;
    const apiGenres = Array.isArray(apiGenresRaw)
      ? apiGenresRaw
      : Array.isArray(apiGenresRaw?.data)
      ? apiGenresRaw.data
      : [];

    const genreSet = new Set();

    apiGenres.forEach((genre) => {
      if (genre) genreSet.add(genre);
    });

    mangaList.forEach((manga) => {
      normalizeGenres(manga.genre).forEach((genre) => {
        if (genre) genreSet.add(genre);
      });
    });

    return Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  }, [genresQuery.data, mangaList]);

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setSort('last_read_at');
    setOrder('DESC');
    setSelectedStatus('');
    setSelectedGenre('');
    setSelectedYear('');
    setFavoritesOnly(false);
    setIncompleteOnly(false);
    setPage(1);
  };

  const isInitialLoading = mangaQuery.isLoading && !mangaQuery.data;
  const isError = mangaQuery.isError;
  const errorMessage = mangaQuery.error?.message || 'Failed to load library';

  if (isInitialLoading) {
    return <LoadingScreen />;
  }

  if (isError) {
    return (
      <div className="panel-soft p-6 text-sm text-red-500">
        {errorMessage}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-[var(--text)]">Library</h1>
        <p className="text-sm text-muted">
          Browse your manga collection with search, filters, and cleaner discovery.
        </p>
      </div>

      <section className="panel-soft p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
          <Filter className="h-4 w-4" />
          Filters
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search manga..."
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none transition focus:border-[var(--primary)]"
          />

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none"
          >
            <option value="">All status</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="hiatus">Hiatus</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={selectedGenre}
            onChange={(e) => {
              setSelectedGenre(e.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none"
          >
            <option value="">All genres</option>
            {availableGenres.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setPage(1);
            }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none"
          >
            <option value="">All years</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-3">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none"
            >
              <option value="last_read_at">Last read</option>
              <option value="title">Title</option>
              <option value="updated_at">Updated</option>
              <option value="created_at">Created</option>
              <option value="year">Year</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'));
                setPage(1);
              }}
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] transition hover:opacity-90"
            >
              {order === 'DESC' ? 'Desc' : 'Asc'}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFavoritesOnly((prev) => !prev);
              setPage(1);
            }}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              favoritesOnly
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
            }`}
          >
            Favorites
          </button>

          <button
            type="button"
            onClick={() => {
              setIncompleteOnly((prev) => !prev);
              setPage(1);
            }}
            className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
              incompleteOnly
                ? 'bg-[var(--primary)] text-white'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
            }`}
          >
            Incomplete
          </button>

          <button
            type="button"
            onClick={resetFilters}
            className="ghost-button gap-2 px-4 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </section>

      {mangaQuery.isFetching ? (
        <div className="text-sm text-muted">Refreshing library…</div>
      ) : null}

      {genresQuery.isError ? (
        <div className="text-xs text-muted">
          Genre list could not be loaded from metadata, using visible manga genres instead.
        </div>
      ) : null}

      {mangaList.length === 0 ? (
        <div className="panel-soft p-8 text-center text-muted">
          No manga found with the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {mangaList.map((manga) => (
            <motion.div
              key={manga.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <MangaCard manga={manga} showProgress />
            </motion.div>
          ))}
        </div>
      )}

      {pagination ? (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-muted">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((prev) => prev + 1)}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}