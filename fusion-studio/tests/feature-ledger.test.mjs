import test from 'node:test';
import assert from 'node:assert/strict';
import {audit,referenceItems} from '../scripts/feature-ledger.mjs';

test('every reference feature/control item has a ledger status backed by existing evidence',()=>{
  const {problems,total}=audit();
  assert.ok(total>800,'reference parsed');assert.deepEqual(problems,[]);
});

test('reference parser reads bullets, numbered items and table rows by section',()=>{
  const items=referenceItems('## 1. Viewport\n- Orbit\n## B4. Nav\n| Scheme | Orbit |\n|---|---|\n| **Maya style** | `Alt+LMB` |\n## B14. Presets\n1. **Blender default** (x)\n');
  assert.deepEqual(items,['A1 Orbit','B4 **Maya style**','B14 **Blender default** (x)']);
});
