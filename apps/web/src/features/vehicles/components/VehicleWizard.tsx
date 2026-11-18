'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Card, Steps } from 'antd';
import { useIsDesktop, useIsMobile } from '@/hooks/use-media-query';
import type { ReactNode } from 'react';
import styles from './VehicleWizard.module.css';

export interface WizardStep {
  key: string;
  /** Nhãn hiện trên cột bước ở desktop — dùng ĐÚNG chữ của Figma. */
  title: string;
  /** Nhãn rút gọn cho mobile. */
  shortTitle: string;
  /** Dòng phụ dưới nhãn ở cột bước dọc (Figma `24352:79234` - "Đầy đủ thông tin phương tiện"). */
  description?: string;
}

interface VehicleWizardProps {
  steps: readonly WizardStep[];
  current: number;
  /** Bấm vào một bước trên thanh. Không truyền → thanh bước chỉ để xem. */
  onStepChange?: (index: number) => void;
  /**
   * `'sequential'` (mặc định) — chỉ bấm về bước ĐÃ đi qua. Dùng khi **tạo mới**: bước sau chưa
   * điền gì, cho nhảy tới sẽ vượt qua phần kiểm tra từng bước.
   *
   * `'free'` — bấm tới bất kỳ bước nào. Dùng khi **sửa**: mọi giá trị đã có sẵn và hợp lệ.
   */
  navigation?: 'sequential' | 'free';
  /**
   * Tiêu đề trong thẻ nội dung. Bỏ trống khi `plain` — mỗi khối con tự mang tiêu đề trong
   * `WizardSection` của nó (Figma: bước 1 là HAI thẻ "Ảnh xe" + "Thông tin xe").
   */
  heading?: string;
  description?: ReactNode;
  /** Cảnh báo cấp bước — hiện ngay trên nội dung, trước các thẻ. */
  notice?: ReactNode;
  /**
   * `true` = không bọc nội dung vào MỘT thẻ: các con là những `WizardSection` riêng. Mặc định
   * vẫn là một thẻ có `heading` (bước hồ sơ chủ xe của luồng nhanh).
   */
  plain?: boolean;
  children: ReactNode;
  /** Hàng nút cuối trang; wizard KHÔNG tự quyết nhãn nút vì tạo và sửa khác nhau. */
  footer: ReactNode;
  /**
   * Cột phải (xem trước trên Marketplace + mức sẵn sàng gửi duyệt). Là một SLOT chứ không phải
   * dữ liệu: vỏ wizard không biết nội dung đó là gì.
   */
  aside?: ReactNode;
}

/**
 * Vỏ wizard tạo xe - Figma `24352:70390` (Thêm xe mới, 17/11/2026).
 *
 * Desktop (>1024px) ba cột: thẻ BƯỚC dọc bên trái (số bước + dòng phụ), nội dung ở giữa, cột phụ
 * bên phải; hàng nút nằm DƯỚI cả ba cột, dồn phải. Tablet/mobile: thanh bước nằm ngang trên đầu,
 * cột phụ xuống dưới nội dung, hàng nút dính đáy màn hình.
 *
 * Dùng `Steps` của AntD thay vì tự vẽ: nó lo sẵn `aria-current`, thứ tự đọc và trạng thái hoàn
 * thành. CSS chỉ vẽ lại vòng tròn theo Figma (vàng viền cho bước hiện tại, vàng đặc có dấu tick cho
 * bước đã qua, xám cho bước chưa tới).
 */
export function VehicleWizard({
  steps,
  current,
  onStepChange,
  heading,
  description,
  notice,
  plain = false,
  children,
  footer,
  aside,
  navigation = 'sequential',
}: VehicleWizardProps) {
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const free = navigation === 'free';

  const stepper = (
    <Steps
      className={isDesktop ? styles.stepsVertical : styles.steps}
      current={current}
      /*
       * `responsive` mặc định BẬT: dưới 532px AntD tự đổi sang dọc. Phải tắt - mobile xếp các bước
       * trên MỘT hàng, `titlePlacement="vertical"` mới là thứ đưa nhãn xuống dưới số.
       */
      responsive={false}
      orientation={isDesktop ? 'vertical' : 'horizontal'}
      titlePlacement={isMobile ? 'vertical' : 'horizontal'}
      onChange={
        onStepChange
          ? (next) => {
              if (free || next < current) onStepChange(next);
            }
          : undefined
      }
      items={steps.map((step, index) => ({
        key: step.key,
        title: isMobile ? step.shortTitle : step.title,
        content: isDesktop ? step.description : undefined,
        icon: <StepDot state={index < current ? 'done' : index === current ? 'current' : 'wait'} />,
        disabled: !onStepChange || (!free && index >= current),
      }))}
    />
  );

  const body = plain ? (
    <div className={styles.plainBody}>
      {notice}
      {children}
    </div>
  ) : (
    <Card className={styles.contentCard}>
      {heading ? <h2 className={styles.heading}>{heading}</h2> : null}
      {description ? <p className={styles.description}>{description}</p> : null}
      {notice}
      <div className={styles.body}>{children}</div>
    </Card>
  );

  return (
    <div className={styles.root}>
      <div className={aside ? styles.layoutWithAside : styles.layout}>
        {/* Đệm của thẻ đặt ở BODY qua CSS module (xem `.stepperCard`) - không ép inline. */}
        <Card className={styles.stepperCard}>{stepper}</Card>
        <div className={styles.main}>{body}</div>
        {aside ? <aside className={styles.aside}>{aside}</aside> : null}
      </div>
      <div className={styles.footer}>{footer}</div>
    </div>
  );
}

/** Vòng tròn của một bước - ba trạng thái theo Figma. Trang trí thuần, AntD lo phần đọc màn hình. */
function StepDot({ state }: { state: 'done' | 'current' | 'wait' }) {
  return (
    <span className={styles[`dot_${state}`]} aria-hidden="true">
      {state === 'done' ? <CheckOutlined /> : <span className={styles.dotCore} />}
    </span>
  );
}

/**
 * Một thẻ nội dung trong bước (Figma: "Ảnh xe", "Thông tin xe", "Dịch vụ & giá"...). Tiêu đề +
 * dòng phụ bên trái, nhãn phụ (vd "6 ảnh bắt buộc") bên phải.
 */
export function WizardSection({
  title,
  description,
  badge,
  id,
  children,
}: {
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  /** Neo để nhảy tới khi báo lỗi. */
  id?: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Card className={styles.sectionCard} id={id}>
      <section aria-labelledby={headingId}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderText}>
            <h2 className={styles.sectionTitle} id={headingId}>
              {title}
            </h2>
            {description ? <p className={styles.sectionDescription}>{description}</p> : null}
          </div>
          {badge ? <div className={styles.sectionBadge}>{badge}</div> : null}
        </div>
        <div className={styles.sectionBody}>{children}</div>
      </section>
    </Card>
  );
}
