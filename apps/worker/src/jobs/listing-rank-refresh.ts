import { refreshListingRankScore, type PrismaClient } from '@xeprime/prisma';

/**
 * Tính lại điểm xếp hạng "phù hợp" của toàn bộ xe đang hiển thị trên chợ.
 *
 * Công thức sống ở `@xeprime/prisma` → `refreshListingRankScore`; job này chỉ quyết định KHI NÀO
 * chạy. Ba trong bốn thành phần của điểm đã được `ListingsService` cập nhật ngay lúc dữ liệu
 * đổi (duyệt/sửa xe, đánh giá mới), nên nếu chỉ có chúng thì job này thừa.
 *
 * Nó tồn tại vì hai thành phần KHÔNG có sự kiện nào báo:
 *
 *   · **Độ mới** phai theo thời gian thật. Không ai gọi "hôm nay xe này cũ hơn hôm qua", nên
 *     thiếu nhịp ngày thì mọi xe giữ nguyên điểm độ-mới của ngày nó được duyệt, và một xe đăng
 *     từ năm ngoái vẫn được tính là vừa lên sàn.
 *   · **Số chuyến đã hoàn thành** đổi khi một chuyến kết thúc — một sự kiện thuộc module
 *     booking, không thuộc đường ghi snapshot. Nối thêm một lời gọi ở đó sẽ là writer thứ hai
 *     cho cùng một cột (ADR 0008 §1); nhịp ngày mua lại tính đúng đắn đó với cái giá là con số
 *     trễ tối đa một ngày — mà một chuyến vừa xong không cần đổi thứ tự chợ trong vòng vài giờ.
 *
 * Idempotent: chạy lại trong cùng một ngày cho ra gần đúng giá trị cũ và `IS DISTINCT FROM`
 * trong câu UPDATE khiến phần không đổi không bị ghi.
 */
export async function refreshListingRanks(prisma: PrismaClient): Promise<number> {
  return refreshListingRankScore(prisma);
}
