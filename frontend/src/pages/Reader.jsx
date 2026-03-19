import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

  const [showSettings, setShowSettings] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingPage, setIsLoadingPage] = useState(true);

  const hasMarkedRead = useRef(false);
  const containerRef = useRef(null);
  const pageRefs = useRef([]);

  const [settings] = useState({
    backgroundColor: '#0a0a0a',
    fitMode: 'width',
  });

  // ✅ FIX: useQuery correcto
  const {
    data: chapter,
    isLoading: chapterLoading,
    isError: chapterError,
    error: chapterQueryError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    queryFn: () => chapterApi.getById(chapterId),
    enabled: Boolean(chapterId),
  });

  // ✅ Detectar páginas dentro del chapter
  const chapterPages = useMemo(() => {
    if (Array.isArray(chapter?.pages)) return chapter.pages;
    if (Array.isArray(chapter?.data?.pages)) return chapter.data.pages;
    return null;
  }, [chapter]);

  const {
    data: fetchedPages,
    isLoading: pagesLoading,
    isError: pagesError,
    error: pagesQueryError,
  } = useQuery({
    queryKey: ['pages', chapterId],
    queryFn: () => pageApi.getByChapter(chapterId),
    enabled: Boolean(chapterId) && !chapterPages,
  });

  const pages = chapterPages ?? fetchedPages ?? [];
  const totalPages = pages.length;

  // 📚 mutations
  const startReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.startReading(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    },
  });

  const endReadingMutation = useMutation({
    mutationFn: (data) => libraryApi.endReading(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryOverview'] });
    },
  });

  useEffect(() => {
    hasMarkedRead.current = false;
  }, [chapterId]);

  // 📜 scroll tracking
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

  // ▶ start / end reading
  useEffect(() => {
    if (chapter?.manga_id) {
      startReadingMutation.mutate({
        manga_id: chapter.manga_id,
        chapter_id: chapterId,
        page_number: 0,
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
  }, [chapterId, chapter?.manga_id]);

  // ✅ marcar leído
  useEffect(() => {
    if (currentPage === totalPages - 1 && totalPages > 0 && !hasMarkedRead.current) {
      hasMarkedRead.current = true;
      chapterApi.markRead(chapterId).catch(() => {
        hasMarkedRead.current = false;
      });
    }
  }, [currentPage, totalPages, chapterId]);

  // ⌨ navegación teclado
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        pageRefs.current[currentPage + 1]?.scrollIntoView({ behavior: 'smooth' });
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        pageRefs.current[currentPage - 1]?.scrollIntoView({ behavior: 'smooth' });
      }
      if (e.key === 'Escape') {
        if (chapter?.manga_id) navigate(`/manga/${chapter.manga_id}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, chapter]);

  // ⏳ loading
  if (chapterLoading || pagesLoading) return <LoadingScreen />;

  // ❌ error
  if (chapterError || pagesError || !chapter || pages.length === 0) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <h2 className="text-xl">Unable to load chapter</h2>
          <p className="text-gray-400">
            {chapterQueryError?.message || pagesQueryError?.message || 'Chapter not found'}
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

  // ✅ render
  return (
    <div className="fixed inset-0 bg-black">
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto"
        style={{ backgroundColor: settings.backgroundColor }}
      >
        <div className="max-w-4xl mx-auto">
          {pages.map((page, index) => (
            <div
              key={page.id || index}
              ref={(el) => (pageRefs.current[index] = el)}
              className="min-h-screen flex justify-center"
            >
              <img
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
        {(startReadingMutation.isPending || endReadingMutation.isPending) && (
          <motion.div className="absolute top-4 right-4 text-xs bg-black/80 px-3 py-2 rounded">
            Syncing...
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