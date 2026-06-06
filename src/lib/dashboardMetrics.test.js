import { describe, it, expect } from 'vitest';
import { periodRange, prevPeriodRange } from './dashboardMetrics.js';

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
