/** Shared geometry for layout solvers (parties = rects, donors = circles). */

export const PARTY_PAD = 8;
export const DONOR_PAD = 5;

export function partyHalfSize(data) {
  return {
    hw: ((data?.partyWidth ?? 120) + PARTY_PAD) / 2,
    hh: ((data?.partyHeight ?? 52) + PARTY_PAD) / 2,
  };
}

export function donorRadius(data) {
  return ((data?.size ?? 18) / 2) + DONOR_PAD;
}

export function partyHalfDiagonal(data) {
  const { hw, hh } = partyHalfSize(data);
  return Math.hypot(hw, hh);
}

/** @returns {{ depth: number, ax: number, ay: number, bx: number, by: number } | null} */
export function separateRectRect(ax, ay, aw, ah, bx, by, bw, bh) {
  const overlapX = (aw + bw) / 2 - Math.abs(ax - bx);
  const overlapY = (ah + bh) / 2 - Math.abs(ay - by);
  if (overlapX <= 0 || overlapY <= 0) return null;

  if (overlapX < overlapY) {
    const push = overlapX / 2 + 0.25;
    const sx = ax < bx ? -push : push;
    return { depth: overlapX, ax: sx, ay: 0, bx: -sx, by: 0 };
  }

  const push = overlapY / 2 + 0.25;
  const sy = ay < by ? -push : push;
  return { depth: overlapY, ax: 0, ay: sy, bx: 0, by: -sy };
}

/** @returns {{ depth: number, cx: number, cy: number, rx: number, ry: number } | null} */
export function separateCircleRect(cx, cy, r, rx, ry, rw, rh) {
  const hw = rw / 2;
  const hh = rh / 2;
  const closestX = Math.max(rx - hw, Math.min(cx, rx + hw));
  const closestY = Math.max(ry - hh, Math.min(cy, ry + hh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const distSq = dx * dx + dy * dy;
  const minDist = r + 0.25;
  if (distSq >= minDist * minDist) return null;

  if (distSq < 1e-6) {
    const push = minDist + hw;
    return { depth: push, cx: push, cy: 0, rx: -push / 2, ry: 0 };
  }

  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) / 2 + 0.25;
  const nx = dx / dist;
  const ny = dy / dist;
  return { depth: minDist - dist, cx: nx * push, cy: ny * push, rx: -nx * push, ry: -ny * push };
}

/** @returns {{ depth: number, ax: number, ay: number, bx: number, by: number } | null} */
export function separateCircleCircle(ax, ay, ar, bx, by, br) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const minDist = ar + br + 0.25;
  if (dist >= minDist) return null;

  if (dist < 1e-6) {
    const push = minDist / 2 + 0.5;
    return { depth: minDist, ax: -push, ay: 0, bx: push, by: 0 };
  }

  const push = (minDist - dist) / 2 + 0.25;
  const nx = dx / dist;
  const ny = dy / dist;
  return { depth: minDist - dist, ax: -nx * push, ay: -ny * push, bx: nx * push, by: ny * push };
}

export function countLayoutOverlaps(bodies) {
  let overlaps = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];

      if (a.type === 'party' && b.type === 'party') {
        if (separateRectRect(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) overlaps++;
      } else if (a.type === 'donor' && b.type === 'donor') {
        if (separateCircleCircle(a.x, a.y, a.r, b.x, b.y, b.r)) overlaps++;
      } else {
        const [circle, rect] = a.type === 'donor' ? [a, b] : [b, a];
        if (separateCircleRect(circle.x, circle.y, circle.r, rect.x, rect.y, rect.w, rect.h)) overlaps++;
      }
    }
  }
  return overlaps;
}

export function layoutBounds(bodies) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const body of bodies) {
    minX = Math.min(minX, body.x - body.hw);
    maxX = Math.max(maxX, body.x + body.hw);
    minY = Math.min(minY, body.y - body.hh);
    maxY = Math.max(maxY, body.y + body.hh);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    spanX: maxX - minX || 1,
    spanY: maxY - minY || 1,
    area: (maxX - minX) * (maxY - minY) || 1,
  };
}

export function resolveBodyOverlaps(bodies, passes = 1, immovableIds = null) {
  const fixed = immovableIds ?? new Set();

  function applySep(a, ax, ay, b, bx, by) {
    const aFixed = fixed.has(a.id);
    const bFixed = fixed.has(b.id);
    if (aFixed && bFixed) return;
    if (aFixed) {
      b.x += ax + bx;
      b.y += ay + by;
      return;
    }
    if (bFixed) {
      a.x += ax + bx;
      a.y += ay + by;
      return;
    }
    a.x += ax;
    a.y += ay;
    b.x += bx;
    b.y += by;
  }

  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];

        if (a.type === 'party' && b.type === 'party') {
          const sep = separateRectRect(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
          if (!sep) continue;
          applySep(a, sep.ax, sep.ay, b, sep.bx, sep.by);
        } else if (a.type === 'donor' && b.type === 'donor') {
          const sep = separateCircleCircle(a.x, a.y, a.r, b.x, b.y, b.r);
          if (!sep) continue;
          applySep(a, sep.ax, sep.ay, b, sep.bx, sep.by);
        } else {
          const [circle, rect] = a.type === 'donor' ? [a, b] : [b, a];
          const sep = separateCircleRect(circle.x, circle.y, circle.r, rect.x, rect.y, rect.w, rect.h);
          if (!sep) continue;
          if (fixed.has(circle.id) && fixed.has(rect.id)) continue;
          if (fixed.has(circle.id)) {
            rect.x += sep.rx;
            rect.y += sep.ry;
          } else if (fixed.has(rect.id)) {
            circle.x += sep.cx;
            circle.y += sep.cy;
          } else {
            circle.x += sep.cx;
            circle.y += sep.cy;
            rect.x += sep.rx;
            rect.y += sep.ry;
          }
        }
      }
    }
  }
}
