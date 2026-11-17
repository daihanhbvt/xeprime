'use client';

import { CheckCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { App, Alert, Button, Collapse, Radio, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BANK_MATCH_STATUS,
  BANK_MATCH_STATUS_META,
  BANK_MATCH_WALLET_CREDIT,
  type BankMatchStatus,
} from '@xeprime/types';
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
  useCreditCustomer,
  useIgnoreBankTransaction,
  useMatchBankTransaction,
  useMatchReceivable,
} from '../hooks/use-bank-transactions';
import type { BankTransactionDetail, BankTxReceivableSuggestion } from '../types';
import { IgnoreDialog, NOTE_MAX } from './HandleDialogs';
import { BankMatchReasonText } from './BankMatchReasonText';
import styles from './BankTransactionDrawer.module.css';

type DialogKind = 'match' | 'ignore' | 'credit';

/**
 * Giá trị của MỘT lựa chọn ở cột phải — hoá đơn gói (`invoice:<id>`) hay khoản giữ chỗ / phụ lục
 * của khách (`booking_hold:<id>` · `booking_extension:<id>`, ADR 0092). Một nhóm radio duy nhất:
 * khớp một khoản tiền vào HAI đích là điều không được xảy ra.
 */
const INVOICE_CHOICE = 'invoice';

interface Chosen {
  /** `invoice` hoặc loại khoản của khách (`booking_hold` / `booking_extension`). */
  kind: string;
  id: string;
  code: string;
  /** Gian hàng (hoá đơn gói) hoặc khách (khoản giữ chỗ). */
  who: string;
}

function choiceValue(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function resolveChoice(tx: BankTransactionDetail | undefined, value: string | null): Chosen | null {
  if (!tx || !value) return null;
  const [kind, id] = value.split(':') as [string, string];
  if (kind === INVOICE_CHOICE) {
    const s = tx.suggestions.find((row) => row.invoiceId === id);
    return s ? { kind, id, code: s.code, who: s.tenantName } : null;
  }
  const r = tx.receivableSuggestions.find((row) => row.targetType === kind && row.targetId === id);
  return r ? { kind, id, code: r.code, who: r.customerName } : null;
}

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
  const matchReceivable = useMatchReceivable();
  const credit = useCreditCustomer();
  const ignore = useIgnoreBankTransaction();
  const tx = detail.data;

  /*
   * Lựa chọn đích và hộp thoại GẮN VỚI GIAO DỊCH đã mở chúng: chuyển sang giao dịch khác
   * (trước/sau) thì lựa chọn cũ tự không còn — không có đường khớp tiền của khoản A vào đích
   * đã chọn cho khoản B.
   */
  const [choice, setChoice] = useState<{ txId: string; value: string } | null>(null);
  const [dialogState, setDialogState] = useState<{ txId: string; kind: DialogKind } | null>(null);
  const chosenValue = choice && choice.txId === id ? choice.value : null;
  const dialog = dialogState && dialogState.txId === id ? dialogState.kind : null;
  const chosen = resolveChoice(tx, chosenValue);
  const pending = tx?.matchStatus === BANK_MATCH_STATUS.UNMATCHED;
  const hasTargets = Boolean(
    tx && (tx.suggestions.length > 0 || tx.receivableSuggestions.length > 0),
  );
  // Ghi có ví chỉ mời khi mã trỏ tới khoản ĐÃ ĐÓNG có tài khoản khách (ADR 0092).
  const lateCredit = tx?.lateCredit?.hasCustomerAccount ? tx.lateCredit : null;
  const busy = match.isPending || matchReceivable.isPending || credit.isPending || ignore.isPending;

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
    const handlers = {
      onSuccess: () => {
        message.success(t('match.success'));
        done();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (chosen.kind === INVOICE_CHOICE) {
      match.mutate({ id, invoiceId: chosen.id, note }, handlers);
    } else {
      matchReceivable.mutate(
        {
          id,
          targetType: chosen.kind as BankTxReceivableSuggestion['targetType'],
          targetId: chosen.id,
          note,
        },
        handlers,
      );
    }
  }

  function submitCredit(note: string) {
    if (!id || !lateCredit || busy) return;
    const done = afterDecision();
    credit.mutate(
      {
        id,
        targetType: lateCredit.targetType as BankTxReceivableSuggestion['targetType'],
        targetId: lateCredit.targetId,
        note,
      },
      {
        onSuccess: () => {
          message.success(t('credit.success'));
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
            {t('footer.chosen', { code: chosen.code, tenant: chosen.who })}
          </span>
        ) : (
          <span className={styles.hintTone}>
            <InfoCircleOutlined aria-hidden />
            {hasTargets ? t('footer.choose') : t('footer.noInvoice')}
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
          {lateCredit ? (
            <Button
              disabled={busy}
              onClick={() => id && setDialogState({ txId: id, kind: 'credit' })}
            >
              {t('credit.action')}
            </Button>
          ) : null}
          {/* Không có đích nào để khớp thì không có nút khớp — chỉ còn đường bỏ qua / ghi có ví. */}
          {hasTargets ? (
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
                <TargetPicker
                  tx={tx}
                  chosenValue={chosenValue}
                  onChoose={(value) => id && setChoice({ txId: id, value })}
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
                tenant: chosen.who,
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
        loading={match.isPending || matchReceivable.isPending}
        onSubmit={submitMatch}
        onClose={closeDialog}
      />

      <ReasonDialog
        open={dialog === 'credit' && Boolean(lateCredit)}
        title={t('credit.dialogTitle')}
        summary={
          lateCredit && tx
            ? t('credit.dialogSummary', {
                amount: fmt.money(tx.amountIn),
                code: lateCredit.code,
                customer: lateCredit.customerName,
              })
            : ''
        }
        label={t('handle.reasonLabel')}
        placeholder={t('handle.reasonPlaceholder')}
        requiredMessage={t('handle.reasonRequired')}
        minLength={1}
        maxLength={NOTE_MAX}
        submitText={t('credit.action')}
        destructive={false}
        loading={credit.isPending}
        onSubmit={submitCredit}
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
    ...(tx.matchReasonCode
      ? [
          {
            key: 'reason',
            label: t('detail.systemReason'),
            value: <BankMatchReasonText tx={tx} />,
            wide: true,
          },
        ]
      : []),
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

/**
 * Cột phải khi còn chờ: chọn ĐÚNG MỘT đích — hoá đơn gói, hoặc khoản giữ chỗ / phụ lục còn nhận
 * tiền (ADR 0092). Không dòng nào được chọn sẵn. Mã trỏ tới một khoản ĐÃ ĐÓNG thì nói rõ ở đầu cột:
 * đường đúng là ghi có Ví điểm khách (hoặc chuyển trả tay khi không có tài khoản khách).
 */
function TargetPicker({
  tx,
  chosenValue,
  onChoose,
}: {
  tx: BankTransactionDetail;
  chosenValue: string | null;
  onChoose: (value: string) => void;
}) {
  const t = useTranslations('BankTransactions');
  const fmt = useAppFormat();
  const hasTargets = tx.suggestions.length > 0 || tx.receivableSuggestions.length > 0;

  const option = (
    value: string,
    head: { code: string; amountMatches: boolean },
    lines: string[],
  ) => (
    <Radio
      key={value}
      value={value}
      className={value === chosenValue ? styles.suggestionOn : styles.suggestion}
    >
      <span className={styles.suggestionBody}>
        <span className={styles.suggestionHead}>
          <span className={styles.mono}>{head.code}</span>
          {head.amountMatches ? (
            <Tag color="success" className={styles.matchTag}>
              {t('suggestions.amountMatches')}
            </Tag>
          ) : null}
        </span>
        {lines.map((line) => (
          <span key={line} className={styles.suggestionMeta}>
            {line}
          </span>
        ))}
      </span>
    </Radio>
  );

  return (
    <section className={styles.side} aria-labelledby="xp-bank-suggestions">
      {tx.lateCredit ? (
        <Alert
          type="warning"
          showIcon
          title={t('lateCredit.title', {
            code: tx.lateCredit.code,
            customer: tx.lateCredit.customerName,
          })}
          description={
            tx.lateCredit.hasCustomerAccount ? t('lateCredit.hint') : t('lateCredit.noAccount')
          }
        />
      ) : null}
      <div>
        <h3 id="xp-bank-suggestions" className={styles.sideTitle}>
          {t('suggestions.title')}
        </h3>
        <p className={styles.sideHint}>{t('suggestions.hint')}</p>
      </div>
      {!hasTargets ? (
        <div className={styles.empty}>{t('suggestions.empty')}</div>
      ) : (
        <Radio.Group
          value={chosenValue}
          onChange={(e) => onChoose(String(e.target.value))}
          className={styles.suggestions}
          aria-label={t('suggestions.title')}
        >
          {tx.receivableSuggestions.length > 0 ? (
            <p className={styles.groupTitle}>{t('suggestions.receivablesTitle')}</p>
          ) : null}
          {tx.receivableSuggestions.map((r) =>
            option(choiceValue(r.targetType, r.targetId), r, [
              t('suggestions.customer', { name: r.customerName, tenant: r.tenantName }),
              t('suggestions.remaining', { amount: fmt.money(r.remainingAmount) }),
              ...(r.expiresAt
                ? [t('suggestions.expiresAt', { time: fmt.dateTime(r.expiresAt) })]
                : []),
            ]),
          )}
          {tx.suggestions.length > 0 ? (
            <p className={styles.groupTitle}>{t('suggestions.invoicesTitle')}</p>
          ) : null}
          {tx.suggestions.map((s) =>
            option(choiceValue(INVOICE_CHOICE, s.invoiceId), s, [
              t('suggestions.tenant', { name: s.tenantName }),
              t('suggestions.remaining', { amount: fmt.money(s.remainingAmount) }),
            ]),
          )}
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
      {tx.matchedTargetCode ? (
        <p className={styles.resultLine}>
          {tx.matchedType === BANK_MATCH_WALLET_CREDIT
            ? t('detail.walletCreditFor')
            : t('detail.matchedReceivable')}
          : <span className={styles.mono}>{tx.matchedTargetCode}</span>
        </p>
      ) : null}
      {tx.matchReasonCode ? (
        <p className={styles.resultNote}>
          <BankMatchReasonText tx={tx} />
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
