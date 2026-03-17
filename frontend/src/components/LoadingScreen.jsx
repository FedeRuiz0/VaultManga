import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center">
      <motion.div
        animate={{ 
          rotate: 360,
          scale: [1, 1.1, 1]
        }}
        transition={{ 
          rotate: { duration: 2, repeat: Infinity, ease: "linear" },
          scale: { duration: 1, repeat: Infinity }
        }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center mb-4"
      >
        <BookOpen className="w-8 h-8 text-white" />
      </motion.div>
      <p className="text-gray-400 animate-pulse">Loading...</p>
    </div>
  );
}

