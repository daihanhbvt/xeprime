import { ApiProperty } from '@nestjs/swagger';
import type { UserBadgeCounts } from '@xeprime/types';

/**
 * Huy hiệu của người đang đăng nhập — một response cho TẤT CẢ các con số hiện ở khung ứng dụng.
 *
 * `implements UserBadgeCounts`: cùng bộ số này còn đi qua document `user_badges/{uid}` trên
 * Firestore, và hai đường phải mang đúng một hình dạng. Thiếu một field ở đây là typecheck đỏ,
 * không phải là badge nhảy số lúc chạy.
 */
export class UserBadgesDto implements UserBadgeCounts {
  @ApiProperty({ example: 2, description: 'Tin chưa đọc ở hộp thư KHÁCH của tôi.' })
  chatCustomer!: number;

  @ApiProperty({
    example: 5,
    description:
      'Tin chưa đọc ở hộp thư GIAN HÀNG, gộp mọi gian hàng tôi là thành viên active. Đây là số ' +
      'DÙNG CHUNG của gian hàng: một nhân viên đọc là cả đội hết chưa đọc.',
  })
  chatShop!: number;

  @ApiProperty({ example: 3, description: 'Thông báo in-app chưa đọc (chuông).' })
  notificationsUnread!: number;

  @ApiProperty({
    example: 1_757_600_000_000,
    description:
      'Mốc máy chủ (epoch ms) lúc đếm. Client so nó với `updatedAt` của bản chiếu realtime để ' +
      'một document cũ không đè lên lượt đọc mới hơn — ví dụ sau một quãng `FIRESTORE_ENABLED=false`.',
  })
  asOf!: number;
}
