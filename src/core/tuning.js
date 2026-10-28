// Tuning registry. Each lane registers its own adjustable values with defineTuning(); the
// tuning panel (press T) is built from what was registered. Saved values persist per browser.
import { store } from './util.js';

const TUNE_KEY = 'smelter-yard:tuning:v1';
const saved = (() => { const s = store.get(TUNE_KEY, {}); return s && typeof s === 'object' ? s : {}; })();

export const DEFAULTS = {};   // every value's default
export const tuning = {};     // live values, read by the game every step
export const SECTIONS = [];   // [{ title, rows }] for the panel
// panel order; sections not listed here go at the end in the order they were registered
const SECTION_ORDER = ['Movement', 'Dash', 'Walls', 'Combat', 'Health and lives', 'Enemies', 'Hazards', 'Camera', 'Display'];
const listeners = [];

// rows: [key, label, default, min, max, step, unit] for a slider, or [key, label, default] for a checkbox
export function defineTuning(title, rows) {
  const section = { title, rows: [] };
  for (const r of rows) {
    const [key, label, def] = r;
    if (key in DEFAULTS) throw new Error(`tuning value "${key}" is defined twice`);
    DEFAULTS[key] = def;
    tuning[key] = typeof saved[key] === typeof def ? saved[key] : def;
    section.rows.push(r.length > 3 ? { key, label, min: r[3], max: r[4], step: r[5], unit: r[6] } : { key, label, check: true });
  }
  SECTIONS.push(section);
  SECTIONS.sort((a, b) => rank(a.title) - rank(b.title));
}
const rank = (t) => { const i = SECTION_ORDER.indexOf(t); return i < 0 ? 100 : i; };

export function changedSettings() {
  const diff = {};
  for (const k of Object.keys(DEFAULTS)) if (tuning[k] !== DEFAULTS[k]) diff[k] = tuning[k];
  return diff;
}
// call after changing any value: stores it and tells every listener
export function saveTuning() {
  store.set(TUNE_KEY, changedSettings());
  for (const fn of listeners) fn();
}
export function resetTuning() { Object.assign(tuning, DEFAULTS); saveTuning(); }
export function onTuningChange(fn) { listeners.push(fn); }
