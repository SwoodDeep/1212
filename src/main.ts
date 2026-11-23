import { Game } from './core/Game';

const errBox = document.getElementById('err-overlay');
function showErr(msg: string): void {
  if (!errBox) return;
  errBox.style.display = 'block';
  errBox.textContent = (errBox.textContent || '') + msg + '\n';
}
window.addEventListener('error', (e) => showErr(`ERROR: ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => showErr(`REJECTION: ${(e.reason as Error)?.message ?? e.reason}`));

const params = new URLSearchParams(location.search);
const game = new Game(params);

// отладочные/тестовые хуки
(window as unknown as { __game: unknown }).__game = {
  get ready() { return game.ready; },
  get state() { return game.state; },
  game,
  track: game.track,
  input: game.input,
  get race() { return game.race; },
  startRace: (mode: 'race' | 'time' = 'race') => game.startRace(mode),
  setAutopilot: (on: boolean) => { game.autopilot = on; },
  stats: () => game.getStats(),
  rendererInfo: () => ({ ...game.rendererWrap.renderer.info.render }),
  setQuality: (q: 'low' | 'medium' | 'high') => game.debugSetQuality(q),
};

game.init().catch((e) => {
  showErr(`INIT FAILED: ${e?.stack ?? e}`);
  console.error(e);
});
