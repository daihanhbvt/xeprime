'use client';

import { CheckCircleOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useTripHandoverWord } from '../hooks';
import type { CustomerTripDetail } from '../types';
import styles from './TripHandoverWord.module.css';

/**
 * LỜI CỦA KHÁCH ở mốc giao/trả xe — ADR 0081. Một khối, ba trạng thái (server quyết, client chỉ vẽ):
 *
 *  - `canConfirmPickup` ⇒ nút "Đã nhận xe": đơn sang đang thuê ngay. Trang mở TRƯỚC mốc mở nút
 *    (`pickupConfirmOpensAt`) thì tự hiện nút đúng mốc theo đồng hồ — cửa chặn thật vẫn ở server;
 *  - `canReportReturn` ⇒ nút "Đã trả xe": chủ xe xác nhận trong hạn, im lặng thì chuyến tự hoàn thành;
 *  - `customerReturnedAt` ⇒ dòng "Bạn đã báo trả xe… tự hoàn thành lúc…".
 *
 * Chỉ người đi thuê, chỉ tự lái / dài hạn — server đã tắt hết cờ ở mọi trường hợp khác.
 */
export function TripHandoverWord({
  trip,
  className,
}: {
  trip: CustomerTripDetail;
  className?: string;
}) {
  const t = useTranslations('Trips.handoverWord');
  const fmt = useAppFormat();
  const now = useNow();
  const [asking, setAsking] = useState<'pickup' | 'return' | null>(null);

  if (trip.customerReturnedAt && trip.returnAutoCompleteAt) {
    return (
      <Alert
        className={className}
        type="info"
        showIcon
        title={t('reportedTitle', { time: fmt.dateTime(trip.customerReturnedAt) })}
        description={t('reportedBody', { deadline: fmt.dateTime(trip.returnAutoCompleteAt) })}
      />
    );
  }

  const opensAt = trip.pickupConfirmOpensAt ? new Date(trip.pickupConfirmOpensAt).getTime() : null;
  const pickupOpen = trip.canConfirmPickup || (opensAt !== null && now >= opensAt);
  const word = pickupOpen ? 'pickup' : trip.canReportReturn ? 'return' : null;
  if (!word) return null;

  return (
    <section className={cx(styles.card, className)}>
      <h2 className={styles.title}>
        <CheckCircleOutlined aria-hidden="true" /> {t(`${word}.title`)}
      </h2>
      <p className={styles.lead}>{t(`${word}.lead`)}</p>
      <Button type="primary" block onClick={() => setAsking(word)}>
        {t(`${word}.action`)}
      </Button>
      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi lần trước sang. */}
      {asking ? (
        <WordDialog tripId={trip.id} word={asking} onClose={() => setAsking(null)} />
      ) : null}
    </section>
  );
}

function WordDialog({
  tripId,
  word,
  onClose,
}: {
  tripId: string;
  word: 'pickup' | 'return';
  onClose: () => void;
}) {
  const t = useTranslations('Trips.handoverWord');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const send = useTripHandoverWord(tripId, word);

  return (
    <ResponsiveDialog
      title={t(`${word}.dialogTitle`)}
      open
      onClose={onClose}
      size="sm"
      okText={t(`${word}.confirm`)}
      cancelText={t('keep')}
      confirmLoading={send.isPending}
      onOk={() => {
        if (send.isPending) return;
        send.mutate(undefined, {
          onSuccess: () => {
            message.success(t(`${word}.success`));
            onClose();
          },
        });
      }}
    >
      <div className={styles.body}>
        <p className={styles.dialogLead}>{t(`${word}.dialogBody`)}</p>
        {send.isError ? (
          <Alert type="error" showIcon role="alert" title={errorMessage(send.error)} />
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
