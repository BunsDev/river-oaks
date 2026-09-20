import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateVegetation, canopyTiles } from '../src/vegetation.js';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const world=read('../public/data/district.json');
const vegetation=read('../public/data/district-vegetation.json');

test('shipped canopy matches its source frame, verification hash and return accounting',()=>{
  validateVegetation(world,vegetation);
  const report=read('../../data/reports/district-canopy.json');
  assert.equal(createHash('sha256').update(readFileSync(new URL('../public/data/district-vegetation.json',import.meta.url))).digest('hex'),report.runtime_sha256);
  assert.equal(vegetation.voxels.reduce((sum,row)=>sum+row[3],0),vegetation.supported_returns);
  assert.notEqual(report.independent_canopy.source_id,vegetation.source.source_id);
  assert.equal(world.trees.length,4,'Derived canopy must not overwrite the mapped stem inventory');
});

test('mismatched coordinates, unsupported heights and excessive canopy data are rejected',()=>{
  for(const change of [
    {origin:[0,0]}, {crs:'EPSG:3857'}, {world_source_sha256:'stale'},
    {voxels:[[0,0,8,1]]}, {voxels:[[...vegetation.voxels[0].slice(0,2),-1,1]]},
    {voxels:Array(40001).fill(vegetation.voxels[0])},
    {independent_comparison:null},
  ]) assert.throws(()=>validateVegetation(world,{...vegetation,...change}));
});

test('spatial foliage batches retain every measured voxel exactly once',()=>{
  const tiles=canopyTiles(vegetation.voxels);
  assert.ok(tiles.length>1 && tiles.length<=36);
  const batched=tiles.flatMap(tile=>tile.voxels);
  assert.equal(batched.length,vegetation.voxels.length);
  assert.equal(new Set(batched).size,vegetation.voxels.length);
  for(const tile of tiles) for(const voxel of tile.voxels) {
    assert.ok(Math.abs(voxel[0]-tile.center[0])<=32 && Math.abs(voxel[1]-tile.center[1])<=32);
  }
});
