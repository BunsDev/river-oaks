// One tool-less Codex invocation shared by the agent chat and the World Designer.
// Codex's read-only sandbox still lets its shell *read* any file, so the shell,
// exec, sub-agent, app, plugin, browser and computer-use features are switched off
// and the user config (MCP servers, rules, configured model) is ignored. Verified
// on codex-cli 0.162.1: it can neither read nor write outside the prompt, and it
// has no web search. Codex still injects the user's global ~/.codex/AGENTS.md;
// only a separate CODEX_HOME would stop that, which would mean copying credentials.
import { HostError } from './host-error.js';

// Every listed name must be one Codex knows (it refuses unknown flags), so a release
// that drops one fails closed. Features that are off by default today are listed
// too, so an upgrade cannot switch one on. Plumbing such as auth and storage stays on.
export const CODEX_DISABLED = [
  // Commands, code execution and files.
  'shell_tool', 'unified_exec', 'unified_exec_tty', 'unified_exec_zsh_fork', 'shell_snapshot', 'code_mode', 'code_mode_only', 'code_mode_host',
  'js_repl', 'js_repl_tools_only', 'apply_patch_freeform', 'request_permissions_tool', 'write_stdin_approval', 'worktrees', 'workspace_dependencies',
  // Agents, apps, plugins, MCP and automation.
  'multi_agent', 'multi_agent_v2', 'enable_fanout', 'apps', 'enable_mcp_apps', 'plugins', 'remote_plugin', 'plugin_sharing', 'hooks',
  'tool_call_mcp_elicitation', 'in_app_local_automation', 'daemon_auto_start', 'skill_mcp_dependency_install', 'skill_search', 'tool_suggest', 'goals', 'sleep_tool',
  // Browsers, computer use, web search, media and voice.
  'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'browser_annotation_api', 'in_app_browser', 'computer_use',
  'standalone_web_search', 'search_tool', 'web_search_request', 'web_search_cached', 'image_generation', 'view_image',
  'realtime_conversation', 'in_app_voice', 'in_app_dictation',
  // Context the page should not be able to ask for.
  'memories', 'mentions_v2'];

export function codexArgs({ model = 'default', prompt, workspace }) {
  return ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules',
    ...CODEX_DISABLED.flatMap(feature => ['--disable', feature]), '-c', 'web_search="disabled"', '-C', workspace,
    ...(model === 'default' ? [] : ['-m', model]), '--', prompt];
}

// The final agent message of a completed `codex exec --json` turn. Earlier messages
// (progress notes) are ignored; a failed or unfinished turn is an error.
export function lastCodexMessage(stdout) {
  let message = null, completed = false;
  for (const line of String(stdout).split('\n')) {
    let event; try { event = JSON.parse(line); } catch { continue; }
    if (event.type === 'turn.failed' || event.type === 'error') throw new HostError('Codex reported an error. Check its sign-in and usage limits.');
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') message = event.item.text;
    if (event.type === 'turn.completed') completed = true;
  }
  if (!completed || !message) throw new HostError('Codex returned an incomplete response.');
  return message.trim();
}
