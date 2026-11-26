// nxorg Video Speed: content script.
// Draws a small speed label at the top-left of each playing <video>.
// Built to stay light on CPU: it is event-driven, with one 1s position check that runs only while a video plays.
(() => {
  if (window.__videoSpeedWatermark) return;
  window.__videoSpeedWatermark = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const MIN = 0.1, MAX = 16;
  const cfg = { watermark: true, hideAtNormal: false, shortcuts: true, step: 0.25, remember: true, rate: 1 };

  const marks = new Map(); // video -> { host, label, flashUntil }
  const loadedAt = new WeakMap(); // video -> when it last started loading or playing
  const RESET_WINDOW_MS = 3000;
  let lastVideo = null;
  let rafId = 0;
  let tickId = 0;

  api.storage.local.get(cfg).then((s) => { Object.assign(cfg, s); applyAll(); schedule(); });
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    for (const k in ch) if (k in cfg) cfg[k] = ch[k].newValue;
    // Speed changed in another tab or the popup: follow it here too.
    if ('rate' in ch || 'remember' in ch) applyAll();
    schedule();
  });

  // ---------- watermark ----------
  const ro = new ResizeObserver(() => schedule());

  function getMark(video) {
    let m = marks.get(video);
    if (m) return m;
    const host = document.createElement('div');
    host.style.cssText =
      'all:initial;position:fixed;top:0;left:0;z-index:2147483647;pointer-events:none;display:none;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      'span{display:inline-block;font:600 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'color:#fff;background:rgba(0,0,0,.45);padding:4px 7px;border-radius:4px;' +
      'text-shadow:0 1px 1px rgba(0,0,0,.6);user-select:none;white-space:nowrap}';
    const label = document.createElement('span');
    root.append(style, label);
    m = { host, label, flashUntil: 0, volUntil: 0 };
    marks.set(video, m);
    ro.observe(video);
    return m;
  }

  function fmt(rate) {
    return `${+rate.toFixed(2)}×`;
  }

  function fmtVol(v) {
    return v.muted || v.volume === 0 ? '🔇 muted' : `🔊 ${Math.round(v.volume * 100)}%`;
  }

  function hostParent(video) {
    const fs = document.fullscreenElement;
    // A fullscreen container (YouTube, Netflix…) can hold our label; a bare fullscreen <video> cannot.
    if (fs && fs !== video && fs.contains(video)) return fs;
    return document.body || document.documentElement;
  }

  function update(video, m, now) {
    if (!video.isConnected) {
      m.host.remove();
      ro.unobserve(video);
      marks.delete(video);
      return false;
    }
    const playing = !video.paused && !video.ended;
    const rate = video.playbackRate;
    const wanted =
      cfg.watermark &&
      (playing || now < m.flashUntil) &&
      !(cfg.hideAtNormal && rate === 1 && now >= m.flashUntil);

    const r = wanted ? video.getBoundingClientRect() : null;
    const visible =
      r && r.width >= 80 && r.height >= 50 &&
      r.bottom > 30 && r.right > 40 && r.top < innerHeight && r.left < innerWidth;

    if (!visible) {
      m.host.style.display = 'none';
      return playing;
    }
    const parent = hostParent(video);
    if (m.host.parentNode !== parent) parent.appendChild(m.host);
    // After a volume change, show the volume next to the speed for a moment.
    const text = now < m.volUntil ? `${fmt(rate)} · ${fmtVol(video)}` : fmt(rate);
    if (m.label.textContent !== text) m.label.textContent = text;
    const x = Math.max(r.left, 0) + 10;
    const y = Math.max(r.top, 0) + 10;
    m.host.style.transform = `translate(${x}px,${y}px)`;
    m.host.style.display = 'block';
    return playing;
  }

  function updateAll() {
    rafId = 0;
    const now = Date.now();
    let anyPlaying = false;
    let anyFlash = false;
    for (const [video, m] of marks) {
      if (update(video, m, now)) anyPlaying = true;
      if (m.flashUntil > now) anyFlash = true;
    }
    // Catch layout shifts that fire no event (theater mode, ads); runs only while a video plays.
    if ((anyPlaying || anyFlash) && !tickId) {
      tickId = setInterval(schedule, 1000);
    } else if (!anyPlaying && !anyFlash && tickId) {
      clearInterval(tickId);
      tickId = 0;
    }
  }

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(updateAll);
  }

  function track(video, flash, vol) {
    const m = getMark(video);
    if (flash) m.flashUntil = Date.now() + 1500;
    if (vol) m.volUntil = m.flashUntil = Date.now() + 1500;
    schedule();
  }

  // Media events don't bubble, but they do reach document listeners registered for the capture phase.
  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied', 'loadedmetadata']) {
    document.addEventListener(type, (e) => {
      if (e.target instanceof HTMLVideoElement) {
        const v = e.target;
        if (type === 'play' || type === 'playing') lastVideo = v;
        // Only a new source counts as "just loaded"; a plain play/unpause must not undo a speed the person picks.
        if (type === 'emptied' || type === 'loadedmetadata') loadedAt.set(v, Date.now());
        if (type !== 'pause' && type !== 'ended') applyRemembered(v);
        track(v, false);
      }
    }, true);
  }
  document.addEventListener('loadstart', (e) => {
    if (e.target instanceof HTMLVideoElement) loadedAt.set(e.target, Date.now());
  }, true);
  document.addEventListener('ratechange', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement)) return;
    if (cfg.remember && Math.abs(v.playbackRate - cfg.rate) > 0.001) {
      if (Date.now() - (loadedAt.get(v) || 0) < RESET_WINDOW_MS) {
        // The site reset the speed while loading the next video (YouTube does this): put it back.
        applyRemembered(v);
      } else if (v.playbackRate > 0) {
        // The person changed it with the site's own menu: remember that choice instead.
        saveRate(v.playbackRate);
      }
    }
    track(v, true);
  }, true);
  document.addEventListener('volumechange', (e) => {
    if (e.target instanceof HTMLVideoElement) track(e.target, false, true);
  }, true);
  addEventListener('scroll', schedule, { capture: true, passive: true });
  addEventListener('resize', schedule, { passive: true });
  document.addEventListener('fullscreenchange', schedule);

  // Videos that were already playing before the script loaded.
  for (const v of document.querySelectorAll('video')) {
    if (!v.paused) { lastVideo = v; track(v, false); }
  }

  // ---------- remember speed ----------
  function applyRemembered(v) {
    if (!cfg.remember) return;
    const r = Number(cfg.rate) || 1;
    if (Math.abs(v.playbackRate - r) > 0.001) v.playbackRate = r;
  }

  function applyAll() {
    for (const v of document.querySelectorAll('video')) applyRemembered(v);
  }

  function saveRate(rate) {
    if (!cfg.remember || cfg.rate === rate) return;
    cfg.rate = rate;
    api.storage.local.set({ rate });
  }

  // ---------- speed control ----------
  function targetVideo() {
    if (lastVideo && lastVideo.isConnected) return lastVideo;
    let best = null, bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = v; bestArea = area; }
    }
    return best;
  }

  function setRate(video, rate) {
    rate = Math.min(MAX, Math.max(MIN, Math.round(rate * 100) / 100));
    saveRate(rate);
    video.playbackRate = rate;
    track(video, true);
    return rate;
  }

  // ---------- volume ----------
  const VOL_STEP = 0.1;
  function nudgeVolume(video, delta) {
    // Step from the real level even when muted, so unmuting a 50% video goes to 60%, not 10%.
    const vol = Math.min(1, Math.max(0, Math.round((video.volume + delta) * 100) / 100));
    if (delta > 0) video.muted = false; // turning it up should be heard, even on autoplay-muted videos
    video.volume = vol;
    if (vol === 0) video.muted = true;
    track(video, false, true);
    return vol;
  }

  function isTyping(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  addEventListener('keydown', (e) => {
    if (!cfg.shortcuts || e.ctrlKey || e.altKey || e.metaKey) return;
    if (!['[', ']', '\\', '9', '0'].includes(e.key)) return;
    if (isTyping(e.composedPath()[0])) return;
    const v = targetVideo();
    if (!v) return;
    const step = Number(cfg.step) || 0.25;
    if (e.key === ']') setRate(v, v.playbackRate + step);
    else if (e.key === '[') setRate(v, v.playbackRate - step);
    else if (e.key === '\\') setRate(v, 1);
    else if (e.key === '0') nudgeVolume(v, VOL_STEP);
    else nudgeVolume(v, -VOL_STEP);
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Popup → page messages. Only frames that have a video reply.
  api.runtime.onMessage.addListener((msg) => {
    const v = targetVideo();
    if (!v) return;
    if (msg && msg.type === 'set') setRate(v, msg.rate);
    else if (msg && msg.type === 'nudge') setRate(v, v.playbackRate + msg.delta);
    return Promise.resolve({ rate: v.playbackRate });
  });
})();
