'use client';

import {
  CheckCircleFilled,
  FlagOutlined,
  MoreOutlined,
  SendOutlined,
  StopOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import {
  CHAT_REPORT_NOTE_MAX_LENGTH,
  CHAT_REPORT_REASON_VALUES,
  CHAT_SIDE,
  type ChatReportReason,
} from '@xeprime/types';
import { App, Button, Dropdown, Input, Modal } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useReportConversation, useToggleChatBlock } from '../hooks/use-chat-mutations';
import type { ConversationSummary } from '../types';
import styles from './ThreadActions.module.css';

/** Menu "..." ở đầu một hội thoại: chặn / bỏ chặn và báo cáo (App Store Guideline 1.2). */
export function ThreadActions({ conversation }: { conversation: ConversationSummary }) {
  const t = useTranslations('Chat');
  const [reportOpen, setReportOpen] = useState(false);
  const { confirmBlock, unblock, pending } = useBlockActions(conversation);

  return (
    <>
      <Dropdown
        trigger={['click']}
        placement="bottomRight"
        menu={{
          className: styles.menu,
          items: [
            conversation.blockedByMe
              ? {
                  key: 'unblock',
                  icon: <UnlockOutlined />,
                  label: t('unblock'),
                  onClick: unblock,
                }
              : {
                  key: 'block',
                  icon: <StopOutlined />,
                  label: t('block'),
                  danger: true,
                  onClick: confirmBlock,
                },
            { type: 'divider' },
            {
              key: 'report',
              icon: <FlagOutlined />,
              label: t('report'),
              onClick: () => setReportOpen(true),
            },
          ],
        }}
      >
        <Button type="text" icon={<MoreOutlined />} aria-label={t('moreActions')} loading={pending} />
      </Dropdown>
      <ReportModal
        open={reportOpen}
        conversationId={conversation.id}
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}

/** Dòng thay ô soạn tin khi hội thoại bị chặn. Bỏ chặn đi qua menu "..." ở đầu hội thoại. */
export function BlockedNotice({ conversation }: { conversation: ConversationSummary }) {
  const t = useTranslations('Chat');

  return (
    <div className={styles.blockedNotice} role="status">
      <span className={styles.blockedIcon} aria-hidden>
        <StopOutlined />
      </span>
      <span className={styles.blockedText}>
        {conversation.blockedByMe
          ? t('blockedByMe', { party: conversation.partyName })
          : t('blockedByOther')}
      </span>
    </div>
  );
}

function useBlockActions(conversation: ConversationSummary) {
  const t = useTranslations('Chat');
  const { message, modal } = App.useApp();
  const errorMessage = useErrorMessage();
  const toggleBlock = useToggleChatBlock(conversation.id);

  const confirmBlock = () => {
    modal.confirm({
      icon: <StopOutlined className={styles.confirmIcon} />,
      title:
        conversation.side === CHAT_SIDE.CUSTOMER ? t('blockShopTitle') : t('blockCustomerTitle'),
      content: t('blockConfirmBody'),
      okText: t('blockConfirm'),
      okButtonProps: { danger: true },
      cancelText: t('cancel'),
      onOk: () =>
        toggleBlock.mutateAsync(true).then(
          () => void message.success(t('blockSuccess')),
          (e: unknown) => void message.error(errorMessage(e)),
        ),
    });
  };

  const unblock = () =>
    toggleBlock.mutate(false, {
      onSuccess: () => void message.success(t('unblockSuccess')),
      onError: (e) => void message.error(errorMessage(e)),
    });

  return { confirmBlock, unblock, pending: toggleBlock.isPending };
}

function ReportModal({
  open,
  conversationId,
  onClose,
}: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
}) {
  const t = useTranslations('Chat');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const report = useReportConversation(conversationId);
  const [reason, setReason] = useState<ChatReportReason | null>(null);
  const [note, setNote] = useState('');

  // Đóng là xoá lựa chọn: lần mở sau là một báo cáo mới, không mang lựa chọn cũ sang.
  const close = () => {
    setReason(null);
    setNote('');
    onClose();
  };

  const submit = () => {
    if (!reason) return;
    report.mutate(
      { reason, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          void message.success(t('reportSuccess'));
          close();
        },
        onError: (e) => void message.error(errorMessage(e)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      width={480}
      title={
        <div className={styles.reportHead}>
          <span className={styles.reportHeadIcon} aria-hidden>
            <FlagOutlined />
          </span>
          <div>
            <div className={styles.reportTitle}>{t('reportTitle')}</div>
            <div className={styles.reportIntro}>{t('reportIntro')}</div>
          </div>
        </div>
      }
      footer={[
        <Button key="cancel" onClick={close}>
          {t('cancel')}
        </Button>,
        <Button
          key="submit"
          type="primary"
          danger
          icon={<SendOutlined />}
          disabled={!reason}
          loading={report.isPending}
          onClick={submit}
        >
          {t('reportSubmit')}
        </Button>,
      ]}
    >
      <div className={styles.reportBody}>
        <div className={styles.reportLabel}>{t('reportReason')}</div>
        <div className={styles.reasonList} role="radiogroup" aria-label={t('reportReason')}>
          {CHAT_REPORT_REASON_VALUES.map((value) => {
            const selected = value === reason;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={cx(styles.reason, selected && styles.reasonSelected)}
                onClick={() => setReason(value)}
              >
                <span className={styles.reasonLabel}>{t(`reportReasons.${value}`)}</span>
                <span className={styles.reasonCheck} aria-hidden>
                  {selected ? <CheckCircleFilled /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.reportLabel}>{t('reportNoteLabel')}</div>
        <Input.TextArea
          className={styles.reportNote}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('reportNote')}
          maxLength={CHAT_REPORT_NOTE_MAX_LENGTH}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
        />
      </div>
    </Modal>
  );
}
