
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  User, 
  Palette, 
  BookOpen, 
  Bell, 
  Shield, 
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

<<<<<<< ours
<<<<<<< ours
  const updateSettingsMutation = useMutation(
    (data) => settingsApi.update(data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
      }
    }
  );

  const resetSettingsMutation = useMutation(
    () => settingsApi.reset(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
      }
    }
  );
=======
  const updateSettingsMutation = useMutation({
    mutationFn: (data) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
  });

=======
  const updateSettingsMutation = useMutation({
    mutationFn: (data) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
  });

>>>>>>> theirs
  const resetSettingsMutation = useMutation({
    mutationFn: () => settingsApi.reset(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
  });
<<<<<<< ours
>>>>>>> theirs

  useEffect(() => {
    if (preferences?.data?.theme) {
      useThemeStore.getState().syncFromPreferences(preferences.data);
    }
  }, [preferences?.data?.theme]);
=======
>>>>>>> theirs

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

function ReaderSettings({ preferences, onUpdate, onReset }) {
  const [settings, setSettings] = useState({
    reader_mode: preferences.reader_mode || 'vertical',
    reader_direction: preferences.reader_direction || 'rtl',
    prefetch_chapters: preferences.prefetch_chapters || 2,
    show_page_number: preferences.show_page_number ?? true,
    auto_advance: preferences.auto_advance ?? true,
  });

  const handleChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onUpdate(newSettings);
  };

  return (
    <div className="space-y-6">
      <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
        <h2 className="text-lg font-semibold mb-6">Reader Preferences</h2>
        
        {/* Reader Mode */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-3">Default Reader Mode</label>
          <div className="grid grid-cols-3 gap-3">
            {['vertical', 'horizontal', 'webtoon'].map((mode) => (
              <button
                key={mode}
                onClick={() => handleChange('reader_mode', mode)}
                className={clsx(
                  'px-4 py-3 rounded-xl text-sm capitalize',
                  settings.reader_mode === mode
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                )}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Reading Direction */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-3">Reading Direction</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'rtl', label: 'Right to Left' },
              { value: 'ltr', label: 'Left to Right' }
            ].map((dir) => (
              <button
                key={dir.value}
                onClick={() => handleChange('reader_direction', dir.value)}
                className={clsx(
                  'px-4 py-3 rounded-xl text-sm',
                  settings.reader_direction === dir.value
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
                )}
              >
                {dir.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prefetch Chapters */}
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-3">
            Prefetch Chapters: {settings.prefetch_chapters}
          </label>
          <input
            type="range"
            min="0"
            max="5"
            value={settings.prefetch_chapters}
            onChange={(e) => handleChange('prefetch_chapters', parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-4">
          <ToggleSetting
            label="Show Page Number"
            description="Display current page number while reading"
            value={settings.show_page_number}
            onChange={(value) => handleChange('show_page_number', value)}
          />
          <ToggleSetting
            label="Auto Advance"
            description="Automatically go to next chapter when finished"
            value={settings.auto_advance}
            onChange={(value) => handleChange('auto_advance', value)}
          />
        </div>
      </div>

      <button
        onClick={onReset}
        className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
        Reset to Defaults
      </button>
    </div>
  );
}


function AppearanceSettings({ preferences, onUpdate }) {
  const theme = useThemeStore(state => state.theme);

  const handleThemeChange = (newTheme) => {
    useThemeStore.getState().setTheme(newTheme);
    onUpdate({ theme: newTheme });
  };

  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <h2 className="text-lg font-semibold mb-6">Appearance</h2>
      
      {/* Theme */}
      <div>
        <label className="block text-sm text-gray-400 mb-3">Theme</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'system', label: 'System', icon: Monitor },
          ].map((t) => (
            <button
              key={t.value}
              onClick={() => handleThemeChange(t.value)}
              className={clsx(
                'flex flex-col items-center gap-2 p-4 rounded-xl transition-all',
                theme === t.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-gray-400 hover:bg-dark-700'
              )}
            >
              <t.icon className="w-6 h-6" />
              <span className="text-sm">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


function StorageSettings() {
  const [cacheSize, setCacheSize] = useState('0 MB');

  return (
    <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
      <h2 className="text-lg font-semibold mb-6">Storage</h2>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-dark-800 rounded-xl">
          <div>
            <p className="font-medium">Image Cache</p>
            <p className="text-sm text-gray-400">Cached manga images</p>
          </div>
          <span className="text-gray-400">{cacheSize}</span>
        </div>

        <button className="w-full px-4 py-3 bg-dark-800 hover:bg-dark-700 rounded-xl text-gray-300 transition-colors">
          Clear Cache
        </button>
      </div>
    </div>
  );
}

function ToggleSetting({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          'w-12 h-6 rounded-full transition-colors relative',
          value ? 'bg-primary-600' : 'bg-dark-700'
        )}
      >
        <div 
          className={clsx(
            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
            value ? 'left-7' : 'left-1'
          )}
        />
      </button>
    </div>
  );
}

