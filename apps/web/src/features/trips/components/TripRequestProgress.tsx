'use client';

import { CheckOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { cx } from '@/lib/cx';
import styles from './TripRequestProgress.module.css';

/** Các mốc của một YÊU CẦU thuê, từ phía khách — ADR 0044: gửi → duyệt → giữ chỗ → xác nhận. */
export type TripRequestStep = 'sent' | 'response' | 'hold' | 'confirmed';

interface TripRequestProgressProps {
  /** Mốc khách đang đứng. */
  current: TripRequestStep;
  /**
   * Chuyến có khoản giữ chỗ phải trả online không (`fees.holdAmount` của bảng kê). Không có thì
   * không có mốc "Hoàn tất giữ chỗ" — vẽ nó ra là hứa một bước không bao giờ tới (ADR 0044 điều 4).
   */
  hasHoldStage: boolean;
  /** Khung thẻ do màn chứa quyết — cùng khuôn với các thẻ đứng cạnh. */
  className?: string;
}

/**
 * "Tiến trình yêu cầu" — Figma `19727:61272` (chờ phản hồi) · `19737:23963` (chờ giữ chỗ): các mốc
 * xếp DỌC, mỗi mốc một tiêu đề + một câu nói điều gì xảy ra ở đó.
 *
 * Khác `CustomerTripTimeline` (đúng HAI mốc của một chuyến đã thành đơn: xác nhận → hoàn thành):
 * thanh này kể đoạn TRƯỚC khi có đơn, nơi khách cần biết gửi xong chưa phải là xong. Hai thanh
 * không bao giờ cùng hiện — yêu cầu chờ duyệt không có dòng thời gian hai mốc.
 *
 * Trạng thái từng mốc đọc được bằng trình đọc màn hình (`srOnly`), không chỉ bằng màu của chấm.
 */
export function TripRequestProgress({ current, hasHoldStage, className }: TripRequestProgressProps) {
  const t = useTranslations('Trips.requestProgress');
  const titleId = useId();
  const steps: TripRequestStep[] = hasHoldStage
    ? ['sent', 'response', 'hold', 'confirmed']
    : ['sent', 'response', 'confirmed'];
  // Mốc không có trên thanh ('hold' của chuyến không thu trước) ⇒ đứng ở mốc xác nhận ngay sau nó.
  const currentIndex = steps.indexOf(steps.includes(current) ? current : 'confirmed');

  return (
    <section className={cx(styles.progress, className)} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        {t('title')}
      </h2>
      <ol className={styles.steps}>
        {steps.map((step, index) => {
          const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
          return (
            <li
              key={step}
              className={styles.step}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className={cx(styles.marker, styles[state])} aria-hidden="true">
                {state === 'done' ? <CheckOutlined /> : <span className={styles.dot} />}
              </span>
              <div className={styles.text}>
                <p className={styles.stepTitle}>
                  {t(`steps.${step}.title`)}
                  <span className={styles.srOnly}>{` — ${t(`state.${state}`)}`}</span>
                </p>
                <p className={styles.stepBody}>
                  {/*
                    Mốc giữ chỗ nhìn từ TRƯỚC nói điều kiện ("chỉ thanh toán khi chủ xe đã nhận");
                    khi khách đã đứng ở đó thì điều kiện đã thoả — câu phải nói việc cần làm ngay.
                  */}
                  {step === 'hold' && state === 'current'
                    ? t('steps.hold.bodyCurrent')
                    : t(`steps.${step}.body`)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
