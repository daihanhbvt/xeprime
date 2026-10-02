'use client';

import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { App, Alert, Button, Collapse, Radio, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BANK_MATCH_STATUS, BANK_MATCH_STATUS_META, type BankMatchStatus } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFacts,
  WorkDrawerFooter,
  WorkDrawerLayout,
  WorkDrawerPager,
  WorkDrawerTitle,
  type WorkDrawerFact,
} from '@/components/overlay/WorkDrawer';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useBankTransaction,
  useIgnoreBankTransaction,
  useMatchBankTransaction,
} from '../hooks/use-bank-transactions';
import type { BankTransactionDetail } from '../types';
import { IgnoreDialog, NOTE_MAX } from './HandleDialogs';
import styles from './BankTransactionDrawer.module.css';

type DialogKind = 'match' | 'ignore';

/**
 * Chi tiết một giao dịch tiền vào + hai đường xử lý tay — ADR 0022 điều 4.
 *
 * Cùng khuôn PANEL LÀM VIỆC với màn "Kiểm duyệt xe" (`components/overlay/WorkDrawer`): panel rộng,
 * bản ghi trước/sau ngay trên đầu, hồ sơ giao dịch bên trái, cột chọn hoá đơn bên phải, hai quyết
 * định ở chân panel và LÝ DO trong hộp thoại.
 *
 * Điều quan trọng nhất của màn này là **nó không tự làm gì cả**: gợi ý sắp số tiền trùng lên đầu
 * để mắt người tìm nhanh, nhưng KHÔNG dòng nào được chọn sẵn — khớp theo số tiền sẽ gán tiền của
 * người này vào hoá đơn của người khác.
 */
export function BankTransactionDrawer({
  id,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: {
  id: string | null;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('BankTransactions');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const detail = useBankTransaction(id);
  const match = useMatchBankTransaction();
  const ignore = useIgnoreBankTransaction();
  const tx = detail.data;

  /*
   * Lựa chọn hoá đơn và hộp thoại GẮN VỚI GIAO DỊCH đã mở chúng: chuyển sang giao dịch khác
   * (trước/sau) thì lựa chọn cũ tự không còn — không có đường khớp tiền của khoản A vào hoá đơn
   * đã chọn cho khoản B.
   */
  const [choice, setChoice] = useState<{ txId: string; invoiceId: string } | null>(null);
  const [dialogState, setDialogState] = useState<{ txId: string; kind: DialogKind } | null>(null);
  const chosenId = choice && choice.txId === id ? choice.invoiceId : null;
  const dialog = dialogState && dialogState.txId === id ? dialogState.kind : null;
  const chosen = tx?.suggestions.find((s) => s.invoiceId === chosenId) ?? null;
  const pending = tx?.matchStatus === BANK_MATCH_STATUS.UNMATCHED;
  const busy = match.isPending || ignore.isPending;

  // Giao dịch mới hiện ra: đưa vùng cuộn về đầu hồ sơ đó.
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // `?.()`: jsdom (test) không có `scrollIntoView`; trình duyệt thật thì luôn có.
    topRef.current?.scrollIntoView?.({ block: 'start' });
  }, [tx?.id]);

  function closeDialog() {
    setDialogState(null);
  }

  /*
   * Xử lý xong thì đi tiếp sang khoản KẾ (hoặc khoản trước nếu đây là khoản cuối). Chốt id đó
   * NGAY lúc gửi: xử lý xong, khoản này rời khỏi danh sách "chưa khớp" và trước/sau tính lại từ
   * một vị trí không còn tồn tại — hai nút cùng tắt đúng lúc người trực cần "khoản kế" nhất.
   */
  function afterDecision(): () => void {
    const goTo = nextId ?? previousId;
    return () => {
      closeDialog();
      if (goTo) onNavigate(goTo);
    };
  }

  function submitMatch(note: string) {
    // Enter trong hộp thoại gửi lại kể cả khi nút đang quay — chặn lượt thứ hai ở đây.
    if (!id || !chosen || busy) return;
    const done = afterDecision();
    match.mutate(
      { id, invoiceId: chosen.invoiceId, note },
      {
        onSuccess: () => {
          message.success(t('match.success'));
          done();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function submitIgnore(input: { note: string; refundReference?: string }) {
    if (!id || busy) return;
    const done = afterDecision();
    ignore.mutate(
      { id, ...input },
      {
        onSuccess: () => {
          message.success(t('ignore.success'));
          done();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const footer = !tx ? null : pending ? (
    <WorkDrawerFooter
      hint={
        chosen ? (
          <span className={styles.hintReady}>
            <CheckCircleOutlined aria-hidden />
            {t('footer.chosen', { code: chosen.code, tenant: chosen.tenantName })}
          </span>
        ) : (
          <span className={styles.hintTone}>
            <InfoCircleOutlined aria-hidden />
            {tx.suggestions.length > 0 ? t('footer.choose') : t('footer.noInvoice')}
          </span>
        )
      }
      actions={
        <>
          <Button
            danger
            disabled={busy}
            onClick={() => id && setDialogState({ txId: id, kind: 'ignore' })}
          >
            {t('ignore.action')}
          </Button>
          {/* Không có hoá đơn nào để khớp thì không có nút khớp — chỉ còn đường bỏ qua. */}
          {tx.suggestions.length > 0 ? (
            <Button
              type="primary"
              disabled={!chosen || busy}
              onClick={() => id && setDialogState({ txId: id, kind: 'match' })}
            >
              {chosen ? t('match.submitFor', { code: chosen.code }) : t('match.submit')}
            </Button>
          ) : null}
        </>
      }
    />
  ) : (
    <WorkDrawerFooter hint={t('footer.handled')} />
  );

  return (
    <>
      <DetailDrawer
        open={Boolean(id)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={t('detail.title')}
        title={
          <WorkDrawerTitle
            label={t('detail.title')}
            code={tx?.referenceCode ?? null}
            status={
              tx ? (
                <StatusTag
                  value={tx.matchStatus as BankMatchStatus}
                  meta={BANK_MATCH_STATUS_META}
                  group="bankMatchStatus"
                />
              ) : null
            }
          />
        }
        extra={
          <WorkDrawerPager
            previousId={previousId}
            nextId={nextId}
            onNavigate={onNavigate}
            previousLabel={t('detail.previous')}
            nextLabel={t('detail.next')}
          />
        }
        loading={detail.isLoading}
        error={detail.isError && !tx}
        errorTitle={t('detail.loadError')}
        onRetry={() => void detail.refetch()}
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={footer}
      >
        {tx ? (
          <WorkDrawerLayout
            key={tx.id}
            ref={topRef}
            sideLabel={t('detail.sideLabel')}
            main={<TransactionFile tx={tx} />}
            side={
              pending ? (
                <InvoicePicker
                  tx={tx}
                  chosenId={chosenId}
                  onChoose={(invoiceId) => id && setChoice({ txId: id, invoiceId })}
                />
              ) : (
                <HandledResult tx={tx} />
              )
            }
          />
        ) : null}
      </DetailDrawer>

      <ReasonDialog
        open={dialog === 'match' && Boolean(chosen)}
        title={t('match.dialogTitle')}
        summary={
          chosen && tx
            ? t('match.dialogSummary', {
                amount: fmt.money(tx.amountIn),
                code: chosen.code,
                tenant: chosen.tenantName,
              })
            : ''
        }
        label={t('handle.reasonLabel')}
        placeholder={t('handle.reasonPlaceholder')}
        requiredMessage={t('handle.reasonRequired')}
        minLength={1}
        maxLength={NOTE_MAX}
        submitText={t('match.submit')}
        destructive={false}
        loading={match.isPending}
        onSubmit={submitMatch}
        onClose={closeDialog}
      />

      <IgnoreDialog
        open={dialog === 'ignore'}
        submitting={ignore.isPending}
        onSubmit={submitIgnore}
        onClose={closeDialog}
      />
    </>
  );
}

/** Hồ sơ giao dịch — số tiền, các trường bóc từ payload, bằng chứng gốc thu gọn. */
function TransactionFile({ tx }: { tx: BankTransactionDetail }) {
  const t = useTranslations('BankTransactions');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const empty = <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>;

  const facts: WorkDrawerFact[] = [
    { key: 'content', label: t('columns.content'), value: tx.content, wide: true },
    {
      key: 'code',
      label: t('columns.code'),
      value: tx.referenceCode ? <span className={styles.mono}>{tx.referenceCode}</span> : empty,
    },
    { key: 'gateway', label: t('detail.bankGateway'), value: tx.bankGateway ?? empty },
    {
      key: 'account',
      label: t('detail.bankAccount'),
      value: tx.bankAccountNumber ? (
        <span className={styles.mono}>{tx.bankAccountNumber}</span>
      ) : (
        empty
      ),
    },
    {
      key: 'reference',
      label: t('detail.bankReference'),
      value: tx.bankReferenceNumber ? (
        <span className={styles.copyable}>
          <span className={styles.mono}>{tx.bankReferenceNumber}</span>
          <CopyButton value={tx.bankReferenceNumber} label={t('detail.bankReference')} />
        </span>
      ) : (
        empty
      ),
    },
    {
      key: 'provider',
      label: t('detail.providerTx'),
      value: <span className={styles.mono}>{tx.providerTxId}</span>,
    },
    {
      key: 'bankTime',
      label: t('columns.bankTime'),
      value: tx.bankTime ? fmt.dateTime(tx.bankTime) : empty,
    },
    { key: 'receivedAt', label: t('detail.receivedAt'), value: fmt.dateTime(tx.createdAt) },
  ];

  return (
    <>
      <div className={styles.amountBlock}>
        <span className={styles.amountLabel}>{t('columns.amount')}</span>
        <span className={styles.amount}>{fmt.money(tx.amountIn)}</span>
      </div>
      <WorkDrawerFacts items={facts} />
      <Collapse
        size="small"
        items={[
          {
            key: 'raw',
            label: t('detail.rawTitle'),
            children: (
              <>
                <p className={styles.rawHint}>{t('detail.rawHint')}</p>
                <pre className={styles.raw}>{JSON.stringify(tx.rawJson, null, 2)}</pre>
              </>
            ),
          },
        ]}
      />
    </>
  );
}

/** Cột phải khi còn chờ: chọn ĐÚNG MỘT hoá đơn — không dòng nào được chọn sẵn. */
function InvoicePicker({
  tx,
  chosenId,
  onChoose,
}: {
  tx: BankTransactionDetail;
  chosenId: string | null;
  onChoose: (invoiceId: string) => void;
}) {
  const t = useTranslations('BankTransactions');
  const fmt = useAppFormat();

  return (
    <section className={styles.side} aria-labelledby="xp-bank-suggestions">
      <div>
        <h3 id="xp-bank-suggestions" className={styles.sideTitle}>
          {t('suggestions.title')}
        </h3>
        <p className={styles.sideHint}>{t('suggestions.hint')}</p>
      </div>
      {tx.suggestions.length === 0 ? (
        <div className={styles.empty}>{t('suggestions.empty')}</div>
      ) : (
        <Radio.Group
          value={chosenId}
          onChange={(e) => onChoose(String(e.target.value))}
          className={styles.suggestions}
          aria-label={t('suggestions.title')}
        >
          {tx.suggestions.map((s) => (
            <Radio
              key={s.invoiceId}
              value={s.invoiceId}
              className={s.invoiceId === chosenId ? styles.suggestionOn : styles.suggestion}
            >
              <span className={styles.suggestionBody}>
                <span className={styles.suggestionHead}>
                  <span className={styles.mono}>{s.code}</span>
                  {s.amountMatches ? (
                    <Tag color="success" className={styles.matchTag}>
                      {t('suggestions.amountMatches')}
                    </Tag>
                  ) : null}
                </span>
                <span className={styles.suggestionMeta}>
                  {t('suggestions.tenant', { name: s.tenantName })}
                </span>
                <span className={styles.suggestionMeta}>
                  {t('suggestions.remaining', { amount: fmt.money(s.remainingAmount) })}
                </span>
              </span>
            </Radio>
          ))}
        </Radio.Group>
      )}
    </section>
  );
}

/** Cột phải khi đã xử lý — ai, lúc nào, vì sao, và đã trả lại người gửi chưa. */
function HandledResult({ tx }: { tx: BankTransactionDetail }) {
  const t = useTranslations('BankTransactions');
  const fmt = useAppFormat();

  return (
    <section className={styles.side} aria-labelledby="xp-bank-result">
      <h3 id="xp-bank-result" className={styles.sideTitle}>
        {t('detail.resultTitle')}
      </h3>
      {tx.matchedInvoiceCode ? (
        <p className={styles.resultLine}>
          {t('detail.matchedInvoice')}: <span className={styles.mono}>{tx.matchedInvoiceCode}</span>
        </p>
      ) : null}
      {tx.matchNote ? <p className={styles.resultNote}>{tx.matchNote}</p> : null}
      {tx.matchedAt ? (
        <p className={styles.resultMeta}>
          {tx.matchedByName
            ? t('detail.handledBy', { name: tx.matchedByName, time: fmt.dateTime(tx.matchedAt) })
            : fmt.dateTime(tx.matchedAt)}
        </p>
      ) : null}
      {tx.refundReference && tx.refundedAt ? (
        <Alert
          type="info"
          showIcon
          title={t('detail.refunded', {
            reference: tx.refundReference,
            time: fmt.dateTime(tx.refundedAt),
          })}
        />
      ) : null}
    </section>
  );
}
