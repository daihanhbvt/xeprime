import { Injectable } from '@nestjs/common';
import { computeUserBadges } from '@xeprime/prisma';
import { PrismaService } from '../../prisma/prisma.service';
import { UserBadgesDto } from './dto/badges.dto';

/**
 * Huy hiệu của người đang đăng nhập.
 *
 * Service này cố ý MỎNG: phép đếm nằm ở `@xeprime/prisma` vì worker cũng cần đúng nó để chiếu
 * sang Firestore, và hai bản sao của một phép đếm là hai con số sẽ lệch nhau. Ở đây chỉ còn
 * phạm vi — "người đang đăng nhập", lấy từ phiên, không bao giờ từ tham số của client.
 */
@Injectable()
export class BadgesService {
  constructor(private readonly prisma: PrismaService) {}

  async ofUser(userId: string): Promise<UserBadgesDto> {
    const counts = await computeUserBadges(this.prisma, userId);
    /*
     * `asOf` lấy SAU khi đếm xong: nó phải nói "số này đúng tới thời điểm này", và một mốc lấy
     * trước sẽ khiến một bản chiếu ghi trong lúc đang đếm bị coi là cũ hơn thực tế.
     */
    return { ...counts, asOf: Date.now() };
  }
}
