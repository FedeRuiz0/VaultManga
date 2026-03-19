import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  User, 
  Palette, 
  BookOpen, 
  HardDrive,
  Moon,
  Sun,
  Monitor,
  Save,
  RotateCcw
} from 'lucide-react';
import { settingsApi, authApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore.js';
import LoadingScreen from '../components/LoadingScreen';
import clsx from 'clsx';

const tabs = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'reader', label: 'Reader', icon: BookOpen },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'storage', label: 'Storage', icon: HardDrive },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: () => settingsApi.get(),
  });

  // ✅ Versión correcta sin conflictos
  const updateSettingsMutation = useMutation({
    mutationFn: (data) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
  });

  const resetSettingsMutation = useMutation({
    mutationFn: () => settingsApi.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
  });

  // ✅ Sync del theme (esto estaba perdido en el merge)
  useEffect(() => {
    if (preferences?.data?.theme) {
      useThemeStore.getState().syncFromPreferences(preferences.data);
    }
  }, [preferences?.data?.theme]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  const prefs = preferences?.data || {};

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold font-display mb-6">Settings</h1>

      <div className="flex gap-6">
        {/* Tabs */}
        <nav className="w-48 flex-shrink-0">
          <div className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all',
                  activeTab === tab.id
                    ? 'bg-primary-600/10 text-primary-400'
                    : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200'
                )}
              >
                <tab.icon className="w-5 h-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {activeTab === 'profile' && (
              <ProfileSettings user={user} />
            )}
            {activeTab === 'reader' && (
              <ReaderSettings 
                preferences={prefs}
                onUpdate={(data) => updateSettingsMutation.mutate(data)}
                onReset={() => resetSettingsMutation.mutate()}
              />
            )}
            {activeTab === 'appearance' && (
              <AppearanceSettings 
                preferences={prefs}
                onUpdate={(data) => updateSettingsMutation.mutate(data)}
              />
            )}
            {activeTab === 'storage' && (
              <StorageSettings />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ProfileSettings({ user }) {
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');

  const updateProfileMutation = useMutation({
    mutationFn: (data) => authApi.updateProfile(data),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateProfileMutation.mutate({ username, email });
  };

  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <h2 className="text-lg font-semibold mb-6">Profile Settings</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <button
          type="submit"
          disabled={updateProfileMutation.isPending}
          className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 rounded-xl font-medium transition-colors"
        >
          <Save className="w-5 h-5" />
          Save Changes
        </button>
      </form>
    </div>
  );
}