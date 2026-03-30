import { useRealtimeSync } from '../hooks/useRealtimeSync';

export default function RealtimeBridge() {
  useRealtimeSync();
  return null;
}