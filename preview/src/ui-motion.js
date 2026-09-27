import './ui-motion.css';

// Delegation also covers panels created after scene and avatar loading.
export function setupUIMotion() {
  const root=document.documentElement;
  root.dataset.uiInput='keyboard';
  document.addEventListener('pointerdown',()=>{root.dataset.uiInput='pointer';},{passive:true});
  document.addEventListener('keydown',()=>{root.dataset.uiInput='keyboard';},true);
  requestAnimationFrame(()=>{root.dataset.uiReady='true';});
}
