(function () {
  "use strict";

  var E = window.Emerytura;
  var STORAGE_KEY = "dni-do-emerytury:config";
  var nf = new Intl.NumberFormat("pl-PL");
  var nf2 = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf1 = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var dateFmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  var $ = function (id) { return document.getElementById(id); };
  var form = $("config-form");
  var state = { config: null, today: null, result: null, timer: null };

  /* ---------- pamięć (localStorage) ---------- */

  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var cfg = E.migrateConfig(JSON.parse(raw));
      return E.validateConfig(cfg).length === 0 ? cfg : null;
    } catch (e) {
      return null;
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearConfig() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* brak dostępu */ }
  }

  /* ---------- formatowanie ---------- */

  function daysWord(n) { return n === 1 ? "dzień" : "dni"; }
  function formatDate(dn) { return dateFmt.format(new Date(dn * E.MS_PER_DAY)); }
  function formatYears(y) { return "≈ " + nf2.format(y) + " roku"; }
  function pad(n) { return String(n).padStart(2, "0"); }

  /* ---------- formularz ---------- */

  var ageTouched = false;

  function selectedGender() {
    var el = form.querySelector('input[name="gender"]:checked');
    return el ? el.value : "M";
  }

  function updateAgeHint() {
    var g = selectedGender();
    $("age-hint").textContent = "Ustawowo: " + E.DEFAULT_RETIREMENT_AGE[g] + " lat (" +
      (g === "K" ? "kobiety" : "mężczyźni") + ")";
  }

  function fillForm(cfg) {
    cfg = cfg || {};
    var gender = cfg.gender || "M";
    form.birthDate.value = cfg.birthDate || "";
    form.workStartDate.value = cfg.workStartDate || "";
    form.querySelector('input[name="gender"][value="' + gender + '"]').checked = true;
    form.retirementAge.value = cfg.retirementAge || E.DEFAULT_RETIREMENT_AGE[gender];
    form.workStartTime.value = cfg.workStartTime || E.DEFAULT_WORK_START;
    form.workEndTime.value = cfg.workEndTime || E.DEFAULT_WORK_END;
    ageTouched = !!cfg.retirementAge && Number(cfg.retirementAge) !== E.DEFAULT_RETIREMENT_AGE[gender];
    $("form-errors").innerHTML = "";
    updateAgeHint();
  }

  function readForm() {
    return {
      birthDate: form.birthDate.value,
      workStartDate: form.workStartDate.value,
      gender: selectedGender(),
      retirementAge: form.retirementAge.value === "" ? NaN : Number(form.retirementAge.value),
      workStartTime: form.workStartTime.value,
      workEndTime: form.workEndTime.value
    };
  }

  form.addEventListener("change", function (ev) {
    if (ev.target.name === "gender") {
      if (!ageTouched) form.retirementAge.value = E.DEFAULT_RETIREMENT_AGE[selectedGender()];
      updateAgeHint();
    }
  });
  form.retirementAge.addEventListener("input", function () { ageTouched = true; });

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var cfg = readForm();
    var errors = E.validateConfig(cfg);
    var list = $("form-errors");
    list.innerHTML = "";
    errors.forEach(function (msg) {
      var li = document.createElement("li");
      li.textContent = msg;
      list.appendChild(li);
    });
    if (errors.length) return;
    if (!saveConfig(cfg)) {
      var li = document.createElement("li");
      li.textContent = "Nie udało się zapisać danych w przeglądarce (tryb prywatny?). Wyniki pokażę tylko do odświeżenia strony.";
      list.appendChild(li);
    }
    state.config = cfg;
    showResults();
  });

  $("edit-btn").addEventListener("click", function () { showSetup(true); });
  $("cancel-btn").addEventListener("click", function () { showResults(); });
  $("clear-btn").addEventListener("click", function () {
    clearConfig();
    state.config = null;
    showSetup(false);
  });

  /* ---------- widoki ---------- */

  function showSetup(editing) {
    stopTimer();
    fillForm(state.config);
    $("results").hidden = true;
    $("edit-btn").hidden = true;
    $("cancel-btn").hidden = !(editing && state.config);
    $("setup").hidden = false;
    form.birthDate.focus();
  }

  function showResults() {
    $("setup").hidden = true;
    $("results").hidden = false;
    $("edit-btn").hidden = false;
    render();
    startTimer();
  }

  /* ---------- wykres pierścieniowy ---------- */

  var R = 52, STROKE = 10, C = 2 * Math.PI * R;

  function ringSVG(percent, caption, tooltipText) {
    var p = Math.max(0, Math.min(100, percent));
    var dash = (p / 100) * C;
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", caption + ": " + nf1.format(p) + "%");

    function circle(cls, extra) {
      var c = document.createElementNS(svgNS, "circle");
      c.setAttribute("cx", 60); c.setAttribute("cy", 60); c.setAttribute("r", R);
      c.setAttribute("fill", "none");
      c.setAttribute("class", cls);
      Object.keys(extra || {}).forEach(function (k) { c.setAttribute(k, extra[k]); });
      svg.appendChild(c);
      return c;
    }

    circle("track", { "stroke-width": STROKE });
    if (p > 0) {
      circle("fill", {
        "stroke-width": STROKE,
        "stroke-linecap": p < 100 ? "round" : "butt",
        "stroke-dasharray": dash + " " + C,
        "transform": "rotate(-90 60 60)",
        "style": "--ring-from: " + dash
      });
    }
    var hit = circle("hit", { "stroke-width": STROKE + 16 });
    bindTooltip(hit, tooltipText);

    var t = document.createElementNS(svgNS, "text");
    t.setAttribute("x", 60); t.setAttribute("y", 63);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "pct");
    t.textContent = nf1.format(p) + "%";
    svg.appendChild(t);
    var s = document.createElementNS(svgNS, "text");
    s.setAttribute("x", 60); s.setAttribute("y", 77);
    s.setAttribute("text-anchor", "middle");
    s.setAttribute("class", "pct-sub");
    s.textContent = caption;
    svg.appendChild(s);
    return svg;
  }

  var tooltip = $("tooltip");
  function bindTooltip(el, text) {
    function move(ev) {
      tooltip.textContent = text;
      tooltip.hidden = false;
      var x = ev.clientX + 14, y = ev.clientY + 14;
      var w = tooltip.offsetWidth, h = tooltip.offsetHeight;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
      tooltip.style.left = x + "px";
      tooltip.style.top = y + "px";
    }
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", move);
    el.addEventListener("pointerleave", function () { tooltip.hidden = true; });
  }

  /* ---------- renderowanie wyników ---------- */

  function render() {
    var cfg = state.config;
    state.today = E.todayDayNumber();
    var r = E.compute(cfg, state.today);
    state.result = r;

    $("retired-banner").hidden = !r.retired;
    $("countdown-block").hidden = r.retired;
    $("retired-date").textContent = formatDate(r.retirementDate);

    if (!r.retired) {
      $("days-left").textContent = nf.format(r.daysLeft);
      $("days-left-unit").textContent = daysWord(r.daysLeft);
      $("years-left").textContent = formatYears(r.yearsLeft);
      $("retirement-date").textContent = formatDate(r.retirementDate);
      $("working-days").textContent = nf.format(r.workingDaysLeft);
      $("working-hours-sub").textContent = nf.format(r.workingHoursLeft) + " h · pn–pt " +
        E.formatTime(r.workDayStart) + "–" + E.formatTime(r.workDayEnd);
    }

    var remaining = Math.max(0, r.totalWorkDays - r.daysWorked);
    $("worked-days").textContent = nf.format(r.daysWorked) + " " + daysWord(r.daysWorked) +
      " (" + nf2.format(r.yearsWorked) + " roku)";
    $("remaining-days").textContent = nf.format(remaining) + " " + daysWord(remaining);
    $("life-worked").textContent = nf1.format(r.lifeWorkPercent) + "%";
    $("life-before").textContent = nf1.format(100 - r.lifeWorkPercent) + "%";

    var ringWork = $("ring-work");
    ringWork.replaceChildren(ringSVG(r.workPercent, "przepracowane",
      "Przepracowano " + nf.format(r.daysWorked) + " z " + nf.format(r.totalWorkDays) +
      " dni (" + nf2.format(r.workPercent) + "%)"));
    var ringLife = $("ring-life");
    ringLife.replaceChildren(ringSVG(r.lifeWorkPercent, "życia w pracy",
      "Praca to " + nf2.format(r.lifeWorkPercent) + "% Twojego dotychczasowego życia"));

    tick();
  }

  /* Odliczanie na żywo do północy (czasu lokalnego) w dniu emerytury. */
  function tick() {
    var r = state.result;
    if (!r || r.retired) return;
    if (E.todayDayNumber() !== state.today) { render(); return; }
    var p = E.fromDayNumber(r.retirementDate);
    var target = new Date(p.y, p.m - 1, p.d).getTime();
    var ms = Math.max(0, target - Date.now());
    var totalSec = Math.floor(ms / 1000);
    var hours = Math.floor(totalSec / 3600);
    var min = Math.floor((totalSec % 3600) / 60);
    var sec = totalSec % 60;
    $("calendar-hours").textContent = nf.format(hours);
    $("countdown").innerHTML = "<b>" + nf.format(hours) + "</b> godz. <b>" + pad(min) +
      "</b> min <b>" + pad(sec) + "</b> s";

    var now = new Date();
    var nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    var work = E.workingSecondsLeft(r, state.today, nowSec);
    $("working-hours").innerHTML = nf.format(Math.floor(work / 3600)) + "<small> h </small>" +
      pad(Math.floor((work % 3600) / 60)) + "<small> min </small>" + pad(work % 60) + "<small> s</small>";
  }

  function startTimer() {
    stopTimer();
    state.timer = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  }

  /* ---------- start ---------- */

  state.config = loadConfig();
  if (state.config) showResults();
  else showSetup(false);
})();
