'use client';

import { EditOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { DRIVER_WAGE_STAGE } from '@xeprime/types';
import { driverWageLine } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import type { DriverWage } from '../types';
import styles from './DriverWageDialogs.module.css';

/**
 * Tiền công của một lượt gán nhìn từ BÊN THUÊ (ADR 0075): dòng số hiện hành theo giai đoạn
 * (`driverWageLine`), nút sửa khi còn hạn, và lịch sử sửa (mới nhất trước). XePrime chỉ ghi nhận
 * con số — chủ xe trả trực tiếp cho tài xế.
 */
export function DriverWageInfo({
  wage,
  canEdit,
  onEdit,
}: {
  wage: DriverWage;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('Drivers.wage');
  const fmt = useAppFormat();
  const line = driverWageLine(wage);
  const editable = canEdit && wage.editable;
  if (!line && !editable) return null;

  return (
    <div className={styles.info}>
      <div className={styles.lineRow}>
        {line ? (
          <span className={line.kind === 'none' ? styles.muted : styles.amount}>
            {t(`line.${line.kind}`, { amount: fmt.money(line.amount), days: wage.days ?? 0 })}
          </span>
        ) : null}
        {editable ? (
          <Button size="small" type="link" icon={<EditOutlined />} onClick={onEdit}>
            {wage.stage === DRIVER_WAGE_STAGE.NOT_RUN ? t('edit.actionAgreed') : t('edit.action')}
          </Button>
        ) : null}
      </div>
      {wage.changes.length > 0 ? (
        <div className={styles.changes}>
          <span className={styles.changesTitle}>{t('changes.title')}</span>
          <ul className={styles.changeList}>
            {wage.changes.map((c) => (
              <li key={c.id}>
                <span className={styles.changeAmount}>
                  {t('changes.item', { old: fmt.money(c.oldAmount), new: fmt.money(c.newAmount) })}
                </span>
                <span className={styles.muted}>
                  {c.changedByName
                    ? t('changes.by', { name: c.changedByName, time: fmt.dateTime(c.changedAt) })
                    : t('changes.at', { time: fmt.dateTime(c.changedAt) })}
                </span>
                {c.reason ? (
                  <span className={styles.muted}>{t('changes.reason', { reason: c.reason })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
