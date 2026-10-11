// One tool-less Codex invocation shared by the agent chat and the World Designer.
// Codex's read-only sandbox still lets its shell *read* any file, so the shell,
// exec, sub-agent, app, plugin, browser and computer-use features are switched off
// and the user config (MCP servers, rules, configured model) is ignored. Verified
// on codex-cli 0.162.1: it can neither read nor write outside the prompt, and it
// has no web search. Codex still injects the user's global ~/.codex/AGENTS.md;
// only a separate CODEX_HOME would stop that, which would mean copying credentials.
export const CODEX_VERIFIED = '0.162.1';
export const CODEX_DISABLED = ['shell_tool', 'unified_exec', 'unified_exec_tty', 'shell_snapshot', 'code_mode_host', 'multi_agent', 'apps', 'plugins',
  'remote_plugin', 'plugin_sharing', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'in_app_browser', 'computer_use',
  'image_generation', 'view_image', 'skill_mcp_dependency_install', 'skill_search', 'tool_suggest', 'goals', 'sleep_tool'];

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
    if (event.type === 'turn.failed' || event.type === 'error') throw Error('Codex reported an error. Check its sign-in and usage limits.');
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') message = event.item.text;
    if (event.type === 'turn.completed') completed = true;
  }
  if (!completed || !message) throw Error('Codex returned an incomplete response.');
  return message.trim();
}
