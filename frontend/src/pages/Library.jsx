import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Grid, 
  List, 
  Search, 
  Filter, 
  Plus,
  SortAsc,
  SortDesc,
  Heart,
  BookOpen,
  AlertTriangle
} from 'lucide-react';
import { mangaApi } from '../services/api';
import MangaCard from '../components/MangaCard';
import LoadingScreen from '../components/LoadingScreen';
import clsx from 'clsx';

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
];

const sortOptions = [
  { value: 'last_read_at', label: 'Recently Read' },
  { value: 'created_at', label: 'Date Added' },
  { value: 'title', label: 'Title' },
  { value: 'year', label: 'Year' },
];

export default function Library() {
  const { status } = useParams();
  const [viewMode, setViewMode] = useState('grid');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('last_read_at');
  const [order, setOrder] = useState('DESC');
  const [selectedStatus, setSelectedStatus] = useState(status || '');

  const isFavorites = window.location.pathname.includes('favorites');
  const isIncomplete = window.location.pathname.includes('incomplete');

  const { data, isLoading } = useQuery({
    queryKey: ['manga', page, search, sort, order, selectedStatus, isFavorites, isIncomplete],
    queryFn: () => mangaApi.getAll({
      page,
      limit: 24,
      search: search || undefined,
      sort,
      order,
      status: selectedStatus || undefined,
      favorites: isFavorites ? true : undefined,
      incomplete: isIncomplete ? true : undefined,
    })
  });

  const handleSort = (value) => {
    if (value === sort) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSort(value);
      setOrder('DESC');
    }
  };

  if (isLoading) {
    return <LoadingScreen />;
  }

  const mangaList = data?.data || [];
  const pagination = data?.pagination || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">
            {isFavorites ? 'Favorites' : isIncomplete ? 'Incomplete' : 'Library'}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {pagination.total || 0} manga in your library
          </p>
        </div>
        
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 rounded-xl font-medium transition-colors">
          <Plus className="w-5 h-5" />
          Add Manga
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search manga..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-900 border border-dark-800 rounded-xl text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setSelectedStatus(filter.value)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                selectedStatus === filter.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-900 text-gray-400 hover:bg-dark-800 hover:text-gray-200'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* View Mode */}
        <div className="flex items-center gap-1 p-1 bg-dark-900 rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx(
              'p-2 rounded-md transition-colors',
              viewMode === 'grid' ? 'bg-dark-700 text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'p-2 rounded-md transition-colors',
              viewMode === 'list' ? 'bg-dark-700 text-white' : 'text-gray-400 hover:text-white'
            )}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        {/* Sort */}
        <div className="relative group">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-dark-900 border border-dark-800 rounded-xl text-sm hover:border-dark-700 transition-colors">
            <SortAsc className="w-4 h-4 text-gray-400" />
            <span>{sortOptions.find(s => s.value === sort)?.label}</span>
          </button>
          <div className="absolute right-0 top-full mt-2 w-48 py-2 bg-dark-900 border border-dark-800 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            {sortOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSort(option.value)}
                className={clsx(
                  'w-full px-4 py-2 text-left text-sm hover:bg-dark-800 transition-colors',
                  sort === option.value ? 'text-primary-400' : 'text-gray-300'
                )}
              >
                {option.label}
                {sort === option.value && (
                  order === 'ASC' ? ' ↑' : ' ↓'
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Manga Grid */}
      {mangaList.length > 0 ? (
        <div className={clsx(
          viewMode === 'grid' 
            ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'
            : 'space-y-3'
        )}>
          {mangaList.map((manga, index) => (
            <motion.div
              key={manga.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              {viewMode === 'grid' ? (
                <MangaCard manga={manga} showProgress />
              ) : (
                <MangaListItem manga={manga} />
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <BookOpen className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No manga found</h3>
          <p className="text-gray-400">
            {search ? 'Try a different search term' : 'Add some manga to get started'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-dark-900 text-gray-400 hover:bg-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="px-4 text-sm text-gray-400">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="px-4 py-2 rounded-lg bg-dark-900 text-gray-400 hover:bg-dark-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function MangaListItem({ manga }) {
  const progress = manga.total_chapters > 0 
    ? Math.round((manga.read_chapters / manga.total_chapters) * 100)
    : 0;

  return (
    <Link 
      to={`/manga/${manga.id}`}
      className="flex gap-4 p-3 bg-dark-900 rounded-xl border border-dark-800 hover:border-dark-700 transition-all"
    >
      <div className="w-16 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-dark-800">
        {manga.cover_image ? (
          <img 
            src={manga.cover_image} 
            alt={manga.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-dark-600" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium truncate">{manga.title}</h3>
        <p className="text-sm text-gray-400 mt-1">
          {manga.author || 'Unknown author'}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-500">
            {manga.total_chapters} chapters
          </span>
          {manga.is_favorite && (
            <Heart className="w-4 h-4 text-accent-400 fill-accent-400" />
          )}
          {manga.is_incomplete && (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          )}
        </div>
        <div className="mt-2">
          <div className="h-1 bg-dark-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

