import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { libraryApi } from '../services/api';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';

export default function History() {
  const [page, setPage] = useState(1);

  const recentReadQuery = useQuery({
    queryKey: ['recentReadPage', page],
    queryFn: ({ signal }) =>
      libraryApi.getRecentRead(
        {
          page,
          limit: 24,
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

  if (recentReadQuery.isLoading && !recentReadQuery.data) {
    return <LoadingScreen />;
  }

  if (recentReadQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
        {recentReadQuery.error?.message || 'Failed to load recently read manga'}
      </div>
    );
  }

  const recentlyRead = recentReadQuery.data?.data || [];
  const pagination = recentReadQuery.data?.pagination || null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display">Recently Read</h1>
          <p className="text-gray-400">
            Manga you interacted with most recently.
          </p>
        </div>

        <Link
          to="/library"
          className="text-primary-400 hover:text-primary-300 flex items-center gap-1 text-sm"
        >
          Full Library
        </Link>
      </div>

      {recentReadQuery.isFetching && (
        <div className="text-sm text-gray-500">Refreshing recently read...</div>
      )}

      {recentlyRead.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {recentlyRead.map((manga) => (
            <MangaCard key={manga.id} manga={manga} showProgress />
          ))}
        </div>
      ) : (
        <p className="text-gray-400">No recently read manga yet.</p>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-white/10 bg-dark-800 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-gray-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            onClick={() =>
              setPage((prev) =>
                pagination?.totalPages ? Math.min(pagination.totalPages, prev + 1) : prev + 1
              )
            }
            disabled={page >= pagination.totalPages}
            className="rounded-xl border border-white/10 bg-dark-800 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}