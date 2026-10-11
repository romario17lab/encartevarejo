// Relógio e animação da cena de vídeo, executados DENTRO da página (navegador).
// Escrito como texto JavaScript (sem transpilação) para ser o mesmo na prévia do editor (Next) e na
// geração do MP4 (worker). O tempo NUNCA vem do relógio real na geração: o worker chama
// window.__EV_VIDEO.seek(t) para cada quadro, o que torna cada quadro reproduzível.
// Na prévia (data.preview = true) um laço com requestAnimationFrame avança o tempo para tocar.

/** Núcleo: curvas de suavização e interpolação de quadros-chave (também usado nos testes, em Node). */
export const RUNTIME_CORE = String.raw`
function evEase(name, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  switch (name) {
    case "linear": return x;
    case "in": return x * x * x;
    case "out": return 1 - Math.pow(1 - x, 3);
    case "back": { var c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
    case "step": return 0;
    default: return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; /* inout */
  }
}
var EV_DEF = { x: 0, y: 0, s: 1, r: 0, o: 1, c: null };
function evPropAt(kf, i, p) {
  for (var j = i; j >= 0; j--) if (kf[j][p] !== undefined) return kf[j][p];
  return EV_DEF[p];
}
/** Valores de uma trilha no instante t: { x, y, s, r, o, c, active }. */
function evSample(kf, t) {
  var out = { active: !(t < kf[0].t || t > kf[kf.length - 1].t) };
  var props = ["x", "y", "s", "r", "o", "c"];
  var i = 0;
  while (i < kf.length - 1 && kf[i + 1].t <= t) i++;
  for (var k = 0; k < props.length; k++) {
    var p = props[k];
    var a = evPropAt(kf, i, p);
    if (i >= kf.length - 1 || t <= kf[0].t) { out[p] = t <= kf[0].t ? evPropAt(kf, 0, p) : a; continue; }
    var nk = kf[i + 1];
    var b = nk[p] !== undefined ? nk[p] : a;
    var span = nk.t - kf[i].t;
    var e = span > 0 ? evEase(nk.e || "inout", (t - kf[i].t) / span) : 1;
    if (p === "c") {
      if (!a && !b) { out.c = null; continue; }
      var A = a || [0, 0, 0, 0], B = b || [0, 0, 0, 0];
      out.c = [A[0] + (B[0] - A[0]) * e, A[1] + (B[1] - A[1]) * e, A[2] + (B[2] - A[2]) * e, A[3] + (B[3] - A[3]) * e];
    } else out[p] = a + (b - a) * e;
  }
  return out;
}
`;

/** Página: aplica as trilhas, avisa quando fontes/imagens carregaram e (prévia) toca em tempo real. */
export const RUNTIME_JS = RUNTIME_CORE + String.raw`
(function () {
function evInit() {
  var dataEl = document.getElementById("ev-video-data");
  if (!dataEl) return;
  var data = JSON.parse(dataEl.textContent || "{}");
  var stage = document.querySelector("[data-v-stage]");
  var tracks = (data.tracks || []).map(function (tr) {
    var els = [];
    try { els = Array.prototype.slice.call(document.querySelectorAll(tr.sel)); } catch (e) { els = []; }
    return { tr: tr, els: els };
  });
  var r2 = function (n) { return Math.round(n * 100) / 100; };
  var current = 0;
  function apply(t) {
    current = Math.max(0, Math.min(data.duration, t));
    for (var i = 0; i < tracks.length; i++) {
      var T = tracks[i];
      if (!T.els.length) continue;
      var v = evSample(T.tr.kf, current);
      var hidden = (T.tr.hide && !v.active) || v.o <= 0.001;
      for (var j = 0; j < T.els.length; j++) {
        var st = T.els[j].style;
        st.visibility = hidden ? "hidden" : "";
        if (hidden) continue;
        st.translate = (v.x || v.y) ? r2(v.x) + "px " + r2(v.y) + "px" : "";
        st.scale = v.s !== 1 ? String(Math.round(v.s * 10000) / 10000) : "";
        st.rotate = v.r ? r2(v.r) + "deg" : "";
        st.opacity = v.o < 1 ? String(Math.round(v.o * 1000) / 1000) : "";
        st.clipPath = v.c ? "inset(" + r2(v.c[0]) + "% " + r2(v.c[1]) + "% " + r2(v.c[2]) + "% " + r2(v.c[3]) + "%)" : (T.tr.clip ? "" : st.clipPath);
      }
    }
    return current;
  }

  function waitImages() {
    var imgs = Array.prototype.slice.call(document.querySelectorAll("[data-v-stage] img"));
    var errors = [];
    return Promise.all(imgs.map(function (img) {
      return new Promise(function (res) {
        var done = function () { if (!img.naturalWidth) errors.push(img.currentSrc || img.src); res(); };
        if (img.complete) done(); else { img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); }
      }).then(function () { return img.decode ? img.decode().catch(function () {}) : null; });
    })).then(function () { return errors; });
  }

  window.__EV_VIDEO = {
    duration: data.duration, fps: data.fps, width: data.width, height: data.height,
    seek: apply,
    time: function () { return current; },
  };
  apply(0);

  var ready = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(waitImages).then(function (errors) {
    window.__EV_IMG_ERRORS = errors;
    return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });
  }).then(function () {
    window.__EV_READY = true;
    document.documentElement.setAttribute("data-ev-ready", "1");
  });

  if (!data.preview) return;

  // ---------- prévia: ajusta ao tamanho da janela e toca em tempo real ----------
  var fit = function () {
    var k = Math.min(window.innerWidth / data.width, window.innerHeight / data.height);
    stage.style.transformOrigin = "0 0";
    stage.style.transform = "translate(" + Math.max(0, (window.innerWidth - data.width * k) / 2) + "px," + Math.max(0, (window.innerHeight - data.height * k) / 2) + "px) scale(" + k + ")";
  };
  fit();
  window.addEventListener("resize", fit);
  var playing = false, base = 0, from = 0, lastPost = 0;
  var post = function (force) {
    var now = performance.now();
    if (!force && now - lastPost < 120) return;
    lastPost = now;
    try { window.parent.postMessage({ type: "ev-video-state", t: current, playing: playing, duration: data.duration }, "*"); } catch (e) {}
  };
  var loop = function (now) {
    if (!playing) return;
    var t = from + (now - base) / 1000;
    if (t >= data.duration) { if (data.loop === false) { apply(data.duration); playing = false; post(true); return; } from = 0; base = now; t = 0; }
    apply(t); post(false);
    requestAnimationFrame(loop);
  };
  var play = function () { if (playing) return; playing = true; from = current >= data.duration ? 0 : current; base = performance.now(); requestAnimationFrame(loop); post(true); };
  var pause = function () { playing = false; post(true); };
  window.addEventListener("message", function (ev) {
    var m = ev.data;
    if (!m || m.type !== "ev-video") return;
    if (m.action === "play") play();
    else if (m.action === "pause") pause();
    else if (m.action === "seek") { from = Number(m.t) || 0; base = performance.now(); apply(from); post(true); }
    else if (m.action === "state") post(true);
  });
  ready.then(function () { post(true); if (data.autoplay !== false) play(); });
}
  // prévia dentro do Next: espera a hidratação do React terminar antes de mexer nos estilos
  var pre = document.getElementById("ev-video-data");
  var isPreview = false;
  try { isPreview = !!JSON.parse(pre ? pre.textContent || "{}" : "{}").preview; } catch (e) {}
  if (!isPreview) { evInit(); return; }
  var later = function () { setTimeout(evInit, 350); };
  if (document.readyState === "complete") later(); else window.addEventListener("load", later, { once: true });
})();
`;
