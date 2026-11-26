const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { watermark: true, hideAtNormal: false, shortcuts: true, step: 0.25 };
const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const $ = (id) => document.getElementById(id);
let step = DEFAULTS.step;

function show(rate) {
  $('cur').textContent = rate == null ? 'No video' : `${+rate.toFixed(2)}×`;
  document.querySelectorAll('#presets button').forEach((b) =>
    b.classList.toggle('on', rate != null && +b.dataset.r === +rate.toFixed(2)));
}

async function send(msg) {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const res = await api.tabs.sendMessage(tab.id, msg);
    show(res ? res.rate : null);
  } catch {
    show(null); // e.g. about: pages, or no content script in the tab
  }
}

for (const r of PRESETS) {
  const b = document.createElement('button');
  b.textContent = `${r}×`;
  b.dataset.r = r;
  b.onclick = () => send({ type: 'set', rate: r });
  $('presets').appendChild(b);
}
$('up').onclick = () => send({ type: 'nudge', delta: step });
$('down').onclick = () => send({ type: 'nudge', delta: -step });

api.storage.local.get(DEFAULTS).then((s) => {
  step = Number(s.step);
  for (const k of ['watermark', 'hideAtNormal', 'shortcuts']) {
    $(k).checked = s[k];
    $(k).onchange = (e) => api.storage.local.set({ [k]: e.target.checked });
  }
  $('step').value = String(s.step);
  $('step').onchange = (e) => { step = Number(e.target.value); api.storage.local.set({ step }); };
});

send({ type: 'get' });
