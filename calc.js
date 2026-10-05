/*
 * Logika obliczeń „Dni do emerytury” — port z wersji CLI (Python).
 *
 * Wszystkie daty są reprezentowane jako numery dni (liczba dni od 1970-01-01
 * w UTC), dzięki czemu zmiany czasu letniego/zimowego nie wpływają na wyniki.
 *
 * Plik działa zarówno jako zwykły <script> w przeglądarce (globalny obiekt
 * `Emerytura`), jak i jako moduł CommonJS w Node (testy).
 */
(function (root) {
  "use strict";

  var MS_PER_DAY = 86400000;
  var DEFAULT_RETIREMENT_AGE = { M: 65, K: 60 };
  var DEFAULT_WORK_START = "09:00";
  var DEFAULT_WORK_END = "17:00";
  var DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // 0 = niedziela … 6 = sobota
  var DEFAULT_VACATION_DAYS = 26;

  function dayNumber(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
  }

  function fromDayNumber(dn) {
    var dt = new Date(dn * MS_PER_DAY);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function daysInMonth(y, m) {
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  /** "YYYY-MM-DD" -> numer dnia albo null, gdy data jest niepoprawna. */
  function parseISODate(str) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || "").trim());
    if (!match) return null;
    var y = +match[1], m = +match[2], d = +match[3];
    if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
    return dayNumber(y, m, d);
  }

  function formatISODate(dn) {
    var p = fromDayNumber(dn);
    return p.y + "-" + String(p.m).padStart(2, "0") + "-" + String(p.d).padStart(2, "0");
  }

  /** Dzisiejsza data w lokalnej strefie czasowej użytkownika jako numer dnia. */
  function todayDayNumber(now) {
    now = now || new Date();
    return dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /** Jak relativedelta(years=n): 29 lutego przechodzi na 28 lutego. */
  function addYears(dn, years) {
    var p = fromDayNumber(dn);
    var y = p.y + years;
    return dayNumber(y, p.m, Math.min(p.d, daysInMonth(y, p.m)));
  }

  /** Niedziela Wielkanocna (algorytm Meeusa/Jonesa/Butchera). */
  function easterSunday(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100;
    var d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return dayNumber(y, month, day);
  }

  /** Polskie dni ustawowo wolne od pracy w danym roku (od 1990). */
  function polishHolidays(y) {
    var easter = easterSunday(y);
    var list = [
      dayNumber(y, 1, 1),   // Nowy Rok
      easter,               // Wielkanoc
      easter + 1,           // Poniedziałek Wielkanocny
      dayNumber(y, 5, 1),   // Święto Pracy
      dayNumber(y, 5, 3),   // Święto Konstytucji 3 Maja
      easter + 49,          // Zielone Świątki
      easter + 60,          // Boże Ciało
      dayNumber(y, 8, 15),  // Wniebowzięcie NMP
      dayNumber(y, 11, 1),  // Wszystkich Świętych
      dayNumber(y, 12, 25), // Boże Narodzenie
      dayNumber(y, 12, 26)  // drugi dzień Bożego Narodzenia
    ];
    if (y >= 2011) list.push(dayNumber(y, 1, 6));   // Trzech Króli
    if (y >= 2025) list.push(dayNumber(y, 12, 24)); // Wigilia
    if (y >= 1990) list.push(dayNumber(y, 11, 11)); // Święto Niepodległości
    if (y === 2018) list.push(dayNumber(y, 11, 12)); // jednorazowo: 100-lecie niepodległości
    return list;
  }

  var holidayCache = {};
  function isHoliday(dn) {
    var y = fromDayNumber(dn).y;
    if (!holidayCache[y]) {
      var set = {};
      polishHolidays(y).forEach(function (h) { set[h] = true; });
      holidayCache[y] = set;
    }
    return holidayCache[y][dn] === true;
  }

  function weekdayOf(dn) {
    return new Date(dn * MS_PER_DAY).getUTCDay(); // 0 = niedziela
  }

  /** Dzień pracy: wybrany dzień tygodnia (domyślnie pn–pt), który nie jest świętem. */
  function isWorkingDay(dn, workDays) {
    return (workDays || DEFAULT_WORK_DAYS).indexOf(weekdayOf(dn)) !== -1 && !isHoliday(dn);
  }

  /** Dni robocze w przedziale [start, end] — oba końce włącznie. */
  function countWorkingDays(start, end, workDays) {
    var count = 0;
    for (var dn = start; dn <= end; dn++) {
      if (isWorkingDay(dn, workDays)) count++;
    }
    return count;
  }

  /**
   * Średnia liczba dni roboczych w roku dla danych dni tygodnia — liczona
   * na stałym 28-letnim cyklu kalendarza, żeby nie zmieniała się z dnia na dzień.
   */
  var avgCache = {};
  function averageWorkingDaysPerYear(workDays) {
    var key = workDays.join(",");
    if (avgCache[key] === undefined) {
      avgCache[key] = countWorkingDays(dayNumber(2000, 1, 1), dayNumber(2027, 12, 31), workDays) / 28;
    }
    return avgCache[key];
  }

  /**
   * Jaka część dni roboczych jest faktycznie przepracowana po odjęciu urlopu
   * (urlop rozłożony równomiernie, bo nie wiemy, kiedy zostanie wykorzystany).
   */
  function workFactor(workDays, vacationDays) {
    var perYear = averageWorkingDaysPerYear(workDays);
    return perYear > 0 ? Math.max(0, 1 - vacationDays / perYear) : 0;
  }

  /** "HH:MM" -> liczba sekund od północy albo null. "24:00" jest dozwolone. */
  function parseTime(str) {
    var match = /^(\d{2}):(\d{2})$/.exec(String(str || "").trim());
    if (!match) return null;
    var h = +match[1], m = +match[2];
    if (m > 59 || h > 24 || (h === 24 && m !== 0)) return null;
    return h * 3600 + m * 60;
  }

  function formatTime(sec) {
    return String(Math.floor(sec / 3600)).padStart(2, "0") + ":" +
      String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  }

  /**
   * Uzupełnia konfigurację zapisaną przez starszą wersję strony, która
   * zamiast godzin pracy od–do trzymała tylko liczbę godzin dziennie.
   */
  function migrateConfig(config) {
    var cfg = {};
    Object.keys(config || {}).forEach(function (k) { cfg[k] = config[k]; });
    if (cfg.workStartTime === undefined && cfg.workEndTime === undefined) {
      var start = parseTime(DEFAULT_WORK_START);
      var hours = Number(cfg.hoursPerDay);
      cfg.workStartTime = DEFAULT_WORK_START;
      cfg.workEndTime = hours > 0
        ? formatTime(Math.min(24 * 3600, start + Math.round(hours * 3600 / 60) * 60))
        : DEFAULT_WORK_END;
    }
    delete cfg.hoursPerDay;
    if (cfg.workDays === undefined) cfg.workDays = DEFAULT_WORK_DAYS.slice();
    if (cfg.vacationDays === undefined) cfg.vacationDays = DEFAULT_VACATION_DAYS;
    return cfg;
  }

  /**
   * Sprawdza konfigurację i zwraca listę błędów (pustą, gdy wszystko OK).
   * config: { birthDate, workStartDate, gender, retirementAge, workStartTime,
   *           workEndTime, workDays, vacationDays }
   */
  function validateConfig(config) {
    var errors = [];
    var birth = parseISODate(config.birthDate);
    var workStart = parseISODate(config.workStartDate);
    if (birth === null) errors.push("Podaj poprawną datę urodzenia.");
    if (workStart === null) errors.push("Podaj poprawną datę rozpoczęcia pracy.");
    if (config.gender !== "M" && config.gender !== "K") errors.push("Wybierz płeć.");
    var age = Number(config.retirementAge);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      errors.push("Wiek emerytalny musi być liczbą całkowitą z zakresu 1–120.");
    }
    var dayStart = parseTime(config.workStartTime);
    var dayEnd = parseTime(config.workEndTime);
    if (dayStart === null || dayEnd === null) {
      errors.push("Podaj poprawne godziny pracy (GG:MM).");
    } else if (dayEnd <= dayStart) {
      errors.push("Koniec pracy musi być później niż jej początek.");
    }
    var days = config.workDays;
    var daysOk = Array.isArray(days) && days.length > 0 && days.every(function (d, i) {
      return Number.isInteger(d) && d >= 0 && d <= 6 && days.indexOf(d) === i;
    });
    if (!daysOk) errors.push("Wybierz co najmniej jeden dzień pracy w tygodniu.");
    var vacation = Number(config.vacationDays);
    if (!Number.isInteger(vacation) || vacation < 0) {
      errors.push("Liczba dni urlopu musi być nieujemną liczbą całkowitą.");
    } else if (daysOk && vacation >= averageWorkingDaysPerYear(days)) {
      errors.push("Urlop nie może być dłuższy niż liczba dni pracy w roku.");
    }
    if (birth !== null && workStart !== null && workStart < birth) {
      errors.push("Data rozpoczęcia pracy nie może być wcześniejsza niż data urodzenia.");
    }
    if (birth !== null && Number.isInteger(age) && workStart !== null &&
        workStart >= addYears(birth, age)) {
      errors.push("Data rozpoczęcia pracy musi być wcześniejsza niż data emerytury.");
    }
    return errors;
  }

  /** Główne obliczenia — odpowiednik funkcji main() z wersji CLI. */
  function compute(config, today) {
    var birth = parseISODate(config.birthDate);
    var workStart = parseISODate(config.workStartDate);
    var age = Number(config.retirementAge);
    var dayStart = parseTime(config.workStartTime);
    var dayEnd = parseTime(config.workEndTime);
    var hoursPerDay = (dayEnd - dayStart) / 3600;
    var retirement = addYears(birth, age);
    var workDays = config.workDays || DEFAULT_WORK_DAYS;
    var vacationDays = Number(config.vacationDays) || 0;

    var totalWorkDays = retirement - workStart;
    var daysWorked = Math.max(0, today - workStart);
    var ageInDays = today - birth;
    var result = {
      retirementDate: retirement,
      workDayStart: dayStart,
      workDayEnd: dayEnd,
      hoursPerDay: hoursPerDay,
      workDays: workDays,
      vacationDays: vacationDays,
      workFactor: workFactor(workDays, vacationDays),
      retired: today >= retirement,
      totalWorkDays: totalWorkDays,
      daysWorked: Math.min(daysWorked, totalWorkDays),
      yearsWorked: Math.min(daysWorked, totalWorkDays) / 365.25,
      workPercent: totalWorkDays > 0
        ? Math.min(100, (daysWorked / totalWorkDays) * 100) : 0,
      lifeWorkPercent: ageInDays > 0
        ? Math.min(100, (daysWorked / ageInDays) * 100) : 0,
      daysLeft: 0,
      yearsLeft: 0,
      calendarWorkingDaysLeft: 0,
      workingDaysLeft: 0,
      vacationDaysLeft: 0,
      workingHoursLeft: 0
    };
    if (!result.retired) {
      result.daysLeft = retirement - today;
      result.yearsLeft = result.daysLeft / 365.25;
      // W dniu emerytury już się nie pracuje — liczymy do dnia poprzedniego.
      result.calendarWorkingDaysLeft = countWorkingDays(today, retirement - 1, workDays);
      result.workingDaysLeft = Math.round(result.calendarWorkingDaysLeft * result.workFactor);
      result.vacationDaysLeft = result.calendarWorkingDaysLeft - result.workingDaysLeft;
      result.workingHoursLeft = result.workingDaysLeft * hoursPerDay;
    }
    return result;
  }

  /**
   * Sekundy pracy pozostałe do emerytury w danej chwili: dzisiejsze godziny
   * pracy liczą się tylko w części, która jeszcze nie minęła. Całość jest
   * pomniejszana o urlop (współczynnik workFactor), więc w godzinach pracy
   * licznik spada nieco wolniej niż zegar, ale nigdy nie skacze.
   * nowSec — sekundy od północy (czas lokalny) w dniu `today`.
   */
  function workingSecondsLeft(result, today, nowSec) {
    if (result.retired) return 0;
    var perDay = result.workDayEnd - result.workDayStart;
    var days = result.calendarWorkingDaysLeft;
    var raw = days * perDay;
    if (isWorkingDay(today, result.workDays)) {
      var todayLeft = Math.max(0, Math.min(perDay, result.workDayEnd - Math.max(nowSec, result.workDayStart)));
      raw = (days - 1) * perDay + todayLeft;
    }
    return Math.round(raw * result.workFactor);
  }

  /**
   * Nadchodzące kamienie milowe (posortowane po dacie, łącznie z dzisiejszym):
   * procent okresu pracy, najbliższy pełny 5% życia spędzonego w pracy, okrągłe
   * lata stażu oraz okrągłe liczby dni do emerytury i dni roboczych.
   * Zwraca [{ date, kind, value, label }].
   */
  var DAYS_LEFT_MARKS = [20000, 15000, 10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000,
    2500, 2000, 1500, 1000, 750, 500, 365, 300, 200, 100, 50, 30, 14, 7, 1];
  var WORKING_DAYS_MARKS = [10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000, 2500, 2000,
    1500, 1000, 750, 500, 250, 100, 50, 20, 10, 5, 1];

  function milestones(config, result, today) {
    if (result.retired) return [];
    var list = [];
    var workStart = parseISODate(config.workStartDate);
    var retirement = result.retirementDate;
    var total = result.totalWorkDays;

    for (var p = 10; p <= 90; p += 10) {
      var date = workStart + Math.ceil((p / 100) * total);
      if (date >= today) list.push({ date: date, kind: "percent", value: p });
    }
    [25, 75].forEach(function (p) {
      var date = workStart + Math.ceil((p / 100) * total);
      if (date >= today) list.push({ date: date, kind: "percent", value: p });
    });
    // % życia w pracy rośnie z każdym dniem — tylko najbliższa wielokrotność 5%.
    // Pierwszy dzień d, w którym (d − start pracy) / (d − urodzenie) ≥ p / 100.
    var birth = parseISODate(config.birthDate);
    for (var lp = 5; lp < 100; lp += 5) {
      var lifeDate = Math.ceil((100 * workStart - lp * birth) / (100 - lp));
      if (lifeDate >= retirement) break;
      if (lifeDate >= today) {
        list.push({ date: lifeDate, kind: "lifePercent", value: lp });
        break;
      }
    }
    for (var years = 5; addYears(workStart, years) < retirement; years += 5) {
      var anniversary = addYears(workStart, years);
      if (anniversary >= today) list.push({ date: anniversary, kind: "yearsWorked", value: years });
    }
    DAYS_LEFT_MARKS.forEach(function (n) {
      var date = retirement - n;
      if (date >= today) list.push({ date: date, kind: "daysLeft", value: n });
    });

    // Dni robocze (po odjęciu urlopu): pierwszy dzień, w którym zostaje ich ≤ N.
    var targets = WORKING_DAYS_MARKS.filter(function (n) { return n < result.workingDaysLeft; });
    var raw = result.calendarWorkingDaysLeft;
    var ti = 0;
    for (var dn = today; dn < retirement && ti < targets.length; dn++) {
      var effective = Math.round(raw * result.workFactor);
      while (ti < targets.length && effective <= targets[ti]) {
        list.push({ date: dn, kind: "workingDays", value: targets[ti] });
        ti++;
      }
      if (isWorkingDay(dn, result.workDays)) raw--;
    }

    list.forEach(function (m) {
      if (m.kind === "percent") m.label = m.value + "% okresu pracy za Tobą";
      else if (m.kind === "lifePercent") m.label = m.value + "% życia w pracy";
      else if (m.kind === "yearsWorked") m.label = m.value + " lat pracy za Tobą";
      else if (m.kind === "daysLeft") m.label = m.value === 1 ? "Ostatni dzień przed emeryturą" : m.value + " dni do emerytury";
      else m.label = m.value === 1 ? "Ostatni dzień roboczy" : m.value + " dni roboczych do emerytury";
    });
    list.sort(function (a, b) { return a.date - b.date || b.value - a.value; });
    return list;
  }

  /**
   * „Ile jeszcze” w okresie [dziś, dzień przed emeryturą]: pracujące poniedziałki
   * i piątki, weekendy, święta w dni pracy oraz długie weekendy (co najmniej
   * 3 kolejne dni wolne, wśród których jest święto).
   */
  function remainingStats(result, today) {
    var stats = { mondays: 0, fridays: 0, weekends: 0, holidays: 0, longWeekends: 0 };
    if (result.retired) return stats;
    var workDays = result.workDays;
    var run = 0, runHasHoliday = false;
    function closeRun() {
      if (run >= 3 && runHasHoliday) stats.longWeekends++;
      run = 0; runHasHoliday = false;
    }
    for (var dn = today; dn < result.retirementDate; dn++) {
      var wd = weekdayOf(dn);
      var working = isWorkingDay(dn, workDays);
      if (working && wd === 1) stats.mondays++;
      if (working && wd === 5) stats.fridays++;
      if (wd === 6) stats.weekends++;
      var holidayOnWorkday = workDays.indexOf(wd) !== -1 && isHoliday(dn);
      if (holidayOnWorkday) stats.holidays++;
      if (working) closeRun();
      else { run++; if (holidayOnWorkday) runHasHoliday = true; }
    }
    closeRun();
    return stats;
  }

  var api = {
    DEFAULT_RETIREMENT_AGE: DEFAULT_RETIREMENT_AGE,
    DEFAULT_WORK_START: DEFAULT_WORK_START,
    DEFAULT_WORK_END: DEFAULT_WORK_END,
    DEFAULT_WORK_DAYS: DEFAULT_WORK_DAYS,
    DEFAULT_VACATION_DAYS: DEFAULT_VACATION_DAYS,
    MS_PER_DAY: MS_PER_DAY,
    dayNumber: dayNumber,
    fromDayNumber: fromDayNumber,
    parseISODate: parseISODate,
    formatISODate: formatISODate,
    todayDayNumber: todayDayNumber,
    addYears: addYears,
    easterSunday: easterSunday,
    polishHolidays: polishHolidays,
    isWorkingDay: isWorkingDay,
    countWorkingDays: countWorkingDays,
    averageWorkingDaysPerYear: averageWorkingDaysPerYear,
    workFactor: workFactor,
    parseTime: parseTime,
    formatTime: formatTime,
    migrateConfig: migrateConfig,
    validateConfig: validateConfig,
    compute: compute,
    workingSecondsLeft: workingSecondsLeft,
    milestones: milestones,
    remainingStats: remainingStats
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.Emerytura = api;
  }
})(this);
