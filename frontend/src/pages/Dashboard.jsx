import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookMarked,
  BookOpenCheck,
  Flame,
  Heart,
  PlayCircle,
} from 'lucide-react';
import { libraryApi } from '../services/api';
import StatsCard from '../components/StatsCard';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';

function safeNumber(value) {
  return Number(value || 0);
}

function formatRelativeTime(dateValue) {
  if (!dateValue) return 'Recently read';

  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();

  if (Number.isNaN(diffMs)) return 'Recently read';

  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;

  return date.toLocaleDateString();
}

function RecentlyReadCard({ item }) {
  const mangaId = item.manga_id || item.id;
  const chapterNumber = item.chapter_number ?? '?';

  return (
    <article className="panel-soft overflow-hidden p-3 transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow)]">
      <div className="flex gap-4">
        <Link
          to={`/manga/${mangaId}`}
          className="relative h-28 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-2)]"
        >
          {item.cover_image ? (
            <img
              src={item.cover_image}
              alt={item.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted">
              No cover
            </div>
          )}

          <div className="absolute left-2 top-2 rounded-full bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-md">
            Recent
          </div>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex h-full flex-col justify-between">
            <div>
              <Link
                to={`/manga/${mangaId}`}
                className="block text-sm font-semibold leading-5 text-[var(--text)] transition hover:text-[var(--primary)]"
              >
                <span
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {item.title || item.manga_title}
                </span>
              </Link>

              <p className="mt-2 text-xs text-muted">
                Chapter {chapterNumber}
              </p>

              <p className="mt-1 text-xs text-muted-2">
                {formatRelativeTime(item.last_read_at || item.read_at)}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2">
              {item.chapter_id ? (
                <Link
                  to={`/reader/${item.chapter_id}`}
                  className="accent-button gap-2 px-3 py-2 text-xs"
                >
                  <PlayCircle className="h-4 w-4" />
                  Continue
                </Link>
              ) : (
                <Link
                  to={`/manga/${mangaId}`}
                  className="ghost-button px-3 py-2 text-xs"
                >
                  View manga
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function ContinueReadingCard({ item }) {
  const progress = item.page_count
    ? Math.min(
        100,
        Math.round(
          (safeNumber(item.read_progress) / safeNumber(item.page_count)) * 100
        )
      )
    : 0;

  return (
    <article className="panel-soft overflow-hidden p-4">
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="relative overflow-hidden rounded-[24px] bg-[var(--surface-2)]">
          <img
            src={item.cover_image || '/placeholder-cover.jpg'}
            alt={item.title}
            className="h-full min-h-[190px] w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
              Continue where you left off
            </div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text)]">
              {item.title}
            </h3>
            <p className="mt-2 text-sm text-muted">
              Chapter {item.chapter_number} • Page {safeNumber(item.read_progress) + 1}
            </p>
          </div>

          <div className="space-y-3">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <div className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>Progress {progress}%</span>
              <span>
                {safeNumber(item.read_progress)}/{safeNumber(item.page_count)} pages
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={`/reader/${item.chapter_id}`}
                className="accent-button gap-2"
              >
                <PlayCircle className="h-4 w-4" />
                Continue
              </Link>

              <Link
                to={`/manga/${item.manga_id}`}
                className="ghost-button gap-2"
              >
                View manga
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

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

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return <LoadingScreen />;
  }

  if (overviewQuery.isError) {
    return (
      <div className="panel-soft p-6 text-sm text-red-500">
        {overviewQuery.error?.message || 'Failed to load dashboard'}
      </div>
    );
  }

  const dashboardData = overviewQuery.data || {};
  const stats = dashboardData.stats || {};
  const continueReading = dashboardData.continue_reading || [];
  const recentlyRead = dashboardData.recently_read || [];
  const recentlyAdded = dashboardData.recent_additions || [];

  return (
    <div className="space-y-8">
      <section className="panel p-6 sm:p-7">
        <div className="grid gap-8 xl:grid-cols-[220px_1fr]">
          <div className="space-y-6">
            <div>
              <p className="text-sm font-medium text-muted">Overview</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance text-[var(--text)]">
                Welcome back to your manga vault.
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted">
                Pick up where you left off, track your reading, and keep your library fresh.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <StatsCard
                title="Total Manga"
                value={safeNumber(stats.total_manga)}
                subtitle="Saved in your library"
                icon={BookMarked}
                tone="primary"
              />
              <StatsCard
                title="Chapters Read"
                value={safeNumber(stats.read_chapters)}
                subtitle="Tracked progress"
                icon={BookOpenCheck}
                tone="accent"
              />
              <StatsCard
                title="Favorites"
                value={safeNumber(stats.favorites)}
                subtitle="Titles you love"
                icon={Heart}
                tone="secondary"
              />
              <StatsCard
                title="Incomplete"
                value={safeNumber(stats.incomplete)}
                subtitle="Need attention"
                icon={Flame}
                tone="neutral"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="section-title">Continue Reading</h2>
              <p className="section-subtitle">
                Quick access to the chapters you already started.
              </p>
            </div>

            {continueReading.length === 0 ? (
              <div className="panel-soft flex min-h-[280px] items-center justify-center p-8 text-center text-muted">
                You have no active reading sessions yet.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {continueReading.slice(0, 2).map((item) => (
                  <ContinueReadingCard
                    key={`${item.manga_id}-${item.chapter_id}`}
                    item={item}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="section-title">Recently Read</h2>
            <p className="section-subtitle">
              Real reading activity from your latest sessions.
            </p>
          </div>

          <Link
            to="/library/history"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] transition hover:opacity-80"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {recentlyRead.length === 0 ? (
          <div className="panel-soft p-8 text-center text-muted">
            No recent reading activity yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentlyRead.map((item, index) => (
              <RecentlyReadCard
                key={`${item.id}-${item.chapter_number}-${index}`}
                item={item}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="section-title">Recently Added</h2>
            <p className="section-subtitle">Newest manga added to your collection.</p>
          </div>

          <Link
            to="/library"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)] transition hover:opacity-80"
          >
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {recentlyAdded.length === 0 ? (
          <div className="panel-soft p-8 text-center text-muted">
            No recently added manga yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {recentlyAdded.map((item) => (
              <MangaCard
                key={item.id}
                manga={item}
                showProgress={false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}