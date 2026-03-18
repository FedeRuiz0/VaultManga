import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
  X,
  Maximize,
  Minimize,
  Loader2
} from 'lucide-react';
import { chapterApi, pageApi, libraryApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';
import clsx from 'clsx';

export default function Reader() {

  const { chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  const hasMarkedRead = useRef(false);

  const [settings, setSettings] = useState({
    backgroundColor: '#0a0a0a',
    fitMode: 'width',
    showPageNumber: true,
    preloading: true,
    prefetchCount: 3,
  });

  const containerRef = useRef(null);
  const pageRefs = useRef([]);

  // Fetch chapter
<<<<<<< ours
  const { data: chapterData, isLoading: chapterLoading } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => chapterApi.getById(chapterId),
    enabled: !!chapterId,
  });

  // Fetch pages
  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: () => pageApi.getByChapter(chapterId),
    enabled: !!chapterId,
=======
  const {
    data: chapterData,
    isLoading: chapterLoading,
    isError: chapterError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => chapterApi.getById(chapterId),
    enabled: Boolean(chapterId),
  });

  // Fetch pages
  const {
    data: pagesData,
    isLoading: pagesLoading,
    isError: pagesError,
    error: pagesQueryError,
  } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: () => pageApi.getByChapter(chapterId),
    enabled: Boolean(chapterId),
>>>>>>> theirs
  });

  const chapter = chapterData?.data;
  const pages = pagesData?.data || [];
  const totalPages = pages.length;

  // Start reading session
<<<<<<< ours
  const startReadingMutation = useMutation(
    (data) => libraryApi.startReading(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
        queryClient.refetchQueries({ queryKey: ['libraryOverview'] });
      }
    }
  );

  // End reading session
  const endReadingMutation = useMutation(
    (data) => libraryApi.endReading(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['chapters', chapter?.manga_id] });
        queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
        queryClient.refetchQueries({ queryKey: ['libraryOverview'] });
      }
    }
  );
=======
  const startReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.startReading(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
      queryClient.refetchQueries({ queryKey: ['libraryOverview'] });
    },
  });

  // End reading session
  const endReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.endReading(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', chapter?.manga_id] });
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
      queryClient.refetchQueries({ queryKey: ['libraryOverview'] });
    },
  });
>>>>>>> theirs

  // Reset read flag when chapter changes
  useEffect(() => {
    hasMarkedRead.current = false;
  }, [chapterId]);

  // Auto-hide controls
  useEffect(() => {
    let timeout;

    const handleMouseMove = () => {
      setShowControls(true);

      clearTimeout(timeout);

      timeout = setTimeout(() => {
        if (!showSettings) setShowControls(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };

  }, [showSettings]);

  // Scroll detection
  const handleScroll = useCallback(() => {

    if (!containerRef.current || totalPages === 0) return;

    const scrollTop = containerRef.current.scrollTop;
    const viewportHeight = containerRef.current.clientHeight;

    for (let i = 0; i < pageRefs.current.length; i++) {

      const pageEl = pageRefs.current[i];

      if (!pageEl) continue;

      const rect = pageEl.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const pageTop = rect.top - containerRect.top + scrollTop;

      if (scrollTop >= pageTop - viewportHeight / 2) {
        setCurrentPage(i);
      }

    }

  }, [totalPages]);

  useEffect(() => {

    const container = containerRef.current;

    if (!container) return;

    container.addEventListener('scroll', handleScroll);

    return () => container.removeEventListener('scroll', handleScroll);

  }, [handleScroll]);

  // Start / end reading session
  useEffect(() => {

    if (chapter?.manga_id) {

      startReadingMutation.mutate({
        manga_id: chapter.manga_id,
        chapter_id: chapterId,
        page_number: 0
      });

    }

    return () => {

      if (chapter?.manga_id) {

        endReadingMutation.mutate({
          chapter_id: chapterId,
          end_page: currentPage,
          duration_seconds: 0
        });

      }

    };

  }, [chapterId, chapter]);

  // Mark chapter as read
  useEffect(() => {

    if (
      currentPage === totalPages - 1 &&
      totalPages > 0 &&
      !hasMarkedRead.current
    ) {

      hasMarkedRead.current = true;

      chapterApi.markRead(chapterId).then(() => {

        queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
        queryClient.refetchQueries({ queryKey: ['libraryOverview'] });

      });

    }

  }, [currentPage, totalPages, chapterId, queryClient]);

  // Keyboard navigation
  useEffect(() => {

    const handleKeyDown = (e) => {

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        goToNextPage();
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        goToPrevPage();
      }

      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false);
        else navigate(`/manga/${chapter?.manga_id}`);
      }

      if (e.key === 'f') toggleFullscreen();

    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);

  }, [currentPage, totalPages, showSettings]);

  const goToNextPage = () => {

    if (currentPage < totalPages - 1) {
      pageRefs.current[currentPage + 1]?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigateNextChapter();
    }

  };

  const goToPrevPage = () => {

    if (currentPage > 0) {
      pageRefs.current[currentPage - 1]?.scrollIntoView({ behavior: 'smooth' });
    }

  };

  const navigateNextChapter = async () => {

    try {

      const { data } = await chapterApi.getNext(chapterId);

      if (data) navigate(`/reader/${data.id}`);

    } catch {
      console.log('No next chapter');
    }

  };

  const navigatePrevChapter = async () => {

    try {

      const { data } = await chapterApi.getPrev(chapterId);

      if (data) navigate(`/reader/${data.id}`);

    } catch {
      console.log('No previous chapter');
    }

  };

  const toggleFullscreen = () => {

    if (!document.fullscreenElement) {

      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);

    } else {

      document.exitFullscreen();
      setIsFullscreen(false);

    }

  };

  if (chapterLoading || pagesLoading) return <LoadingScreen />;

  if (chapterError || pagesError) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-xl font-semibold">Unable to load reader</h2>
          <p className="text-gray-400">
            {pagesQueryError?.message || 'Something went wrong while loading this chapter.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">

      <div
        ref={containerRef}
        className="h-full overflow-y-auto reader-container"
        style={{ backgroundColor: settings.backgroundColor }}
      >

        <div className="max-w-4xl mx-auto">

          {pages.map((page, index) => (

            <div
              key={page.id}
              ref={(el) => (pageRefs.current[index] = el)}
              style={{
                minHeight: '100vh',
                display: 'flex',
                justifyContent: 'center'
              }}
            >

              <img
                src={page.display_path || page.image_path}
                alt={`Page ${index + 1}`}
                loading={index < 3 ? 'eager' : 'lazy'}
                className={clsx(
                  'max-w-full h-auto',
                  settings.fitMode === 'width' && 'w-full',
                  settings.fitMode === 'height' && 'h-screen object-contain',
                  settings.fitMode === 'original' && 'max-h-screen object-contain'
                )}
                onLoad={() => {
                  if (index === 0) setIsLoadingPage(false);
                }}
              />

            </div>

          ))}

        </div>

      </div>

      <AnimatePresence>

        {(startReadingMutation.isPending || endReadingMutation.isPending) && (
          <motion.div className="absolute top-4 right-4 bg-dark-900/90 text-xs px-3 py-2 rounded-lg border border-dark-700">
            Syncing progress...
          </motion.div>
        )}

        {(startReadingMutation.isError || endReadingMutation.isError) && (
          <motion.div className="absolute top-4 left-4 bg-red-900/90 text-xs px-3 py-2 rounded-lg border border-red-700">
            Failed to sync reading progress.
          </motion.div>
        )}

        {isLoadingPage && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-black"
          >
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );

}
