import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BookOpen,
  ChevronLeft,
  Home,
  Library,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../stores/authStore';
import { useThemeToggle } from '../stores/themeStore.js';
import SearchBar from './SearchBar.jsx';

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/library/history', icon: BookOpen, label: 'History' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const location = useLocation();
  const navigate = useNavigate();

  const { logout, user } = useAuthStore();
  const { toggleTheme, effectiveTheme } = useThemeToggle();

  const isReaderRoute = location.pathname.startsWith('/reader/');

  const initials = useMemo(() => {
    const source =
      user?.username ||
      user?.name ||
      user?.email ||
      'MV';

    return String(source)
      .trim()
      .slice(0, 2)
      .toUpperCase();
  }, [user]);

  if (isReaderRoute) {
    return <div className="min-h-screen bg-black">{children}</div>;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearch = (query) => {
    if (!query?.trim()) return;
    navigate(`/library?search=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="app-shell min-h-screen">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar backdrop"
          />
        )}
      </AnimatePresence>

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-[280px] px-4 py-4 transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="glass-panel flex h-full flex-col p-4">
          <div className="flex items-center justify-between px-2 pb-4">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--secondary))] text-white shadow-lg">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight">MangaVault</div>
                <div className="text-xs text-muted">Anime reader dashboard</div>
              </div>
            </Link>

            <button
              type="button"
              className="icon-chip lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="panel-soft mb-4 flex items-center gap-3 p-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary-soft),var(--secondary-soft))] text-[var(--primary)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text)]">
                {user?.username || user?.name || 'Reader'}
              </p>
              <p className="truncate text-xs text-muted">
                {user?.email || 'Welcome back'}
              </p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map(({ path, icon: Icon, label }) => {
              const active =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path);

              return (
                <Link
                  key={path}
                  to={path}
                  className={clsx(
                    'sidebar-link',
                    active && 'sidebar-link-active'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-6 panel-soft p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Quick tip
            </div>
            <p className="mt-2 text-sm text-muted">
              Use search to import manga on demand, then continue reading from the dashboard.
            </p>
          </div>

          <div className="mt-auto pt-4">
            <button
              type="button"
              className="sidebar-link w-full"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[304px]">
        <header className="sticky top-0 z-30 px-4 pt-4 lg:px-6">
          <div className="glass-panel flex items-center gap-3 px-3 py-3 sm:px-4">
            <button
              type="button"
              className="icon-chip lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm text-muted sm:flex">
              <Search className="h-4 w-4" />
              <span>Search manga, authors, tags...</span>
            </div>

            <div className="flex-1">
              <SearchBar
                value={searchValue}
                onChange={setSearchValue}
                onSearch={handleSearch}
                className="w-full"
                placeholder="Search manga, authors, tags..."
              />
            </div>

            <button
              type="button"
              className="icon-chip hidden sm:flex"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {effectiveTheme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button type="button" className="icon-chip hidden sm:flex" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </button>

            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--secondary))] text-white shadow-lg"
              aria-label="Quick action"
            >
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </button>

            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-sm font-semibold text-[var(--text)] shadow-sm">
              {initials}
            </div>
          </div>
        </header>

        <main className="px-4 pb-6 pt-6 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}