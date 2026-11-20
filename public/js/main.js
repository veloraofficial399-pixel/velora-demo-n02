(function () {
  "use strict";

  var CONFIG = window.WEDDING_CONFIG || {};
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key));
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { return null; }
  }

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  // iOS can scroll a body with overflow:hidden; keep the envelope page still until it opens
  function blockScroll(e) { if (document.body.classList.contains("is-locked")) e.preventDefault(); }
  document.addEventListener("touchmove", blockScroll, { passive: false });
  document.addEventListener("wheel", blockScroll, { passive: false });

  /* =========================================================
     1. Envelope intro
     ========================================================= */
  var intro = $("#intro");
  var video = $("#introVideo");
  var openBtn = $("#introOpen");
  var backdrop = $("#introBackdrop");
  var bctx = backdrop.getContext("2d");
  var hero = $(".hero");
  var introDone = false;
  var INTRO_SPEED = 0.6; // envelope opens slowly and gracefully
  video.defaultPlaybackRate = INTRO_SPEED;

  backdrop.width = 36;
  backdrop.height = 64;

  function paintBackdrop(src) {
    try { bctx.drawImage(src, 0, 0, backdrop.width, backdrop.height); } catch (e) { /* not ready yet */ }
  }

  var poster = new Image();
  poster.onload = function () { if (!intro.classList.contains("is-playing")) paintBackdrop(poster); };
  poster.src = video.getAttribute("poster");

  function backdropLoop() {
    if (introDone) return;
    if (video.readyState >= 2) paintBackdrop(video);
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(backdropLoop);
    else requestAnimationFrame(backdropLoop);
  }

  /* Background music (audio/tp1.mp3) starts on the guest's first tap (browsers only allow
     sound after a gesture) and keeps playing; the button mutes and unmutes it. Volume runs
     through a Web Audio gain node because iOS ignores <audio>.volume. */
  var Music = (function () {
    var audio = $("#bgMusic");
    var btn = $("#musicToggle");
    var TARGET = 0.55, muted = false, started = false, ctx = null, gain = null, raf = 0;

    function setupGraph() {
      if (ctx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        gain = ctx.createGain();
        gain.gain.value = 0;
        ctx.createMediaElementSource(audio).connect(gain);
        gain.connect(ctx.destination);
      } catch (e) { ctx = null; gain = null; }
    }
    function level(v) { if (gain) gain.gain.value = v; else audio.volume = v; }
    function current() { return gain ? gain.gain.value : audio.volume; }
    function fadeTo(v, ms) {
      cancelAnimationFrame(raf);
      var from = current(), t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / ms);
        level(from + (v - from) * k);
        if (k < 1) raf = requestAnimationFrame(step);
      })(t0);
    }
    function sync() {
      btn.setAttribute("aria-pressed", String(muted));
      btn.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    }
    function start() {
      if (started) return;
      started = true;
      setupGraph();
      if (ctx && ctx.state === "suspended") ctx.resume();
      level(0);
      btn.hidden = false;
      sync();
      var p = audio.play();
      var go = function () { fadeTo(muted ? 0 : TARGET, 1500); };
      if (p && p.then) p.then(go).catch(function () {}); else go();
    }

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      muted = !muted;
      if (audio.paused) audio.play().catch(function () {});
      fadeTo(muted ? 0 : TARGET, muted ? 300 : 800);
      sync();
    });
    // quiet while the guest is in another tab or app
    document.addEventListener("visibilitychange", function () {
      if (!started) return;
      if (document.hidden) audio.pause();
      else audio.play().catch(function () {});
    });

    return { start: start };
  })();

  function finishIntro() {
    if (introDone) return;
    introDone = true;
    intro.classList.add("is-leaving");
    document.body.classList.remove("is-locked");
    hero.classList.add("is-revealed");
    Lanterns.start();
    Music.start(); // already playing if the guest tapped; this covers keyboard skips
    setTimeout(function () {
      intro.classList.add("is-gone");
      try { video.pause(); video.removeAttribute("src"); video.load(); } catch (e) {}
    }, 1700);
  }

  function openEnvelope() {
    if (intro.classList.contains("is-playing")) return;
    intro.classList.add("is-playing");
    video.muted = false;
    video.playbackRate = INTRO_SPEED;
    Music.start();
    var stall = setTimeout(finishIntro, 6000); // never strand a guest on a stalled video
    video.addEventListener("playing", function () { clearTimeout(stall); stall = setTimeout(finishIntro, 9000); }, { once: true });
    var p = video.play();
    if (p && p.catch) {
      p.catch(function () {
        video.muted = true;
        video.play().catch(finishIntro);
      });
    }
    backdropLoop();
  }

  // Begin the cross-fade just before the last frame so the envelope melts into the hero
  // The fade to the hero starts part-way through the flap lift, and the envelope is held at
  // FADE_HOLD (flap about two-thirds open) so it fades out at exactly that point.
  var FADE_START = 1.45, FADE_HOLD = 1.87; // seconds into welcome.mp4
  function watchFade() {
    if (introDone && video.paused) return;
    if (video.currentTime >= FADE_START) finishIntro();
    if (video.currentTime >= FADE_HOLD) { video.pause(); return; }
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(watchFade);
    else requestAnimationFrame(watchFade);
  }
  video.addEventListener("playing", watchFade, { once: true });
  video.addEventListener("ended", finishIntro);
  video.addEventListener("error", function () { if (intro.classList.contains("is-playing")) finishIntro(); });
  openBtn.addEventListener("click", openEnvelope);
  intro.addEventListener("click", openEnvelope);
  document.addEventListener("keydown", function (e) {
    if (introDone) return;
    if (e.key === "Escape") finishIntro();
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEnvelope(); }
  });

  /* =========================================================
     2. Hero — warm glow on the hanging bulbs
     ========================================================= */
  // Bulb centres (% of the artwork), detected from hero2.webp
  var BULBS = [[89.8,48.64],[19.52,49.59],[23.68,50.46],[86.87,50.49],[86.11,50.81],[82.71,51.3],[27.55,51.38],[79.37,51.68],[32.0,52.09],[75.44,52.2],[71.45,52.49],[36.17,52.58],[67.35,52.77],[60.61,52.87],[42.56,53.04],[56.92,53.17],[46.31,53.31],[53.58,53.36],[50.23,53.47],[3.46,54.69],[22.86,55.34],[33.88,56.53],[37.34,56.97],[40.91,57.29],[44.49,57.65],[48.36,57.92],[51.82,58.16],[54.98,58.3],[57.74,58.38],[60.38,58.49],[74.33,58.49],[64.13,58.57],[71.1,58.6],[67.64,58.65],[29.89,59.46],[33.59,60.03],[36.93,60.49],[40.45,60.98],[67.23,63.15],[70.22,63.37],[73.86,63.64],[77.08,63.8],[80.36,63.86],[84.11,63.99],[87.87,64.15],[91.74,64.26],[95.43,64.29]];
  var HAZE = [[24, 55], [50, 57], [76, 55], [55, 63], [84, 64]];

  (function buildGlows() {
    var wrap = $("#glows");
    var frag = document.createDocumentFragment();
    function rand(a, b) { return a + Math.random() * (b - a); }
    HAZE.forEach(function (p) {
      var g = document.createElement("i");
      g.className = "glow glow--haze";
      g.style.left = p[0] + "%"; g.style.top = p[1] + "%";
      g.style.setProperty("--delay", -rand(0, 9).toFixed(2) + "s");
      g.style.setProperty("--lo", ".6"); g.style.setProperty("--hi", "1");
      frag.appendChild(g);
    });
    BULBS.forEach(function (p) {
      var g = document.createElement("i");
      g.className = "glow";
      g.style.left = p[0] + "%"; g.style.top = p[1] + "%";
      g.style.setProperty("--d", rand(2.6, 6.5).toFixed(2) + "s");
      g.style.setProperty("--delay", -rand(0, 6).toFixed(2) + "s");
      g.style.setProperty("--lo", rand(.4, .65).toFixed(2));
      g.style.setProperty("--hi", rand(.85, 1).toFixed(2));
      frag.appendChild(g);
    });
    wrap.appendChild(frag);
  })();

  /* =========================================================
     2. Hero — floating sky lanterns (drawn between the sky and the garden)
     ========================================================= */
  var Lanterns = (function () {
    var canvas = $("#lanterns");
    var ctx = canvas.getContext("2d");
    var sprite = new Image();
    var glow = document.createElement("canvas");
    var front = $("#heroFront");
    var W = 0, H = 0, dpr = 1;
    var stageX = 0, stageW = 0; // the artwork's horizontal extent within the canvas
    var items = [];
    var running = false, visible = true, started = false, last = 0;

    sprite.src = "image/lantern-sprite.webp";

    (function makeGlow() {
      glow.width = glow.height = 128;
      var g = glow.getContext("2d");
      var grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, "rgba(255,200,120,0.55)");
      grd.addColorStop(0.35, "rgba(255,160,80,0.18)");
      grd.addColorStop(1, "rgba(255,140,60,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    })();

    function rand(a, b) { return a + Math.random() * (b - a); }

    function spawn(l, initial) {
      // depth: 0 = far away, 1 = close. Skewed so most lanterns are distant.
      var z = Math.pow(Math.random(), 1.6);
      l.z = z;
      l.size = (0.045 + z * 0.075) * stageW;       // sprite height relative to the art width
      // lanterns stay over the artwork, rising from behind the garden
      l.x = stageX + rand(0.08, 0.92) * stageW;
      l.y = initial ? rand(0.12, 1.05) * H : H * rand(0.62, 0.78) + l.size;
      l.vy = (0.012 + z * 0.026) * H;              // px per second
      l.drift = rand(-0.006, 0.01) * stageW;       // gentle breeze, slightly to the right
      l.swayA = (0.004 + z * 0.01) * stageW;
      l.swayF = rand(0.12, 0.3);
      l.phase = rand(0, Math.PI * 2);
      l.tilt = rand(-0.22, 0.18);
      l.flip = Math.random() < 0.5 ? -1 : 1;
      l.alpha = 0.5 + z * 0.45;
      l.flick = rand(0, 100);
      l.age = initial ? 99 : 0;
      return l;
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var nw = Math.round(r.width), nh = Math.round(r.height);
      if (!nw || !nh) return;
      var sx = W ? nw / W : 1, sy = H ? nh / H : 1;
      canvas.width = nw * dpr; canvas.height = nh * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (W && items.length) items.forEach(function (l) { l.x *= sx; l.y *= sy; l.size *= sx; l.vy *= sy; l.swayA *= sx; l.drift *= sx; });
      W = nw; H = nh;
      var fr = front.getBoundingClientRect();
      stageX = Math.max(0, fr.left - r.left);
      stageW = Math.min(W, fr.width);
      var target = Math.round(Math.min(22, Math.max(12, stageW / 32)));
      while (items.length < target) items.push(spawn({}, true));
      if (items.length > target) items.length = target;
      items.sort(function (a, b) { return a.z - b.z; });
    }

    function draw(t, dt) {
      ctx.clearRect(0, 0, W, H);
      if (!sprite.complete || !sprite.naturalWidth) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(stageX, 0, stageW, H); ctx.clip(); // never over the empty sides
      var ratio = sprite.naturalWidth / sprite.naturalHeight;
      var respawned = false;
      for (var i = 0; i < items.length; i++) {
        var l = items[i];
        l.age += dt;
        l.y -= l.vy * dt;
        l.x += l.drift * dt;
        var progress = 1 - l.y / H;                 // 0 at bottom → 1 at top
        var scale = 1 - Math.max(0, progress) * 0.35; // recede as they climb
        var h = l.size * scale, w = h * ratio;
        if (l.y < -h || l.x < stageX - w || l.x > stageX + stageW + w) { spawn(l, false); respawned = true; continue; }

        var sway = Math.sin(t * l.swayF + l.phase);
        var x = l.x + sway * l.swayA;
        var fadeTop = Math.min(1, Math.max(0, (l.y + h) / (H * 0.22)));
        var fadeIn = Math.min(1, l.age / 2.5);
        var flick = 0.86 + 0.08 * Math.sin(t * 7.3 + l.flick) + 0.06 * Math.sin(t * 13.1 + l.flick * 1.7);
        var a = l.alpha * fadeTop * fadeIn;
        if (a <= 0.01) continue;

        // halo
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = a * flick * (0.55 + l.z * 0.45);
        var gs = h * 2.6;
        ctx.drawImage(glow, x - gs / 2, l.y - gs / 2 + h * 0.12, gs, gs);

        // lantern
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(x, l.y);
        ctx.rotate(l.tilt + sway * 0.05);
        ctx.scale(l.flip, 1);
        ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      if (respawned) items.sort(function (a, b) { return a.z - b.z; });
    }

    function frame(now) {
      if (!running) return;
      var t = now / 1000;
      var dt = last ? Math.min(0.05, t - last) : 0.016;
      last = t;
      draw(t, dt);
      requestAnimationFrame(frame);
    }

    function play() {
      if (running || !started || !visible || document.hidden) return;
      running = true; last = 0;
      requestAnimationFrame(frame);
    }
    function pause() { running = false; }

    function start() {
      if (started) return;
      started = true;
      resize();
      if (reduceMotion) {
        var once = function () { draw(performance.now() / 1000, 0); };
        if (sprite.complete) once(); else sprite.onload = once;
        return;
      }
      play();
    }

    window.addEventListener("resize", function () { if (started) { resize(); if (reduceMotion) draw(0, 0); } });
    document.addEventListener("visibilitychange", function () { document.hidden ? pause() : play(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (reduceMotion) return;
        visible ? play() : pause();
      }).observe(canvas);
    }

    return { start: start };
  })();

  /* =========================================================
     Reveal on scroll
     ========================================================= */
  (function () {
    var els = $$(".reveal");
    if (!("IntersectionObserver" in window) || reduceMotion) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* =========================================================
     4. Countdown — 13 Feb 2027, 7:00 PM IST
     ========================================================= */
  (function () {
    var target = new Date(CONFIG.eventStart || "2027-02-13T19:00:00+05:30").getTime();
    var nums = {};
    $$(".countdown__num").forEach(function (el) { nums[el.dataset.unit] = el; });
    var done = $(".countdown__done");
    var grid = $(".countdown__grid");
    var pad = function (n, len) { n = String(n); while (n.length < len) n = "0" + n; return n; };
    function set(el, v) { if (el.textContent !== v) el.textContent = v; }
    function tick() {
      var diff = Math.max(0, target - Date.now());
      var s = Math.floor(diff / 1000);
      set(nums.days, pad(Math.floor(s / 86400), 2));
      set(nums.hours, pad(Math.floor((s % 86400) / 3600), 2));
      set(nums.minutes, pad(Math.floor((s % 3600) / 60), 2));
      set(nums.seconds, pad(s % 60, 2));
      if (diff === 0) { done.hidden = false; grid.setAttribute("aria-hidden", "true"); return false; }
      return true;
    }
    if (tick()) {
      var id = setInterval(function () { if (!tick()) clearInterval(id); }, 1000);
    }
  })();

  /* =========================================================
     Supabase (REST) helpers — tables defined in supabase/schema.sql
     ========================================================= */
  var SB = CONFIG.supabase || {};
  var sbUrl = (SB.url || "").trim().replace(/\/+$/, "");
  var sbKey = (SB.anonKey || "").trim();
  var remote = !!(sbUrl && sbKey);

  function sbHeaders(extra) {
    var h = { apikey: sbKey, Authorization: "Bearer " + sbKey };
    for (var k in extra) h[k] = extra[k];
    return h;
  }

  function sbInsert(table, row) {
    return fetch(sbUrl + "/rest/v1/" + table, {
      method: "POST",
      headers: sbHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(row)
    }).then(function (r) {
      if (!r.ok) throw new Error("Supabase " + r.status);
    });
  }

  function sbSelect(table, query) {
    return fetch(sbUrl + "/rest/v1/" + table + "?" + query, { headers: sbHeaders({}) })
      .then(function (r) {
        if (!r.ok) throw new Error("Supabase " + r.status);
        return r.json();
      });
  }

  function setError(field, msg) {
    var wrap = field.closest(".field");
    wrap.classList.toggle("has-error", !!msg);
    $(".field__error", wrap).textContent = msg || "";
  }

  function busy(form, on, label) {
    var btn = $("button[type=submit]", form);
    btn.disabled = on;
    var l = $(".btn__label", btn);
    if (!btn.dataset.label) btn.dataset.label = l.textContent;
    l.textContent = on ? label : btn.dataset.label;
  }

  /* =========================================================
     6. RSVP
     ========================================================= */
  (function () {
    var form = $("#rsvpForm");
    var thanks = $("#rsvpThanks");
    var status = $(".form__status", form);

    function attending() { var c = $("input[name=attending]:checked", form); return c ? c.value : ""; }

    $$("input[name=attending]", form).forEach(function (r) {
      r.addEventListener("change", function () { setError(r, ""); });
    });

    $("#rsvpName").addEventListener("input", function (e) { setError(e.target, ""); });

    function showThanks(data, savedRemotely) {
      var yes = data.attending === "yes";
      var first = data.name.split(/\s+/)[0];
      $(".rsvp__thanks-title", thanks).textContent = yes ? "Thank you, " + first + "!" : "We'll miss you, " + first;
      $(".rsvp__thanks-text", thanks).textContent = yes
        ? "Your RSVP is confirmed. We can't wait to celebrate with you on 13 February 2027."
        : "Thank you for letting us know. You'll be in our hearts on our special evening.";
      if (!savedRemotely && CONFIG.whatsapp) {
        $(".rsvp__thanks-text", thanks).textContent += " Please tap below to send your reply to the family.";
      }

      var wa = $(".rsvp__wa", thanks);
      if (wa) wa.remove();
      if (!savedRemotely && CONFIG.whatsapp) {
        var msg = "RSVP – Varun & Devika's Reception (13 Feb 2027)\nName: " + data.name +
          "\nAttending: " + (yes ? "Yes" : "No");
        wa = document.createElement("a");
        wa.className = "btn btn--gold rsvp__wa";
        wa.href = "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(msg);
        wa.target = "_blank"; wa.rel = "noopener";
        wa.textContent = "Send to the family on WhatsApp";
        wa.style.marginBottom = "14px";
        $(".rsvp__thanks-text", thanks).after(wa);
      }

      form.hidden = true;
      thanks.hidden = false;
      thanks.focus({ preventScroll: true });
    }

    $("#rsvpEdit").addEventListener("click", function () {
      thanks.hidden = true;
      form.hidden = false;
      status.textContent = "";
      $("#rsvpName").focus();
    });

    // Returning guest on the same device
    var saved = store("vd-rsvp");
    if (saved && saved.name) {
      $("#rsvpName").value = saved.name;
      var r = $("input[name=attending][value=" + saved.attending + "]", form);
      if (r) r.checked = true;
      showThanks(saved, !!saved.remote);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = ""; status.classList.remove("is-error");

      var name = $("#rsvpName").value.trim().replace(/\s+/g, " ");
      var att = attending();
      var ok = true;

      if (name.length < 2) { setError($("#rsvpName"), "Please enter your name."); ok = false; } else setError($("#rsvpName"), "");
      if (!att) { setError($("input[name=attending]", form), "Please let us know if you can attend."); ok = false; }
      if (!ok) { var bad = $(".has-error input, .has-error textarea", form); if (bad) bad.focus(); return; }

      var data = {
        name: name,
        attending: att,
        submittedAt: new Date().toISOString()
      };

      function done(remote) {
        data.remote = remote;
        store("vd-rsvp", data);
        busy(form, false);
        showThanks(data, remote);
      }

      if (!remote) { done(false); return; }

      busy(form, true, "Sending…");
      sbInsert(SB.rsvpTable || "rsvps", {
        name: data.name,
        attending: att === "yes"
      }).then(function () { done(true); }).catch(function () {
        busy(form, false);
        status.classList.add("is-error");
        status.textContent = "We couldn't send your RSVP just now. Please check your connection and try again.";
      });
    });
  })();

  /* =========================================================
     8. Map — load the embed only when it is about to be seen
     ========================================================= */
  (function () {
    var box = $("#venueMap");
    var loaded = false;
    function load() {
      if (loaded) return;
      loaded = true;
      var f = document.createElement("iframe");
      f.title = "Map showing Hotel Sea Pearl, Candolim Beach, North Goa";
      f.loading = "lazy";
      f.referrerPolicy = "no-referrer-when-downgrade";
      f.allowFullscreen = true;
      f.src = "https://maps.google.com/maps?q=" + encodeURIComponent("Hotel Sea Pearl, Candolim Beach, North Goa, Goa 403515") + "&z=15&output=embed";
      f.addEventListener("load", function () { var b = $("#mapLoad"); if (b) b.remove(); });
      box.appendChild(f);
    }
    $("#mapLoad").addEventListener("click", load);
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { load(); io.disconnect(); } }, { rootMargin: "400px 0px" });
      io.observe(box);
    } else load();
  })();

  /* =========================================================
     5. Reception details — the string-light bulbs twinkle
     ========================================================= */
  (function () {
    var box = $("#bulbs");
    if (!box) return;
    // bulb centres (% of each image), detected from string-lights*.webp
    var NARROW = [[3.0, 71.88], [8.83, 78.06], [8.98, 51.18], [15.46, 60.8], [17.94, 76.99], [23.14, 86.53], [23.25, 55.32], [30.66, 60.85], [32.49, 81.78], [37.38, 51.45], [38.51, 92.39], [43.3, 58.39], [46.28, 88.63], [49.07, 49.72], [53.34, 95.45], [55.38, 51.24], [60.22, 87.6], [60.44, 43.83], [65.74, 95.51], [67.76, 45.17], [71.65, 88.15], [73.95, 35.28], [77.77, 90.82], [80.77, 32.65], [82.93, 84.61], [87.16, 22.25], [90.04, 87.36], [94.61, 12.4], [96.4, 78.85]];
    var WIDE = [[3.01, 21.74], [8.83, 39.15], [17.94, 36.15], [23.15, 62.89], [32.49, 49.64], [38.52, 79.53], [46.28, 68.94], [53.34, 88.0], [60.22, 66.05], [65.75, 88.17], [71.65, 67.6], [77.77, 75.13], [82.93, 57.61], [90.05, 65.38], [96.4, 41.39]];
    var wide = window.matchMedia("(min-width: 761px)");
    function rand(a, b) { return a + Math.random() * (b - a); }
    function build() {
      box.textContent = "";
      var frag = document.createDocumentFragment();
      (wide.matches ? WIDE : NARROW).forEach(function (p) {
        var g = document.createElement("i");
        g.className = "bulb";
        g.style.left = p[0] + "%";
        g.style.top = p[1] + "%";
        g.style.setProperty("--d", rand(1.6, 3.8).toFixed(2) + "s");
        g.style.setProperty("--delay", (-rand(0, 4)).toFixed(2) + "s");
        frag.appendChild(g);
      });
      box.appendChild(frag);
    }
    build();
    if (wide.addEventListener) wide.addEventListener("change", build);
  })();

  /* =========================================================
     5. Reception details — birds cross one by one on arrival
     ========================================================= */
  (function () {
    var lane = $("#birdsLane");
    var section = $("#details");
    if (!lane || !section || reduceMotion || !("IntersectionObserver" in window)) return;
    var COUNT = 7; // individual birds cut from the uploaded flock (image/birds/bird-N.webp)
    var inView = false, flying = 0;
    function rand(a, b) { return a + Math.random() * (b - a); }
    function launch() {
      var narrow = window.innerWidth < 761;
      var order = [];
      for (var n = 1; n <= COUNT; n++) order.push(n);
      order.sort(function () { return Math.random() - 0.5; });
      var delay = 0;
      order.forEach(function (n) {
        var b = document.createElement("div");
        b.className = "bird";
        var w = narrow ? rand(16, 28) : rand(22, 40);
        b.style.setProperty("--w", w.toFixed(0) + "px");
        b.style.setProperty("--y", (narrow ? rand(-4, 22) : rand(-6, 40)).toFixed(0) + "px");
        b.style.setProperty("--dur", rand(narrow ? 6 : 8, narrow ? 9 : 12).toFixed(1) + "s");
        b.style.setProperty("--delay", delay.toFixed(2) + "s");
        b.style.setProperty("--rise", rand(-40, 10).toFixed(0) + "px");
        var img = document.createElement("img");
        img.src = "image/birds/bird-" + n + ".webp";
        img.alt = "";
        img.style.setProperty("--bob", rand(0.9, 1.8).toFixed(2) + "s");
        b.appendChild(img);
        b.addEventListener("animationend", function (e) {
          if (e.target !== b) return;
          b.remove();
          flying--;
        });
        lane.appendChild(b);
        flying++;
        delay += rand(0.4, 1.6); // staggered take-off
      });
    }
    new IntersectionObserver(function (entries) {
      var now = entries[0].isIntersecting;
      if (now && !inView && flying === 0) launch(); // each arrival, once the last flight has finished
      inView = now;
    }, { threshold: 0.2 }).observe(section);
  })();

  /* =========================================================
     6. RSVP — petals and leaves drifting down from the garland
     ========================================================= */
  (function () {
    var box = $("#leaves");
    if (!box || reduceMotion) return;
    var SPRITES = [1, 2, 3, 4, 5].map(function (n) { return "image/leaves/leaf-" + n + ".webp"; });
    var count = window.innerWidth < 600 ? 9 : 14;
    function rand(a, b) { return a + Math.random() * (b - a); }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var leaf = document.createElement("i");
      leaf.className = "leaf";
      var dur = rand(14, 26);
      var tilt = rand(-40, 40);
      leaf.style.setProperty("--x", rand(4, 94).toFixed(1) + "%");
      leaf.style.setProperty("--dur", dur.toFixed(1) + "s");
      leaf.style.setProperty("--delay", (-rand(0, dur)).toFixed(1) + "s");
      leaf.style.setProperty("--drift", rand(-60, 90).toFixed(0) + "px");
      var img = document.createElement("img");
      img.src = SPRITES[i % SPRITES.length];
      img.alt = "";
      img.decoding = "async";
      img.style.setProperty("--size", rand(14, 30).toFixed(0) + "px");
      img.style.setProperty("--o", rand(0.55, 0.95).toFixed(2));
      img.style.setProperty("--sway", rand(2.6, 4.8).toFixed(1) + "s");
      img.style.setProperty("--amp", rand(10, 26).toFixed(0) + "px");
      img.style.setProperty("--r0", (tilt - rand(25, 60)).toFixed(0) + "deg");
      img.style.setProperty("--r1", (tilt + rand(25, 60)).toFixed(0) + "deg");
      leaf.appendChild(img);
      frag.appendChild(leaf);
    }
    box.appendChild(frag);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        box.classList.toggle("is-paused", !en[0].isIntersecting);
      }).observe(box);
    }
  })();

  /* =========================================================
     9. Wishes
     ========================================================= */
  (function () {
    var form = $("#wishForm");
    var list = $("#wishList");
    var empty = $("#wishEmpty");
    var msg = $("#wishMsg");
    var nameEl = $("#wishName");
    var status = $(".form__status", form);
    var PAGE = 9;
    var all = [];
    var shown = PAGE;

    msg.addEventListener("input", function () { $("#wishCount").textContent = msg.value.length; setError(msg, ""); });
    nameEl.addEventListener("input", function () { setError(nameEl, ""); });

    function fmtDate(iso) {
      var d = new Date(iso);
      if (isNaN(d)) return "";
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }

    function card(w) {
      var el = document.createElement("article");
      el.className = "wish";
      var p = document.createElement("p"); p.className = "wish__msg"; p.textContent = w.message;
      var meta = document.createElement("div"); meta.className = "wish__meta";
      var n = document.createElement("span"); n.className = "wish__name"; n.textContent = w.name;
      var d = document.createElement("time"); d.className = "wish__date"; d.dateTime = w.createdAt || ""; d.textContent = fmtDate(w.createdAt);
      meta.appendChild(n); meta.appendChild(d);
      el.appendChild(p); el.appendChild(meta);
      return el;
    }

    function render() {
      list.textContent = "";
      all.slice(0, shown).forEach(function (w) { list.appendChild(card(w)); });
      empty.hidden = all.length > 0;
      var more = $(".wishes__more");
      if (more) more.remove();
      if (all.length > shown) {
        more = document.createElement("button");
        more.type = "button";
        more.className = "link-btn wishes__more";
        more.style.color = "var(--gold-deep)";
        more.textContent = "Read more wishes (" + (all.length - shown) + ")";
        more.addEventListener("click", function () { shown += PAGE; render(); });
        list.after(more);
      }
    }

    function sortNewest(arr) {
      return arr.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    }

    function load() {
      var local = store("vd-wishes") || [];
      if (!remote) { all = sortNewest(local); render(); return; }
      empty.textContent = "Gathering wishes…";
      sbSelect(SB.wishesTable || "wishes", "select=name,message,created_at&order=created_at.desc&limit=300")
        .then(function (rows) {
          all = (rows || []).map(function (r) { return { name: r.name, message: r.message, createdAt: r.created_at }; });
          empty.textContent = "Be the first to send your blessings.";
          render();
        })
        .catch(function () {
          empty.textContent = "Wishes couldn't be loaded right now — please refresh in a moment.";
          all = []; render();
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.textContent = ""; status.classList.remove("is-error");
      var name = nameEl.value.trim().replace(/\s+/g, " ");
      var message = msg.value.trim();
      var ok = true;
      if (name.length < 2) { setError(nameEl, "Please enter your name."); ok = false; }
      if (message.length < 2) { setError(msg, "Please write a few words for the couple."); ok = false; }
      if (!ok) { $(".has-error input, .has-error textarea", form).focus(); return; }

      var wish = { name: name, message: message, createdAt: new Date().toISOString() };

      function added() {
        busy(form, false);
        all.unshift(wish);
        shown = Math.max(shown, PAGE);
        render();
        form.reset();
        $("#wishCount").textContent = "0";
        status.textContent = "Thank you! Your wish has been added with love.";
        list.firstElementChild && list.firstElementChild.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      }

      if (!remote) {
        var local = store("vd-wishes") || [];
        local.push(wish);
        store("vd-wishes", local);
        added();
        return;
      }

      busy(form, true, "Sending…");
      sbInsert(SB.wishesTable || "wishes", { name: name, message: message }).then(added).catch(function () {
        busy(form, false);
        status.classList.add("is-error");
        status.textContent = "We couldn't send your wish just now. Please try again in a moment.";
      });
    });

    load();
  })();
})();
