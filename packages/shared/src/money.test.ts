import { describe, expect, it } from 'vitest';
import { formatBRL, toCents } from './money';
import { isInQuietHours } from './dates';

describe('toCents', () => {
  it('converte floats sem erro de ponto flutuante', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(-45.9)).toBe(-4590);
    expect(toCents(1234567.89)).toBe(123456789);
  });

  it('aceita strings nos formatos internacional e brasileiro', () => {
    expect(toCents('12.34')).toBe(1234);
    expect(toCents('1.234,56')).toBe(123456);
    expect(toCents('-0,5')).toBe(-50);
    expect(toCents('.75')).toBe(75);
  });

  it('trata notação exponencial e zero negativo', () => {
    expect(toCents(1e-7)).toBe(0);
    expect(toCents(-0.001)).toBe(0);
  });

  it('rejeita entradas inválidas', () => {
    expect(() => toCents('abc')).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
    expect(() => toCents('')).toThrow();
  });
});

describe('formatBRL', () => {
  it('formata em pt-BR', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatBRL(-990).replace(/\s/g, ' ')).toBe('-R$ 9,90');
  });
});

describe('isInQuietHours', () => {
  // 23:30 em São Paulo (UTC-3) = 02:30 UTC
  const lateNight = new Date('2026-10-30T02:30:00Z');
  const noon = new Date('2026-10-30T15:00:00Z');

  it('janela que atravessa a meia-noite', () => {
    expect(isInQuietHours(lateNight, '22:00', '07:00')).toBe(true);
    expect(isInQuietHours(noon, '22:00', '07:00')).toBe(false);
  });

  it('janela no mesmo dia e desativada', () => {
    expect(isInQuietHours(noon, '11:00', '13:00')).toBe(true);
    expect(isInQuietHours(noon, null, null)).toBe(false);
  });
});
