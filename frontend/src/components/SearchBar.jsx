import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock3, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { mangaApi } from '../services/api.js';

export default function SearchBar({
  value = '',
  onChange,
  onSearch,
  placeholder = 'Search manga...',
  recentSearches = [],
  className,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const fetchSuggestions = async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      setLoading(true);
      const response = await mangaApi.search(query.trim(), 6);
      const items = Array.isArray(response) ? response : response?.data || [];
      setSuggestions(items);
    } catch (error) {
      console.error('Search error:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(localValue);
    }, 320);

    return () => clearTimeout(debounceRef.current);
  }, [localValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!localValue.trim()) return;
    onSearch?.(localValue.trim());
  };

  const handleClear = () => {
    setLocalValue('');
    setSuggestions([]);
    onChange?.('');
    inputRef.current?.focus();
  };

  const showSuggestions =
    isFocused &&
    (localValue.trim().length > 0 || recentSearches.length > 0 || loading);

  return (
    <div className={clsx('relative', className)}>
      <form onSubmit={handleSubmit}>
        <div className="search-shell relative flex items-center gap-3 px-4 py-3">
          <Search className="h-4 w-4 text-muted" />

          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onChange?.(e.target.value);
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 160)}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-muted"
          />

          {localValue ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted transition hover:text-[var(--text)]"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </form>

      <AnimatePresence>
        {showSuggestions ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="panel-soft absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden"
          >
            {loading ? (
              <div className="px-4 py-4 text-sm text-muted">Searching...</div>
            ) : suggestions.length > 0 ? (
              <div className="max-h-80 overflow-y-auto scrollbar-soft p-2">
                {suggestions.map((item) => (
                  <Link
                    key={item.id}
                    to={`/manga/${item.id}`}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-[var(--surface-2)]"
                  >
                    <div className="h-12 w-10 overflow-hidden rounded-xl bg-[var(--surface-2)]">
                      <img
                        src={item.cover_image || item.cover || '/placeholder-cover.jpg'}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text)]">
                        {item.title}
                      </p>
                      {item.description ? (
                        <p className="mt-1 truncate text-xs text-muted">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            ) : recentSearches.length > 0 && !localValue ? (
              <div className="p-2">
                {recentSearches.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setLocalValue(item);
                      onChange?.(item);
                      onSearch?.(item);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[var(--surface-2)]"
                  >
                    <Clock3 className="h-4 w-4 text-muted" />
                    <span className="text-sm text-[var(--text)]">{item}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-4 text-sm text-muted">
                No results found.
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}