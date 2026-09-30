import { useLocalSearchParams } from 'expo-router';
import { HANDOVER_TYPE, HANDOVER_TYPE_VALUES, type HandoverType } from '@xeprime/types';
import { HandoverScreen } from '@/features/handovers/HandoverScreen';

/**
 * Biên bản giao (`pickup`) hoặc nhận (`return`) của một đơn.
 *
 * Một route cho cả hai chiều: chúng dùng chung form, chỉ khác vài trường (hư hỏng phát sinh chỉ
 * có ở chiều trả) và khác trạng thái đơn mà việc xác nhận chuyển tới. Hai file là hai bản sao
 * của cùng một màn.
 */
export default function HandoverRoute() {
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();

  // Deep link có thể mang chiều lạ — rơi về `pickup` thay vì nổ giữa màn hình.
  const handoverType: HandoverType = (HANDOVER_TYPE_VALUES as string[]).includes(type)
    ? (type as HandoverType)
    : HANDOVER_TYPE.PICKUP;

  return <HandoverScreen bookingId={id} type={handoverType} />;
}
