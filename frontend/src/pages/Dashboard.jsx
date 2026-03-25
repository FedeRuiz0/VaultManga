import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { libraryApi, mangaApi } from '../services/api';
import StatsCard from '../components/StatsCard';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';

export default function Dashboard() {
  const overviewQuery = useQuery({
    queryKey: ['libraryOverview'],
    queryFn: ({ signal }) => libraryApi.getOverview({ signal }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const recentReadQuery = useQuery({
    queryKey: ['dashboardRecentRead'],
    queryFn: ({ signal }) =>
      mangaApi.getAll(
        {
          page: 1,
          limit: 8,
          sort: 'last_read_at',
          order: 'DESC',
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

  const recentAddedQuery = useQuery({
    queryKey: ['dashboardRecentAdded'],
    queryFn: ({ signal }) =>
      mangaApi.getAll(
        {
          page: 1,
          limit: 8,
          sort: 'created_at',
          order: 'DESC',
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

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingScreen />;
  }

  if (overviewQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
        {overviewQuery.error?.message || 'Failed to load dashboard'}
      </div>
    );
  }

  const overview = overviewQuery.data || {};
  const recentRead = recentReadQuery.data?.data || [];
  const recentAdded = recentAddedQuery.data?.data || [];

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-zinc-400">
            Quick overview of your library and reading activity.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatsCard title="Total Manga" value={overview.total_manga ?? 0} subtitle="Saved in your library" />
          <StatsCard title="Total Chapters" value={overview.total_chapters ?? 0} subtitle="Across all manga" />
          <StatsCard title="Read Chapters" value={overview.read_chapters ?? 0} subtitle="Reading progress tracked" />
          <StatsCard title="Favorites" value={overview.favorite_manga ?? 0} subtitle="Marked as favorite" />
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Recently Read</h2>
            <p className="text-sm text-zinc-400">Your latest manga activity.</p>
          </div>

          <Link
            to="/library"
            className="text-sm font-medium text-violet-400 transition hover:text-violet-300"
          >
            View all
          </Link>
        </div>

        {recentRead.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-zinc-400">
            No recent activity yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {recentRead.map((manga) => (
              <MangaCard key={manga.id} manga={manga} showProgress />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Recently Added</h2>
            <p className="text-sm text-zinc-400">Newest manga added to your library.</p>
          </div>

          <Link
            to="/library"
            className="text-sm font-medium text-violet-400 transition hover:text-violet-300"
          >
            View all
          </Link>
        </div>

        {recentAdded.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center text-zinc-400">
            No recently added manga yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {recentAdded.map((manga) => (
              <MangaCard key={manga.id} manga={manga} showProgress={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}