import { motion } from 'framer-motion';
import { TrendingUp, Clock, BookOpen, Target, Star, Calendar } from 'lucide-react';
import clsx from 'clsx';

/**
 * StatsCard - Display reading statistics
 */
export default function StatsCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
  color = 'primary',
  className
}) {
  const colors = {
    primary: 'from-primary-500/20 to-primary-500/5 border-primary-500/30 text-primary-400',
    accent: 'from-accent-500/20 to-accent-500/5 border-accent-500/30 text-accent-400',
    green: 'from-green-500/20 to-green-500/5 border-green-500/30 text-green-400',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 text-amber-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        'p-4 rounded-2xl bg-gradient-to-br border',
        colors[color],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="p-2 rounded-lg bg-dark-900/50">
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <span className={clsx(
            'flex items-center text-xs font-medium',
            trend > 0 ? 'text-green-400' : 'text-red-400'
          )}>
            <TrendingUp className={clsx('w-3 h-3 mr-1', trend < 0 && 'rotate-180')} />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
        {subValue && (
          <p className="text-xs text-gray-500 mt-1">{subValue}</p>
        )}
      </div>
    </motion.div>
  );
}

/**
 * ReadingStats - Comprehensive reading statistics display
 */
export function ReadingStats({ stats, period = 'week' }) {
  const periodLabels = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    all: 'All Time'
  };

  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Reading Statistics</h3>
        <span className="text-sm text-gray-400">{periodLabels[period]}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          icon={BookOpen}
          label="Chapters Read"
          value={stats?.chapters_read || 0}
          color="primary"
        />
        <StatsCard
          icon={Clock}
          label="Time Spent"
          value={formatTime(stats?.total_read_time || 0)}
          color="accent"
        />
        <StatsCard
          icon={Target}
          label="Sessions"
          value={stats?.total_sessions || 0}
          color="green"
        />
        <StatsCard
          icon={Star}
          label="Unique Manga"
          value={stats?.unique_manga || 0}
          color="amber"
        />
      </div>

      {/* Daily Chart */}
      {stats?.daily && stats.daily.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-400 mb-3">Daily Activity</h4>
          <div className="flex items-end gap-1 h-24">
            {stats.daily.slice(0, 14).map((day, index) => {
              const maxValue = Math.max(...stats.daily.map(d => d.read_time || 0));
              const height = maxValue > 0 ? ((day.read_time || 0) / maxValue) * 100 : 0;
              
              return (
                <div
                  key={index}
                  className="flex-1 bg-primary-500/30 rounded-t hover:bg-primary-500/50 transition-colors relative group"
                  style={{ height: `${Math.max(height, 4)}%` }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-dark-800 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {formatTime(day.read_time || 0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * GenreChart - Genre distribution visualization
 */
export function GenreChart({ genres = [] }) {
  const total = genres.reduce((sum, g) => sum + g.manga_count, 0);

  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <h3 className="text-lg font-semibold mb-4">Genre Distribution</h3>
      
      <div className="space-y-3">
        {genres.slice(0, 8).map((genre, index) => {
          const percentage = total > 0 ? (genre.manga_count / total) * 100 : 0;
          
          return (
            <div key={genre.genre} className="group">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-gray-300">{genre.genre}</span>
                <span className="text-gray-500">{genre.manga_count}</span>
              </div>
              <div className="h-2 bg-dark-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * CompletionProgress - Manga completion tracking
 */
export function CompletionProgress({ completion }) {
  const distribution = completion?.distribution || {};

  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <h3 className="text-lg font-semibold mb-4">Library Completion</h3>
      
      {/* Progress rings */}
      <div className="flex justify-center gap-8 mb-6">
        {[
          { label: '0-25%', value: distribution['0-25'] || 0, color: 'bg-red-500' },
          { label: '26-50%', value: distribution['26-50'] || 0, color: 'bg-orange-500' },
          { label: '51-75%', value: distribution['51-75'] || 0, color: 'bg-yellow-500' },
          { label: '76-99%', value: distribution['76-99'] || 0, color: 'bg-blue-500' },
          { label: '100%', value: distribution['100'] || 0, color: 'bg-green-500' },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center mb-2', item.color)}>
              <span className="text-white font-bold">{item.value}</span>
            </div>
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Completed list */}
      {completion?.details?.slice(0, 5).map((manga) => (
        <div key={manga.id} className="flex items-center gap-3 py-2">
          <div className="w-8 h-12 rounded overflow-hidden bg-dark-800">
            {manga.cover_image && (
              <img src={manga.cover_image} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{manga.title}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-dark-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${manga.percentage}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{manga.percentage}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * ReadingGoal - Track reading goals
 */
export function ReadingGoal({ goal, current, period = 'week' }) {
  const progress = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  
  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Reading Goal</h3>
        <Calendar className="w-5 h-5 text-gray-500" />
      </div>

      <div className="relative pt-8">
        {/* Progress circle */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-24">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-dark-800"
            />
            <circle
              cx="48"
              cy="48"
              r="40"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${progress * 2.51} 251`}
              className="text-primary-500 transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>

      <div className="text-center mt-12">
        <p className="text-2xl font-bold">{current}</p>
        <p className="text-gray-400">of {goal} chapters this {period}</p>
      </div>

      {current >= goal && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
          <span className="text-green-400 font-medium">🎉 Goal achieved!</span>
        </div>
      )}
    </div>
  );
}

// Helper function to format time
function formatTime(seconds) {
  if (!seconds) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

