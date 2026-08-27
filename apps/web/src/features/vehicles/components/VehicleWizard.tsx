'use client';

import { Card, Steps } from 'antd';
import { useIsMobile } from '@/hooks/use-media-query';
import type { ReactNode } from 'react';
import styles from './VehicleWizard.module.css';

export interface WizardStep {
  key: string;
  /** Nhãn hiện trên thanh bước ở desktop — dùng ĐÚNG chữ của Figma. */
  title: string;
  /** Nhãn rút gọn cho mobile. */
  shortTitle: string;
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
   * `'free'` — bấm tới bất kỳ bước nào. Dùng khi **sửa**: mọi giá trị đã có sẵn và hợp lệ, bắt
   * người sửa bấm "Tiếp tục" bốn lần chỉ để đổi một dòng ở bước 4 là vô nghĩa.
   */
  navigation?: 'sequential' | 'free';
  /** Tiêu đề trong thẻ nội dung, đã đánh số ("1. Thông tin cơ bản của xe"). */
  heading: string;
  description?: ReactNode;
  /** Cảnh báo cấp bước — ví dụ xe đang công khai (Figma `193:2297`). */
  notice?: ReactNode;
  children: ReactNode;
  /** Hàng nút cuối thẻ; wizard KHÔNG tự quyết nhãn nút vì tạo và sửa khác nhau. */
  footer: ReactNode;
}

/**
 * Vỏ wizard cho tạo/sửa xe — Figma `193:1590` (thanh bước) + `193:1615` (thẻ nội dung).
 *
 * Hai thẻ tách rời có chủ đích: thanh bước là **thẻ riêng** phía trên, nội dung bước là thẻ thứ
 * hai bên dưới, và hàng nút nằm TRONG thẻ nội dung chứ không dính đáy màn hình.
 *
 * Dùng `Steps` của AntD thay vì tự vẽ: nó lo sẵn `aria-current`, thứ tự đọc và trạng thái
 * hoàn thành. CSS chỉ chỉnh kích thước vòng tròn về 28px cho khớp Figma.
 */
export function VehicleWizard({
  steps,
  current,
  onStepChange,
  heading,
  description,
  notice,
  children,
  footer,
  navigation = 'sequential',
}: VehicleWizardProps) {
  const isMobile = useIsMobile();
  const free = navigation === 'free';

  return (
    <div className={styles.root}>
      {/* Đệm của thẻ đặt ở BODY qua CSS module (xem `.stepperCard`) — không ép inline. */}
      <Card className={styles.stepperCard}>
        {/*
          Mobile: số nằm TRÊN nhãn rút gọn — bốn bước vừa đúng một hàng
          ngang ở 390px. Để `horizontal` như desktop thì mỗi bước chiếm trọn một dòng.
        */}
        {/*
          Không dùng `size="small"`: kích thước do CSS var `--ant-cmp-steps-*` trong module
          quyết định; class `.ant-steps-small` đặt lại cùng các var đó với specificity ngang
          nhau và thắng nhờ thứ tự tiêm (bẫy D19).
        */}
        <Steps
          className={styles.steps}
          current={current}
          /*
           * `responsive` mặc định BẬT: dưới 532px AntD tự đổi `direction` sang `vertical`, tức
           * mỗi bước chiếm trọn một dòng. Phải tắt hẳn — thiết kế mobile xếp bốn bước trên MỘT
           * hàng, và `titlePlacement="vertical"` bên dưới mới là thứ đưa nhãn xuống dưới số.
           */
          responsive={false}
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
            disabled: !onStepChange || (!free && index >= current),
          }))}
        />
      </Card>

      <Card className={styles.contentCard}>
        <h2 className={styles.heading}>{heading}</h2>
        {description ? <p className={styles.description}>{description}</p> : null}
        {notice}
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>{footer}</div>
      </Card>
    </div>
  );
}
