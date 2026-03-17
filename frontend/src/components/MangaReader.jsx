import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Settings, X, List, Maximize, Minimize,
  ZoomIn, ZoomOut, RotateCw, ArrowLeft
} from 'lucide-react';
import clsx from 'clsx';
import ProgressiveImage from './ProgressiveImage';
import ChapterNavigator from './ChapterNavigator';

/**
 * MangaReader - Ultra smooth Webtoon-style manga reader
 * Features: vertical scroll, lazy loading, prefetch, zoom, etc.
 */
export default function MangaReader({
  manga,
  chapter,
  pages = [],
  onChapterChange,
  onProgressUpdate,
  onSettingsChange,
  settings = {}
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [showChapterList, setShowChapterList] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(null);
  
  // Reader settings
  const [readerSettings, setReaderSettings] = useState({
    fitMode: settings.fitMode || 'width', // width, height, contain
    background: settings.background || '#0a0a0a',
    showPageNumber: settings.showPageNumber !== false,
    preloading: settings.preloading !== false,
    preloadCount: settings.preloadCount || 5,
    ...settings
  });

  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const scrollTimeout = useRef(null);

  // Hide controls after inactivity
  useEffect(() => {
    let timeout;
    const handleActivity = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!showChapterList) setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('click', handleActivity);
      clearTimeout(timeout);
    };
  }, [showChapterList]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          goToPrevPage();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          goToNextPage();
          break;
        case 'Escape':
          if (showChapterList) setShowChapterList(false);
          break;
        case 'Home':
          goToPage(0);
          break;
        case 'End':
          goToPage(pages.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages.length, currentPage, showChapterList]);

  // Track scroll position for page tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
      
      scrollTimeout.current = setTimeout(() => {
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        
        // Find current page based on scroll position
        let accumulatedHeight = 0;
        for (let i = 0; i < pages.length; i++) {
          const pageEl = pageRefs.current[i];
          if (pageEl) {
            const pageHeight = pageEl.clientHeight;
            if (scrollTop >= accumulatedHeight - containerHeight / 2 && 
                scrollTop < accumulatedHeight + pageHeight - containerHeight / 2) {
              if (currentPage !== i) {
                setCurrentPage(i);
                onProgressUpdate?.(i);
              }
              break;
            }
            accumulatedHeight += pageHeight;
          }
        }
      }, 100);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [pages, currentPage, onProgressUpdate]);

  // Prefetch pages
  useEffect(() => {
    if (!readerSettings.preloading) return;

    // Prefetch next pages
    const nextPages = pages.slice(
      currentPage + 1, 
      currentPage + 1 + readerSettings.preloadCount
    );
    
    // Prefetch previous pages
    const prevPages = pages.slice(
      Math.max(0, currentPage - readerSettings.preloadCount),
      currentPage
    );

    // Load images (browser will cache them)
    [...nextPages, ...prevPages].forEach(page => {
      if (page.display_path) {
        const img = new Image();
        img.src = page.display_path;
      }
    });
  }, [currentPage, pages, readerSettings.preloading, readerSettings.preloadCount]);

  // Reset on chapter change
  useEffect(() => {
    setCurrentPage(0);
    setIsLoading(true);
    containerRef.current?.scrollTo(0, 0);
  }, [chapter?.id]);

  const goToPage = useCallback((page) => {
    if (page < 0 || page >= pages.length) return;
    
    setCurrentPage(page);
    pageRefs.current[page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onProgressUpdate?.(page);
  }, [pages.length, onProgressUpdate]);

  const goToNextPage = useCallback(() => {
    if (currentPage < pages.length - 1) {
      goToPage(currentPage + 1);
    } else {
      // Go to next chapter
      onChapterChange?.('next');
    }
  }, [currentPage, pages.length, goToPage, onChapterChange]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      goToPage(currentPage - 1);
    } else {
      // Go to previous chapter
      onChapterChange?.('prev');
    }
  }, [currentPage, goToPage, onChapterChange]);

  const updateSetting = (key, value) => {
    const newSettings = { ...readerSettings, [key]: value };
    setReaderSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const fitClasses = {
    width: 'w-full h-auto',
    height: 'h-screen w-auto object-contain',
    contain: 'w-full h-full object-contain',
    cover: 'w-full h-full object-cover'
  };

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 overflow-auto"
      style={{ backgroundColor: readerSettings.background }}
    >
      {/* Pages */}
      <div className="max-w-4xl mx-auto">
        {pages.map((page, index) => (
          <div
            key={page.id || index}
            ref={(el) => pageRefs.current[index] = el}
            className="relative"
          >
            <ProgressiveImage
              src={page.display_path || page.image_path}
              alt={`Page ${index + 1}`}
              className={clsx('mx-auto', fitClasses[readerSettings.fitMode])}
              onLoad={() => {
                if (index === 0) setIsLoading(false);
              }}
              onError={(e) => {
                if (index === 0) {
                  setImageError('Failed to load page');
                  setIsLoading(false);
                }
              }}
            />
            
            {/* Page number overlay */}
            {readerSettings.showPageNumber && (
              <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/60 rounded-full text-white text-sm">
                {index + 1} / {pages.length}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Loading state */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center bg-black"
          >
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading chapter...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      <AnimatePresence>
        {imageError && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center bg-black"
          >
            <div className="text-center">
              <p className="text-red-400 mb-4">{imageError}</p>
              <button
                onClick={() => {
                  setImageError(null);
                  setIsLoading(true);
                }}
                className="px-4 py-2 bg-primary-600 rounded-lg"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top controls */}
      <AnimatePresence>
        {showControls && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 to-transparent p-4"
          >
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => window.history.back()}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                
                <div className="text-white">
                  <h1 className="font-medium truncate max-w-xs">{manga?.title}</h1>
                  <p className="text-sm text-gray-400">
                    Chapter {chapter?.chapter_number}: {chapter?.title || 'Untitled'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowChapterList(true)}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <List className="w-5 h-5 text-white" />
                </button>
                
                <ReaderSettingsMenu
                  settings={readerSettings}
                  onChange={updateSetting}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom navigation */}
      <AnimatePresence>
        {showControls && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent p-4"
          >
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <button
                onClick={() => onChapterChange?.('prev')}
                disabled={!chapter?.hasPrev}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  chapter?.hasPrev 
                    ? 'bg-white/10 hover:bg-white/20 text-white' 
                    : 'text-gray-600 cursor-not-allowed'
                )}
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Prev</span>
              </button>

              {/* Page indicator */}
              <div className="text-white text-sm">
                {currentPage + 1} / {pages.length}
              </div>

              <button
                onClick={() => onChapterChange?.('next')}
                disabled={!chapter?.hasNext}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  chapter?.hasNext 
                    ? 'bg-white/10 hover:bg-white/20 text-white' 
                    : 'text-gray-600 cursor-not-allowed'
                )}
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapter Navigator */}
      <ChapterNavigator
        isOpen={showChapterList}
        onClose={() => setShowChapterList(false)}
        chapters={chapter?.chapters || []}
        currentChapterId={chapter?.id}
        onChapterSelect={(id) => {
          onChapterChange?.(id);
          setShowChapterList(false);
        }}
        mangaTitle={manga?.title}
      />
    </div>
  );
}

/**
 * ReaderSettingsMenu - Settings dropdown for reader
 */
function ReaderSettingsMenu({ settings, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  const fitOptions = [
    { value: 'width', label: 'Fit Width' },
    { value: 'height', label: 'Fit Height' },
    { value: 'contain', label: 'Contain' },
    { value: 'cover', label: 'Cover' }
  ];

  const backgroundOptions = [
    { value: '#0a0a0a', label: 'Dark', preview: 'bg-[#0a0a0a]' },
    { value: '#000000', label: 'Black', preview: 'bg-black' },
    { value: '#1a1a1a', label: 'Gray', preview: 'bg-[#1a1a1a]' },
    { value: '#ffffff', label: 'White', preview: 'bg-white' }
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <Settings className="w-5 h-5 text-white" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-0 top-full mt-2 w-72 bg-dark-900 border border-dark-800 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              {/* Fit Mode */}
              <div className="p-4 border-b border-dark-800">
                <h4 className="text-sm font-medium mb-3">Display Mode</h4>
                <div className="grid grid-cols-2 gap-2">
                  {fitOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => onChange('fitMode', option.value)}
                      className={clsx(
                        'px-3 py-2 rounded-lg text-sm transition-colors',
                        settings.fitMode === option.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-800 hover:bg-dark-700'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div className="p-4 border-b border-dark-800">
                <h4 className="text-sm font-medium mb-3">Background</h4>
                <div className="flex gap-2">
                  {backgroundOptions.map(option => (
                    <button
                      key={option.value}
                      onClick={() => onChange('background', option.value)}
                      className={clsx(
                        'w-10 h-10 rounded-lg border-2 transition-colors',
                        option.preview,
                        settings.background === option.value
                          ? 'border-primary-500'
                          : 'border-dark-700'
                      )}
                      title={option.label}
                    />
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="p-4 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Show Page Numbers</span>
                  <input
                    type="checkbox"
                    checked={settings.showPageNumber}
                    onChange={(e) => onChange('showPageNumber', e.target.checked)}
                    className="w-5 h-5 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Preload Pages</span>
                  <input
                    type="checkbox"
                    checked={settings.preloading}
                    onChange={(e) => onChange('preloading', e.target.checked)}
                    className="w-5 h-5 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                  />
                </label>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

