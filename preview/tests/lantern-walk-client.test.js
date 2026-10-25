import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`, import.meta.url);
const { createLanternWalkClient } = await import('../src/lantern-walk.js');

// A minimal DOM: the walking HUD's notice and the viewport the status chip joins.
function dom() {
  const element = id => ({ id, hidden: true, textContent: '', children: [], isConnected: true, innerHTML: '',
    append(child) { this.children.push(child); }, querySelector() { return { textContent: '' }; } });
  const notice = element('walking-notice'), viewport = element('viewport');
  globalThis.document = { querySelector: selector => ({ '#walking-notice': notice, '#viewport': viewport })[selector] ?? null, createElement: () => element('chip') };
  return { notice };
}

test('crossing the promenade names Bayou Market Commons on arrival and the District on return', () => {
  const { notice } = dom(), edge = -2666.34;
  let east = edge - 4;
  const client = createLanternWalkClient({
    getLayout: () => ({ edge, destination: { lanterns: [] } }),
    getPose: () => ({ position: [east, 18.4, 1335], altitude: 0 }),
    getSnapshot: () => ({ lanterns: [], round: null, best: null }),
    getScene: () => ({ userData: { setLanterns() {} } }),
    send: async () => ({ ok: true }),
  });
  client.update();
  assert.equal(notice.textContent, '', 'starting in the District announces nothing');
  east = edge + 6; client.update();
  assert.match(notice.textContent, /^Bayou Market Commons/); assert.equal(notice.hidden, false);
  notice.textContent = ''; client.update();
  assert.equal(notice.textContent, '', 'walking on inside does not repeat the welcome');
  east = edge - 3; client.update();
  assert.equal(notice.textContent, 'Back in River Oaks District');
});

test('the shared walking HUD can own arrival announcements without a second lantern notice', () => {
  const {notice} = dom();
  const client = createLanternWalkClient({announceArrival:false,
    getLayout:()=>({edge:0,destination:{lanterns:[]}}),getPose:()=>({position:[20,0,0]}),
    getSnapshot:()=>({lanterns:[],round:null}),getScene:()=>({userData:{setLanterns(){}}})});
  client.update(); assert.equal(notice.textContent,'');
});
