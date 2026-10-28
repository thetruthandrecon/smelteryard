// The tuning panel (press T): one slider or checkbox per value registered with defineTuning().
import { $ } from '../core/util.js';
import { tuning, SECTIONS, changedSettings, saveTuning, resetTuning, onTuningChange } from '../core/tuning.js';

const outputs = {}, checks = {};
function decimals(stepV) { const s = String(stepV); return s.includes('.') ? s.split('.')[1].length : 0; }
function syncRow(key) { const o = outputs[key]; o.inp.value = tuning[key]; o.out.textContent = `${Number(tuning[key]).toFixed(decimals(o.stepV))} ${o.unit}`; }
function syncAll() {
  for (const k of Object.keys(outputs)) syncRow(k);
  for (const k of Object.keys(checks)) checks[k].checked = !!tuning[k];
}
export function refreshTuneOut() {
  const diff = changedSettings();
  $('tune-out').value = Object.keys(diff).length ? `Smelter Yard settings: ${JSON.stringify(diff)}` : 'Smelter Yard settings: all defaults';
}
onTuningChange(refreshTuneOut);

// build the panel once every lane has registered its values
export function initTuningPanel() {
  const rows = $('tune-rows');
  for (const sec of SECTIONS) {
    const h = document.createElement('h3'); h.textContent = sec.title; rows.appendChild(h);
    for (const r of sec.rows) {
      if (r.check) {
        const label = document.createElement('label'); label.className = 'check';
        const inp = document.createElement('input'); inp.type = 'checkbox'; inp.id = `opt-${r.key}`;
        label.append(inp, ` ${r.label}`);
        rows.appendChild(label);
        checks[r.key] = inp;
        inp.addEventListener('change', () => { tuning[r.key] = inp.checked; saveTuning(); });
        continue;
      }
      const wrap = document.createElement('div'); wrap.className = 'trow';
      const id = `t-${r.key}`;
      wrap.innerHTML = `<label for="${id}">${r.label}</label><output id="o-${r.key}"></output><input type="range" id="${id}" min="${r.min}" max="${r.max}" step="${r.step}">`;
      rows.appendChild(wrap);
      const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
      outputs[r.key] = { inp, out, unit: r.unit, stepV: r.step };
      inp.addEventListener('input', () => { tuning[r.key] = parseFloat(inp.value); syncRow(r.key); saveTuning(); });
    }
  }
  $('tune-reset').addEventListener('click', () => { resetTuning(); syncAll(); });
  $('tune-copy').addEventListener('click', () => {
    refreshTuneOut();
    const ta = $('tune-out'), btn = $('tune-copy');
    const fallback = () => { ta.focus(); ta.select(); btn.textContent = 'Press Ctrl+C'; };
    try {
      const pr = navigator.clipboard && navigator.clipboard.writeText(ta.value);
      if (pr) pr.then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy settings'), 1500); }).catch(fallback);
      else fallback();
    } catch { fallback(); }
  });
  syncAll(); refreshTuneOut();
}
