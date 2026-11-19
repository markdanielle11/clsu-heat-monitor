/**
 * Tiny pub/sub so any part of the app can say "data may have changed, refetch now"
 * (for example when a heat alert push arrives while the app is open).
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeRefresh(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function requestRefresh(): void {
  listeners.forEach((fn) => fn());
}
