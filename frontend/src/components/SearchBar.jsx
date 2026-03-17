import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Clock, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

/**
 * SearchBar - Enhanced search with suggestions
 */
export default function SearchBar({
  value,
  onChange,
  onSearch,
  placeholder = 'Search manga...',
  suggestions = [],
  recentSearches = [],
  className
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch?.(localValue);
  };

  const handleClear = () => {
    setLocalValue('');
    onChange?.('');
    inputRef.current?.focus();
  };

  const showSuggestions = isFocused && (localValue.length > 0 || recentSearches.length > 0);

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

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-dark-900 border border-dark-800 rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Recent Searches */}
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

            {/* Search Suggestions */}
            {localValue && suggestions.length > 0 && (
              <div className="p-2">
                {suggestions.map((manga) => (
                  <Link
                    key={manga.id}
                    to={`/manga/${manga.id}`}
                    onClick={() => setIsFocused(false)}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-dark-800 transition-colors"
                  >
                    <div className="w-10 h-14 rounded overflow-hidden bg-dark-800 flex-shrink-0">
                      {manga.cover_image ? (
                        <img
                          src={manga.cover_image}
                          alt={manga.title}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{manga.title}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {manga.author || 'Unknown'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* No Results */}
            {localValue && suggestions.length === 0 && (
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

/**
 * FilterDropdown - Multi-select filter dropdown
 */
export function FilterDropdown({
  label,
  options = [],
  selected = [],
  onChange,
  className
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (option) => {
    if (selected.includes(option)) {
      onChange?.(selected.filter(s => s !== option));
    } else {
      onChange?.([...selected, option]);
    }
  };

  return (
    <div ref={dropdownRef} className={clsx('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors',
          selected.length > 0
            ? 'bg-primary-600/10 border-primary-500/50 text-primary-400'
            : 'bg-dark-800 border-dark-700 hover:border-dark-600'
        )}
      >
        <span className="text-sm">{label}</span>
        {selected.length > 0 && (
          <span className="px-1.5 py-0.5 bg-primary-600 rounded text-xs">
            {selected.length}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 mt-2 w-48 bg-dark-900 border border-dark-800 rounded-xl shadow-xl z-50 py-1"
          >
            {options.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-3 px-3 py-2 hover:bg-dark-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={() => handleToggle(option.value)}
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * SortDropdown - Sort options dropdown
 */
export function SortDropdown({
  options = [],
  value,
  onChange,
  className
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div ref={dropdownRef} className={clsx('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl hover:border-dark-600 transition-colors"
      >
        <TrendingUp className="w-4 h-4 text-gray-400" />
        <span className="text-sm">{selectedOption?.label || 'Sort'}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-full mt-2 w-48 bg-dark-900 border border-dark-800 rounded-xl shadow-xl z-50 py-1"
          >
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange?.(option.value);
                  setIsOpen(false);
                }}
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 hover:bg-dark-800 transition-colors text-left',
                  value === option.value ? 'text-primary-400' : 'text-gray-300'
                )}
              >
                <span className="text-sm">{option.label}</span>
                {value === option.value && (
                  <span className="text-xs">✓</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

