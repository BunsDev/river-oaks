import { setupThemeControls } from '../theme.js';

// Follow the game's Appearance preference (System by default) before anything renders.
setupThemeControls();
// The hosted chunks are gated by the same middleware as the game. Check again
// before starting, including on local Vite where production middleware is absent.
const host=document.querySelector('#studio');
try {
  const response=await fetch('/api/waitlist/status',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok||(await response.json()).status!=='approved')throw new Error('Sign in and join the approved waitlist to open World Studio.');
  const { startStudio }=await import('./main.js');startStudio(host);
} catch(error) {host.querySelector('[role="status"]').textContent=error.message||'World Studio could not open. Return to the world and try again.';}
