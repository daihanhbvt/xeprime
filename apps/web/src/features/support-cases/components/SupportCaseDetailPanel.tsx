'use client';

import { App, Alert, Button, Checkbox, Descriptions, Input, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_META,
  SUPPORT_CASE_STATUS_VALUES,
  SUPPORT_EVENT_VISIBILITY,
  canTransitionSupportCase,
  type SupportCaseStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  usePostSupportMessage,
  useResolveSupportCase,
  useSupportCase,
  useTransitionSupportCase,
} from '../hooks/use-support-cases';
import { SUPPORT_SURFACE, type SupportSurface } from '../types';
import styles from './SupportCaseDetailPanel.module.css';

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

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState('');

  const isPlatform = surface === SUPPORT_SURFACE.PLATFORM;
  const row = detail.data;

  if (!id) return <div className={styles.placeholder}>{t('detail.pickOne')}</div>;
  if (detail.isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (detail.isError || !row) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('detail.loadError')}
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

  const allowedTransitions = SUPPORT_CASE_STATUS_VALUES.filter(
    (next) =>
      canTransitionSupportCase(status, next) &&
      // `resolved` đi qua nút Kết luận (bắt buộc có kết luận), không qua nút đổi trạng thái trần.
      next !== SUPPORT_CASE_STATUS.RESOLVED &&
      // Gian hàng và khách chỉ được ĐÓNG case của chính họ; mọi bước xử lý là việc của nền tảng.
      (isPlatform || next === SUPPORT_CASE_STATUS.CLOSED),
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
          {row.openedByName} · {domainLabel('supportCaseParty', row.openedByScope, row.openedByScope)}
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
          message={t('detail.resolution')}
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
        <Alert type="info" showIcon message={t('detail.closedNotice')} />
      ) : (
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

          {isPlatform && canTransitionSupportCase(status, SUPPORT_CASE_STATUS.RESOLVED) ? (
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
