import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { recommendationApi } from '../services/api';
import { getCoverUrl } from '../lib/imageUrls';

export default function RecommendationPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['recommendations'],
    queryFn: ({ signal }) => recommendationApi.getAll({ limit: 8 }, { signal }),
    staleTime: 5 * 60_000,
    gcTime: 20 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const feedbackMutation = useMutation({
    mutationFn: (payload) => recommendationApi.createFeedback(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'], exact: true });
      queryClient.invalidateQueries({ queryKey: ['recommendationProfile'], exact: true });
    },
  });

  if (isLoading) {
     return <div className="empty-state"><p className="text-sm text-muted">Loading recommendations...</p></div>;
  }

  if (isError) {
    console.error('[recommendations] frontend query failed', {
      message: error?.message || 'Unknown error',
      status: error?.status || null,
      payload: error?.payload || null,
    });
    return <div className="empty-state"><p className="text-sm text-muted">Could not load recommendations.</p></div>;
  }

  const recommendations = data?.recommendations || [];

  if (recommendations.length === 0) {
    return <div className="empty-state"><p className="text-sm text-muted">No recommendations yet.</p></div>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
        <h2 className="section-title">Recommended for you</h2>
        <p className="section-subtitle">
          Adaptive recommendations based on your reading behavior.
        </p>
        </div>
        <span className="soft-badge hidden sm:inline-flex"><Sparkles className="h-3.5 w-3.5" />Personalized</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {recommendations.map((item) => (
          <article key={item.id} className="panel-soft p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--ring)]/60">
            <div className="mb-3 overflow-hidden rounded-2xl bg-[var(--surface-2)]">
              {item.id ? (
                <img
                  src={getCoverUrl(item.id)}
                  alt={item.title}
                  className="aspect-[0.8] w-full object-cover"
                />
              ) : (
                <div className="aspect-[0.8] w-full" />
              )}
            </div>

            <Link to={`/manga/${item.id}`} className="text-sm font-semibold text-[var(--text)] transition hover:text-[var(--primary)]">{item.title}</Link>

            <p className="mt-2 text-xs text-muted">
              Score {item.recommendation_score} • Confidence {Math.round((item.confidence || 0) * 100)}%
            </p>

            <div className="mt-3 space-y-1">
              {(item.reasons || []).slice(0, 3).map((reason) => (
                <p key={reason} className="text-[11px] text-muted">
                  • {reason}
                </p>
              ))}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="ghost-button px-3 py-2 text-xs"
                onClick={() =>
                  feedbackMutation.mutate({
                    feedback_type: 'block_manga',
                    value: item.id,
                  })
                }
              >
                Not this one
              </button>

              {(Array.isArray(item.genre) ? item.genre : []).slice(0, 1).map((genre) => (
                <button
                  key={genre}
                  className="ghost-button px-3 py-2 text-xs"
                  onClick={() =>
                    feedbackMutation.mutate({
                      feedback_type: 'like_genre',
                      value: genre,
                    })
                  }
                >
                  More {genre}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}