'use client';

import { App, Alert, Button, Checkbox, Descriptions, Input, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_META,
  SUPPORT_CASE_STATUS_VALUES,
  SUPPORT_EVENT_VISIBILITY,
  TRIP_VERDICT,
  canTransitionSupportCase,
  isTripVerdict,
  type SupportCaseCategory,
  type SupportCaseStatus,
  type TripVerdict,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useCanWriteSupportCase,
  usePostSupportMessage,
  useResolveSupportCase,
  useSupportCase,
  useTransitionSupportCase,
  useTripVerdict,
  useTripVerdictPreview,
} from '../hooks/use-support-cases';
import { SUPPORT_SURFACE, type SupportSurface, type TripVerdictMoney } from '../types';
import styles from './SupportCaseDetailPanel.module.css';

/** Kết luận khép chuyến lại theo hướng có người chịu thiệt — nút và hộp xác nhận màu nguy hiểm. */
const NEGATIVE_VERDICTS: ReadonlySet<TripVerdict> = new Set([
  TRIP_VERDICT.CUSTOMER_NO_SHOW,
  TRIP_VERDICT.HOST_NOT_DELIVERED,
  TRIP_VERDICT.PLATFORM_CANCELLED,
]);

/**
 * Chi tiết một case + dòng thời gian append-only.
 *
 * Ghi chú NỘI BỘ chỉ nền tảng thấy — nhưng chúng nằm trong CÙNG một dòng thời gian, không phải
 * một sổ thứ hai; server đã lọc trước khi trả, client chỉ đánh dấu để người viết biết ai đọc được.
 */
export function SupportCaseDetailPanel({
  surface,
  id,
}: {
  surface: SupportSurface;
  id: string | null;
}) {
  const t = useTranslations('SupportCases');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const detail = useSupportCase(surface, id);
  const post = usePostSupportMessage(surface);
  const transition = useTransitionSupportCase(surface);
  const resolve = useResolveSupportCase();
  const tripVerdict = useTripVerdict();

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState('');
  /** Kết luận đang mở hộp xác nhận — gắn với id case, nên đổi case không mang lựa chọn theo. */
  const [pendingVerdict, setPendingVerdict] = useState<{
    caseId: string;
    verdict: TripVerdict;
  } | null>(null);

  const isPlatform = surface === SUPPORT_SURFACE.PLATFORM;
  const canWrite = useCanWriteSupportCase(surface);
  const row = detail.data;
  const openVerdict =
    pendingVerdict && pendingVerdict.caseId === id ? pendingVerdict.verdict : null;
  // Tiền của kết luận chỉ xin khi hộp xác nhận mở — cùng phép tính lượt thật (ADR 0095 điều 3).
  const verdictPreview = useTripVerdictPreview(isPlatform && openVerdict ? id : null);

  if (!id) return <div className={styles.placeholder}>{t('detail.pickOne')}</div>;
  if (detail.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (detail.isError || !row) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('detail.loadError')}
        action={
          <Button size="small" onClick={() => void detail.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    );
  }

  const status = row.status as SupportCaseStatus;
  const closed = status === SUPPORT_CASE_STATUS.CLOSED;

  function sendMessage() {
    if (!id || !body.trim()) return;
    post.mutate(
      { id, body: body.trim(), ...(isPlatform && internal ? { internal: 'true' } : {}) },
      {
        onSuccess: () => {
          setBody('');
          setInternal(false);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function changeStatus(next: SupportCaseStatus) {
    if (!id) return;
    transition.mutate(
      { id, status: next, note: null },
      { onError: (err) => message.error(errorMessage(err)) },
    );
  }

  function submitResolution() {
    if (!id || resolution.trim().length < 5) {
      message.error(t('detail.resolutionRequired'));
      return;
    }
    resolve.mutate(
      { id, resolution: resolution.trim() },
      {
        onSuccess: () => {
          setResolution('');
          message.success(t('detail.resolveSuccess'));
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function submitVerdict(note: string) {
    if (!id || !pendingVerdict || tripVerdict.isPending) return;
    tripVerdict.mutate(
      { id, verdict: pendingVerdict.verdict, note: note.trim() },
      {
        onSuccess: () => {
          setPendingVerdict(null);
          message.success(t('detail.verdict.success'));
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  // Case GIỮ tiền của chuyến (tranh chấp, chưa xác nhận bàn giao) chỉ nền tảng đóng/kết luận —
  // server từ chối `SUPPORT_CASE_PLATFORM_RESOLVE_ONLY`, nên bên còn lại không thấy nút nào.
  const platformResolveOnly = SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES.includes(
    row.category as SupportCaseCategory,
  );
  /*
   * Case xác minh bàn giao mà đơn còn treo (ADR 0094): server trả các kết luận CHUYẾN dùng được và
   * chặn kết luận/đóng trần (`SUPPORT_CASE_TRIP_VERDICT_REQUIRED`) — nên ở đây ẩn hai nút đó, chỉ
   * còn các nút kết luận chuyến. Tranh chấp trước giờ nhận (ADR 0095) có kết luận nhưng KHÔNG bắt
   * buộc (`tripVerdictRequired = false`): giữ cả ô kết luận trần.
   */
  const verdicts = isPlatform ? (row.tripVerdicts ?? []).filter(isTripVerdict) : [];
  const verdictPending = verdicts.length > 0;
  const verdictRequired = isPlatform && row.tripVerdictRequired === true;
  const verdictMoney = openVerdict
    ? verdictPreview.data?.items.find((item) => item.verdict === openVerdict)
    : undefined;

  /** Câu tiền của kết luận đang mở: ai nhận bao nhiêu, theo đúng con số lượt bấm sẽ ghi. */
  function moneySummary(verdict: TripVerdict, money: TripVerdictMoney | undefined): string {
    if (verdictPreview.isLoading) return t('detail.verdict.money.loading');
    if (verdictPreview.isError) return t('detail.verdict.money.loadError');
    if (!money || money.outcome == null) {
      return verdict === TRIP_VERDICT.HANDED_OVER
        ? t('detail.verdict.money.later')
        : t('detail.verdict.money.noHold');
    }
    const parts = [
      t('detail.verdict.money.customer', { amount: fmt.money(money.customerAmount) }),
      t('detail.verdict.money.owner', { amount: fmt.money(money.ownerAmount) }),
      t('detail.verdict.money.platform', { amount: fmt.money(money.platformAmount) }),
    ];
    if (Number(money.insurerAmount) > 0) {
      parts.push(t('detail.verdict.money.insurer', { amount: fmt.money(money.insurerAmount) }));
    }
    if (Number(money.taxAmount) > 0) {
      parts.push(t('detail.verdict.money.tax', { amount: fmt.money(money.taxAmount) }));
    }
    const line = parts.join(LIST_SEPARATOR);
    return money.deferred ? `${line}. ${t('detail.verdict.money.deferred')}` : `${line}.`;
  }
  const allowedTransitions = SUPPORT_CASE_STATUS_VALUES.filter(
    (next) =>
      canTransitionSupportCase(status, next) &&
      // `resolved` đi qua nút Kết luận (bắt buộc có kết luận), không qua nút đổi trạng thái trần.
      next !== SUPPORT_CASE_STATUS.RESOLVED &&
      !(verdictRequired && next === SUPPORT_CASE_STATUS.CLOSED) &&
      // Gian hàng và khách chỉ được ĐÓNG case của chính họ; mọi bước xử lý là việc của nền tảng.
      (isPlatform || (next === SUPPORT_CASE_STATUS.CLOSED && !platformResolveOnly)),
  );
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.code}>{row.code}</span>
          <StatusTag value={status} meta={SUPPORT_CASE_STATUS_META} group="supportCaseStatus" />
          <Tag>{domainLabel('supportCaseCategory', row.category)}</Tag>
          {isPlatform ? <Tag>{domainLabel('supportCasePriority', row.priority)}</Tag> : null}
        </div>
        <h2 className={styles.subject}>{row.subject}</h2>
      </header>

      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label={t('detail.openedBy')}>
          {/* `null` = case do hệ thống mở (worker — ADR 0066), không có người nào bấm nút. */}
          {row.openedByName ?? t('detail.openedBySystem')}
          {LIST_SEPARATOR}
          {domainLabel('supportCaseParty', row.openedByScope, row.openedByScope)}
        </Descriptions.Item>
        {row.tenantName ? (
          <Descriptions.Item label={t('detail.tenant')}>{row.tenantName}</Descriptions.Item>
        ) : null}
        {row.bookingCode ? (
          <Descriptions.Item label={t('detail.booking')}>{row.bookingCode}</Descriptions.Item>
        ) : null}
        {row.assigneeName ? (
          <Descriptions.Item label={t('detail.assignee')}>{row.assigneeName}</Descriptions.Item>
        ) : null}
        <Descriptions.Item label={t('detail.createdAt')}>{fmt.dateTime(row.createdAt)}</Descriptions.Item>
      </Descriptions>

      <p className={styles.description}>{row.description}</p>

      {row.resolution ? (
        <Alert
          type="success"
          showIcon
          title={t('detail.resolution')}
          description={row.resolution}
        />
      ) : null}

      <section aria-labelledby="xp-support-timeline">
        <h3 id="xp-support-timeline" className={styles.sectionTitle}>
          {t('detail.timeline')}
        </h3>
        {row.events.length === 0 ? (
          <div className={styles.placeholder}>{t('detail.noEvents')}</div>
        ) : (
          <ul className={styles.events}>
            {row.events.map((event) => (
              <li
                key={event.id}
                className={
                  event.visibility === SUPPORT_EVENT_VISIBILITY.INTERNAL
                    ? styles.eventInternal
                    : styles.event
                }
              >
                <div className={styles.eventHead}>
                  <b>{event.actorName}</b>
                  <span className={styles.eventMeta}>{fmt.dateTime(event.createdAt)}</span>
                  {event.visibility === SUPPORT_EVENT_VISIBILITY.INTERNAL ? (
                    <Tag color="gold">{t('detail.internalTag')}</Tag>
                  ) : null}
                </div>
                {event.body ? <p className={styles.eventBody}>{event.body}</p> : null}
                {event.toStatus ? (
                  <p className={styles.eventMeta}>
                    {t('detail.statusChanged', {
                      status: domainLabel('supportCaseStatus', event.toStatus),
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {closed ? (
        <Alert type="info" showIcon title={t('detail.closedNotice')} />
      ) : !canWrite ? null : (
        <section aria-labelledby="xp-support-reply" className={styles.reply}>
          <h3 id="xp-support-reply" className={styles.sectionTitle}>
            {t('detail.reply')}
          </h3>
          <Input.TextArea
            rows={3}
            value={body}
            aria-label={t('detail.replyLabel')}
            placeholder={t('detail.replyPlaceholder')}
            onChange={(e) => setBody(e.target.value)}
          />
          {isPlatform ? (
            <Checkbox checked={internal} onChange={(e) => setInternal(e.target.checked)}>
              {t('detail.internalNote')}
            </Checkbox>
          ) : null}
          <div className={styles.actions}>
            <Button type="primary" loading={post.isPending} disabled={!body.trim()} onClick={sendMessage}>
              {t('detail.send')}
            </Button>
            {allowedTransitions.map((next) => (
              <Button
                key={next}
                loading={transition.isPending}
                onClick={() => changeStatus(next)}
              >
                {t('detail.moveTo', { status: domainLabel('supportCaseStatus', next) })}
              </Button>
            ))}
          </div>

          {verdictPending ? (
            <div className={styles.resolveBox}>
              <h4 className={styles.sectionTitle}>{t('detail.verdict.title')}</h4>
              <p className={styles.hint}>
                {verdictRequired ? t('detail.verdict.hint') : t('detail.verdict.optionalHint')}
              </p>
              <div className={styles.actions}>
                {verdicts.map((verdict) => (
                  <Button
                    key={verdict}
                    danger={NEGATIVE_VERDICTS.has(verdict)}
                    onClick={() => setPendingVerdict({ caseId: id, verdict })}
                  >
                    {t(`detail.verdict.action.${verdict}`)}
                  </Button>
                ))}
              </div>
              <ReasonDialog
                open={openVerdict !== null}
                title={openVerdict ? t(`detail.verdict.action.${openVerdict}`) : ''}
                summary={
                  openVerdict
                    ? `${t(`detail.verdict.summary.${openVerdict}`)} ${moneySummary(openVerdict, verdictMoney)}`
                    : undefined
                }
                audienceHint={t('detail.verdict.audience')}
                label={t('detail.verdict.noteLabel')}
                placeholder={t('detail.verdict.notePlaceholder')}
                requiredMessage={t('detail.verdict.noteRequired')}
                minLength={5}
                maxLength={2000}
                submitText={openVerdict ? t(`detail.verdict.action.${openVerdict}`) : ''}
                destructive={openVerdict !== null && NEGATIVE_VERDICTS.has(openVerdict)}
                loading={tripVerdict.isPending}
                onSubmit={submitVerdict}
                onClose={() => setPendingVerdict(null)}
              />
            </div>
          ) : null}
          {!verdictRequired &&
          isPlatform &&
          canTransitionSupportCase(status, SUPPORT_CASE_STATUS.RESOLVED) ? (
            <div className={styles.resolveBox}>
              <h4 className={styles.sectionTitle}>{t('detail.resolveTitle')}</h4>
              <p className={styles.hint}>{t('detail.resolveHint')}</p>
              <Input.TextArea
                rows={3}
                value={resolution}
                aria-label={t('detail.resolutionLabel')}
                placeholder={t('detail.resolutionPlaceholder')}
                onChange={(e) => setResolution(e.target.value)}
              />
              <Button loading={resolve.isPending} onClick={submitResolution}>
                {t('detail.resolveSubmit')}
              </Button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
