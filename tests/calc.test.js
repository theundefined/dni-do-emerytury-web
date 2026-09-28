// Uruchamianie: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../calc.js");

const d = E.parseISODate;

test("święta zgodne z biblioteką Python holidays (PL, 2000–2070)", () => {
  // Wzorzec wygenerowany: holidays.country_holidays('PL', years=range(2000, 2071))
  const expected = require("./pl_holidays_2000_2070.json");
  const actual = [];
  for (let y = 2000; y <= 2070; y++) {
    E.polishHolidays(y).forEach((dn) => actual.push(E.formatISODate(dn)));
  }
  assert.deepEqual(actual.sort(), expected);
});

test("liczba dni roboczych zgodna z calculate_working_days z CLI", () => {
  const cases = [
    ["2026-09-28", "2050-01-01", 5857],
    ["2024-12-20", "2025-01-10", 12],
    ["2030-03-01", "2061-02-28", 7802],
    ["2026-01-01", "2026-12-31", 253],
  ];
  for (const [a, b, n] of cases) {
    assert.equal(E.countWorkingDays(d(a), d(b)), n, `${a}..${b}`);
  }
});

test("dodawanie lat jak relativedelta (29 lutego -> 28 lutego)", () => {
  assert.equal(E.formatISODate(E.addYears(d("1972-02-29"), 65)), "2037-02-28");
  assert.equal(E.formatISODate(E.addYears(d("1972-02-29"), 60)), "2032-02-29");
  assert.equal(E.formatISODate(E.addYears(d("1980-06-15"), 65)), "2045-06-15");
});

test("parsowanie dat odrzuca niepoprawne wartości", () => {
  assert.equal(d("2023-02-29"), null);
  assert.equal(d("2024-13-01"), null);
  assert.equal(d("abc"), null);
  assert.notEqual(d("2024-02-29"), null);
});

test("compute — przykładowa konfiguracja", () => {
  const cfg = {
    birthDate: "1980-01-01",
    workStartDate: "2000-01-01",
    gender: "M",
    retirementAge: 65,
    workStartTime: "09:00", workEndTime: "17:00",
    workDays: [1, 2, 3, 4, 5],
    vacationDays: 0,
  };
  const r = E.compute(cfg, d("2026-09-28"));
  assert.equal(E.formatISODate(r.retirementDate), "2045-01-01");
  assert.equal(r.retired, false);
  assert.equal(r.daysLeft, d("2045-01-01") - d("2026-09-28"));
  // dzień emerytury (2045-01-01) nie jest liczony jako dzień pracy
  assert.equal(r.workingDaysLeft, E.countWorkingDays(d("2026-09-28"), d("2044-12-31")));
  assert.equal(r.workingHoursLeft, r.workingDaysLeft * 8);
  assert.equal(r.daysWorked, d("2026-09-28") - d("2000-01-01"));
  const total = d("2045-01-01") - d("2000-01-01");
  assert.ok(Math.abs(r.workPercent - (r.daysWorked / total) * 100) < 1e-9);
});

test("compute — już na emeryturze", () => {
  const cfg = { birthDate: "1950-05-05", workStartDate: "1970-01-01", gender: "K", retirementAge: 60, workStartTime: "09:00", workEndTime: "17:00", workDays: [1, 2, 3, 4, 5], vacationDays: 0 };
  const r = E.compute(cfg, d("2026-09-28"));
  assert.equal(r.retired, true);
  assert.equal(r.workPercent, 100);
  assert.equal(r.workingDaysLeft, 0);
});

test("walidacja konfiguracji", () => {
  const ok = { birthDate: "1980-01-01", workStartDate: "2000-01-01", gender: "M", retirementAge: 65, workStartTime: "09:00", workEndTime: "17:00", workDays: [1, 2, 3, 4, 5], vacationDays: 0 };
  assert.deepEqual(E.validateConfig(ok), []);
  assert.equal(E.validateConfig({ ...ok, workStartDate: "1970-01-01" }).length, 1);
  assert.equal(E.validateConfig({ ...ok, retirementAge: "abc" }).length, 1);
  assert.equal(E.validateConfig({ ...ok, gender: "X" }).length, 1);
});

test("walidacja godzin pracy", () => {
  const ok = { birthDate: "1980-01-01", workStartDate: "2000-01-01", gender: "M", retirementAge: 65, workStartTime: "09:00", workEndTime: "17:00", workDays: [1, 2, 3, 4, 5], vacationDays: 0 };
  assert.equal(E.validateConfig({ ...ok, workEndTime: "08:00" }).length, 1);
  assert.equal(E.validateConfig({ ...ok, workStartTime: "25:00" }).length, 1);
  assert.deepEqual(E.validateConfig({ ...ok, workStartTime: "00:00", workEndTime: "24:00" }), []);
});

test("migracja starej konfiguracji z hoursPerDay", () => {
  const old = { birthDate: "1980-01-01", workStartDate: "2000-01-01", gender: "M", retirementAge: 65, hoursPerDay: 7.5 };
  const cfg = E.migrateConfig(old);
  assert.equal(cfg.workStartTime, "09:00");
  assert.equal(cfg.workEndTime, "16:30");
  assert.deepEqual(cfg.workDays, [1, 2, 3, 4, 5]);
  assert.equal(cfg.vacationDays, 26);
  assert.equal("hoursPerDay" in cfg, false);
  assert.deepEqual(E.validateConfig(cfg), []);
  assert.equal(E.migrateConfig({ ...old, hoursPerDay: undefined }).workEndTime, "17:00");
});

test("sekundy pracy do emerytury uwzględniają porę dnia", () => {
  const cfg = { birthDate: "1980-01-01", workStartDate: "2000-01-01", gender: "M", retirementAge: 65, workStartTime: "09:00", workEndTime: "17:00", workDays: [1, 2, 3, 4, 5], vacationDays: 0 };
  const monday = d("2026-09-28"); // poniedziałek, dzień roboczy
  const r = E.compute(cfg, monday);
  const full = r.workingDaysLeft * 8 * 3600;
  assert.equal(r.workingHoursLeft, r.workingDaysLeft * 8);
  assert.equal(E.workingSecondsLeft(r, monday, 8 * 3600), full);                 // przed pracą
  assert.equal(E.workingSecondsLeft(r, monday, 13 * 3600 + 30), full - 4 * 3600 - 30); // w trakcie
  assert.equal(E.workingSecondsLeft(r, monday, 18 * 3600), full - 8 * 3600);     // po pracy
  const sunday = d("2026-09-27");
  const rs = E.compute(cfg, sunday);
  assert.equal(E.workingSecondsLeft(rs, sunday, 12 * 3600), rs.workingDaysLeft * 8 * 3600);
});

const base = { birthDate: "1980-01-01", workStartDate: "2000-01-01", gender: "M", retirementAge: 65,
  workStartTime: "09:00", workEndTime: "17:00", workDays: [1, 2, 3, 4, 5], vacationDays: 0 };

test("walidacja dni pracy i urlopu", () => {
  assert.equal(E.validateConfig({ ...base, workDays: [] }).length, 1);
  assert.equal(E.validateConfig({ ...base, workDays: [1, 1] }).length, 1);
  assert.equal(E.validateConfig({ ...base, workDays: [7] }).length, 1);
  assert.equal(E.validateConfig({ ...base, vacationDays: -1 }).length, 1);
  assert.equal(E.validateConfig({ ...base, vacationDays: 300 }).length, 1);
  assert.deepEqual(E.validateConfig({ ...base, workDays: [6], vacationDays: 5 }), []);
});

test("konfigurowalne dni pracy", () => {
  const monday = d("2026-09-28");
  const sunday = d("2026-10-04");
  // tydzień 28.09–04.10.2026 nie ma świąt
  assert.equal(E.countWorkingDays(monday, sunday), 5);
  assert.equal(E.countWorkingDays(monday, sunday, [1, 2, 3, 4]), 4);
  assert.equal(E.countWorkingDays(monday, sunday, [0, 6]), 2);
  assert.equal(E.isWorkingDay(d("2026-12-25"), [0, 1, 2, 3, 4, 5, 6]), false); // święto
});

test("urlop zmniejsza dni i czas pracy proporcjonalnie", () => {
  const today = d("2026-09-28");
  const r0 = E.compute(base, today);
  const r26 = E.compute({ ...base, vacationDays: 26 }, today);
  const f = E.workFactor([1, 2, 3, 4, 5], 26);
  assert.ok(f > 0.89 && f < 0.9);
  assert.equal(r26.calendarWorkingDaysLeft, r0.workingDaysLeft);
  assert.equal(r26.workingDaysLeft, Math.round(r0.workingDaysLeft * f));
  assert.equal(r26.vacationDaysLeft, r0.workingDaysLeft - r26.workingDaysLeft);
  // licznik przed pracą = dni po urlopie × 8 h (z dokładnością do zaokrąglenia dni)
  const secs = E.workingSecondsLeft(r26, today, 8 * 3600);
  assert.ok(Math.abs(secs - r26.workingDaysLeft * 8 * 3600) <= 8 * 3600);
  // licznik nie skacze o północy: koniec pracy w pn == początek wt
  const tue = E.compute({ ...base, vacationDays: 26 }, today + 1);
  assert.equal(E.workingSecondsLeft(r26, today, 23 * 3600), E.workingSecondsLeft(tue, today + 1, 0));
});

test("kamienie milowe", () => {
  const today = d("2026-09-28");
  const r = E.compute(base, today);
  const ms = E.milestones(base, r, today);
  assert.ok(ms.length > 0);
  for (let i = 1; i < ms.length; i++) assert.ok(ms[i].date >= ms[i - 1].date);
  assert.ok(ms.every((m) => m.date >= today && m.date < r.retirementDate));
  const days1000 = ms.find((m) => m.kind === "daysLeft" && m.value === 1000);
  assert.equal(days1000.date, r.retirementDate - 1000);
  const p90 = ms.find((m) => m.kind === "percent" && m.value === 90);
  assert.equal(p90.date, d("2000-01-01") + Math.ceil(0.9 * r.totalWorkDays));
  // w dniu kamienia „N dni roboczych” licznik pokazuje ≤ N, dzień wcześniej > N
  const wd = ms.find((m) => m.kind === "workingDays" && m.value === 1000);
  assert.ok(E.compute(base, wd.date).workingDaysLeft <= 1000);
  assert.ok(E.compute(base, wd.date - 1).workingDaysLeft > 1000);
});

test("statystyki „ile jeszcze”", () => {
  // emerytura 2027-01-01 → zakres 21.12 (pn) – 31.12.2026 (czw)
  // 24.12 (czw) Wigilia, 25.12 (pt) i 26.12 (sb) Boże Narodzenie
  const cfg = { ...base, birthDate: "1962-01-01" };
  const s = E.remainingStats(E.compute(cfg, d("2026-12-21")), d("2026-12-21"));
  assert.equal(s.mondays, 2);        // 21.12, 28.12
  assert.equal(s.fridays, 0);        // jedyny piątek (25.12) to święto
  assert.equal(s.weekends, 1);       // 26–27.12
  assert.equal(s.holidays, 2);       // 24.12, 25.12 (26.12 wypada w sobotę)
  assert.equal(s.longWeekends, 1);   // 24–27.12 (4 dni wolne)
});
