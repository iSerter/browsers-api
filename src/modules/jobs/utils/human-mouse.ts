import { Page } from 'playwright';

type Point = { x: number; y: number };
type Options = {
  speed?: number;        // avg pixels per second (base). default ~1200
  jitter?: number;       // max per-step jitter in px. default 0.6
  overshoot?: number;    // fraction of total distance to overshoot (0–0.08). default 0.03
  minPauseMs?: number;   // minimal random pause window. default 8
  maxPauseMs?: number;   // maximal random pause window. default 35
  stepsMin?: number;     // lower bound base steps. default 18
  stepsMax?: number;     // upper bound base steps. default 38
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Smooth ease for speed profile (accelerate/decelerate)
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Quadratic Bézier
function qBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x,
    y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y,
  };
}

// Produce a slightly wavy control point between A and B
function controlPoint(a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const nx = -dy, ny = dx; // perpendicular
  const len = Math.hypot(dx, dy) || 1;
  const offset = clamp(len * rand(0.08, 0.22), 12, 80);
  const along = rand(0.25, 0.75);
  return { 
    x: a.x + dx * along + (nx / len) * (Math.random() < 0.5 ? -offset : offset),
    y: a.y + dy * along + (ny / len) * (Math.random() < 0.5 ? -offset : offset) 
  };
}

export async function moveMouseHuman(
  page: Page,
  to: Point | { el: import('playwright').ElementHandle, padding?: number },
  opts: Options = {}
) {
  const {
    speed = 1200,
    jitter = 0.6,
    overshoot = 0.03,
    minPauseMs = 8,
    maxPauseMs = 35,
    stepsMin = 18,
    stepsMax = 38,
  } = opts;

  const mouse = page.mouse;

  // current position (Playwright doesn't expose; we track by reading last move or assume (0,0))
  // If you always start from element A, call this util consistently; else start from center of viewport.
  // We'll try to read from CDP if available; fallback to 5,5.
  let cur: Point = { x: 5, y: 5 };

  // Calculate destination
  let dest: Point;
  if ('el' in to) {
    const box = await to.el.boundingBox();
    if (!box) throw new Error('Element not visible for mouse move');
    const pad = to.padding ?? 4;
    dest = {
      x: rand(box.x + pad, box.x + box.width - pad),
      y: rand(box.y + pad, box.y + box.height - pad),
    };
  } else {
    dest = to;
  }

  // If you track the current mouse position elsewhere, pass it in instead of cur.
  // For a safer first move, start from a nearby random spot:
  if (Math.hypot(dest.x - cur.x, dest.y - cur.y) > 200) {
    cur = { x: dest.x + rand(-60, 60), y: dest.y + rand(-60, 60) };
    await mouse.move(cur.x, cur.y);
    await page.waitForTimeout(rand(20, 40));
  }

  const distance = Math.hypot(dest.x - cur.x, dest.y - cur.y);
  const baseSteps = Math.round(rand(stepsMin, stepsMax));
  const totalSteps = Math.max(baseSteps, Math.round(distance / (speed / 60))); // ~60Hz pacing

  // Optional tiny overshoot then correct
  const overshootPoint: Point = {
    x: dest.x + (dest.x - cur.x) * overshoot,
    y: dest.y + (dest.y - cur.y) * overshoot,
  };

  // Path 1: cur -> overshootPoint (curved), Path 2: overshoot -> dest (short correction)
  const c1 = controlPoint(cur, overshootPoint);

  // Generate points along the curve
  const points: Point[] = [];
  for (let i = 1; i <= totalSteps; i++) {
    const t = i / totalSteps;
    const et = easeInOut(t);
    const p = qBezier(cur, c1, overshootPoint, et);
    // jitter
    p.x += rand(-jitter, jitter);
    p.y += rand(-jitter, jitter);
    points.push(p);
  }
  // correction segment
  const correctionSteps = Math.max(3, Math.round(totalSteps * clamp(overshoot * 0.6, 0.02, 0.06)));
  for (let i = 1; i <= correctionSteps; i++) {
    const t = i / correctionSteps;
    points.push({
      x: overshootPoint.x + (dest.x - overshootPoint.x) * t + rand(-jitter * 0.5, jitter * 0.5),
      y: overshootPoint.y + (dest.y - overshootPoint.y) * t + rand(-jitter * 0.5, jitter * 0.5),
    });
  }

  // Move with variable per-step timing (human-ish cadence)
  for (const [i, p] of points.entries()) {
    await mouse.move(p.x, p.y, { steps: 1 });
    // cadence: faster in middle, slower at ends
    const phase = i / points.length;
    const baseDelay = (1000 / 120); // ~120 Hz baseline
    const slowFactor = 1 + 1.8 * (Math.cos(Math.PI * (phase - 0.5)) ** 2); // slow at edges
    const randomPause = rand(minPauseMs, maxPauseMs);
    const delay = baseDelay * slowFactor + (Math.random() < 0.08 ? randomPause : 0);
    await page.waitForTimeout(delay);
  }
}

export async function moveToElementAndClick(
  page: Page,
  el: import('playwright').ElementHandle,
  opts?: Options
) {
  await el.scrollIntoViewIfNeeded();
  await moveMouseHuman(page, { el }, opts);
  // brief hover dwell before click
  await page.waitForTimeout(rand(40, 140));
  await page.mouse.down();
  await page.waitForTimeout(rand(20, 90));
  await page.mouse.up();
}

