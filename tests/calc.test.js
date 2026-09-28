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
    hoursPerDay: 8,
  };
  const r = E.compute(cfg, d("2026-09-28"));
  assert.equal(E.formatISODate(r.retirementDate), "2045-01-01");
  assert.equal(r.retired, false);
  assert.equal(r.daysLeft, d("2045-01-01") - d("2026-09-28"));
  assert.equal(r.workingDaysLeft, E.countWorkingDays(d("2026-09-28"), d("2045-01-01")));
  assert.equal(r.workingHoursLeft, r.workingDaysLeft * 8);
  assert.equal(r.daysWorked, d("2026-09-28") - d("2000-01-01"));
  const total = d("2045-01-01") - d("2000-01-01");
  assert.ok(Math.abs(r.workPercent - (r.daysWorked / total) * 100) < 1e-9);
});

test("compute — już na emeryturze", () => {
  const cfg = { birthDate: "1950-05-05", workStartDate: "1970-01-01", gender: "K", retirementAge: 60, hoursPerDay: 8 };
  const r = E.compute(cfg, d("2026-09-28"));
  assert.equal(r.retired, true);
  assert.equal(r.workPercent, 100);
  assert.equal(r.workingDaysLeft, 0);
});

test("walidacja konfiguracji", () => {
  const ok = { birthDate: "1980-01-01", workStartDate: "2000-01-01", gender: "M", retirementAge: 65, hoursPerDay: 8 };
  assert.deepEqual(E.validateConfig(ok), []);
  assert.equal(E.validateConfig({ ...ok, workStartDate: "1970-01-01" }).length, 1);
  assert.equal(E.validateConfig({ ...ok, retirementAge: "abc" }).length, 1);
  assert.equal(E.validateConfig({ ...ok, gender: "X" }).length, 1);
});
