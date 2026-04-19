import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { recommendationApi } from '../services/api';
import { getCoverUrl } from '../lib/imageUrls';

export default function RecommendationPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['recommendations'],
    queryFn: ({ signal }) => recommendationApi.getAll({ limit: 8 }, { signal }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const feedbackMutation = useMutation({
    mutationFn: (payload) => recommendationApi.createFeedback(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['recommendationProfile'] });
    },
  });

  if (isLoading) {
    return <div className="panel-soft p-5 text-sm text-muted">Loading recommendations...</div>;
  }

  if (isError) {
    return <div className="panel-soft p-5 text-sm text-muted">Could not load recommendations.</div>;
  }

  const recommendations = data?.recommendations || [];

  if (recommendations.length === 0) {
    return <div className="panel-soft p-5 text-sm text-muted">No recommendations yet.</div>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="section-title">Recommended for you</h2>
        <p className="section-subtitle">
          Adaptive recommendations based on your reading behavior.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {recommendations.map((item) => (
          <article key={item.id} className="panel-soft p-4">
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

            <h3 className="text-sm font-semibold text-[var(--text)]">{item.title}</h3>

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