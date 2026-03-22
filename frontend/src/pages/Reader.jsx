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

  const settings = {
    backgroundColor: '#0a0a0a',
    fitMode: 'width',
  };

  // 📘 Chapter
  const {
    data: chapter,
    isLoading: chapterLoading,
    isError: chapterError,
    error: chapterQueryError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => chapterApi.getById(chapterId),
    enabled: Boolean(chapterId),
    staleTime: 60_000,
  });

  // 📄 Pages
  const {
    data: pages = [],
    isLoading: pagesLoading,
    isError: pagesError,
    error: pagesQueryError,
  } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: () => pageApi.getByChapter(chapterId),
    enabled: Boolean(chapterId),
    staleTime: 2 * 60_000,
  });

  const totalPages = pages.length;

  // 📚 Mutations
  const startReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.startReading(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] }),
  });

  const endReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.endReading(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] }),
  });

  // 🔄 Reset when chapter changes
  useEffect(() => {
    hasMarkedRead.current = false;
    hasAutoNavigated.current = false;
    setCurrentPage(0);
    setIsLoadingPage(true);
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

  // ▶ Start / End reading
  useEffect(() => {
    if (!chapter?.manga_id) return;

    startReadingMutation.mutate({
      manga_id: chapter.manga_id,
      chapter_id: chapterId,
      page_number: 0,
    });

    return () => {
      endReadingMutation.mutate({
        chapter_id: chapterId,
        end_page: currentPage,
        duration_seconds: 0,
      });
    };
  }, [chapterId, chapter?.manga_id]);

  // ✅ Mark as read
  useEffect(() => {
    if (
      currentPage !== totalPages - 1 ||
      totalPages === 0 ||
      hasMarkedRead.current
    )
      return;

    hasMarkedRead.current = true;

    chapterApi.markRead(chapterId).catch(() => {
      hasMarkedRead.current = false;
    });
  }, [currentPage, totalPages, chapterId]);

  // 🚀 Prefetch next chapter
  useEffect(() => {
    if (!chapterId) return;

    const timer = setTimeout(async () => {
      try {
        const next = await chapterApi.getNext(chapterId);
        if (!next?.id) return;

        queryClient.prefetchQuery({
          queryKey: ['chapter', next.id],
          queryFn: () => chapterApi.getById(next.id),
          staleTime: 60_000,
        });

        queryClient.prefetchQuery({
          queryKey: ['pages', next.id],
          queryFn: () => pageApi.getByChapter(next.id),
          staleTime: 2 * 60_000,
        });
      } catch (error) {
        console.warn('Next chapter prefetch failed', error);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [chapterId, queryClient]);

  // ➡ Auto-next chapter
  useEffect(() => {
    if (
      totalPages === 0 ||
      currentPage !== totalPages - 1 ||
      isNavigatingNext ||
      hasAutoNavigated.current
    )
      return;

    hasAutoNavigated.current = true;

    const timer = setTimeout(async () => {
      try {
        const next = await chapterApi.getNext(chapterId);
        if (!next?.id) return;

        setIsNavigatingNext(true);
        navigate(`/reader/${next.id}`);
      } catch (error) {
        console.warn('Unable to auto-advance chapter', error);
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
        pageRefs.current[currentPage + 1]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }

      if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
        pageRefs.current[currentPage - 1]?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }

      if (e.key === 'Escape' && chapter?.manga_id) {
        navigate(`/manga/${chapter.manga_id}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, chapter, navigate]);

  // ⏳ Loading
  if (chapterLoading || pagesLoading) return <LoadingScreen />;

  // ❌ Error
  if (chapterError || pagesError || !chapter || pages.length === 0) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h2 className="text-xl">Unable to load chapter</h2>
          <p className="text-gray-400">
            {chapterQueryError?.message ||
              pagesQueryError?.message ||
              'Chapter not found'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-blue-600 rounded-lg"
          >
            Go Back
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
        <div className="max-w-4xl mx-auto">
          {pages.map((page, index) => (
            <div
              key={page.id || index}
              ref={(el) => {
                pageRefs.current[index] = el;
              }}
              className="min-h-screen flex justify-center"
            >
              <img
                loading={index <= 1 ? 'eager' : 'lazy'}
                decoding="async"
                src={page.display_path || page.image_path}
                alt={`Page ${index + 1}`}
                className={clsx(
                  'max-w-full h-auto',
                  settings.fitMode === 'width' && 'w-full'
                )}
                onLoad={() => index === 0 && setIsLoadingPage(false)}
              />
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {(startReadingMutation.isPending ||
          endReadingMutation.isPending ||
          isNavigatingNext) && (
          <motion.div className="absolute top-4 right-4 text-xs bg-black/80 px-3 py-2 rounded text-white">
            {isNavigatingNext ? 'Opening next chapter...' : 'Syncing...'}
          </motion.div>
        )}

        {isLoadingPage && (
          <motion.div className="absolute inset-0 flex items-center justify-center bg-black">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}