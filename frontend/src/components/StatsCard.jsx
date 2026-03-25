import { motion } from 'framer-motion';

console.log('StatsCard loaded');
console.log(motion);

export default function StatsCard({ title, value, icon }) {
  return (
    <motion.div
      className="p-4 rounded-xl bg-zinc-900 shadow"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm text-zinc-400">{title}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </motion.div>
  );
}