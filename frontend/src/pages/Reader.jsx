import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { chapterApi, pageApi, libraryApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';
import ProgressiveImage from '../components/ProgressiveImage';
import clsx from 'clsx';

export default function Reader() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showSettings, setShowSettings] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const hasMarkedRead = useRef(false);
  const containerRef = useRef(null);
  const pageRefs = useRef([]);

  const settings = {
    backgroundColor: '#0a0a0a',
    fitMode: 'width',
    showPageNumber: true,
    preloading: true,
    prefetchCount: 3,
  };

  // Extract data
  const chapter = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => chapterApi.getById(chapterId),
    enabled: Boolean(chapterId),
  }).data?.chapter;

  const { data: pagesData = { pages: [] }, isLoading: pagesLoading, error: pagesError } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: () => pageApi.getByChapter(chapterId),
    enabled: Boolean(chapterId),
  });

  const pages = pagesData.pages || [];
  const totalPages = pages.length;

  // Timeout for hiding controls
  useEffect(() => {
    let timeout;
    if (showControls) {
      timeout = setTimeout(() => {
        if (!showSettings) setShowControls(false);
      }, 3000);
    }
    return () => clearTimeout(timeout);
  }, [showControls, showSettings]);

  // Reading session start/end
  const startReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.startReading(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    },
  });

  const endReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.endReading(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', chapter?.manga_id] });
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    },
  });

  useEffect(() => {
    if (chapter?.manga_id) {
      startReadingMutation.mutate({
        manga_id: chapter.manga_id,
        chapter_id: chapterId,
      });
    }
    return () => {
      if (chapter?.manga_id) {
        endReadingMutation.mutate({
          chapter_id: chapterId,
          end_page: currentPage,
          duration_seconds: 0,
        });
      }
    };
  }, [chapterId, chapter?.manga_id, currentPage]);

  // Mark as read
  useEffect(() => {
    if (
      totalPages > 0 &&
      currentPage === totalPages - 1 &&
      !hasMarkedRead.current
    ) {
      hasMarkedRead.current = true;
      chapterApi.markRead(chapterId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
      }).catch(console.error);
    }
  }, [currentPage, totalPages, chapterId]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === 'Escape') {
        setShowSettings(false);
        navigate(`/manga/${chapter?.manga_id}`);
      } else if (e.key === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, chapter?.manga_id]);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      pageRefs.current[currentPage + 1]?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigateNextChapter();
    }
  }, [currentPage, totalPages]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      pageRefs.current[currentPage - 1]?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentPage]);

  const navigateNextChapter = async () => {
    try {
      const { data } = await chapterApi.getNext(chapterId);
      if (data) navigate(`/reader/${data.id}`);
    } catch (err) {
      console.log('No next chapter');
    }
  };

  const navigatePrevChapter = async () => {
    try {
      const { data } = await chapterApi.getPrev(chapterId);
      if (data) navigate(`/reader/${data.id}`);
    } catch (err) {
      console.log('No previous chapter');
    }
  };

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  if (pagesLoading) return <LoadingScreen />;

  if (pagesError || !chapter) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-xl font-semibold">Unable to load chapter</h2>
          <p className="text-gray-400">{pagesError?.message || 'Chapter not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto scrollbar-hide"
        style={{ backgroundColor: settings.backgroundColor }}
      >
        <div className="max-w-4xl mx-auto p-4">
          <AnimatePresence>
            {pages.map((page, index) => (
              <motion.div
                key={page.id}
                ref={(el) => { pageRefs.current[index] = el; }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center justify-center min-h-screen py-8"
              >
                <ProgressiveImage
                  src={page.display_path || page.image_path}
                  alt={`Page ${index + 1}`}
                  className={clsx(
                    'max-w-full max-h-screen object-contain cursor-zoom-in hover:cursor-grab active:cursor-grabbing',
                    settings.fitMode === 'width' ? 'w-full h-auto' : 'h-screen w-auto'
                  )}
                  onLoadEnd={() => setIsLoadingPage(false)}
                  placeholder="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIwIiBoZWlnaHQ9IjMyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgZm9udC1mYW1pbHk9IkhlbHZldGljYSwgQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTgiIHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjUwJSIgeT0iNTAlIj5Mb2FkaW5nLi4uPC90ZXh0Pjwvc3ZnPg=="
                />
                {settings.showPageNumber && (
                  <div className="mt-4 text-sm text-gray-400">
                    Page {index + 1} / {totalPages}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Top controls */}
            <div className="flex justify-between items-center pointer-events-auto">
              <button
                onClick={navigatePrevChapter}
                className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
                title="Previous chapter"
              >
                ← Prev
              </button>
              <div className="text-sm text-gray-300">
                {chapter?.title}
              </div>
              <button
                onClick={navigateNextChapter}
                className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
                title="Next chapter"
              >
                Next →
              </button>
            </div>

            {/* Bottom controls */}
            <div className="flex justify-center space-x-4 pointer-events-auto">
              <button
                onClick={toggleFullscreen}
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
                title="Fullscreen"
              >
                ↔
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 text-white transition-all"
                title="Settings"
              >
                ⚙️
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      {isLoadingPage && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center bg-black/80 z-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
        </motion.div>
      )}

      {/* Progress sync status */}
      <AnimatePresence>
        {(startReadingMutation.isPending || endReadingMutation.isPending) && (
          <motion.div
            className="absolute top-6 right-6 bg-gray-900/90 backdrop-blur-sm text-xs px-3 py-2 rounded-lg border border-gray-700 z-50"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            Syncing...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
