import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { renderPlansIndex, plansIndexFor } from '../plans-index.mjs';

test('the plans index groups register-linked plans by status and lists the rest as historical', () => {
  const text = renderPlansIndex({
    tasks: [
      { id: 'live-task', status: 'active', ledger: 'docs/superpowers/plans/2026-10-12-live.md', updatedAt: '2026-10-12T01:00:00Z' },
      { id: 'shipped', status: 'retired', ledger: 'docs/superpowers/plans/2026-10-11-shipped.md', pr: 240, deliveryPr: 244, updatedAt: '2026-10-11T20:00:00Z' },
      { id: 'no-ledger', status: 'delivered' },
    ],
    plans: [
      { file: '2026-10-12-live.md', text: '# Live work | with a pipe\n' },
      { file: '2026-10-11-shipped.md', text: '# Shipped thing ending in a backslash \\\n' },
      { file: '2026-09-20-old.md', text: '# Old plan\nDelivered in #31 and #29; see #31 again.\n' },
    ],
  });
  assert.match(text, /## Active and blocked \(1\)[\s\S]*\[2026-10-12-live\]\(2026-10-12-live\.md\)<br>Live work \\\| with a pipe \| `live-task` \| active \| — \| 2026-10-12 \|/);
  assert.match(text, /## Delivered, awaiting local retirement \(0\)\n\nNone\./);
  assert.match(text, /## Retired \(1\)[\s\S]*`shipped` \| retired \| #244 \| 2026-10-11 \|/, 'the delivery PR wins over the first PR');
  assert.ok(text.includes('Shipped thing ending in a backslash \\\\ |'), 'a trailing backslash is escaped, so it cannot escape the cell divider');
  assert.match(text, /## Historical, not in the register \(1\)[\s\S]*Old plan \| #31, #29 \|/);
  assert.match(text, /Do not edit by hand/);
});

test('the repository index covers every plan ledger', () => {
  const { text } = plansIndexFor(fileURLToPath(new URL('../..', import.meta.url)));
  assert.match(text, /^# Plans index/);
  assert.match(text, /## Historical, not in the register \(\d+\)/);
});
