import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  BookOpen, 
  Clock, 
  Heart, 
  AlertTriangle,
  ChevronRight,
  Play
} from 'lucide-react';
import { libraryApi } from '../services/api';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';

export default function Dashboard() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['libraryOverview'],
    queryFn: () => libraryApi.getOverview()
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  // Accedemos directamente a los datos del API
  const stats = {
    total_manga: Number(overview?.stats?.total_manga) || 0,
    unread_chapters: Number(overview?.stats?.unread_chapters) || 0,
    favorites: Number(overview?.stats?.favorites) || 0,
    incomplete: Number(overview?.stats?.incomplete) || 0
  };

  const continueReading = overview?.continue_reading || [];
  const recentlyRead = overview?.recently_read || [];
  const recentAdditions = overview?.recent_additions || [];
  const favorites = overview?.favorites || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold font-display">Welcome back!</h1>
        <p className="text-gray-400 mt-1">Continue your reading journey</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={BookOpen}
          label="Total Manga"
          value={stats.total_manga}
          color="primary"
        />
        <StatCard
          icon={Clock}
          label="Unread Chapters"
          value={stats.unread_chapters}
          color="accent"
        />
        <StatCard
          icon={Heart}
          label="Favorites"
          value={stats.favorites}
          color="rose"
        />
        <StatCard
          icon={AlertTriangle}
          label="Incomplete"
          value={stats.incomplete}
          color="amber"
        />
      </div>

      {/* Continue Reading */}
      {continueReading.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-display">Continue Reading</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {continueReading.map((item, index) => (
              <motion.div
                key={item.chapter_id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <ContinueReadingCard item={item} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Recently Read */}
      {recentlyRead.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-display">Recently Read</h2>
            <Link 
              to="/library/history" 
              className="text-primary-400 hover:text-primary-300 flex items-center gap-1 text-sm"
            >
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {recentlyRead.slice(0, 5).map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <MangaCard manga={item} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Additions */}
      {recentAdditions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-display">Recently Added</h2>
            <Link 
              to="/library" 
              className="text-primary-400 hover:text-primary-300 flex items-center gap-1 text-sm"
            >
              View library <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {recentAdditions.slice(0, 5).map((manga, index) => (
              <motion.div
                key={manga.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <MangaCard manga={manga} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-display">Your Favorites</h2>
            <Link 
              to="/library/favorites" 
              className="text-primary-400 hover:text-primary-300 flex items-center gap-1 text-sm"
            >
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {favorites.slice(0, 5).map((manga, index) => (
              <motion.div
                key={manga.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <MangaCard manga={manga} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {(!recentAdditions.length && !continueReading.length && !recentlyRead.length) && (
        <div className="text-center py-16">
          <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Your library is empty</h3>
          <p className="text-gray-400 mb-6">Add some manga to get started</p>
          <Link 
            to="/library"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 rounded-xl font-medium transition-colors"
          >
            <Play className="w-5 h-5" />
            Browse Library
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    primary: 'from-primary-500/20 to-primary-500/5 border-primary-500/30',
    accent: 'from-accent-500/20 to-accent-500/5 border-accent-500/30',
    rose: 'from-rose-500/20 to-rose-500/5 border-rose-500/30',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
  };

  const iconColors = {
    primary: 'text-primary-400',
    accent: 'text-accent-400',
    rose: 'text-rose-400',
    amber: 'text-amber-400',
  };

  return (
    <div className={`p-4 rounded-2xl bg-gradient-to-br ${colors[color]} border`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-dark-900/50 ${iconColors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ContinueReadingCard({ item }) {
  const progress = item.page_count > 0 
    ? Math.round((item.read_progress / item.page_count) * 100) 
    : 0;

  return (
    <Link 
      to={`/reader/${item.chapter_id}`}
      className="group block p-3 bg-dark-900 rounded-xl border border-dark-800 hover:border-dark-700 transition-all"
    >
      <div className="flex gap-3">
        <div className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-dark-800">
          {item.cover_image ? (
            <img 
              src={item.cover_image} 
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-dark-600" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate group-hover:text-primary-400 transition-colors">
            {item.title}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Chapter {item.chapter_number}
          </p>
          <div className="mt-2">
            <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">{progress}% complete</p>
          </div>
        </div>
      </div>
    </Link>
  );
}