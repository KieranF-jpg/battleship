// Optional 3D view: tilted boards and raised ships, plus a shell that drops onto each target.
export const VIEW_KEY = 'battleship.view';

export function loadView(storage) {
  try {
    return storage?.getItem(VIEW_KEY) === '3d' ? '3d' : '2d';
  } catch {
    return '2d';
  }
}

export function saveView(storage, view) {
  try { storage?.setItem(VIEW_KEY, view); } catch { /* storage disabled */ }
}

export function dropShell(target, duration = 380) {
  if (!target) return Promise.resolve();
  const r = target.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const shell = document.createElement('div');
  shell.className = 'cannonball shell';
  shell.setAttribute('aria-hidden', 'true');
  document.body.appendChild(shell);
  return new Promise((resolve) => {
    const done = () => { shell.remove(); resolve(); };
    if (!shell.animate) return done();
    shell.animate([
      { transform: `translate(${x}px, ${y - 240}px) scale(2.6)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 70}px) scale(1.5)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x}px, ${y}px) scale(0.6)`, opacity: 1 },
    ], { duration, easing: 'ease-in' });
    setTimeout(done, duration);
  });
}
