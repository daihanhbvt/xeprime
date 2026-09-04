'use client';

import { App, Alert, Button, Descriptions, Input, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BANK_MATCH_STATUS, BANK_MATCH_STATUS_META, type BankMatchStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useBankTransaction,
  useIgnoreBankTransaction,
  useMatchBankTransaction,
} from '../hooks/use-bank-transactions';
import type { BankTransactionSuggestion } from '../types';
import styles from './BankTransactionDrawer.module.css';

/**
 * Chi tiết một giao dịch tiền vào + đường khớp tay — ADR 0022 điều 4.
 *
 * Điều quan trọng nhất của màn này là **nó không tự làm gì cả**. Danh sách gợi ý được sắp cho
 * mắt người tìm nhanh (số tiền trùng lên đầu, có nhãn), nhưng không có nút "khớp tự động", và
 * không dòng nào được chọn sẵn — khớp theo số tiền sẽ gán tiền của người này vào hoá đơn của
 * người khác, và ở tuyến giữ chỗ nhiều khoản có số tiền giống hệt nhau.
 *
 * Ghi chú là BẮT BUỘC ở cả hai hành động: mỗi dòng `manual`/`ignored` phải truy được về một con
 * người và một lý do, vì đây là thao tác đụng thẳng vào tiền.
 */
export function BankTransactionDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('BankTransactions');
  const tCommon = useTranslations('Common');
  const { message, modal } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const detail = useBankTransaction(id);
  const match = useMatchBankTransaction();
  const ignore = useIgnoreBankTransaction();

  /** Hoá đơn admin đang chọn để khớp — `null` = chưa chọn gì, và đó là mặc định. */
  const [chosen, setChosen] = useState<BankTransactionSuggestion | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  function close() {
    setChosen(null);
    setNote('');
    setNoteError(null);
    onClose();
  }

  function submitMatch() {
    if (!id || !chosen) return;
    if (!note.trim()) {
      setNoteError(t('match.noteRequired'));
      return;
    }
    match.mutate(
      { id, invoiceId: chosen.invoiceId, note: note.trim() },
      {
        onSuccess: () => {
          message.success(t('match.success'));
          close();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function confirmIgnore() {
    if (!id) return;
    let reason = '';
    modal.confirm({
      title: t('ignore.title'),
      content: (
        <div className={styles.confirmBody}>
          <p>{t('ignore.body')}</p>
          <Input.TextArea
            rows={2}
            placeholder={t('ignore.notePlaceholder')}
            aria-label={t('ignore.noteLabel')}
            onChange={(e) => {
              reason = e.target.value;
            }}
          />
        </div>
      ),
      okText: t('ignore.submit'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.close'),
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          if (!reason.trim()) {
            message.error(t('ignore.noteRequired'));
            reject(new Error('note-required'));
            return;
          }
          ignore.mutate(
            { id, note: reason.trim() },
            {
              onSuccess: () => {
                message.success(t('ignore.success'));
                close();
                resolve();
              },
              onError: (err) => {
                message.error(errorMessage(err));
                reject(err instanceof Error ? err : new Error('ignore-failed'));
              },
            },
          );
        }),
    });
  }

  const tx = detail.data;
  const pending = tx?.matchStatus === BANK_MATCH_STATUS.UNMATCHED;

  return (
    <ResponsiveDialog
      title={t('detail.title')}
      open={Boolean(id)}
      onClose={close}
      size="lg"
      footer={null}
    >
      {detail.isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : detail.isError || !tx ? (
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
      ) : (
        <div className={styles.body}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label={t('columns.amount')}>
              <b className={styles.amount}>{fmt.money(tx.amountIn)}</b>
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.content')}>
              <span className={styles.content}>{tx.content}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.code')}>
              {tx.referenceCode ?? tCommon('labels.emptyValue')}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.bankTime')}>
              {tx.bankTime ? fmt.dateTime(tx.bankTime) : tCommon('labels.emptyValue')}
            </Descriptions.Item>
            <Descriptions.Item label={t('detail.providerTx')}>{tx.providerTxId}</Descriptions.Item>
            <Descriptions.Item label={t('columns.status')}>
              <StatusTag
                value={tx.matchStatus as BankMatchStatus}
                meta={BANK_MATCH_STATUS_META}
                group="bankMatchStatus"
              />
            </Descriptions.Item>
            {tx.matchedInvoiceCode ? (
              <Descriptions.Item label={t('detail.matchedInvoice')}>
                {tx.matchedInvoiceCode}
              </Descriptions.Item>
            ) : null}
            {tx.matchNote ? (
              <Descriptions.Item label={t('detail.note')}>
                {tx.matchNote}
                {tx.matchedByName ? ` — ${tx.matchedByName}` : ''}
              </Descriptions.Item>
            ) : null}
          </Descriptions>

          {pending ? (
            <section aria-labelledby="xp-bank-suggestions">
              <h3 id="xp-bank-suggestions" className={styles.sectionTitle}>
                {t('suggestions.title')}
              </h3>
              {/* Nói thẳng ra rằng hệ thống không tự khớp — người dùng phải biết trách nhiệm
                  chọn đúng hoá đơn là của họ, không phải của máy. */}
              <Alert type="warning" showIcon message={t('suggestions.hint')} />

              {tx.suggestions.length === 0 ? (
                <div className={styles.empty}>{t('suggestions.empty')}</div>
              ) : (
                <ul className={styles.suggestions}>
                  {tx.suggestions.map((s) => (
                    <li
                      key={s.invoiceId}
                      className={
                        chosen?.invoiceId === s.invoiceId ? styles.suggestionOn : styles.suggestion
                      }
                    >
                      <div className={styles.suggestionInfo}>
                        <div className={styles.suggestionHead}>
                          <span className={styles.code}>{s.code}</span>
                          {s.amountMatches ? (
                            <Tag color="green">{t('suggestions.amountMatches')}</Tag>
                          ) : null}
                        </div>
                        <div className={styles.suggestionMeta}>
                          {s.tenantName} ·{' '}
                          {t('suggestions.remaining', { amount: fmt.money(s.remainingAmount) })}
                        </div>
                      </div>
                      <Button
                        size="small"
                        type={chosen?.invoiceId === s.invoiceId ? 'primary' : 'default'}
                        onClick={() => setChosen(s)}
                      >
                        {t('suggestions.choose')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {chosen ? (
                <div className={styles.matchForm}>
                  <h4 className={styles.sectionTitle}>{t('match.title', { code: chosen.code })}</h4>
                  <Input.TextArea
                    rows={2}
                    value={note}
                    aria-label={t('match.noteLabel')}
                    placeholder={t('match.notePlaceholder')}
                    status={noteError ? 'error' : undefined}
                    onChange={(e) => {
                      setNote(e.target.value);
                      if (noteError) setNoteError(null);
                    }}
                  />
                  {noteError ? <div className={styles.fieldError}>{noteError}</div> : null}
                  <div className={styles.actions}>
                    <Button type="primary" loading={match.isPending} onClick={submitMatch}>
                      {t('match.submit')}
                    </Button>
                    <Button onClick={() => setChosen(null)}>{tCommon('actions.cancel')}</Button>
                  </div>
                </div>
              ) : null}

              <div className={styles.ignoreRow}>
                <Button danger loading={ignore.isPending} onClick={confirmIgnore}>
                  {t('ignore.action')}
                </Button>
              </div>
            </section>
          ) : (
            <Alert type="info" showIcon message={t('detail.handled')} />
          )}

          <section aria-labelledby="xp-bank-raw">
            <h3 id="xp-bank-raw" className={styles.sectionTitle}>
              {t('detail.rawTitle')}
            </h3>
            <p className={styles.rawHint}>{t('detail.rawHint')}</p>
            <pre className={styles.raw}>{JSON.stringify(tx.rawJson, null, 2)}</pre>
          </section>
        </div>
      )}
    </ResponsiveDialog>
  );
}
