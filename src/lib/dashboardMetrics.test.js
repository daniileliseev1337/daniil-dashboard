import { describe, it, expect } from 'vitest';
import { periodRange, prevPeriodRange, inPeriod, periodBalance, trendDir } from './dashboardMetrics.js';

const NOW = new Date('2026-06-06T12:00:00');

describe('periodRange', () => {
  it('месяц = текущий календарный месяц', () => {
    expect(periodRange('month', NOW)).toEqual({ from: '2026-06-01', to: '2026-07-01' });
  });
  it('квартал = текущий квартал (Q2 для июня)', () => {
    expect(periodRange('quarter', NOW)).toEqual({ from: '2026-04-01', to: '2026-07-01' });
  });
  it('год = текущий календарный год', () => {
    expect(periodRange('year', NOW)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
  });
  it('всё = признак all + широкие границы', () => {
    expect(periodRange('all', NOW)).toEqual({ from: '0000-01-01', to: '9999-12-31', all: true });
  });
});

describe('prevPeriodRange', () => {
  it('предыдущий месяц', () => {
    expect(prevPeriodRange('month', NOW)).toEqual({ from: '2026-05-01', to: '2026-06-01' });
  });
  it('предыдущий год', () => {
    expect(prevPeriodRange('year', NOW)).toEqual({ from: '2025-01-01', to: '2026-01-01' });
  });
  it('для "всё" предыдущего периода нет', () => {
    expect(prevPeriodRange('all', NOW)).toBeNull();
  });
});

const TXS = [
  { date: '2026-06-10', type: 'income',  amount: 100 },
  { date: '2026-06-15', type: 'expense', amount: 30 },
  { date: '2026-05-01', type: 'income',  amount: 999 }, // вне июня
];

describe('inPeriod', () => {
  const r = { from: '2026-06-01', to: '2026-07-01' };
  it('включает дату внутри [from,to)', () => expect(inPeriod('2026-06-10', r)).toBe(true));
  it('исключает дату до from', () => expect(inPeriod('2026-05-31', r)).toBe(false));
  it('исключает дату == to (правая граница открыта)', () => expect(inPeriod('2026-07-01', r)).toBe(false));
  it('для all включает всё', () => expect(inPeriod('1999-01-01', { from:'0000-01-01', to:'9999-12-31', all:true })).toBe(true));
});

describe('periodBalance', () => {
  it('считает доход/расход/баланс за период', () => {
    expect(periodBalance(TXS, { from: '2026-06-01', to: '2026-07-01' }))
      .toEqual({ income: 100, expense: 30, balance: 70 });
  });
});

describe('trendDir', () => {
  it('up когда текущий больше прошлого', () => expect(trendDir(70, 50)).toBe('up'));
  it('down когда текущий меньше прошлого', () => expect(trendDir(40, 50)).toBe('down'));
  it('null когда прошлый период недоступен', () => expect(trendDir(70, null)).toBeNull());
});
