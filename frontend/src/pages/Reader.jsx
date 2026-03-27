import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { chapterApi, pageApi, libraryApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';
import clsx from 'clsx';

export default function Reader() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isNavigatingNext, setIsNavigatingNext] = useState(false);

  const hasMarkedRead = useRef(false);
  const hasAutoNavigated = useRef(false);
  const containerRef = useRef(null);
  const pageRefs = useRef([]);

  const readingSessionId = useRef(null);
  const readingStartedAt = useRef(null);
  const currentPageRef = useRef(0);

  const settings = {
    backgroundColor: '#0a0a0a',
    fitMode: 'width',
  };

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const invalidateReadingQueries = useCallback(() => {
  queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
  queryClient.invalidateQueries({ queryKey: ['dashboardRecentRead'] });
  queryClient.invalidateQueries({ queryKey: ['recentReadPage'] });
  queryClient.invalidateQueries({ queryKey: ['libraryManga'] });
  queryClient.invalidateQueries({ queryKey: ['manga'] });
  queryClient.invalidateQueries({ queryKey: ['chapters'] });
}, [queryClient]);

  // 📘 Chapter
  const {
    data: chapter,
    isLoading: chapterLoading,
    isError: chapterError,
    error: chapterQueryError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: ({ signal }) => chapterApi.getById(chapterId, { signal }),
    enabled: Boolean(chapterId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 📄 Pages
  const {
    data: pages = [],
    isLoading: pagesLoading,
    isFetching: pagesFetching,
    isError: pagesError,
    error: pagesQueryError,
  } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: ({ signal }) => pageApi.getByChapterId(chapterId, { signal }),
    enabled: Boolean(chapterId),
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });

  const totalPages = pages.length;

  // 📚 Mutations
  const startReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.startReading(data),
    onSuccess: (session) => {
      readingSessionId.current = session?.id || null;
      readingStartedAt.current = Date.now();
      invalidateReadingQueries();
    },
  });

  const endReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.endReading(data),
    onSuccess: () => {
      invalidateReadingQueries();
      readingSessionId.current = null;
      readingStartedAt.current = null;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: () => chapterApi.markRead(chapterId),
    onSuccess: () => {
      invalidateReadingQueries();
    },
    onError: () => {
      hasMarkedRead.current = false;
    },
  });

  // 🔄 Reset when chapter changes
  useEffect(() => {
    hasMarkedRead.current = false;
    hasAutoNavigated.current = false;
    readingSessionId.current = null;
    readingStartedAt.current = null;
    currentPageRef.current = 0;
    setCurrentPage(0);
    setIsLoadingPage(true);
    pageRefs.current = [];
  }, [chapterId]);

  // 📜 Scroll tracking
  const handleScroll = useCallback(() => {
    if (!containerRef.current || totalPages === 0) return;

    const scrollTop = containerRef.current.scrollTop;
    const viewportHeight = containerRef.current.clientHeight;

    for (let i = 0; i < pageRefs.current.length; i += 1) {
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

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // ▶ Start / End reading session
  useEffect(() => {
    if (!chapter?.manga_id || !chapterId) return;

    if (!readingSessionId.current) {
      startReadingMutation.mutate({
        manga_id: chapter.manga_id,
        chapter_id: chapterId,
        page_number: 0,
      });
    }

    return () => {
      if (!readingSessionId.current) return;

      const elapsedSeconds = readingStartedAt.current
        ? Math.max(0, Math.round((Date.now() - readingStartedAt.current) / 1000))
        : 0;

      endReadingMutation.mutate({
        session_id: readingSessionId.current,
        end_page: currentPageRef.current,
        duration_seconds: elapsedSeconds,
      });
    };
  }, [chapterId, chapter?.manga_id]);

  // ✅ Mark as read on last page
  useEffect(() => {
    if (
      totalPages === 0 ||
      currentPage !== totalPages - 1 ||
      hasMarkedRead.current
    ) {
      return;
    }

    hasMarkedRead.current = true;
    markReadMutation.mutate();
  }, [currentPage, totalPages, markReadMutation]);

  // 🚀 Prefetch next chapter
  useEffect(() => {
    if (!chapterId) return;

    const timer = setTimeout(async () => {
      try {
        const next = await chapterApi.getNext(chapterId);
        if (!next?.id) return;

        queryClient.prefetchQuery({
          queryKey: ['chapter', next.id],
          queryFn: ({ signal }) => chapterApi.getById(next.id, { signal }),
          staleTime: 60_000,
        });

        queryClient.prefetchQuery({
          queryKey: ['pages', next.id],
          queryFn: ({ signal }) => pageApi.getByChapterId(next.id, { signal }),
          staleTime: 2 * 60_000,
        });
      } catch (error) {
        console.warn('Next chapter prefetch failed', error);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [chapterId, queryClient]);

  // ➡ Auto-next chapter
  useEffect(() => {
    if (
      totalPages === 0 ||
      currentPage !== totalPages - 1 ||
      isNavigatingNext ||
      hasAutoNavigated.current
    ) {
      return;
    }

    hasAutoNavigated.current = true;

    const timer = setTimeout(async () => {
      try {
        const next = await chapterApi.getNext(chapterId);
        if (!next?.id) return;

        setIsNavigatingNext(true);
        navigate(`/reader/${next.id}`);
      } catch (error) {
        console.warn('Unable to auto-advance chapter', error);
        hasAutoNavigated.current = false;
      } finally {
        setIsNavigatingNext(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [chapterId, currentPage, totalPages, navigate, isNavigatingNext]);

  // ⌨ Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowRight', 'ArrowDown', ' '].includes(e.key)) {
        const nextPage = pageRefs.current[currentPage + 1];
        if (nextPage) {
          e.preventDefault();
          nextPage.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }

      if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
        const prevPage = pageRefs.current[currentPage - 1];
        if (prevPage) {
          e.preventDefault();
          prevPage.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      }

      if (e.key === 'Escape' && chapter?.manga_id) {
        navigate(`/manga/${chapter.manga_id}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, chapter, navigate]);

  // ⏳ Loading
  if (chapterLoading || pagesLoading) {
    return <LoadingScreen />;
  }

  // ❌ Error
  if (chapterError || pagesError || !chapter) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black p-6 text-white">
        <div className="space-y-4 text-center">
          <h2 className="text-xl">Unable to load chapter</h2>
          <p className="text-gray-400">
            {chapterQueryError?.message ||
              pagesQueryError?.message ||
              'Chapter not found'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg bg-blue-600 px-4 py-2"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!pages.length) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black p-6 text-white">
        <div className="space-y-4 text-center">
          <h2 className="text-xl">No pages available</h2>
          <p className="text-gray-400">
            This chapter has no pages to display yet.
          </p>
          <button
            onClick={() => navigate(`/manga/${chapter.manga_id}`)}
            className="rounded-lg bg-blue-600 px-4 py-2"
          >
            Back to manga
          </button>
        </div>
      </div>
    );
  }

  // 🎨 Render
  return (
    <div className="fixed inset-0 bg-black">
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ backgroundColor: settings.backgroundColor }}
      >
        <div className="mx-auto max-w-4xl">
          {pages.map((page, index) => (
            <div
              key={page.id || `${chapterId}-${index}`}
              ref={(el) => {
                pageRefs.current[index] = el;
              }}
              className="flex min-h-screen justify-center"
            >
              <img
                loading={index <= 1 ? 'eager' : 'lazy'}
                decoding="async"
                src={page.url || page.display_path || page.image_path}
                alt={`Page ${index + 1}`}
                className={clsx(
                  'h-auto max-w-full',
                  settings.fitMode === 'width' && 'w-full'
                )}
                onLoad={() => {
                  if (index === 0) setIsLoadingPage(false);
                }}
                onError={() => {
                  if (index === 0) setIsLoadingPage(false);
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {(startReadingMutation.isPending ||
          endReadingMutation.isPending ||
          markReadMutation.isPending ||
          pagesFetching ||
          isNavigatingNext) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute right-4 top-4 rounded bg-black/80 px-3 py-2 text-xs text-white"
          >
            {isNavigatingNext
              ? 'Opening next chapter...'
              : pagesFetching
              ? 'Refreshing pages...'
              : 'Syncing...'}
          </motion.div>
        )}

        {isLoadingPage && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black"
          >
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}