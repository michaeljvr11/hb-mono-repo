/*
 * H&B Market — Radial mobile navigation
 * Drop-in: <script src="../shared/radial-nav.js" data-active="home"></script>
 * Renders a corner "semicircle" FAB that expands into concentric rings of
 * nav options. Mobile only (auto-hidden at >=768px). Desktop nav is untouched.
 * data-active = home | search | orders | profile | cart | wishlist
 */
(function () {
  var me = document.currentScript;
  var ACTIVE = (me && me.getAttribute('data-active')) || 'home';

  /* ---- inject styles once ---- */
  if (!document.getElementById('rnav-style')) {
    var css = document.createElement('style');
    css.id = 'rnav-style';
    css.textContent = [
      '.rnav{position:fixed;inset:0;z-index:60;pointer-events:none;}',
      '@media(min-width:768px){.rnav{display:none!important;}}',
      '.rnav-scrim{position:absolute;inset:0;background:rgba(12,16,9,.34);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .45s ease;pointer-events:none;}',
      '.rnav.open .rnav-scrim{opacity:1;pointer-events:auto;}',
      '.rnav-band{position:absolute;right:0;bottom:0;border-radius:50%;border:1.5px solid rgba(255,255,255,.55);background:radial-gradient(circle at center,rgba(1,83,0,0) 60%,rgba(1,83,0,.06) 100%);opacity:0;transform:translate(50%,50%) scale(.4);transition:transform .55s cubic-bezier(.22,1,.36,1),opacity .4s ease;}',
      '.rnav.open .rnav-band{transform:translate(50%,50%) scale(1);opacity:1;}',
      '.rnav-item{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#fff;color:#015300;box-shadow:0 8px 22px -6px rgba(1,40,0,.45),inset 0 0 0 1px rgba(1,83,0,.12);transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0;pointer-events:none;border:none;cursor:pointer;transition:transform .5s cubic-bezier(.34,1.56,.64,1),opacity .35s ease,background .2s,color .2s;}',
      '.rnav.open .rnav-item{transform:translate(0,0) scale(1);opacity:1;pointer-events:auto;}',
      '.rnav-item:active,.rnav-item.active{background:#015300;color:#fff;}',
      '.rnav-item .material-symbols-outlined{font-size:26px;}',
      '.rnav-label{position:absolute;transform:translate(-100%,-50%);white-space:nowrap;background:#1c1b1b;color:#fff;font-size:12px;font-weight:600;padding:5px 10px;border-radius:8px;opacity:0;transition:opacity .3s ease;pointer-events:none;}',
      ".rnav-label::after{content:'';position:absolute;right:-5px;top:50%;transform:translateY(-50%);border:5px solid transparent;border-left-color:#1c1b1b;}",
      '.rnav.open .rnav-label{opacity:1;}',
      '.rnav-fab{position:absolute;right:0;bottom:0;width:88px;height:88px;border:none;padding:0;border-top-left-radius:100%;background:radial-gradient(120% 120% at 100% 100%,#026e00 0%,#015300 70%);box-shadow:-6px -6px 22px -6px rgba(1,40,0,.5);pointer-events:auto;cursor:pointer;z-index:5;}',
      '.rnav-fab:active{filter:brightness(1.1);}',
      '.rnav-fab-ic{position:absolute;right:18px;bottom:18px;color:#fff;font-size:30px;transition:transform .45s cubic-bezier(.34,1.56,.64,1);}',
      '.rnav.open .rnav-fab-ic{transform:rotate(135deg);}',
      '.rnav-pulse{position:absolute;right:0;bottom:0;width:88px;height:88px;border-top-left-radius:100%;pointer-events:none;z-index:4;animation:rnavpulse 2.6s ease-out infinite;}',
      '.rnav.open .rnav-pulse{animation:none;opacity:0;}',
      '@keyframes rnavpulse{0%{box-shadow:-2px -2px 0 0 rgba(1,83,0,.4);}70%{box-shadow:-22px -22px 0 14px rgba(1,83,0,0);}100%{box-shadow:0 0 0 0 rgba(1,83,0,0);}}',
      '.rnav-toast{position:absolute;left:50%;bottom:120px;transform:translate(-50%,16px);background:#1c1b1b;color:#fff;font-size:13px;font-weight:600;padding:10px 18px;border-radius:999px;opacity:0;z-index:6;transition:opacity .3s,transform .3s;pointer-events:none;display:flex;align-items:center;gap:8px;}',
      '.rnav-toast.show{opacity:1;transform:translate(-50%,0);}',
      '@media(prefers-reduced-motion:reduce){.rnav-band,.rnav-item,.rnav-fab-ic{transition:opacity .2s ease!important;}.rnav-pulse{animation:none;}}'
    ].join('');
    document.head.appendChild(css);
  }

  /* ---- build root ---- */
  var root = document.createElement('div');
  root.className = 'rnav';
  root.setAttribute('data-active', ACTIVE);
  root.innerHTML =
    '<div class="rnav-scrim"></div>' +
    '<div class="rnav-pulse"></div>' +
    '<button class="rnav-fab" aria-label="Open navigation"><span class="material-symbols-outlined rnav-fab-ic">add</span></button>' +
    '<div class="rnav-toast"><span class="material-symbols-outlined" style="font-size:18px">check_circle</span><span class="rnav-toast-t">Home</span></div>';
  document.body.appendChild(root);

  var fab = root.querySelector('.rnav-fab');
  var pulse = root.querySelector('.rnav-pulse');
  var scrim = root.querySelector('.rnav-scrim');
  var toast = root.querySelector('.rnav-toast');
  var toastT = root.querySelector('.rnav-toast-t');

  /* ---- geometry: rings of options, pivot = bottom-right corner ---- */
  var RINGS = [
    { r: 96,  size: 60, items: [{ icon: 'home', label: 'Home', key: 'home' }] },
    { r: 170, size: 58, items: [{ icon: 'search', label: 'Search', key: 'search' }] },
    { r: 244, size: 52, items: [
      { icon: 'receipt_long',  label: 'My Orders', key: 'orders' },
      { icon: 'person',        label: 'Profile',   key: 'profile' },
      { icon: 'shopping_cart', label: 'Cart',      key: 'cart' },
      { icon: 'favorite',      label: 'Wishlist',  key: 'wishlist' }
    ] }
  ];
  var ANG = { 1: [45], 2: [33, 63], 3: [22, 45, 68], 4: [16, 39, 62, 84] };

  var D2R = Math.PI / 180, built = [], order = 0;

  RINGS.forEach(function (ring, ri) {
    var band = document.createElement('div');
    band.className = 'rnav-band';
    band.style.transitionDelay = (ri * 70) + 'ms';
    root.insertBefore(band, pulse);
    built.push({ el: band, band: true, r: ring.r });

    var angs = ANG[ring.items.length] || [45];
    ring.items.forEach(function (it, ii) {
      var on = it.key === ACTIVE;
      var btn = document.createElement('button');
      btn.className = 'rnav-item' + (on ? ' active' : '');
      btn.style.width = btn.style.height = ring.size + 'px';
      var delay = 120 + order * 55;
      btn.style.transitionDelay = delay + 'ms';
      btn.innerHTML = '<span class="material-symbols-outlined"' + (on ? ' style="font-variation-settings:\'FILL\' 1"' : '') + '>' + it.icon + '</span>';
      btn.addEventListener('click', function () { select(it.label, btn); });
      root.insertBefore(btn, pulse);

      var lbl = document.createElement('div');
      lbl.className = 'rnav-label';
      lbl.textContent = it.label;
      lbl.style.transitionDelay = (delay + 80) + 'ms';
      root.insertBefore(lbl, pulse);

      built.push({ el: btn, lbl: lbl, r: ring.r, angle: angs[ii], size: ring.size });
      order++;
    });
  });

  var MAX_R = 244;
  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    var k = Math.min(1, (H - 70) / MAX_R, (W - 40) / MAX_R);
    built.forEach(function (b) {
      var r = b.r * k;
      if (b.band) { b.el.style.width = b.el.style.height = (r * 2) + 'px'; return; }
      var size = b.size * Math.max(0.85, k);
      b.el.style.width = b.el.style.height = size + 'px';
      var a = b.angle * D2R;                 // 0 = straight up, 90 = straight left
      var x = W - r * Math.sin(a);
      var y = H - r * Math.cos(a);
      b.el.style.left = (x - size / 2) + 'px';
      b.el.style.top = (y - size / 2) + 'px';
      b.el.style.setProperty('--dx', (W - x) + 'px');
      b.el.style.setProperty('--dy', (H - y) + 'px');
      b.lbl.style.left = (x - size / 2 - 12) + 'px';
      b.lbl.style.top = y + 'px';
    });
  }
  window.addEventListener('resize', layout);
  layout();

  /* ---- open / close ---- */
  function setOpen(v) { root.classList.toggle('open', v); }
  fab.addEventListener('click', function () { setOpen(!root.classList.contains('open')); });
  scrim.addEventListener('click', function () { setOpen(false); });

  /* ---- selection feedback ---- */
  var tt;
  function select(label, btn) {
    root.querySelectorAll('.rnav-item').forEach(function (b) {
      b.classList.remove('active');
      b.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 0";
    });
    btn.classList.add('active');
    btn.querySelector('.material-symbols-outlined').style.fontVariationSettings = "'FILL' 1";
    toastT.textContent = label;
    toast.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(function () { toast.classList.remove('show'); }, 1600);
    setTimeout(function () { setOpen(false); }, 180);
  }
})();
