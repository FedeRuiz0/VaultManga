import { motion } from 'framer-motion';
import clsx from 'clsx';

const toneMap = {
  primary: {
    orb: 'bg-[var(--primary-soft)] text-[var(--primary)]',
    chip: 'text-[var(--primary)]',
  },
  secondary: {
    orb: 'bg-[var(--secondary-soft)] text-[var(--secondary)]',
    chip: 'text-[var(--secondary)]',
  },
  accent: {
    orb: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    chip: 'text-[var(--accent)]',
  },
  neutral: {
    orb: 'bg-[var(--surface-2)] text-[var(--text)]',
    chip: 'text-[var(--text)]',
  },
};

export default function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = 'primary',
}) {
  const palette = toneMap[tone] || toneMap.primary;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="panel-soft p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted">{title}</p>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">
            {value}
          </div>
          {subtitle ? (
            <p className="mt-2 text-sm text-muted">{subtitle}</p>
          ) : null}
        </div>

        {Icon ? (
          <div
            className={clsx(
              'flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)]',
              palette.orb
            )}
          >
            <Icon className={clsx('h-5 w-5', palette.chip)} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}