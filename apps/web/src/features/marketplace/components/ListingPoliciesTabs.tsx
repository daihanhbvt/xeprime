'use client';

import { useId, useState } from 'react';
import {
  COLLATERAL_ASSET_TYPE_LABEL,
  COLLATERAL_MODE,
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  DRIVER_SURCHARGE_KIND_SPEC,
  SERVICE_TYPE,
  appliesExcessMileage,
  requiredIdentityDocuments,
  type CollateralAssetType,
  type CustomerDocumentType,
  type DriverSurchargeKind,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { PublicListingDetail } from '../types';
import styles from './ListingPoliciesTabs.module.css';

interface ListingPoliciesTabsProps {
  listing: PublicListingDetail;
  activeService: string;
}

export function ListingPoliciesTabs({ listing, activeService }: ListingPoliciesTabsProps) {
  const vatTitleId = useId();
  const [activeTab, setActiveTab] = useState<'general' | 'documents' | 'collateral' | 'cancellation'>('general');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const activeTerms =
    listing.rentalTerms?.find((term) => term.serviceType === activeService) ?? null;

  const thresholdKindOf = (kind: string) =>
    DRIVER_SURCHARGE_KIND_SPEC[kind as DriverSurchargeKind]?.threshold ?? null;

  const windowLabels = (windows: ReadonlyArray<{ start: string; end: string }>) =>
    windows.map((window) => `${window.start}–${window.end}`);
  const pickupWindows = windowLabels(listing.handover?.pickupWindows ?? []);
  const returnWindows = windowLabels(listing.handover?.returnWindows ?? []);

  const requiredDocs =
    activeTerms?.requiredDocuments && activeTerms.requiredDocuments.length > 0
      ? activeTerms.requiredDocuments
      : requiredIdentityDocuments(activeService);

  return (
    <section className={styles.wrap} aria-label="Quy định thuê xe">
      <h2 className={styles.title}>Quy định & Chính sách</h2>

      <div className={styles.tabList} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'general'}
          className={`${styles.tabButton} ${activeTab === 'general' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('general')}
        >
          Quy định chung
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'documents'}
          className={`${styles.tabButton} ${activeTab === 'documents' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Giấy tờ thuê xe
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'collateral'}
          className={`${styles.tabButton} ${activeTab === 'collateral' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('collateral')}
        >
          Tài sản thế chấp
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cancellation'}
          className={`${styles.tabButton} ${activeTab === 'cancellation' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('cancellation')}
        >
          Điều khoản huỷ
        </button>
      </div>

      <div className={styles.content}>
        {/* TAB 1: QUY ĐỊNH CHUNG */}
        <div role="tabpanel" aria-labelledby="tab-general" hidden={activeTab !== 'general'}>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>Sử dụng xe đúng mục đích, không vận chuyển hàng cấm, chất cháy nổ hoặc gia súc, gia cầm.</span>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>Nghiêm cấm hút thuốc, kẹo cao su hoặc xả rác bừa bãi trong khoang xe (phụ phí vệ sinh nếu vi phạm).</span>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>Bàn giao và trả xe đúng khung giờ đã thỏa thuận, giữ gìn xe trong tình trạng ban đầu.</span>
          </div>

          {/* Hạn mức quãng đường */}
          {appliesExcessMileage(activeService) && listing.mileagePolicy && (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Hạn mức quãng đường</h3>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  Bao gồm {fmt.km(listing.mileagePolicy.includedKmPerDay)}/ngày. Phụ phí {fmt.money(listing.mileagePolicy.excessFeePerKm)}/km vượt hạn mức.
                </span>
              </div>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  Hạn mức quãng đường tính theo tổng số ngày thuê có tính phí. Phí vượt quãng đường được thanh toán trực tiếp cho chủ xe khi hoàn tất trả xe.
                </span>
              </div>
            </div>
          )}

          {/* Khung giờ giao nhận */}
          {(pickupWindows.length > 0 || returnWindows.length > 0) && (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Khung giờ giao nhận</h3>
              {pickupWindows.length > 0 && (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>Khung giờ nhận xe: {pickupWindows.join(', ')}</span>
                </div>
              )}
              {returnWindows.length > 0 && (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>Khung giờ trả xe: {returnWindows.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* Phụ phí tài xế nếu có */}
          {activeService === SERVICE_TYPE.WITH_DRIVER && (
            <div className={styles.subSection}>
              <h3 className={styles.subSectionTitle}>Phụ phí có thể phát sinh</h3>
              {(listing.driverSurchargeRules?.length ?? 0) > 0 && (
                <ul className={styles.surchargeList}>
                  {listing.driverSurchargeRules!.map((rule) => (
                    <li key={rule.kind}>
                      {domainLabel('driverSurchargeKind', rule.kind)}: {fmt.money(rule.amount)} / {domainLabel('driverSurchargeUnit', rule.unit)}
                      {rule.thresholdValue != null && thresholdKindOf(rule.kind)
                        ? ` · Ngưỡng: ${rule.thresholdValue} ${domainLabel('driverSurchargeThresholdKind', thresholdKindOf(rule.kind) ?? '')}`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
              {activeTerms?.depositMode && (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>
                    {activeTerms.depositMode === 'none'
                      ? 'Không cần cọc giữ chuyến đối với dịch vụ có tài xế.'
                      : `Cọc dịch vụ có tài xế: ${domainLabel('driverDepositMode', activeTerms.depositMode)}`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Hoá đơn VAT */}
          {listing.vatInvoiceSupported && (
            <section className={styles.subSection} aria-labelledby={vatTitleId}>
              <h3 id={vatTitleId} className={styles.subSectionTitle}>Hoá đơn VAT</h3>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  Chủ xe hỗ trợ xuất hoá đơn VAT cho tiền thuê xe trả cho chủ xe. Bạn trao đổi thông tin xuất hoá đơn và xác nhận trực tiếp với chủ xe.
                </span>
              </div>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  Đây là thoả thuận giữa bạn và chủ xe: XePrime không xuất hoá đơn thay chủ xe, và các khoản bạn trả cho XePrime (như phí dịch vụ) không nằm trong hoá đơn này.
                </span>
              </div>
            </section>
          )}

          <div className={styles.noteBox}>
            💡 Mẹo: Chụp ảnh tình trạng xe (ngoại thất & công tơ mét) lúc nhận và trả xe để đối chiếu minh bạch.
          </div>
        </div>

        {/* TAB 2: GIẤY TỜ THUÊ XE */}
        <div role="tabpanel" aria-labelledby="tab-documents" hidden={activeTab !== 'documents'}>
          {activeTerms && (
            <>
              <h3 className={styles.subSectionTitle}>Thủ tục & điều kiện thuê</h3>

              {activeTerms.instantBookEnabled && (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>
                    <span className={styles.instantBadge}>Đặt ngay</span>
                    Yêu cầu hợp lệ trong khung giờ cho phép sẽ được xác nhận tự động.
                  </span>
                </div>
              )}

              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  Giấy tờ cần có: {requiredDocs.map((doc) => domainLabel('customerDocumentType', doc, CUSTOMER_DOCUMENT_TYPE_LABEL[doc as CustomerDocumentType] ?? doc)).join(', ')}.
                </span>
              </div>

              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  <strong>Đối chiếu:</strong> {activeTerms.identityVerifyMethod ? domainLabel('identityVerifyMethod', activeTerms.identityVerifyMethod) : 'Đối chiếu bản gốc trực tiếp khi nhận xe'}.
                </span>
              </div>

              {activeTerms.termsText && (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>{activeTerms.termsText}</span>
                </div>
              )}

              {activeTerms.requireTermsAcceptance && (
                <div className={styles.ruleItem}>
                  <span className={styles.bullet} />
                  <span>Yêu cầu ký cam kết / đồng ý với điều khoản thuê xe riêng của chủ xe trước khi nhận bàn giao.</span>
                </div>
              )}

              <div className={styles.noteBox}>
                📌 Tài khoản của bạn cần xác thực bằng lái trước khi gửi yêu cầu thuê để được duyệt nhanh nhất.
              </div>
            </>
          )}
        </div>

        {/* TAB 3: TÀI SẢN THẾ CHẤP */}
        <div role="tabpanel" aria-labelledby="tab-collateral" hidden={activeTab !== 'collateral'}>
          <h3 className={styles.subSectionTitle}>Bảo đảm & giấy tờ cần có</h3>

          {listing.noCollateral ? (
            <div className={styles.ruleItem}>
              <span className={styles.bullet} />
              <span><strong>Không yêu cầu đặt cọc hay thế chấp tài sản:</strong> Xe này miễn thế chấp tài sản / cọc xe máy khi nhận xe.</span>
            </div>
          ) : listing.collateral ? (
            <>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  <strong>Hình thức thế chấp:</strong> {listing.collateral.mode === COLLATERAL_MODE.CASH ? 'Tiền mặt' : listing.collateral.assetTypes && listing.collateral.assetTypes.length > 0 ? `Xe máy hoặc tài sản có giá trị tương đương (${listing.collateral.assetTypes.map((type) => domainLabel('collateralAssetType', type, COLLATERAL_ASSET_TYPE_LABEL[type as CollateralAssetType] ?? type)).join(', ')})` : 'Xe máy hoặc tài sản có giá trị tương đương'}.
                </span>
              </div>
              <div className={styles.ruleItem}>
                <span className={styles.bullet} />
                <span>
                  <strong>Giá trị thế chấp yêu cầu:</strong> {listing.collateral.depositAmount && Number(listing.collateral.depositAmount) > 0 ? fmt.money(listing.collateral.depositAmount) : '0 đ'}
                </span>
              </div>
            </>
          ) : (
            <div className={styles.ruleItem}>
              <span className={styles.bullet} />
              <span>Không yêu cầu thế chấp tài sản hoặc trao đổi trực tiếp với chủ xe khi nhận bàn giao.</span>
            </div>
          )}

          <div className={styles.noteBox}>
            ⚠️ Tiền thế chấp (cọc nhận xe) được giao trực tiếp cho chủ xe khi nhận xe và hoàn trả 100% khi trả xe nguyên vẹn.
          </div>
        </div>

        {/* TAB 4: ĐIỀU KHOẢN HUỶ */}
        <div role="tabpanel" aria-labelledby="tab-cancellation" hidden={activeTab !== 'cancellation'}>
          <h3 className={styles.subSectionTitle}>Chính sách huỷ chuyến & giữ chỗ</h3>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span><strong>Huỷ miễn phí:</strong> Khách hàng được huỷ chuyến miễn phí trước giờ nhận xe tối thiểu 4 tiếng.</span>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span><strong>Thời gian giữ chỗ:</strong> Sau khi chủ xe chấp thuận, bạn có 120 phút để thanh toán tiền giữ chỗ để chốt xe.</span>
          </div>
          <div className={styles.ruleItem}>
            <span className={styles.bullet} />
            <span>Nếu quá thời gian giữ chỗ mà chưa thanh toán, yêu cầu sẽ tự động giải phóng trên lịch cho khách khác.</span>
          </div>
          <div className={styles.noteBox}>
            🛡️ Chính sách bảo vệ người thuê: Nếu chủ xe huỷ chuyến sau khi đã nhận tiền giữ chỗ, bạn sẽ được hoàn tiền 100% vào tài khoản.
          </div>
        </div>
      </div>
    </section>
  );
}
