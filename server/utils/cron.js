/**
 * Minimal standard 5-field cron evaluator (no external dependency).
 *
 * Fields: `minute hour day-of-month month day-of-week`
 * Each field supports `*`, lists (`a,b`), ranges (`a-b`), and steps
 * (`* /n`, `a-b/n`). day-of-week: 0 or 7 = Sunday. When both day-of-month and
 * day-of-week are restricted, a match on EITHER fires (standard Vixie cron).
 *
 * Times are evaluated in the server's local timezone, matching how a user
 * thinks about "每晚 2 点". Good enough for the scheduler; swap for a library
 * if DST-exact or seconds-granularity scheduling is ever needed.
 */

const FIELD_RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7], // day of week (0/7 = Sun)
];

function parseField(field, min, max) {
  const allowed = new Set();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isInteger(step) || step < 1) return null;

    let lo;
    let hi;
    if (rangePart === '*') {
      lo = min;
      hi = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map((n) => parseInt(n, 10));
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      lo = a;
      hi = b;
    } else {
      const v = parseInt(rangePart, 10);
      if (!Number.isInteger(v)) return null;
      lo = v;
      hi = v;
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return allowed;
}

/**
 * Parses a cron expression into matcher sets, or null if malformed.
 */
export function parseCron(expr) {
  if (typeof expr !== 'string') return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const sets = [];
  for (let i = 0; i < 5; i += 1) {
    const set = parseField(fields[i], FIELD_RANGES[i][0], FIELD_RANGES[i][1]);
    if (!set) return null;
    sets.push(set);
  }
  // Normalize day-of-week 7 -> 0 (Sunday) for matching against Date.getDay().
  if (sets[4].has(7)) sets[4].add(0);

  const domRestricted = fields[2] !== '*';
  const dowRestricted = fields[4] !== '*';
  return { sets, domRestricted, dowRestricted };
}

export function isValidCron(expr) {
  return parseCron(expr) !== null;
}

function matches(parsed, date) {
  const [min, hr, dom, mon, dow] = parsed.sets;
  if (!min.has(date.getMinutes())) return false;
  if (!hr.has(date.getHours())) return false;
  if (!mon.has(date.getMonth() + 1)) return false;

  const domOk = dom.has(date.getDate());
  const dowOk = dow.has(date.getDay());
  // Both restricted -> OR semantics; otherwise the unrestricted one is '*'.
  if (parsed.domRestricted && parsed.dowRestricted) return domOk || dowOk;
  return domOk && dowOk;
}

/**
 * Returns the epoch-ms of the next cron fire strictly after `fromMs`, scanning
 * minute by minute up to ~400 days ahead. Returns null for an invalid
 * expression or if no match is found within the bound.
 */
export function cronNextRun(expr, fromMs = Date.now()) {
  const parsed = parseCron(expr);
  if (!parsed) return null;

  const cursor = new Date(fromMs);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1); // strictly after

  const limit = 400 * 24 * 60; // minutes to scan before giving up
  for (let i = 0; i < limit; i += 1) {
    if (matches(parsed, cursor)) return cursor.getTime();
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}
