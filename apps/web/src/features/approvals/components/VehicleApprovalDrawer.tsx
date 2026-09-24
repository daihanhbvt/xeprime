'use client';

import {
  CarOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  PictureOutlined,
  RightOutlined,
  ShopOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Collapse, Tag, type AlertProps, type CollapseProps } from 'antd';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  APPROVAL_DECISION,
  APPROVAL_STATUS,
  APPROVAL_STATUS_META,
  STOREFRONT_KIND,
  VEHICLE_PUBLIC_MIN_IMAGES,
  VEHICLE_REVIEW_BASIS,
  missingVehicleReviewChecks,
  type ApprovalDecision,
  type ApprovalStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import {
  isStaleApprovalError,
  useVehicleApproval,
  useVehicleApprovalDecision,
} from '../hooks/use-vehicle-approvals';
import { hasApprovalBlockers, pricingPolicyRows, vehicleInfoRows } from '../review-rows';
import type { VehicleApprovalDetail } from '../types';
import { ApproveDialog, ReasonDialog } from './DecisionDialogs';
import { ReviewChecklist } from './ReviewChecklist';
import { ReviewFieldGrid } from './ReviewFieldGrid';
import { ReviewFeatures, ReviewGallery, ReviewHistory, ReviewPickupSource } from './ReviewSections';
import styles from './VehicleApprovalDrawer.module.css';

interface VehicleApprovalDrawerProps {
  taskId: string | null;
  /** Phiếu liền trước / liền sau trong trang hàng đợi đang xem — `null` ở hai đầu. */
  previousId: string | null;
  nextId: string | null;
  onNavigate: (taskId: string) => void;
  onClose: () => void;
}

/** Khối mở sẵn: đủ để quyết định mà không phải bấm; tiện nghi và lịch sử mở khi cần. */
const DEFAULT_OPEN_SECTIONS = ['gallery', 'vehicle', 'pricing', 'pickup'];

const DECIDED_TONE: Partial<Record<ApprovalStatus, AlertProps['type']>> = {
  [APPROVAL_STATUS.APPROVED]: 'success',
  [APPROVAL_STATUS.REJECTED]: 'error',
  [APPROVAL_STATUS.NEEDS_REVISION]: 'warning',
};

/**
 * Chi tiết MỘT phiếu duyệt xe — panel rộng (`DetailDrawer size="xl"`): hồ sơ bên trái, danh mục
 * kiểm tra bên phải (dính khi cuộn), thanh quyết định dính ở đáy.
 *
 * Ba hành động, và chúng KHÔNG đối xứng:
 *  - **Phê duyệt**: chỉ sáng khi đủ năm mục kiểm tra thủ công (`missingVehicleReviewChecks` —
 *    cùng hàm backend dùng để chặn), và luôn qua một bước xác nhận.
 *  - **Yêu cầu bổ sung** / **Từ chối**: dùng được bất cứ lúc nào — người duyệt trả xe về ngay khi
 *    thấy vấn đề đầu tiên — nhưng BẮT BUỘC lý do gửi chủ xe.
 *
 * Xe SỐNG đã lệch khỏi hồ sơ gửi duyệt (`approvalBlockers`: sửa trường căn cước, hoặc không còn
 * đạt điều kiện lên chợ): Phê duyệt tắt và panel nói vì sao — duyệt lúc này là đưa lên chợ một
 * chiếc xe chưa ai xem. Backend chặn cùng điều đó (409) dưới khoá dòng.
 *
 * Phiếu đã có người khác xử lý / xe vừa đổi: server trả 409, hook nạp lại, hộp thoại đóng, và
 * panel hiện trạng thái thật — không có nút nào còn mời bấm vô ích.
 */
export function VehicleApprovalDrawer({
  taskId,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: VehicleApprovalDrawerProps) {
  const t = useTranslations('Approvals');
  const { message, modal } = App.useApp();
  const errorMessage = useErrorMessage();
  const { data: detail, isLoading, isError, refetch } = useVehicleApproval(taskId);
  const decision = useVehicleApprovalDecision();
  /*
   * Hộp thoại GẮN VỚI PHIẾU đã mở nó: chuyển sang phiếu khác (trước/sau, link) thì hộp thoại của
   * phiếu cũ tự không còn — không có cách nào gửi lý do từ chối xe A lên phiếu của xe B.
   */
  const [dialogState, setDialogState] = useState<{
    taskId: string;
    kind: ApprovalDecision;
  } | null>(null);
  const dialog = dialogState && dialogState.taskId === taskId ? dialogState.kind : null;
  const openDialog = (kind: ApprovalDecision) => {
    if (taskId) setDialogState({ taskId, kind });
  };
  // Chỉ đóng hộp thoại của ĐÚNG phiếu vừa có kết quả — người duyệt có thể đã sang phiếu khác.
  const closeDialog = (id: string | null = taskId) =>
    setDialogState((current) => (current && current.taskId === id ? null : current));
  const topRef = useRef<HTMLDivElement>(null);
  const noteDirtyRef = useRef(false);
  const handleNoteDirty = useCallback((dirty: boolean) => {
    noteDirtyRef.current = dirty;
  }, []);
  const shownTaskId = detail?.approvalTaskId ?? null;

  // Hồ sơ mới hiện ra: đưa vùng cuộn về đầu hồ sơ đó.
  useEffect(() => {
    // `?.()`: jsdom (test) không có `scrollIntoView`; trình duyệt thật thì luôn có.
    topRef.current?.scrollIntoView?.({ block: 'start' });
  }, [shownTaskId]);

  /**
   * Rời phiếu (trước/sau/đóng) khi ghi chú nội bộ còn chữ chưa lưu ⇒ hỏi lại. Bỏ qua lặng lẽ là
   * xoá mất ghi chú người duyệt vừa gõ — và không có bản nháp nào để lấy lại.
   */
  const leave = (action: () => void) => {
    if (!noteDirtyRef.current) {
      action();
      return;
    }
    modal.confirm({
      title: t('drawer.unsavedNote.title'),
      content: t('drawer.unsavedNote.body'),
      okText: t('drawer.unsavedNote.discard'),
      cancelText: t('drawer.unsavedNote.stay'),
      okButtonProps: { danger: true },
      onOk: () => {
        noteDirtyRef.current = false;
        action();
      },
    });
  };

  const pending = detail?.approvalStatus === APPROVAL_STATUS.PENDING;
  const manualComplete = detail
    ? missingVehicleReviewChecks(detail.manualChecks).length === 0
    : false;
  const blocked = Boolean(detail && pending && hasApprovalBlockers(detail.approvalBlockers));
  // Lượt quyết định đang bay CỦA PHIẾU NÀY — lượt của phiếu trước không khoá nút của phiếu sau.
  const deciding = decision.isPending && decision.variables?.id === taskId;
  const busyKind = deciding ? decision.variables?.kind : null;

  function decide(kind: ApprovalDecision, reason?: string) {
    if (!taskId) return;
    const id = taskId;
    decision.mutate(
      { id, kind, reason },
      {
        onSuccess: () => {
          message.success(t(`done.${kind}`));
          closeDialog(id);
        },
        onError: (error) => {
          message.error(errorMessage(error));
          // Thứ đang hiện đã cũ (người khác vừa xử lý, xe vừa đổi…): hộp thoại không còn gì để
          // hỏi — panel nạp lại và nói trạng thái thật.
          if (isStaleApprovalError(error)) closeDialog(id);
        },
      },
    );
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(taskId)}
        onClose={() => leave(onClose)}
        size="xl"
        closeAtEnd
        ariaLabel={
          detail ? t('drawer.ariaLabel', { name: detail.vehicle.name }) : t('drawer.title')
        }
        title={
          <div className={styles.headTitle}>
            <span className={styles.headLabel}>{t('drawer.title')}</span>
            {detail ? <span className={styles.headCode}>{detail.vehicle.code}</span> : null}
            {detail ? (
              <StatusTag
                value={detail.approvalStatus as ApprovalStatus}
                meta={APPROVAL_STATUS_META}
                group="approvalStatus"
              />
            ) : null}
          </div>
        }
        extra={
          <div className={styles.headNav}>
            <Button
              size="small"
              icon={<LeftOutlined />}
              aria-label={t('drawer.previous')}
              title={t('drawer.previous')}
              disabled={!previousId}
              onClick={() => previousId && leave(() => onNavigate(previousId))}
            />
            <Button
              size="small"
              icon={<RightOutlined />}
              aria-label={t('drawer.next')}
              title={t('drawer.next')}
              disabled={!nextId}
              onClick={() => nextId && leave(() => onNavigate(nextId))}
            />
          </div>
        }
        loading={isLoading}
        error={isError && !detail}
        errorTitle={t('drawer.loadError')}
        onRetry={() => void refetch()}
        bodyClassName={styles.body}
        footer={
          detail ? (
            pending ? (
              <div className={styles.footerBar}>
                <FooterHint blocked={blocked} ready={manualComplete} />
                <div className={styles.footerActions}>
                  <Button
                    onClick={() => openDialog(APPROVAL_DECISION.REQUEST_REVISION)}
                    disabled={deciding}
                  >
                    {t('actions.requestRevision')}
                  </Button>
                  <Button
                    danger
                    onClick={() => openDialog(APPROVAL_DECISION.REJECT)}
                    disabled={deciding}
                  >
                    {t('actions.reject')}
                  </Button>
                  <Button
                    type="primary"
                    disabled={
                      blocked ||
                      !manualComplete ||
                      (deciding && busyKind !== APPROVAL_DECISION.APPROVE)
                    }
                    loading={busyKind === APPROVAL_DECISION.APPROVE}
                    onClick={() => openDialog(APPROVAL_DECISION.APPROVE)}
                  >
                    {t('actions.approve')}
                  </Button>
                </div>
              </div>
            ) : (
              <span className={styles.footerHint}>{t('footer.decided')}</span>
            )
          ) : null
        }
      >
        {detail ? (
          /*
           * `key` theo PHIẾU: mọi trạng thái cục bộ của hồ sơ — khối đang mở, ghi chú đang gõ, cảnh
           * báo xung đột — thuộc về một xe. Sang xe khác là dựng lại từ đầu, không bao giờ mang
           * chữ của xe A sang lưu vào phiếu xe B.
           */
          <div key={detail.approvalTaskId} ref={topRef} className={styles.layout}>
            <div className={styles.main}>
              <ReviewIntro detail={detail} blocked={blocked} />
              <Collapse
                className={styles.collapse}
                defaultActiveKey={DEFAULT_OPEN_SECTIONS}
                items={sectionItems(detail, t)}
              />
            </div>
            <aside className={styles.side} aria-label={t('checklist.title')}>
              <ReviewChecklist detail={detail} onNoteDirtyChange={handleNoteDirty} />
            </aside>
          </div>
        ) : null}
      </DetailDrawer>

      <ReasonDialog
        kind={dialog === APPROVAL_DECISION.APPROVE ? null : dialog}
        submitting={deciding}
        onSubmit={(reason) =>
          dialog && dialog !== APPROVAL_DECISION.APPROVE && decide(dialog, reason)
        }
        onClose={() => closeDialog()}
      />
      <ApproveDialog
        open={dialog === APPROVAL_DECISION.APPROVE}
        vehicleName={detail?.vehicle.name ?? ''}
        submitting={busyKind === APPROVAL_DECISION.APPROVE}
        onConfirm={() => decide(APPROVAL_DECISION.APPROVE)}
        onClose={() => closeDialog()}
      />
    </>
  );
}

/** Dòng gợi ý ở thanh quyết định — luôn có chữ, không chỉ màu. */
function FooterHint({ blocked, ready }: { blocked: boolean; ready: boolean }) {
  const t = useTranslations('Approvals.footer');
  if (blocked) {
    return (
      <span className={cx(styles.footerHint, styles.footerHintBlocked)}>
        <ExclamationCircleOutlined aria-hidden />
        {t('blocked')}
      </span>
    );
  }
  return (
    <span className={cx(styles.footerHint, ready && styles.footerHintReady)}>
      {ready ? <CheckCircleOutlined aria-hidden /> : <InfoCircleOutlined aria-hidden />}
      {ready ? t('ready') : t('hint')}
    </span>
  );
}

/**
 * Vì sao chưa phê duyệt được: tên từng trường căn cước chủ xe đã sửa sau khi gửi, và từng điều kiện
 * lên chợ xe hiện tại không còn đạt — cùng nhãn với cột danh mục, để người duyệt đối chiếu được.
 */
function BlockersAlert({ blockers }: { blockers: VehicleApprovalDetail['approvalBlockers'] }) {
  const t = useTranslations('Approvals');
  return (
    <Alert
      type="warning"
      showIcon
      className={styles.introAlert}
      title={t('drawer.blockers.title')}
      description={
        <>
          {blockers.changedLockedFields.length > 0 ? (
            <>
              <span className={styles.caption}>{t('drawer.blockers.changed')}</span>
              <ul className={styles.blockerList}>
                {blockers.changedLockedFields.map((field) => (
                  <li key={field}>{t(`fields.${field}`)}</li>
                ))}
              </ul>
            </>
          ) : null}
          {blockers.missingRequirements.length > 0 ? (
            <>
              <span className={styles.caption}>{t('drawer.blockers.missing')}</span>
              <ul className={styles.blockerList}>
                {blockers.missingRequirements.map((key) => (
                  <li key={key}>
                    {t(`checklist.auto.items.${key}`, { min: VEHICLE_PUBLIC_MIN_IMAGES })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <span className={styles.prose}>{t('drawer.blockers.next')}</span>
        </>
      }
    />
  );
}

/** Tên xe + nhãn loại xe / nguồn đăng + các cảnh báo về nguồn dữ liệu và trạng thái phiếu. */
function ReviewIntro({ detail, blocked }: { detail: VehicleApprovalDetail; blocked: boolean }) {
  const t = useTranslations('Approvals');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const status = detail.approvalStatus as ApprovalStatus;
  const isShop = detail.source.storefrontKind === STOREFRONT_KIND.SHOP;
  const kindLabel = domainLabel('storefrontKind', detail.source.storefrontKind);

  return (
    <div className={styles.intro}>
      <h2 className={styles.vehicleName}>{detail.vehicle.name}</h2>
      <div className={styles.chips}>
        <Tag icon={<CarOutlined aria-hidden />} className={styles.chip}>
          {domainLabel('vehicleType', detail.vehicle.vehicleType)}
        </Tag>
        <Tag
          icon={isShop ? <ShopOutlined aria-hidden /> : <UserOutlined aria-hidden />}
          className={styles.chip}
        >
          {isShop
            ? t('drawer.sourceChip', { kind: kindLabel, name: detail.source.name })
            : kindLabel}
        </Tag>
      </div>

      {blocked ? <BlockersAlert blockers={detail.approvalBlockers} /> : null}

      {detail.basis === VEHICLE_REVIEW_BASIS.LIVE ? (
        <Alert
          type="warning"
          showIcon
          className={styles.introAlert}
          title={t('drawer.liveBasis.title')}
          description={t('drawer.liveBasis.body')}
        />
      ) : null}

      {status !== APPROVAL_STATUS.PENDING ? (
        <Alert
          type={DECIDED_TONE[status] ?? 'info'}
          showIcon
          className={styles.introAlert}
          title={t('drawer.decided.title', {
            status: domainLabel('approvalStatus', detail.approvalStatus),
          })}
          description={
            <>
              {detail.reviewedAt ? (
                <span className={styles.caption}>
                  {t('drawer.decided.byline', {
                    at: fmt.dateTime(detail.reviewedAt),
                    name: detail.reviewedByName ?? t('history.system'),
                  })}
                </span>
              ) : null}
              {detail.reason ? (
                <span className={styles.prose}>
                  {t('drawer.decided.reason', { reason: detail.reason })}
                </span>
              ) : null}
            </>
          }
        />
      ) : null}
    </div>
  );
}

function sectionItems(
  detail: VehicleApprovalDetail,
  t: ReturnType<typeof useTranslations<'Approvals'>>,
): CollapseProps['items'] {
  const label = (icon: ReactNode, text: string) => (
    <span className={styles.sectionLabel}>
      {icon}
      {text}
    </span>
  );
  return [
    {
      key: 'gallery',
      label: label(<PictureOutlined aria-hidden />, t('sections.gallery')),
      children: <ReviewGallery vehicle={detail.vehicle} />,
    },
    {
      key: 'vehicle',
      label: label(<CarOutlined aria-hidden />, t('sections.vehicle')),
      children: <ReviewFieldGrid rows={vehicleInfoRows(detail.vehicle)} />,
    },
    {
      key: 'pricing',
      label: label(<DollarOutlined aria-hidden />, t('sections.pricing')),
      children: (
        <div className={styles.stack}>
          <p className={detail.policy ? styles.caption : styles.muted}>
            {detail.policy
              ? t(`values.policySource.${detail.policy.source}`)
              : t('values.noPolicy')}
          </p>
          <ReviewFieldGrid rows={pricingPolicyRows(detail)} />
        </div>
      ),
    },
    {
      key: 'pickup',
      label: label(<EnvironmentOutlined aria-hidden />, t('sections.pickup')),
      children: <ReviewPickupSource detail={detail} />,
    },
    {
      key: 'features',
      label: label(<UnorderedListOutlined aria-hidden />, t('sections.features')),
      children: <ReviewFeatures vehicle={detail.vehicle} />,
    },
    {
      key: 'history',
      label: label(<HistoryOutlined aria-hidden />, t('sections.history')),
      children: <ReviewHistory logs={detail.logs} />,
    },
  ];
}
