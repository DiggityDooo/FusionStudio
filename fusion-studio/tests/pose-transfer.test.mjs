import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCharacter, POSES} from '../src/character.js';
import {poseInitialPositions} from '../src/hybrid.js';

function garmentAt(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.liveGarment = {version: 1};
  return group;
}

test('pose transfer carries cloth with the raised arm and leaves the chest nearly still', () => {
  const character = createCharacter({}, POSES.wave); // UpperArm_L raised 130 degrees
  const sleeve = [0.39, 1.13, 0.05], chest = [0, 1.35, 0.22];
  const prior = garmentAt([sleeve, chest]);
  const result = poseInitialPositions(prior, character, [sleeve, chest]);
  assert.ok(result, 'transfer must be available for a skinned character');
  assert.equal(result.positions.length, 2);
  assert.equal(result.binding.length, 2);
  const sleeveLift = result.positions[0][1] - sleeve[1];
  assert.ok(sleeveLift > 0.25, `sleeve vertex should follow the raised arm, lifted ${sleeveLift.toFixed(3)} m`);
  const chestMove = Math.hypot(result.positions[1][0] - chest[0], result.positions[1][1] - chest[1], result.positions[1][2] - chest[2]);
  assert.ok(chestMove < 0.1, `chest vertex should barely move, moved ${chestMove.toFixed(3)} m`);
});

test('pose transfer is a no-op in the bind pose and rejects mismatched garments', () => {
  const character = createCharacter({}, POSES.standing ?? {});
  const point = [0.1, 1.3, 0.2];
  const prior = garmentAt([point]);
  const result = poseInitialPositions(prior, character, [point]);
  assert.ok(result);
  const moved = Math.hypot(result.positions[0][0] - point[0], result.positions[0][1] - point[1], result.positions[0][2] - point[2]);
  assert.ok(moved < 0.02, `bind pose transfer moved cloth ${moved.toFixed(3)} m`);
  assert.equal(poseInitialPositions(prior, character, []), null);
  assert.equal(poseInitialPositions(null, character, [point]), null);
});
