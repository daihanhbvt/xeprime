'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  COLLATERAL_MODE,
  HOLD_FREE_CANCEL_HOURS,
  HOLD_PAYMENT_WINDOW_MINUTES,
  IDENTITY_VERIFY_METHOD,
  SERVICE_TYPE,
  appliesExcessMileage,
  requiredIdentityDocuments,
  serviceRequiresDriverLicence,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import { useDriverSurchargeLine } from '../hooks/use-driver-surcharge-line';
import type { PublicListingDetail } from '../types';
import styles from './ListingPoliciesTabs.module.css';

interface ListingPoliciesTabsProps {
  listing: PublicListingDetail;
  activeService: string;
}

const TABS = ['general', 'documents', 'collateral', 'cancellation'] as const;
type PolicyTab = (typeof TABS)[number];

/**
 * Bốn tab "Quy định & Chính sách" của trang chi tiết xe — Figma v2 `19707:83494`.
 *
 * Câu chữ là của nền tảng, SỐ LIỆU là của tin đăng: khung giờ, phụ phí, hạn mức km, giấy tờ, thế chấp
 * đọc từ `listing`; hai mốc thời gian của khoản giữ chỗ đọc từ hằng số dùng chung với server
 * (`HOLD_FREE_CANCEL_HOURS`, `HOLD_PAYMENT_WINDOW_MINUTES`) — không gõ lại "4 tiếng", "120 phút".
 * Huỷ miễn phí tính XUÔI từ lúc chủ xe nhận chuyến (ADR 0032 · ADR 0044), không ngược từ giờ nhận xe.
 *
 * Thanh tab theo mẫu WAI-ARIA Tabs: tab và panel nối nhau bằng id, mũi tên trái/phải/Home/End đổi
 * tab, chỉ tab đang chọn nằm trong thứ tự Tab của bàn phím.
 */
export function ListingPoliciesTabs({ listing, activeService }: ListingPoliciesTabsProps) {
  const t = useTranslations('Listings.detail');
  const tp = useTranslations('Listings.detail.policies');
  const baseId = useId();
  const vatTitleId = useId();
  const [activeTab, setActiveTab] = useState<PolicyTab>('general');
  const tabRefs = useRef<Partial<Record<PolicyTab, HTMLButtonElement | null>>>({});
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const tabId = (tab: PolicyTab) => `${baseId}-tab-${tab}`;
  const panelId = (tab: PolicyTab) => `${baseId}-panel-${tab}`;

  const selectTab = (tab: PolicyTab, focus = false) => {
    setActiveTab(tab);
    if (focus) tabRefs.current[tab]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.indexOf(activeTab);
    const next =
      event.key === 'ArrowRight'
        ? TABS[(index + 1) % TABS.length]
        : event.key === 'ArrowLeft'
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === 'Home'
            ? TABS[0]
            : event.key === 'End'
              ? TABS[TABS.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next, true);
  };

  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === activeService) ?? null;

  const windowLabels = (windows: ReadonlyArray<{ start: string; end: string }>) =>
    windows.map((window) => `${window.start}–${window.end}`).join(', ');
  const pickupWindows = windowLabels(listing.handover?.pickupWindows ?? []);
  const returnWindows = windowLabels(listing.handover?.returnWindows ?? []);

  const requiredDocs =
    activeTerms?.requiredDocuments && activeTerms.requiredDocuments.length > 0
      ? activeTerms.requiredDocuments
      : requiredIdentityDocuments(activeService);

  const surchargeLine = useDriverSurchargeLine();

  const collateralMode = (() => {
    const collateral = listing.collateral;
    if (!collateral) return null;
    if (collateral.mode === COLLATERAL_MODE.CASH) return tp('collateral.modeCash');
    const types = (collateral.assetTypes ?? []).map((type) =>
      domainLabel('collateralAssetType', type),
    );
    return types.length > 0
      ? tp('collateral.modeAssetTypes', { types: types.join(', ') })
      : tp('collateral.modeAsset');
  })();

  const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

  const tabButton = (tab: PolicyTab) => (
    <button
      key={tab}
      ref={(el) => {
        tabRefs.current[tab] = el;
      }}
      type="button"
      role="tab"
      id={tabId(tab)}
      aria-controls={panelId(tab)}
      aria-selected={activeTab === tab}
      tabIndex={activeTab === tab ? 0 : -1}
      className={cx(styles.tabButton, activeTab === tab && styles.tabActive)}
      onClick={() => selectTab(tab)}
      onKeyDown={handleTabKeyDown}
    >
      {tp(`tabs.${tab}`)}
    </button>
  );

  const panelProps = (tab: PolicyTab) => ({
    role: 'tabpanel' as const,
    id: panelId(tab),
    'aria-labelledby': tabId(tab),
    hidden: activeTab !== tab,
    tabIndex: 0,
  });

  return (
    <section className={styles.wrap} aria-label={tp('label')}>
      <h2 className={styles.title}>{tp('title')}</h2>

      <div className={styles.tabList} role="tablist" aria-label={tp('title')}>
        {TABS.map(tabButton)}
      </div>

      <div className={styles.content}>
        {/* TAB 1: QUY ĐỊNH CHUNG */}
        <div {...panelProps('general')}>
          {(['purpose', 'noSmoking', 'handover'] as const).map((key) => (
            <div key={key} className={styles.ruleItem}>
              <span className={styles.bullet} />
              <span>{tp(`general.${key}`)}</span>
            </div>
          ))}

          {/* Hạn mức quãng đường — chỉ dịch vụ có tính km vượt */}
          {appliesExcessMileage(activeService) && listing.mileagePolicy ? (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>{t('mileage.title')}</h3>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  {t('mileage.included', {
                    km: fmt.km(listing.mileagePolicy.includedKmPerDay),
                    fee: fmt.money(listing.mileagePolicy.excessFeePerKm),
                  })}
                </span>
              </div>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>{t('mileage.note')}</span>
              </div>
            </div>
          ) : null}

          {/* Khung giờ giao nhận */}
          {pickupWindows || returnWindows ? (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>{t('handover.title')}</h3>
              {pickupWindows ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>{t('handover.pickup', { windows: pickupWindows })}</span>
                </div>
              ) : null}
              {returnWindows ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>{t('handover.return', { windows: returnWindows })}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Phụ phí tài xế — chỉ khi khách đang xem dịch vụ CÓ TÀI XẾ */}
          {activeService === SERVICE_TYPE.WITH_DRIVER ? (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>{t('surcharges.title')}</h3>
              {(listing.driverSurchargeRules?.length ?? 0) > 0 ? (
                <ul className={styles.surchargeList}>
                  {listing.driverSurchargeRules.map((rule) => (
                    <li key={rule.kind}>{surchargeLine(rule)}</li>
                  ))}
                </ul>
              ) : null}
              {activeTerms?.depositMode ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>
                    {activeTerms.depositMode === 'none'
                      ? t('terms.driverDepositNone')
                      : t('terms.driverDeposit', {
                          mode: domainLabel('driverDepositMode', activeTerms.depositMode),
                        })}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Hoá đơn VAT (ADR 0059) */}
          {listing.vatInvoiceSupported ? (
            <section className={styles.subSection} aria-labelledby={vatTitleId}>
              <h3 id={vatTitleId} className={styles.subSectionTitle}>
                {t('vatInvoice.title')}
              </h3>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>{t('vatInvoice.body')}</span>
              </div>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>{t('vatInvoice.disclaimer')}</span>
              </div>
            </section>
          ) : null}

          <div className={styles.noteBox}>
            <span aria-hidden="true">💡 </span>
            {tp('general.tip')}
          </div>
        </div>

        {/* TAB 2: GIẤY TỜ THUÊ XE */}
        <div {...panelProps('documents')}>
          {activeTerms ? (
            <>
              <h3 className={styles.subSectionTitle}>{t('terms.title')}</h3>

              {activeTerms.instantBookEnabled ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>
                    <span className={styles.instantBadge}>{t('terms.instantBook')}</span>
                    {t('terms.instantBookHint')}
                  </span>
                </div>
              ) : null}

              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  {t('terms.documents', {
                    documents: requiredDocs
                      .map((doc) => domainLabel('customerDocumentType', doc))
                      .join(', '),
                  })}
                </span>
              </div>

              {/*
                Nhãn `identityVerifyMethod` đã là cả câu ("Đối chiếu qua VNeID") — không ghép thêm
                "Đối chiếu:" phía trước. Chưa khai thì là đối chiếu bản gốc tại chỗ.
              */}
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  {domainLabel(
                    'identityVerifyMethod',
                    activeTerms.identityVerifyMethod ?? IDENTITY_VERIFY_METHOD.IN_PERSON,
                  )}
                </span>
              </div>

              {activeTerms.termsText ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>{activeTerms.termsText}</span>
                </div>
              ) : null}

              {activeTerms.requireTermsAcceptance ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>{t('terms.acceptanceRequired')}</span>
                </div>
              ) : null}

              {/* Tự lái / dài hạn cần bằng lái ĐÃ XÁC THỰC của tài khoản khách (ADR 0057). */}
              {serviceRequiresDriverLicence(activeService) ? (
                <div className={styles.noteBox}>
                  <span aria-hidden="true">📌 </span>
                  {tp('documents.licenceRequired')}
                </div>
              ) : null}
            </>
          ) : (
            <p className={styles.empty}>{tp('documents.empty')}</p>
          )}
        </div>

        {/* TAB 3: TÀI SẢN THẾ CHẤP */}
        <div {...panelProps('collateral')}>
          <h3 className={styles.subSectionTitle}>{t('collateralTitle')}</h3>

          {listing.noCollateral ? (
            <div className={styles.ruleItem}>
              <span className={styles.bullet} />
              <span>{tp.rich('collateral.none', { strong })}</span>
            </div>
          ) : listing.collateral ? (
            <>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>{tp.rich('collateral.mode', { strong, mode: collateralMode ?? '' })}</span>
              </div>
              {listing.collateral.depositAmount &&
              !isZeroMoney(listing.collateral.depositAmount) ? (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>
                    {tp.rich('collateral.amount', {
                      strong,
                      amount: fmt.money(listing.collateral.depositAmount),
                    })}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.ruleItem}>
              <span className={styles.bullet} />
              <span>{tp('collateral.unknown')}</span>
            </div>
          )}

          <div className={styles.noteBox}>
            <span aria-hidden="true">⚠️ </span>
            {tp('collateral.note')}
          </div>
        </div>

        {/* TAB 4: ĐIỀU KHOẢN HUỶ */}
        <div {...panelProps('cancellation')}>
          <h3 className={styles.subSectionTitle}>{tp('cancellation.title')}</h3>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>{tp.rich('cancellation.free', { strong, hours: HOLD_FREE_CANCEL_HOURS })}</span>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>
              {tp.rich('cancellation.hold', { strong, minutes: HOLD_PAYMENT_WINDOW_MINUTES })}
            </span>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>{tp('cancellation.release')}</span>
          </div>
          <div className={styles.noteBox}>
            <span aria-hidden="true">🛡️ </span>
            {tp('cancellation.protection')}
          </div>
        </div>
      </div>
    </section>
  );
}
