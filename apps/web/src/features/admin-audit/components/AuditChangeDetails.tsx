'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  AUDIT_TARGET_TYPE,
  BILLING_MODE,
  STATUS_COLOR,
  SUBSCRIPTION_AUDIT_ACTION,
  SUBSCRIPTION_STATUS,
  subscriptionAssignKindOfAction,
} from '@xeprime/types';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { buildAuditDiff, type AuditChange } from '../diff';
import { useAuditLabels } from '../hooks/use-audit-labels';
import { useAuditValueFormatter } from '../hooks/use-audit-value-format';
import type { AuditLogDetail } from '../types';
import { AuditChangeTable } from './AuditChangeTable';
import styles from './AuditLogDetailDrawer.module.css';

/** Trường dài — chiếm trọn hàng và giữ xuống dòng của người gõ. */
const WIDE_FIELDS = new Set(['note', 'reason', 'description', 'lockReason', 'title']);

/**
 * Phần "Nội dung" của một dòng nhật ký — chọn cách kể theo LOẠI thay đổi:
 *
 *  - Sự kiện gói dịch vụ: kể bằng ngôn ngữ hợp đồng (gói nào, hiệu lực từ–đến, giá theo bảng hay
 *    đàm phán, nối sau kỳ nào) — đây là câu hỏi người vận hành mang tới trang này nhiều nhất.
 *  - Tạo mới / gỡ bỏ: lưới thông tin đã ghi, có nhãn và định dạng, không có tên khoá kỹ thuật.
 *  - Sửa: bảng Trước · Sau, mặc định chỉ trường đổi.
 *  - Không ghi dữ liệu: nói rõ như vậy.
 */
export function AuditChangeDetails({ log }: { log: AuditLogDetail }) {
  const t = useTranslations('AdminAudit.detail.changes');
  const diff = useMemo(() => buildAuditDiff(log.beforeJson, log.afterJson), [log]);

  if (log.targetType === AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION && hasSubscriptionPayload(log)) {
    return <SubscriptionDetails log={log} />;
  }

  switch (diff.kind) {
    case 'none':
      return <p className={styles.note}>{t('none')}</p>;
    case 'created':
      return (
        <div className={styles.stack}>
          <p className={styles.note}>{t('created')}</p>
          <SnapshotFacts targetType={log.targetType} rows={diff.rows} side="after" />
        </div>
      );
    case 'removed':
      return (
        <div className={styles.stack}>
          <p className={styles.note}>{t('removed')}</p>
          <SnapshotFacts targetType={log.targetType} rows={diff.rows} side="before" />
        </div>
      );
    case 'updated':
      return <AuditChangeTable key={log.id} targetType={log.targetType} rows={diff.rows} />;
  }
}

/** Lưới nhãn–giá trị của MỘT bên snapshot — lượt tạo mới hoặc lượt gỡ bỏ. */
function SnapshotFacts({
  targetType,
  rows,
  side,
}: {
  targetType: string;
  rows: readonly AuditChange[];
  side: 'before' | 'after';
}) {
  const labels = useAuditLabels();
  const format = useAuditValueFormatter(targetType);
  const items: WorkDrawerFact[] = rows.map((row) => {
    const leaf = row.path.slice(row.path.lastIndexOf('.') + 1);
    const label = labels.field(row.path);
    return {
      key: row.path,
      label: label === row.path ? <span className={styles.path}>{label}</span> : label,
      value: format(row.path, row[side]),
      wide: WIDE_FIELDS.has(leaf),
      multiline: WIDE_FIELDS.has(leaf),
    };
  });
  return <WorkDrawerFacts items={items} />;
}

/* ───────────────────────────── Sự kiện gói dịch vụ ───────────────────────────── */

type Json = Record<string, unknown>;

/** Ba trần trong snapshot hạn mức → khoá câu chữ. */
const QUOTA_PARTS = [
  ['maxVehicles', 'vehicles'],
  ['maxBranches', 'branches'],
  ['maxMembers', 'members'],
] as const;

const asRecord = (value: unknown): Json | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : null;

/** Có đủ dữ liệu để kể theo ngôn ngữ hợp đồng không — dòng cũ/lạ rơi về cách kể chung. */
function hasSubscriptionPayload(log: AuditLogDetail): boolean {
  const after = asRecord(log.afterJson);
  const before = asRecord(log.beforeJson);
  return Boolean(
    (after && asString(after.startsAt)) || asRecord(after?.term) || asRecord(before?.term),
  );
}

function SubscriptionDetails({ log }: { log: AuditLogDetail }) {
  const t = useTranslations('AdminAudit.detail.subscription');
  const tPlan = useTranslations('AdminAudit.detail.values');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const after = asRecord(log.afterJson) ?? {};
  const before = asRecord(log.beforeJson) ?? {};
  const period = (from: unknown, to: unknown) =>
    asString(from) && asString(to)
      ? t('period', { from: fmt.date(asString(from)), to: fmt.date(asString(to)) })
      : null;
  const termText = (term: Json | null) =>
    term
      ? [asString(term.planName) ?? asString(term.planCode), period(term.startsAt, term.endsAt)]
          .filter(Boolean)
          .join(LIST_SEPARATOR)
      : null;

  /* ── Huỷ một kỳ ── */
  if (log.action === SUBSCRIPTION_AUDIT_ACTION.CANCEL) {
    const term = asRecord(after.term) ?? asRecord(before.term);
    const planName = asString(term?.planName) ?? log.targetLabel ?? '';
    const reason = asString(after.reason);
    const fallback = asRecord(after.fallbackTerm);
    const items: WorkDrawerFact[] = [
      { key: 'plan', label: t('cancelledTerm'), value: <strong>{planName}</strong> },
      { key: 'period', label: t('validity'), value: period(term?.startsAt, term?.endsAt) ?? '—' },
      {
        key: 'status',
        label: t('status'),
        value: t('statusChange', {
          from: domainLabel('subscriptionStatus', SUBSCRIPTION_STATUS.ACTIVE),
          to: domainLabel('subscriptionStatus', SUBSCRIPTION_STATUS.CANCELLED),
        }),
      },
      ...(reason
        ? [
            {
              key: 'reason',
              label: t('reason'),
              value: domainLabel('subscriptionCancelReason', reason),
            },
          ]
        : []),
      // Huỷ kỳ CUỐI CÙNG: hệ thống gán lại tuyến hoa hồng mặc định trong cùng transaction.
      ...(fallback
        ? [
            {
              key: 'fallback',
              label: t('fallbackTerm'),
              value: termText(fallback) ?? '—',
              wide: true,
            },
          ]
        : []),
    ];
    return (
      <div className={styles.stack}>
        <p className={styles.summary}>{t('summary.cancel', { plan: planName })}</p>
        <WorkDrawerFacts items={items} />
      </div>
    );
  }

  /* ── Gán / gia hạn / đổi gói / kích hoạt ── */
  const planName =
    asString(after.planName) ?? log.targetLabel ?? asString(after.planCode) ?? t('unknownPlan');
  const months = asNumber(after.termMonths);
  const price = asString(after.price);
  const listed = asString(after.listedPrice);
  const overridden = after.priceOverridden === true;
  const quota = asRecord(after.quota);
  const billingMode = asString(after.billingMode);
  const commission = asString(after.commissionPercent);
  const previous = asRecord(after.previousTerm);
  const replaced = Array.isArray(after.replacedTerms)
    ? after.replacedTerms.map(asRecord).filter((term): term is Json => term !== null)
    : [];
  const note = asString(after.note);
  const providerTx = asString(after.providerTxId);
  const starts = asString(after.startsAt);

  const quotaText = quota
    ? QUOTA_PARTS.filter(([key]) => key in quota)
        .map(([key, unit]) =>
          // `null` = KHÔNG GIỚI HẠN (ADR 0041 điều 3), không phải "chưa khai".
          quota[key] === null
            ? t(`quota.${unit}Unlimited`)
            : t(`quota.${unit}`, { count: Number(quota[key]) }),
        )
        .join(LIST_SEPARATOR)
    : null;

  let priceValue: ReactNode = price ? fmt.money(price) : '—';
  if (price && overridden) {
    priceValue = (
      <span className={styles.inline}>
        {fmt.money(price)}
        <Tag color={STATUS_COLOR.WARNING}>{t('negotiated')}</Tag>
        {listed ? <span className={styles.muted}>{t('listedWas', { amount: fmt.money(listed) })}</span> : null}
      </span>
    );
  } else if (price && listed) {
    priceValue = (
      <span className={styles.inline}>
        {fmt.money(price)}
        <Tag>{t('listPrice')}</Tag>
      </span>
    );
  }

  const items: WorkDrawerFact[] = [
    { key: 'plan', label: t('plan'), value: <strong>{planName}</strong> },
    { key: 'period', label: t('validity'), value: period(after.startsAt, after.endsAt) ?? '—' },
    ...(months !== null
      ? [{ key: 'term', label: t('term'), value: t('months', { count: months }) }]
      : []),
    { key: 'price', label: t('price'), value: priceValue },
    ...(quotaText ? [{ key: 'quota', label: t('quotaLabel'), value: quotaText }] : []),
    ...(billingMode
      ? [
          {
            key: 'mode',
            label: t('billingMode'),
            value:
              billingMode === BILLING_MODE.COMMISSION && commission
                ? `${domainLabel('billingMode', billingMode)}${LIST_SEPARATOR}${tPlan('percent', { value: commission })}`
                : domainLabel('billingMode', billingMode),
          },
        ]
      : []),
    ...(previous
      ? [{ key: 'previous', label: t('previousTerm'), value: termText(previous) ?? '—', wide: true }]
      : []),
    ...(replaced.length > 0
      ? [
          {
            key: 'replaced',
            label: t('replacedTerms'),
            value: replaced.map((term) => termText(term)).join('\n'),
            wide: true,
            multiline: true,
          },
        ]
      : []),
    ...(providerTx ? [{ key: 'tx', label: t('providerTx'), value: providerTx }] : []),
    ...(note ? [{ key: 'note', label: t('note'), value: note, wide: true, multiline: true }] : []),
  ];

  // Câu tóm tắt đọc ĐƯỜNG GÁN từ chính bảng quyết định server ghi (`SUBSCRIPTION_ASSIGN_KIND_ACTION`).
  const summaryKey =
    log.action === SUBSCRIPTION_AUDIT_ACTION.ACTIVATE_FROM_PAYMENT
      ? 'activate'
      : subscriptionAssignKindOfAction(log.action);

  return (
    <div className={styles.stack}>
      {summaryKey ? (
        <p className={styles.summary}>
          {t(`summary.${summaryKey}`, {
            plan: planName,
            previous: asString(previous?.planName) ?? '',
            current: asString(previous?.planName) ?? '',
            date: starts ? fmt.date(starts) : '',
            count: replaced.length,
          })}
        </p>
      ) : null}
      <WorkDrawerFacts items={items} />
    </div>
  );
}
