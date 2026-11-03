async page => {
  const { runPlayerBlocking } = await import('./helpers/player-blocking-journey.js');
  return runPlayerBlocking(page, { origin: 'http://127.0.0.1:5180' });
}
