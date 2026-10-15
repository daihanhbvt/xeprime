import { Injectable, NotFoundException } from '@nestjs/common';
import { API_ERROR_CODE } from '@xeprime/types';
import { branchMapTarget } from '../../common/address-view';
import { marketplaceVehicleWhere } from '../../common/marketplace-vehicle-scope';
import { GeoService } from '../geo/geo.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Ảnh bản đồ tĩnh của ĐIỂM NHẬN XE trên trang xe công khai (ADR 0061 điều 1).
 *
 * Toạ độ đọc từ chi nhánh của chính chiếc xe, không bao giờ từ request: endpoint là công khai, và
 * nhận toạ độ tuỳ ý là để bất kỳ ai vẽ bản đồ bất kỳ đâu bằng tiền của mình. Đọc theo xe thì tập ảnh
 * vẽ được bị chặn bởi số chi nhánh, và cache của `GeoService` biến chi phí thành một lượt cho mỗi
 * chi nhánh. Điểm ghim theo đúng quy tắc toạ độ của trang xe (`branchMapTarget`): trang xe không
 * hiện toạ độ thì ảnh cũng không lộ ra.
 */
@Injectable()
export class PickupMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
  ) {}

  /** PNG của điểm nhận xe. 404 khi xe không trên chợ, chi nhánh chưa có điểm ghim, hoặc không vẽ được. */
  async forListing(vehicleId: string): Promise<Buffer> {
    const vehicle = await this.prisma.vehicle.findFirst({
      // Cùng cổng vào với báo giá công khai: chỉ xe ĐANG THẬT SỰ nằm ngoài chợ — không thì endpoint
      // này thành công cụ dò vị trí chi nhánh của những chiếc xe đã bị gỡ xuống.
      where: { id: vehicleId, ...marketplaceVehicleWhere() },
      select: { branch: { select: { address: true, latitude: true, longitude: true } } },
    });
    const target = branchMapTarget(vehicle?.branch);
    const png = target ? await this.geo.staticMap(target.point, target.label) : null;
    if (!png) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không có bản đồ cho điểm nhận xe này',
      });
    }
    return png;
  }
}
