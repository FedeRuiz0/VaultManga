import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="panel-soft min-h-[50vh] flex flex-col items-center justify-center gap-4 p-8">
      <motion.div
        animate={{ 
          rotate: 360,
          scale: [1, 1.08, 1],
        }}
        transition={{ 
          rotate: { duration: 2, repeat: Infinity, ease: "linear" },
          scale: { duration: 1.1, repeat: Infinity },
        }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--secondary))] shadow-[0_14px_30px_rgba(124,58,237,0.25)]"
      >
        <BookOpen className="h-8 w-8 text-white" />
      </motion.div>
      <p className="animate-pulse text-sm text-muted">Loading your vault...</p>
    </div>
  );
}

