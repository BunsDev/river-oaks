import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const recipe = join(root, 'config/neighborhoods/garden-blocks.json');
const run = args => spawnSync(process.execPath, ['scripts/neighborhood.mjs', ...args], {cwd: root, encoding: 'utf8'});
const read = path => JSON.parse(readFileSync(path));

test('CLI exports reproducible Studio/world/preview candidates and refuses to overwrite any output', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'ro-neighborhood-'));t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const a = join(temporary, 'a'), b = join(temporary, 'b');
  for (const out of [a, b]) {
    const result = run(['build', '--recipe', recipe, '--out', out]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(join(out, 'region.json')).buildings.length, 16);
    assert.equal(read(join(out, 'world.json')).buildings.length, 16);
    assert.match(readFileSync(join(out, 'preview.svg'), 'utf8'), /<svg/);
  }
  assert.deepEqual(readdirSync(a).sort(), ['authoring.json', 'diagnostics.json', 'preview.svg', 'region.json', 'world.json']);
  for (const name of readdirSync(a)) assert.equal(readFileSync(join(a, name), 'utf8'), readFileSync(join(b, name), 'utf8'), name);
  const before = readFileSync(join(a, 'authoring.json'), 'utf8');
  const refused = run(['build', '--recipe', recipe, '--out', a]);
  assert.equal(refused.status, 1);assert.match(refused.stderr, /exist/i);
  assert.equal(readFileSync(join(a, 'authoring.json'), 'utf8'), before);
});

test('CLI accepts edited Studio JSON only with its previous artifact and writes conflicts without candidates', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'ro-neighborhood-'));t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const a = join(temporary, 'a'), b = join(temporary, 'b'), bad = join(temporary, 'bad');
  assert.equal(run(['build', '--recipe', recipe, '--out', a]).status, 0);
  const region = read(join(a, 'region.json')), id = region.buildings[0].id;
  region.buildings[0].size[2] = 11;
  const editPath = join(temporary, 'edited.json');writeFileSync(editPath, JSON.stringify(region));
  const result = run(['build', '--recipe', recipe, '--previous', join(a, 'authoring.json'), '--edited', editPath, '--approve', id, '--out', b]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(join(b, 'region.json')).buildings[0].size[2], 11);
  const omitted = run(['build', '--recipe', recipe, '--edited', editPath, '--out', bad]);
  assert.equal(omitted.status, 1);assert.match(omitted.stderr, /previous/i);assert.ok(!existsSync(bad));
  region.buildings[0].center = [-76, -40];writeFileSync(editPath, JSON.stringify(region));
  const conflict = run(['build', '--recipe', recipe, '--previous', join(a, 'authoring.json'), '--edited', editPath, '--out', bad]);
  assert.equal(conflict.status, 1);assert.match(conflict.stderr, /road-clearance/);assert.match(conflict.stderr, new RegExp(id));assert.ok(!existsSync(bad));
});

test('CLI rejects missing, repeated and unsupported arguments before touching output', t => {
  const temporary = mkdtempSync(join(tmpdir(), 'ro-neighborhood-'));t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const out = join(temporary, 'never-created');
  for (const args of [[], ['build', '--out', out], ['build', '--recipe', recipe, '--out', out, '--force'], ['build', '--recipe', recipe, '--recipe', recipe, '--out', out]]) {
    const result = run(args);assert.equal(result.status, 1);assert.ok(!existsSync(out));
  }
});

test('architecture candidates export repeatable kit geometry alongside unchanged region contracts',t=>{
  const temporary=mkdtempSync(join(tmpdir(),'ro-neighborhood-kit-'));t.after(()=>rmSync(temporary,{recursive:true,force:true}));
  for(const [name,count] of [['garden-market',16],['garden-court',6]]){
    const outputs=[join(temporary,`${name}-a`),join(temporary,`${name}-b`)];
    for(const out of outputs){
      const result=run(['build','--recipe',join(root,`config/neighborhoods/${name}.json`),'--out',out]);assert.equal(result.status,0,result.stderr);
      const architecture=read(join(out,'architecture.json'));
      assert.equal(architecture.counts.buildings,count);assert.equal(architecture.counts.fallbacks,0);
      assert.equal(architecture.artifact_sha256,read(join(out,'authoring.json')).sha256);
      assert.equal(read(join(out,'region.json')).buildings.length,count);
    }
    for(const file of readdirSync(outputs[0]))assert.equal(readFileSync(join(outputs[0],file),'utf8'),readFileSync(join(outputs[1],file),'utf8'));
  }
});
