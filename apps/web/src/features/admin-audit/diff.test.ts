import { describe, expect, it } from 'vitest';
import { buildAuditDiff, flattenAuditJson } from './diff';

describe('flattenAuditJson', () => {
  it('làm phẳng object lồng nhau theo dấu chấm', () => {
    const map = flattenAuditJson({ price: '250000', quota: { maxVehicles: 3, maxMembers: null } });
    expect([...map.entries()]).toEqual([
      ['price', '250000'],
      ['quota.maxVehicles', 3],
      ['quota.maxMembers', null],
    ]);
  });

  it('mảng giá trị đơn là MỘT lá; mảng object đánh chỉ số', () => {
    const map = flattenAuditJson({
      tags: ['a', 'b'],
      lines: [{ amount: '1' }, { amount: '2' }],
    });
    expect(map.get('tags')).toEqual(['a', 'b']);
    expect(map.get('lines.0.amount')).toBe('1');
    expect(map.get('lines.1.amount')).toBe('2');
  });

  it('object rỗng và giá trị đơn vẫn có một lá', () => {
    expect([...flattenAuditJson({ quota: {} }).keys()]).toEqual(['quota']);
    expect([...flattenAuditJson('active').entries()]).toEqual([['value', 'active']]);
  });
});

describe('buildAuditDiff', () => {
  it('không có snapshot nào → none', () => {
    expect(buildAuditDiff(null, null)).toEqual({ kind: 'none', rows: [] });
    expect(buildAuditDiff(undefined, null).kind).toBe('none');
  });

  it('chỉ có after → created, mọi hàng đều "đổi"', () => {
    const diff = buildAuditDiff(null, { planCode: 'shop-basic', termMonths: 3 });
    expect(diff.kind).toBe('created');
    expect(diff.rows).toEqual([
      { path: 'planCode', before: undefined, after: 'shop-basic', changed: true },
      { path: 'termMonths', before: undefined, after: 3, changed: true },
    ]);
  });

  it('chỉ có before → removed', () => {
    const diff = buildAuditDiff({ status: 'active' }, null);
    expect(diff.kind).toBe('removed');
    expect(diff.rows[0]).toEqual({ path: 'status', before: 'active', after: undefined, changed: true });
  });

  it('cả hai → updated, đánh dấu đúng hàng đổi, giữ thứ tự before rồi nối trường mới', () => {
    const diff = buildAuditDiff(
      { status: 'active', price: '250000', note: null },
      { status: 'cancelled', price: '250000', reason: 'x' },
    );
    expect(diff.kind).toBe('updated');
    expect(diff.rows.map((r) => [r.path, r.changed])).toEqual([
      ['status', true],
      ['price', false],
      ['note', true],
      ['reason', true],
    ]);
  });

  it('mảng so theo cấu trúc; thiếu khác null', () => {
    const same = buildAuditDiff({ tags: ['a'] }, { tags: ['a'] });
    expect(same.rows[0]!.changed).toBe(false);
    const nullVsMissing = buildAuditDiff({ note: null }, {});
    expect(nullVsMissing.rows[0]!.changed).toBe(true);
  });
});
