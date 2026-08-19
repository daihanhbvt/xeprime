'use client';

import { App, Button, List, Popconfirm, Tag } from 'antd';
import {
  PAYMENT_METHOD_META, PAYMENT_STATUS, PAYMENT_STATUS_META, PERMISSION, type PaymentMethod, type PaymentStatus, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { usePaymentHistory, useVoidPayment } from '../hooks/use-payments';
import styles from './PaymentHistory.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Lịch sử thu tiền của một đơn + huỷ giao dịch (gate PAYMENT_VOID). */
export function PaymentHistory({ bookingId }: { bookingId: string }) {
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const { has } = usePermissions();
  const { data, isLoading } = usePaymentHistory(bookingId);
  const voidPayment = useVoidPayment(bookingId);

  const canVoid = has(PERMISSION.PAYMENT_VOID);
  const items = data ?? [];

  function onVoid(id: string) {
    voidPayment.mutate(id, {
      onSuccess: () => message.success('Đã hoàn giao dịch'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  if (!isLoading && items.length === 0) {
    return <p className={styles.empty}>Chưa có lần thu nào.</p>;
  }

  return (
    <List
      className={styles.list}
      size="small"
      loading={isLoading}
      dataSource={items}
      renderItem={(p) => {
        const refunded = p.status === PAYMENT_STATUS.REFUNDED;
        return (
          <List.Item
            actions={
              canVoid && !refunded
                ? [
                    <Popconfirm
                      key="void"
                      title="Hoàn giao dịch này? Số đã trả sẽ bị trừ lại."
                      okText="Hoàn"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => onVoid(p.id)}
                    >
                      <Button type="link" size="small" danger>
                        Hoàn
                      </Button>
                    </Popconfirm>,
                  ]
                : undefined
            }
          >
            <div className={styles.row}>
              <span className={refunded ? styles.refunded : styles.amount}>
                {fmt.money(p.amount)}
              </span>
              <Tag>{PAYMENT_METHOD_META[p.method as PaymentMethod]?.label ?? p.method}</Tag>
              <StatusTag value={p.status as PaymentStatus} meta={PAYMENT_STATUS_META} group="paymentStatus" />
              <span className={styles.time}>{fmt.dateTime(p.paidAt ?? p.createdAt)}</span>
            </div>
          </List.Item>
        );
      }}
    />
  );
}
