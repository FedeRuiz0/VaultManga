import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../services/api';
import LoadingScreen from '../components/LoadingScreen';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  reader_mode: 'vertical',
  preferred_language: 'es',
  image_quality: 'high',
  auto_mark_read: true,
};

export default function Settings() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [savedMessage, setSavedMessage] = useState('');

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: ({ signal }) => settingsApi.get({ signal }),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        ...DEFAULT_SETTINGS,
        ...settingsQuery.data,
      });
    }
  }, [settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload) => settingsApi.update(payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data);
      setSavedMessage('Settings saved successfully.');
      setTimeout(() => setSavedMessage(''), 2500);
    },
  });

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSavedMessage('');
    updateMutation.mutate(form);
  };

  if (settingsQuery.isLoading && !settingsQuery.data) {
    return <LoadingScreen />;
  }

  if (settingsQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
        {settingsQuery.error?.message || 'Failed to load settings'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-400">
          Configure your reading and app preferences.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-white/10 bg-zinc-900/70 p-6"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white">Theme</label>
            <select
              value={form.theme}
              onChange={(e) => handleChange('theme', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white">Reader Mode</label>
            <select
              value={form.reader_mode}
              onChange={(e) => handleChange('reader_mode', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white"
            >
              <option value="vertical">Vertical</option>
              <option value="paged">Paged</option>
              <option value="webtoon">Webtoon</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white">
              Preferred Language
            </label>
            <select
              value={form.preferred_language}
              onChange={(e) => handleChange('preferred_language', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="pt-br">Português (BR)</option>
              <option value="all">All</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white">Image Quality</label>
            <select
              value={form.image_quality}
              onChange={(e) => handleChange('image_quality', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-white"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3">
          <input
            type="checkbox"
            checked={Boolean(form.auto_mark_read)}
            onChange={(e) => handleChange('auto_mark_read', e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-zinc-900"
          />
          <span className="text-sm text-white">Auto mark chapter as read</span>
        </label>

        {updateMutation.isError && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
            {updateMutation.error?.message || 'Failed to save settings'}
          </div>
        )}

        {savedMessage && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            {savedMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() =>
              setForm({
                ...DEFAULT_SETTINGS,
                ...(settingsQuery.data || {}),
              })
            }
            className="rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-white"
          >
            Reset
          </button>

          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  );
}