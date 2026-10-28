'use strict';
// LED volume / in-camera VFX projection (A22 "LED volume/in-camera
// VFX workflows (nDisplay-style)"): generalized off-axis perspective
// (Kooima) for rendering from a tracked camera eye through a physical
// screen rectangle. Given screen corners pa (bottom-left), pb
// (bottom-right), pc (top-left) and eye position, produce the view and
// projection matrices that make the screen a window into the scene:
// screen corners project exactly to the NDC cube corners, and the
// frustum shears correctly as the eye moves (motion parallax).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a);
  return l < 1e-12 ? [0, 0, 0] : a.map((v) => v / l);
};

/**
 * Compute { view, projection } (row-major 4x4) for an eye looking
 * through screen rectangle pa/pb/pc. near/far are clip distances.
 * The screen normal faces the eye side; if the eye is behind the
 * screen the matrices still form but d is negative -- rejected here.
 */
export function offAxisFrustum({ pa, pb, pc, eye, near = 0.1, far = 100 }) {
  if (!(near > 0) || !(far > near)) throw new Error('led-volume: need 0 < near < far');
  const vr = norm(sub(pb, pa));
  const vu = norm(sub(pc, pa));
  const vn = norm(cross(vr, vu));
  // Vectors from eye to corners.
  const va = sub(pa, eye), vb = sub(pb, eye), vc = sub(pc, eye);
  // One-sided screen: vn (from corner winding) must face the eye.
  const d = -dot(va, vn); // eye distance to screen plane along vn
  if (!(d > 0)) throw new Error('led-volume: eye is not in front of the screen (check corner winding: pa bottom-left, pb bottom-right, pc top-left as seen by the viewer)');
  const n = near, f = far;
  const l = dot(vr, va) * n / d;
  const r = dot(vr, vb) * n / d;
  const b = dot(vu, va) * n / d;
  const t = dot(vu, vc) * n / d;

  const projection = [
    (2 * n) / (r - l), 0, (r + l) / (r - l), 0,
    0, (2 * n) / (t - b), (t + b) / (t - b), 0,
    0, 0, -(f + n) / (f - n), -(2 * f * n) / (f - n),
    0, 0, -1, 0,
  ];
  // View: rotate world into screen frame (vr, vu, vn), translate by -eye.
  const view = [
    vr[0], vr[1], vr[2], -dot(vr, eye),
    vu[0], vu[1], vu[2], -dot(vu, eye),
    vn[0], vn[1], vn[2], -dot(vn, eye),
    0, 0, 0, 1,
  ];
  return { view, projection, frustum: { left: l, right: r, bottom: b, top: t, near: n, far: f }, screenNormal: vn };
}

export function multiplyMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    for (let k = 0; k < 4; k++) out[r * 4 + c] += a[r * 4 + k] * b[k * 4 + c];
  }
  return out;
}

/** Project a world point to NDC [x, y, z] (after perspective divide). */
export function projectPoint(mvp, point) {
  const [x, y, z] = point;
  const cx = mvp[0] * x + mvp[1] * y + mvp[2] * z + mvp[3];
  const cy = mvp[4] * x + mvp[5] * y + mvp[6] * z + mvp[7];
  const cz = mvp[8] * x + mvp[9] * y + mvp[10] * z + mvp[11];
  const cw = mvp[12] * x + mvp[13] * y + mvp[14] * z + mvp[15];
  return [cx / cw, cy / cw, cz / cw];
}

/**
 * Nodal camera helper: for a flat LED wall on the z=0 plane spanning
 * width x height centered at origin, and a tracked eye, return the
 * full MVP setup for a scene rendered from that eye.
 */
export function ledWallSetup({ width = 8, height = 3, eye = [0, 1.5, 5], near = 0.1, far = 100 } = {}) {
  const pa = [-width / 2, 0, 0];
  const pb = [width / 2, 0, 0];
  const pc = [-width / 2, height, 0];
  const { view, projection, frustum } = offAxisFrustum({ pa, pb, pc, eye, near, far });
  return { pa, pb, pc, view, projection, mvp: multiplyMat4(projection, view), frustum };
}
