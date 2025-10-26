import { Page } from 'playwright';

type ScrollOptions = {
  targetY?: number;       // final scrollTop target (default: bottom of page)
  speed?: number;         // base pixels per second (default 2500)
  variance?: number;      // randomness factor 0–1 (default 0.35)
  stepMin?: number;       // minimal pixels per step (default 60)
  stepMax?: number;       // max pixels per step (default 180)
  pauseChance?: number;   // probability per step to pause briefly (default 0.15)
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function easeOutQuad(t: number) {
  return t * (2 - t);
}

export async function humanScroll(page: Page, opts: ScrollOptions = {}) {
  const {
    targetY,
    speed = 2500,
    variance = 0.35,
    stepMin = 60,
    stepMax = 180,
    pauseChance = 0.15,
  } = opts;

  // Evaluate total document height and current scroll
  const { scrollTop, scrollHeight, clientHeight } = await page.evaluate(() => ({
    scrollTop: document.documentElement.scrollTop || document.body.scrollTop,
    scrollHeight: Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    ),
    clientHeight: window.innerHeight,
  }));

  const endY = targetY ?? scrollHeight - clientHeight;
  const distance = endY - scrollTop;
  const direction = Math.sign(distance);

  const totalSteps = Math.max(10, Math.floor(Math.abs(distance) / stepMin));
  let current = scrollTop;
  let t = 0;

  for (let i = 0; i < totalSteps; i++) {
    t = (i + 1) / totalSteps;
    const eased = easeOutQuad(t);
    const stepSize = rand(stepMin, stepMax) * direction;
    const jitter = stepSize * variance * (Math.random() - 0.5) * 2;
    const next = current + (stepSize + jitter) * eased;

    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'auto' }), next);
    current = next;

    // variable timing
    const baseDelay = (1000 * Math.abs(stepSize)) / speed;
    const delay = baseDelay * rand(0.6, 1.4);
    await page.waitForTimeout(delay * 1000);

    // chance to briefly pause
    if (Math.random() < pauseChance) {
      await page.waitForTimeout(rand(150, 400));
    }
  }

  // gentle overshoot and correction
  const overshoot = distance * 0.04 * direction;
  await page.evaluate(y => window.scrollBy({ top: y, behavior: 'auto' }), overshoot);
  await page.waitForTimeout(rand(100, 200));
  await page.evaluate(y => window.scrollBy({ top: y, behavior: 'auto' }), -overshoot / 2);
  await page.waitForTimeout(rand(80, 160));
}

