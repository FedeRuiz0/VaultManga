import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { mangaApi } from '../services/api';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';

export default function Library() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('last_read_at');
  const [order, setOrder] = useState('DESC');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryKey = useMemo(
    () => [
      'libraryManga',
      page,
      search,
      sort,
      order,
      selectedStatus,
      favoritesOnly,
      incompleteOnly,
    ],
    [page, search, sort, order, selectedStatus, favoritesOnly, incompleteOnly]
  );

  const mangaQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      mangaApi.getAll(
        {
          page,
          limit: 24,
          search: search || undefined,
          sort,
          order,
          status: selectedStatus || undefined,
          favorites: favoritesOnly ? true : undefined,
          incomplete: incompleteOnly ? true : undefined,
        },
        { signal }
      ),
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
        favoritesOnly,
        incompleteOnly,
      ],
      queryFn: ({ signal }) =>
        mangaApi.getAll(
          {
            page: page + 1,
            limit: 24,
            search: search || undefined,
            sort,
            order,
            status: selectedStatus || undefined,
            favorites: favoritesOnly ? true : undefined,
            incomplete: incompleteOnly ? true : undefined,
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
    favoritesOnly,
    incompleteOnly,
    queryClient,
  ]);

  if (mangaQuery.isLoading && !mangaQuery.data) {
    return <LoadingScreen />;
  }

  if (mangaQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
        {mangaQuery.error?.message || 'Failed to load library'}
      </div>
    );
  }

  const mangaList = mangaQuery.data?.data || [];
  const pagination = mangaQuery.data?.pagination || null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">Library</h1>
        <p className="text-sm text-zinc-400">
          Browse your manga collection with faster search and smoother paging.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search manga..."
          className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-violet-500"
        />

        <select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white"
        >
          <option value="">All status</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
          <option value="hiatus">Hiatus</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white"
        >
          <option value="last_read_at">Last read</option>
          <option value="title">Title</option>
          <option value="updated_at">Updated</option>
          <option value="created_at">Created</option>
          <option value="year">Year</option>
        </select>

        <button
          onClick={() => {
            setOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'));
            setPage(1);
          }}
          className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 text-white"
        >
          {order === 'DESC' ? 'Desc' : 'Asc'}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => {
            setFavoritesOnly((prev) => !prev);
            setPage(1);
          }}
          className={`rounded-xl px-4 py-2 text-sm transition ${
            favoritesOnly
              ? 'bg-violet-600 text-white'
              : 'border border-white/10 bg-zinc-900 text-zinc-300'
          }`}
        >
          Favorites
        </button>

        <button
          onClick={() => {
            setIncompleteOnly((prev) => !prev);
            setPage(1);
          }}
          className={`rounded-xl px-4 py-2 text-sm transition ${
            incompleteOnly
              ? 'bg-violet-600 text-white'
              : 'border border-white/10 bg-zinc-900 text-zinc-300'
          }`}
        >
          Incomplete
        </button>
      </div>

      {mangaQuery.isFetching && (
        <div className="text-sm text-zinc-500">Refreshing library…</div>
      )}

      {mangaList.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-zinc-400">
          No manga found.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
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

      {pagination && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-zinc-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            disabled={page >= pagination.totalPages}
            onClick={() => setPage((prev) => prev + 1)}
            className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}