/* ============================================================
   HomeServiceDirectory - Shared Layout (Nav + Footer)
   Injected on every page via <script src="/shared-layout.js"></script>
   ============================================================ */

(function() {
  // --- Google Analytics ---
  var GA_ID = window.HSD_GA_ID || '';
  if (GA_ID) {
    var gs = document.createElement('script');
    gs.async = true;
    gs.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(gs);
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', GA_ID);
    window.gtag = gtag;
  }

  // --- Navigation ---
  const navHTML = `
  <header class="site-header">
    <div class="header-inner">
      <a href="/" class="logo">
        <span class="logo-icon" id="logoIcon">&#x1F6A8;</span> Home<span>Service</span>
      </a>
      <nav class="main-nav" id="mainNav">
        <div class="nav-dropdown">
          <a href="#" class="nav-dropdown-trigger" onclick="return false;">Emergency &#9662;</a>
          <div class="nav-dropdown-menu">
            <a href="/plumbing">&#x1F527; Plumbing</a>
            <a href="/water-damage">&#x1F4A7; Water Damage</a>
            <a href="/fire-damage">&#x1F525; Fire & Smoke</a>
            <a href="/storm-damage">&#x1F32A;&#xFE0F; Storm Damage</a>
            <a href="/locksmith">&#x1F511; Locksmith</a>
          </div>
        </div>
        <div class="nav-dropdown">
          <a href="#" class="nav-dropdown-trigger" onclick="return false;">Repair &#9662;</a>
          <div class="nav-dropdown-menu">
            <a href="/hvac">&#x2744;&#xFE0F; HVAC</a>
            <a href="/electrical">&#x26A1; Electrical</a>
            <a href="/roofing">&#x1F3E0; Roofing</a>
            <a href="/foundation-repair">&#x1F3D7;&#xFE0F; Foundation</a>
          </div>
        </div>
        <div class="nav-dropdown">
          <a href="#" class="nav-dropdown-trigger" onclick="return false;">Specialty &#9662;</a>
          <div class="nav-dropdown-menu">
            <a href="/mold-remediation">&#x1F9A0; Mold</a>
            <a href="/sewage-cleanup">&#x2623;&#xFE0F; Sewage</a>
            <a href="/asbestos-abatement">&#x26A0;&#xFE0F; Asbestos</a>
          </div>
        </div>
        <a href="/browse-states">States</a>
        <a href="/pricing">Pricing</a>
        <div class="nav-dropdown">
          <a href="#" class="nav-dropdown-trigger" onclick="return false;">Portal &#9662;</a>
          <div class="nav-dropdown-menu">
            <a href="/my-listing">&#x1F4CB; Provider Dashboard</a>
            <a href="/rep-portal">&#x1F4B0; Rep Portal</a>
            <a href="/manager-portal">&#x1F4CA; Manager Portal</a>
            <a href="/admin">&#x2699;&#xFE0F; Admin</a>
          </div>
        </div>
        <a href="/list-your-business" class="cta-btn">List Your Business</a>
      </nav>
      <button class="hamburger" id="hamburger" aria-label="Menu">&#9776;</button>
    </div>
  </header>`;

  const footerHTML = `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid" style="grid-template-columns:2fr repeat(3, 1fr);">
        <div class="footer-brand">
          <div class="logo">
            <span class="logo-icon" id="footerLogoIcon">&#x1F6A8;</span> Home<span>Service</span>
          </div>
          <p>America's most comprehensive home emergency service directory. Find trusted, licensed professionals for plumbing, HVAC, water damage, mold, and every home emergency.</p>
        </div>
        <div class="footer-col">
          <h4>Emergency Services</h4>
          <a href="/plumbing">Plumbing</a>
          <a href="/water-damage">Water Damage</a>
          <a href="/fire-damage">Fire & Smoke</a>
          <a href="/storm-damage">Storm Damage</a>
          <a href="/locksmith">Locksmith</a>
          <a href="/sewage-cleanup">Sewage Cleanup</a>
        </div>
        <div class="footer-col">
          <h4>Repair & Maintenance</h4>
          <a href="/hvac">HVAC</a>
          <a href="/electrical">Electrical</a>
          <a href="/roofing">Roofing</a>
          <a href="/foundation-repair">Foundation Repair</a>
          <a href="/mold-remediation">Mold Remediation</a>
          <a href="/asbestos-abatement">Asbestos Abatement</a>
        </div>
        <div class="footer-col">
          <h4>Company</h4>
          <a href="/about">About</a>
          <a href="/list-your-business">List Your Business</a>
          <a href="/pricing">Pricing</a>
          <a href="/claim">Claim Listing</a>
          <a href="/browse-states">Browse States</a>
          <a href="/search">Search</a>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <hr style="border:none;border-top:1px solid #2d3561;margin:8px 0;">
          <a href="/rep-portal" style="color:#DC3545;font-weight:600;">Rep Portal</a>
          <a href="/manager-portal">Manager Portal</a>
        </div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} HomeServiceDirectory - All Rights Reserved</span>
        <span>Digital and Growth by <a href="https://markcmo.com" target="_blank">MarkCMO</a></span>
      </div>
    </div>
  </footer>`;

  // Inject nav at top of body immediately
  document.body.insertAdjacentHTML('afterbegin', navHTML);

  // Defer footer + nav logic until DOM is fully parsed
  function initLayout() {
    document.body.insertAdjacentHTML('beforeend', footerHTML);

    // Active nav link
    var path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    document.querySelectorAll('.main-nav a').forEach(function(a) {
      var href = a.getAttribute('href');
      if (href === path || (href !== '/' && path.startsWith(href))) {
        a.classList.add('active');
      }
    });

    // Animated logo icon - cycles through service emojis with 3D flip
    (function() {
      var icons = ['\uD83D\uDEA8', '\uD83D\uDD27', '\uD83D\uDCA7', '\uD83E\uDDA0', '\u2744\uFE0F', '\u26A1', '\uD83C\uDFE0', '\uD83C\uDFD7\uFE0F', '\uD83D\uDD25', '\u2623\uFE0F', '\uD83C\uDF2A\uFE0F', '\u26A0\uFE0F', '\uD83D\uDD11'];
      var idx = 0;
      var el = document.getElementById('logoIcon');
      var footerEl = document.getElementById('footerLogoIcon');
      if (el) {
        setInterval(function() {
          idx = (idx + 1) % icons.length;
          el.classList.add('flip');
          if (footerEl) footerEl.classList.add('flip');
          setTimeout(function() {
            el.textContent = icons[idx];
            if (footerEl) footerEl.textContent = icons[idx];
            el.classList.remove('flip');
            if (footerEl) footerEl.classList.remove('flip');
          }, 300);
        }, 3000);
      }
    })();

    // Mobile nav toggle
    var hamburger = document.getElementById('hamburger');
    var mainNav = document.getElementById('mainNav');
    if (hamburger && mainNav) {
      hamburger.addEventListener('click', function() {
        mainNav.classList.toggle('open');
      });
    }

    // Nav dropdown - click/tap to toggle
    document.querySelectorAll('.nav-dropdown-trigger').forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var menu = this.nextElementSibling;
        document.querySelectorAll('.nav-dropdown-menu.open').forEach(function(m) {
          if (m !== menu) m.classList.remove('open');
        });
        if (menu) menu.classList.toggle('open');
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.nav-dropdown')) {
        document.querySelectorAll('.nav-dropdown-menu.open').forEach(function(m) {
          m.classList.remove('open');
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLayout);
  } else {
    initLayout();
  }
})();
