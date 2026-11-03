// Acceptance-only composition of the actual account/roster/Settings controls.
// The normal access entry and authoritative town still admit every fixture user.
// No renderer or replacement block implementation is loaded.
import '/src/style.css';
import '/src/playground-theme.css';
import '/src/district-theme.css';
import '/src/immersive.css';
import '/src/sidebar.css';
import '/src/visual-finish.css';
import '/src/retro-finish.css';
import '/src/rail-navigation.css';
import '/src/game-hud.css';
import '/src/hud-glass.css';
import '/src/settings-dialog.css';
import { createCommunityPanel } from '/src/community-ui.js';
import { createMultiplayer } from '/src/multiplayer-client.js';
import { setupSidebar, setupSidebarSections } from '/src/sidebar.js';
import { setupThemeControls } from '/src/theme.js';

setupThemeControls();
const sidebar = setupSidebar();
let client;
createCommunityPanel({ host: document.querySelector('.panel-scroll'), getMultiplayer: () => client });
document.querySelector('.panel-scroll').prepend(document.querySelector('#community-section'));
setupSidebarSections({ sidebar });
client = createMultiplayer({ getPose: () => null, onSnapshot() {}, onCorrection() {}, onPlayers() {} });
window.__riverMultiplayer = () => ({ connected: client.connected, selfId: client.identity?.id, snapshot: client.snapshot });
window.__riverMultiplayerCommand = message => client.command(message);
document.querySelector('#loading').hidden = true;
document.dispatchEvent(new CustomEvent('river-oaks:styled'));
