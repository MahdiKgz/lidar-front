import { expect, it } from 'vitest';
import { selectLod } from './lod';
it('requests additional additive detail when the same area is zoomed closer', () => {
  const nodes = [{key:'0-0-0-0',points:100,pixels:600,bytes:1000},{key:'1-0-0-0',points:100,pixels:100,bytes:1000},{key:'2-0-0-0',points:100,pixels:50,bytes:1000}];
  expect(selectLod(nodes,1/128)).toEqual(['0-0-0-0']);
  expect(selectLod(nodes.map(n=>({...n,pixels:n.pixels*4})),1/128)).toEqual(['0-0-0-0','1-0-0-0','2-0-0-0']);
});
it('bounds memory and excludes offscreen detail', () => {
  expect(selectLod([{key:'0-0-0-0',points:100,pixels:600,bytes:1000},{key:'1-0-0-0',points:100,pixels:0,bytes:1000},{key:'1-1-0-0',points:1000,pixels:800,bytes:1000}],1/128,200)).toEqual(['0-0-0-0']);
});
it('ultra reveals fine nodes omitted by balanced mode without exceeding its budget', async () => {
  const { QUALITY_LEVELS } = await import('./lod');
  const nodes = [{key:'0-0-0-0',points:200000,pixels:1000000,bytes:6000000},
    {key:'1-0-0-0',points:500000,pixels:256,bytes:15000000},
    {key:'2-0-0-0',points:500000,pixels:64,bytes:15000000},
    {key:'3-0-0-0',points:500000,pixels:48,bytes:15000000}];
  const normal = QUALITY_LEVELS.balanced, ultra = QUALITY_LEVELS.ultra;
  expect(selectLod(nodes,1/128,normal.budget,normal.spacing)).toHaveLength(2);
  expect(selectLod(nodes,1/128,ultra.budget,ultra.spacing)).toHaveLength(4);
});
