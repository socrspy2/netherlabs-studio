export function startPlayback(opts: {
  getCurrent: () => number;
  setCurrent: (n: number) => void;
  maxFrames: number;
  fps: number;
}) {
  const interval = Math.max(10, Math.floor(1000 / opts.fps));
  const id = window.setInterval(() => {
    const next = opts.getCurrent() + 1;
    opts.setCurrent(next > opts.maxFrames ? 1 : next);
  }, interval);

  return () => window.clearInterval(id);
}
