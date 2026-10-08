import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { AUDIT_TARGET_TYPE_VALUES, SUBSCRIPTION_AUDIT_ACTION } from '@xeprime/types';

import enMessages from '../../../messages/en';
import viMessages from '../../../messages/vi';
import { createDomainLabel } from '@/i18n/domain';
import { auditValueGroup, createAuditLabels, shortAuditId } from './labels';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** Hai nơi GHI nhật ký: API và worker theo đồng hồ. */
const AUDIT_WRITERS = ['apps/api/src', 'apps/worker/src'];

/** `action: 'x.y'` và `auditAction: 'x.y'` — hai hình thái mã hành động xuất hiện trong lời gọi `audit.record`. */
const ACTION_LITERAL = /(?:action|auditAction):\s*'([a-z_]+(?:\.[a-z_]+)+)'/g;

/** Mã khai qua hằng số thay vì literal tại chỗ gọi — thêm vào đây khi backend thêm hằng mới. */
const ACTIONS_BEHIND_CONSTANTS = [
  'vehicle.platform_hide',
  'vehicle.platform_unhide',
  'promo_code.enable',
  'promo_code.disable',
  // Vòng đời thuê bao ghi bằng hằng số dùng chung — đọc thẳng từ đó, không chép tay.
  ...Object.values(SUBSCRIPTION_AUDIT_ACTION),
];

function labelsFor(locale: 'vi' | 'en') {
  const messages = (locale === 'vi' ? viMessages : enMessages) as typeof viMessages;
  const t = createTranslator({ locale, messages, namespace: 'Domain' });
  return createAuditLabels(messages.Domain, createDomainLabel(t as never));
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkTs(full);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) yield full;
  }
}

function backendActionCodes(): string[] {
  const codes = new Set<string>(ACTIONS_BEHIND_CONSTANTS);
  for (const root of AUDIT_WRITERS) {
    for (const file of walkTs(path.join(REPO_ROOT, root))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(ACTION_LITERAL)) codes.add(match[1]!);
    }
  }
  return [...codes].sort();
}

describe('createAuditLabels — nhãn hành động', () => {
  const vi = labelsFor('vi');
  const en = labelsFor('en');

  it('mọi mã hành động backend ghi đều có nhãn đầy đủ ở cả hai ngôn ngữ', () => {
    const codes = backendActionCodes();
    expect(codes.length).toBeGreaterThan(100);
    const missing = codes.filter(
      (code) => !vi.actionCodes.includes(code) || !en.actionCodes.includes(code),
    );
    // Thêm nhãn ở `Domain.auditAction` (vi + en) — xem `labels.ts`.
    expect(missing).toEqual([]);
  });

  it('dịch mã quen thuộc của luồng gói', () => {
    expect(vi.action('subscription.assign')).toBe('Gán gói dịch vụ');
    expect(vi.action('subscription.renew')).toBe('Gia hạn gói dịch vụ');
    expect(vi.action('subscription.schedule_change')).toBe('Đổi gói từ kỳ sau');
    expect(vi.action('subscription.change_now')).toBe('Đổi gói ngay');
    expect(en.action('subscription.renew')).toBe('Renew subscription');
    expect(vi.action('vehicle.document.ocr.apply')).toBe('Áp kết quả OCR giấy tờ xe');
  });

  it('mã chưa có nhãn đầy đủ rơi về "Nhóm · Động từ", rồi về mã thô', () => {
    expect(vi.action('booking.archive')).toBe('Đơn thuê · Lưu trữ');
    expect(vi.action('vehicle.document.frobnicate')).toBe('vehicle.document.frobnicate');
  });

  it('một mã trùng tên NHÁNH không làm nổ (không gọi t() trên một nhóm)', () => {
    // `vehicle.document` chỉ là một NHÁNH của cây nhãn; không có động từ "document" → mã thô.
    expect(vi.action('vehicle.document')).toBe('vehicle.document');
    expect(vi.action('subscription')).toBe('subscription');
  });

  it('danh sách mã của hai ngôn ngữ trùng nhau', () => {
    expect([...vi.actionCodes].sort()).toEqual([...en.actionCodes].sort());
    expect([...vi.targetTypeCodes].sort()).toEqual([...en.targetTypeCodes].sort());
  });
});

describe('createAuditLabels — đối tượng và trường', () => {
  const vi = labelsFor('vi');

  it('dịch loại đối tượng, mã lạ thì bỏ gạch dưới', () => {
    expect(vi.targetType('tenant_subscription')).toBe('Gói dịch vụ');
    expect(vi.targetType('some_new_thing')).toBe('some new thing');
  });

  it('trường lồng nhau tra theo đường dẫn, phần tử mảng tra theo lá', () => {
    expect(vi.field('quota.maxVehicles')).toBe('Trần số xe');
    expect(vi.field('lines.0.amount')).toBe('Số tiền');
    expect(vi.field('unknownField')).toBe('unknownField');
  });

  it('mọi mã trong AUDIT_TARGET_TYPE dùng chung đều có nhãn ở cả hai ngôn ngữ', () => {
    const en = labelsFor('en');
    const missing = AUDIT_TARGET_TYPE_VALUES.filter(
      (code) => !vi.targetTypeCodes.includes(code) || !en.targetTypeCodes.includes(code),
    );
    expect(missing).toEqual([]);
  });

  it('mọi loại đối tượng backend ghi đều có nhãn', () => {
    const codes = new Set<string>();
    for (const root of AUDIT_WRITERS) {
      for (const file of walkTs(path.join(REPO_ROOT, root))) {
        for (const match of readFileSync(file, 'utf8').matchAll(/targetType:\s*'([a-z_]+)'/g)) {
          codes.add(match[1]!);
        }
      }
    }
    // `asc` là một `orderBy` lọt vào regex, không phải loại đối tượng.
    codes.delete('asc');
    const missing = [...codes].filter((code) => !vi.targetTypeCodes.includes(code));
    expect(missing).toEqual([]);
  });
});

describe('auditValueGroup', () => {
  it('status dịch theo loại đối tượng', () => {
    expect(auditValueGroup('tenant_subscription', 'status')).toBe('subscriptionStatus');
    expect(auditValueGroup('booking', 'toStatus')).toBe('bookingStatus');
    expect(auditValueGroup('unknown_target', 'status')).toBeNull();
  });

  it('trường có từ vựng riêng không phụ thuộc đối tượng', () => {
    expect(auditValueGroup('tenant_subscription', 'billingMode')).toBe('billingMode');
    expect(auditValueGroup('platform_membership', 'role')).toBe('platformRole');
    expect(auditValueGroup('tenant_membership', 'role')).toBe('tenantRole');
    expect(auditValueGroup('tenant_subscription', 'price')).toBeNull();
    // `reason` là MÃ ở lượt huỷ kỳ gói, là chữ người gõ ở chỗ khác.
    expect(auditValueGroup('tenant_subscription', 'reason')).toBe('subscriptionCancelReason');
    expect(auditValueGroup('tenant', 'reason')).toBeNull();
  });
});

describe('shortAuditId', () => {
  it('rút ULID về đuôi 8 ký tự, giữ nguyên mã ngắn', () => {
    expect(shortAuditId('01M4CX5DY5HJ4RGRVXR3APM5GC')).toBe('…R3APM5GC');
    expect(shortAuditId('T-001')).toBe('T-001');
  });
});
