import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Clock } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { mangaApi } from '../services/api.js';
import clsx from 'clsx';

/**
 * SearchBar - Connected to backend (MangaDex on-demand)
 */
export default function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search manga...',
  recentSearches = [],
  className
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  /**
   * 🔥 FETCH A TU BACKEND
   */
  const fetchSuggestions = async (query) => {
    if (!query || query.length < 2) {setSuggestions([]);
       return;
      } try {setLoading(true); 
        const results = await mangaApi.searchManga(query);
        setSuggestions(results);
      } catch (err) {console.error('Search error:', err);
        setSuggestions([]);
      } finally {setLoading(false);
        
      }};

  /**
   * 🔥 DEBOUNCE (SUPER IMPORTANTE)
   */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(localValue);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [localValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch?.(localValue);
  };

  const handleClear = () => {
    setLocalValue('');
    setSuggestions([]);
    onChange?.('');
    inputRef.current?.focus();
  };

  const showSuggestions =
    isFocused && (localValue.length > 0 || recentSearches.length > 0);

  return (
    <div className={clsx('relative', className)}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange?.(e.target.value);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder={placeholder}
            className="w-full pl-12 pr-10 py-3 bg-dark-800 border border-dark-700 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
          />

          {localValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-dark-700 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </form>

      {/* DROPDOWN */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-dark-900 border border-dark-800 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* RECENT */}
            {!localValue && recentSearches.length > 0 && (
              <div className="p-2">
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  Recent Searches
                </div>

                {recentSearches.slice(0, 5).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setLocalValue(item);
                      onChange?.(item);
                      onSearch?.(item);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-800 transition-colors text-left"
                  >
                    <Clock className="w-4 h-4 text-gray-600" />
                    <span className="text-sm">{item}</span>
                  </button>
                ))}
              </div>
            )}

            {/* LOADING */}
            {loading && (
              <div className="p-4 text-center text-gray-500 text-sm">
                Searching...
              </div>
            )}

            {/* RESULTS */}
            {!loading && localValue && suggestions.length > 0 && (
              <div className="p-2">
                {suggestions.map((manga) => (
                  <Link
                    key={manga.id}
                    to={`/manga/${manga.id}`}
                    onClick={() => setIsFocused(false)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-800 transition-colors"
                  >
                    <div className="w-10 h-14 rounded overflow-hidden bg-dark-800 flex-shrink-0">
                      {manga.cover_image && (
                        <img
                          src={manga.cover_image}
                          alt={manga.title}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {manga.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {manga.author || 'Unknown'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* EMPTY */}
            {!loading && localValue && suggestions.length === 0 && (
              <div className="p-4 text-center text-gray-500">
                No results found for "{localValue}"
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}