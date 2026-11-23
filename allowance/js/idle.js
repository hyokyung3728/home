const defaultTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id),
};

export function createIdleLock(ms, onLock, timers = defaultTimers, now = Date.now) {
  let id = null;
  let last = now();
  let done = false;

  const stop = () => {
    if (id !== null) timers.clear(id);
    id = null;
  };
  const fire = () => {
    if (done) return;
    done = true;
    stop();
    onLock();
  };
  const start = () => {
    id = timers.set(fire, ms);
  };

  start();
  return {
    touch() {
      if (done) return;
      if (now() - last >= ms) {
        fire();
        return;
      }
      last = now();
      stop();
      start();
    },
    check() {
      if (!done && now() - last >= ms) fire();
    },
    stop,
  };
}
