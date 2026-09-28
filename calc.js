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
  var DEFAULT_HOURS_PER_DAY = 8;

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

  function isWorkingDay(dn) {
    var weekday = new Date(dn * MS_PER_DAY).getUTCDay(); // 0 = niedziela
    return weekday !== 0 && weekday !== 6 && !isHoliday(dn);
  }

  /** Dni robocze w przedziale [start, end] — oba końce włącznie, jak w CLI. */
  function countWorkingDays(start, end) {
    var count = 0;
    for (var dn = start; dn <= end; dn++) {
      if (isWorkingDay(dn)) count++;
    }
    return count;
  }

  /**
   * Sprawdza konfigurację i zwraca listę błędów (pustą, gdy wszystko OK).
   * config: { birthDate, workStartDate, gender, retirementAge, hoursPerDay }
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
    var hours = Number(config.hoursPerDay);
    if (!(hours > 0 && hours <= 24)) {
      errors.push("Liczba godzin pracy dziennie musi być z zakresu 0–24.");
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
    var hoursPerDay = Number(config.hoursPerDay) || DEFAULT_HOURS_PER_DAY;
    var retirement = addYears(birth, age);

    var totalWorkDays = retirement - workStart;
    var daysWorked = Math.max(0, today - workStart);
    var ageInDays = today - birth;
    var result = {
      retirementDate: retirement,
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
      workingDaysLeft: 0,
      workingHoursLeft: 0
    };
    if (!result.retired) {
      result.daysLeft = retirement - today;
      result.yearsLeft = result.daysLeft / 365.25;
      result.workingDaysLeft = countWorkingDays(today, retirement);
      result.workingHoursLeft = result.workingDaysLeft * hoursPerDay;
    }
    return result;
  }

  var api = {
    DEFAULT_RETIREMENT_AGE: DEFAULT_RETIREMENT_AGE,
    DEFAULT_HOURS_PER_DAY: DEFAULT_HOURS_PER_DAY,
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
    validateConfig: validateConfig,
    compute: compute
  };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.Emerytura = api;
  }
})(this);
