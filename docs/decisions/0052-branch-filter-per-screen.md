# ADR 0052 — Lọc chi nhánh theo TỪNG MÀN, sống trên URL; không có bộ chọn chung ở thanh trên

Ngày: 28/09/2026 · Trạng thái: Accepted · Mở rộng: 0004 (bộ lọc sống trên searchParams) ·
Liên quan: 0006, 0008, 0031, 0050 · Không ghi đè ADR nào

## Bối cảnh

Khu quản lý có một bộ chọn chi nhánh ở **thanh trên**, lưu ở Redux (`scope.branchId`), và bảy hook
dữ liệu tự đi đọc nó. Vì nó nằm trên vỏ trang, nó hiện ở **mọi** màn — nên nó đọc như một bộ lọc
toàn hệ thống. Thực tế không phải, và không thể là:

**`vehicles` là bảng DUY NHẤT trong schema mang `branch_id`** (cùng bản chiếu `public_listings` của
nó — ADR 0008). `bookings`, `booking_requests`, `receipts`, `drivers`, `tenant_customers`,
`wallets`, `vehicle_maintenance_records` — không bảng nào có cột chi nhánh. Mọi phép lọc chi nhánh
đang có đều là join `→ vehicle.branchId`. Hệ quả: chỉ những màn có dòng dữ liệu gắn với MỘT chiếc
xe mới lọc được.

Bốn hỏng hóc đo được trên `develop`:

1. **Lệch số ngay trong một màn hình.** Chọn "Hải Châu", mở Tổng quan: vẫn 40 xe. Nặng hơn:
   `GET /vehicles/fleet-summary` không nhận chi nhánh, nên dải chỉ số ghi "40 xe · 12 đang thuê"
   ngay phía trên một bảng có 4 dòng — hai câu trả lời khác nhau cho cùng một câu hỏi, cách nhau
   20px.
2. **Mất lựa chọn sau mỗi lần F5, và không gửi link được.** Đây chính xác là lý do ADR 0004 tồn
   tại, và ADR 0004 còn lấy đúng ví dụ này ("xem giúp lịch xe máy chi nhánh Q1 tháng 8") để giải
   thích vì sao bộ lọc phải ở URL.
3. **`GET /calendar/events` bỏ qua `branchId`** dù DTO đã khai nó. Lưới chỉ vẽ event của những hàng
   nó đang hiện, nên màn hình trông đúng trong khi phản hồi mang cả lịch — và **tên khách** — của
   chi nhánh khác.
4. **Phiên hỗ trợ gian hàng (ADR 0050) không lọc được gì.** `useBranchScope` cố ý tắt query trong
   phiên, vì một lượt hỏi `/branches` từ vỏ trang sẽ kéo chi nhánh của gian hàng được hỗ trợ vào
   cache CHÍNH của nhân sự nền tảng.

Hai phương án còn lại đã cân nhắc và loại:

- **Ép MỌI màn lọc theo bộ chọn chung.** Bất khả thi ở tầng dữ liệu: một gian hàng có **một ví**
  (ADR 0038) và một hội thoại cho mỗi khách — hai thứ không có nghĩa "theo chi nhánh" ở bất kỳ
  cách cắt nào. Còn sổ thu chi thì `receipts.vehicle_id` **nullable**: "lọc" nó mà không nói ra
  phần không gắn xe là âm thầm giấu bớt dòng và làm tổng không khớp.
- **Giữ bộ chọn, thêm chip "phạm vi" cho từng trang.** Phải thêm chip cho mọi trang, dạy người
  dùng ba màu chip, và vẫn phải làm thêm cơ chế giữ lựa chọn qua F5.

## Quyết định

1. **Bộ chọn chi nhánh biến mất khỏi thanh trên.** `scope.branchId` bị gỡ khỏi Redux;
   `BranchScopeSelector` và `useBranchScope`/`useBranchScopeParams` bị xoá. Trang **không có** ô
   chi nhánh thì hiển nhiên là toàn gian hàng — không cần chip hay chú thích nào.

2. **Ô "Chi nhánh" nằm trong thanh bộ lọc của từng màn lọc được, và giá trị sống trên URL**
   (`?branchId=<ULID>`) như mọi bộ lọc khác (ADR 0004). MƯỜI màn (bản đầu sáu, mở rộng ngay
   trong cùng PR — danh sách chuẩn là `BRANCH_AWARE_ROUTES` ở `branch-link.ts`): Danh sách xe ·
   Bảo dưỡng · Lịch
   thuê · Yêu cầu đặt xe · Chờ giao xe · Tất cả đơn thuê.

3. **Dải chỉ số và con số trên tab đi CÙNG chi nhánh với bảng nó đứng cạnh.** `fleet-summary`,
   `meta.statusCounts` của inbox, và `/maintenance/summary` đều nhận `branchId`. Chúng vẫn độc lập
   với trang và với ô lọc trạng thái — chi nhánh là ngoại lệ vì nó không lọc *trong* đội xe, nó
   **định nghĩa** đội xe đang xem.

4. **Một màn thì mọi tab của nó cùng một phạm vi.** Trung tâm bảo dưỡng có tab "Thiếu KM trả" đọc
   `GET /handovers/missing-odometer` — một endpoint khác, cùng một ô lọc. Ba tab lọc và tab thứ tư
   âm thầm hiện cả gian hàng là một lỗi khó thấy hơn hẳn việc không lọc gì.

5. **Chi nhánh đi theo LINK điều hướng, không qua bộ nhớ nào ở client** (`branch-link.ts`). Đang
   lọc Ninh Kiều thì mọi link menu/breadcrumb trỏ tới một màn lọc được đều mang sẵn `?branchId=`.

   Bản đầu làm bằng `localStorage` + điền lại trong `useEffect`, và đã bị bỏ: nó tạo HAI nguồn sự
   thật, URL luôn về sau một nhịp, nên màn hình kịp hỏi server "tất cả chi nhánh", vẽ N dòng rồi
   mới co lại còn 0. Không phải lỗi cài đặt mà là hệ quả tất yếu của việc dữ liệu đọc một nguồn
   còn lựa chọn nằm ở nguồn khác. Mang trên link thì URL đúng NGAY từ request đầu — không có gì
   để hoà giải nên không có gì để nhấp nháy, và luật gói gọn ở MỘT danh sách route.

   Đánh đổi có chủ đích: mở bookmark hay link ai đó gửi thì KHÔNG tự lọc theo lựa chọn cũ. Đường
   dẫn nói gì thấy nấy — chính loại "trạng thái vô hình" ngược lại là thứ điều 1 gỡ khỏi thanh trên.

5b. **`branchId` không dùng được thì tự NHẢ về "Tất cả chi nhánh"**, không để bảng rỗng không lời
   giải thích. Bốn đường: người dùng sửa tay URL · chi nhánh vừa bị ngừng · link của gian hàng
   khác · ô lọc không hiện (thiếu `branches.view`, hoặc gian hàng một chi nhánh) mà URL vẫn mang
   tham số. Phép kiểm CHỜ danh sách chi nhánh tải xong — lúc đang tải thì mọi giá trị đều trông
   như không hợp lệ, nhả ở đó là xoá đúng lựa chọn trong link người dùng vừa mở.

5c. ⚠️ **Nợ đã biết — huy hiệu và đích của nó nói hai phạm vi khác nhau.** `/manage/booking-requests`
   ăn theo chi nhánh như mọi màn khác, nhưng nó là mục menu DUY NHẤT mang huy hiệu, và huy hiệu
   đếm toàn gian hàng (điều 7). Người dùng đang lọc Đà Nẵng thấy huy hiệu "2", bấm vào ra rỗng.

   Đã thử cho đích không nhận chi nhánh từ link để khớp huy hiệu, rồi hoàn lại: tính nhất quán
   "mọi màn cùng ăn theo một chi nhánh" được ưu tiên hơn ở thời điểm này. Ba hướng xử lý, chọn MỘT
   ở đợt sau: (a) bỏ route khỏi `BRANCH_AWARE_ROUTES`; (b) huy hiệu đổi theo `branchId` trên URL —
   nhưng con số sẽ nhảy khi đi qua màn không lọc được; (c) màn đích nói rõ "huy hiệu đếm toàn gian
   hàng, bạn đang lọc X".

6. **Chi nhánh là GỢI Ý ở chỗ tạo dữ liệu, không phải rào chắn.** Nút "Thêm xe" mang `?branchId=`
   sang form và form điền sẵn nó (trước đây form luôn nhảy về chi nhánh **mặc định**, nên lưu xong
   xe biến khỏi đúng danh sách vừa mở). Bộ chọn xe khi tạo đơn mở sẵn ở chi nhánh đang lọc nhưng
   **đổi được tại chỗ**: điều một chiếc xe từ chi nhánh khác sang cho khách là việc bình thường.

7. **Huy hiệu "Yêu cầu đặt xe" trên menu đếm TOÀN GIAN HÀNG.** Nó sống ở vỏ trang và hiện ở mọi
   màn, kể cả những màn không có ô lọc nào; buộc nó theo một chi nhánh nghĩa là con số trên menu
   đổi theo trang người dùng đang đứng mà không trang nào giải thích vì sao.

8. **Thao tác GHI hàng loạt đọc CÙNG bộ lọc với lưới nó đứng trên.** Hai dialog "khoá toàn bộ xe
   ngày X" / "đặt giá hàng loạt" của lịch lấy trọn `useCalendarFilters`, chi nhánh gồm trong đó.
   Sót một vế ở đây không phải lỗi hiển thị: nó chiếm `vehicle_occupancies` của những chi nhánh
   người dùng còn không mở ra xem.

9. **`branchId` chỉ THU HẸP, không bao giờ mở rộng.** `tenantId` vẫn đến từ membership của phiên
   (CLAUDE.md mục 6, lằn ranh 1). Chi nhánh của gian hàng khác gửi vào chỉ ra danh sách rỗng, không
   phải 403 và không phải một đường đi ra ngoài. Một định nghĩa dùng chung — `@BranchIdQuery()` ở
   `apps/api/src/common/dto/branch-scope.ts` — cho cả tám DTO, để không chỗ nào quên `@Length(26, 26)`.

## KHÔNG lọc theo chi nhánh, và vì sao

> Bảng dưới là danh sách HIỆN HÀNH (bản đầu của ADR còn liệt kê Tổng quan · Doanh thu · Thu chi ·
> Công nợ — cả bốn đã CHUYỂN SANG lọc được ngay trong cùng PR; phần chung của sổ tiền được nói ra
> bằng `unassignedCount`/`unassignedCost`, xem "Phần chung khi lọc" bên dưới).

| Màn | Lý do |
| --- | --- |
| Số dư & rút tiền | **Một ví cho một gian hàng** (ADR 0038) — lọc theo chi nhánh là câu hỏi vô nghĩa |
| Khách hàng | `tenant_customers` không có chi nhánh; một khách thuê ở nhiều chi nhánh |
| Trò chuyện | Một hội thoại khách ↔ gian hàng |
| Tài xế | `drivers` không có chi nhánh; điều xe chéo chi nhánh là bình thường |
| Người dùng & phân quyền | Membership thuộc tenant |
| Cửa hàng · Chính sách · Chi nhánh · Hỗ trợ | Cấu hình chung |

## Hệ quả

- Ô lọc **tự ẩn** khi gian hàng có ≤ 1 chi nhánh hoặc người dùng thiếu `branches.view`. Khu Owner
  Lite (`/account/*`, chủ xe tuyến hoa hồng trần 3 xe) vì thế dùng lại nguyên các màn này mà không
  cần một nhánh điều kiện nào.
- Phiên hỗ trợ gian hàng (ADR 0050) **được lọc chi nhánh miễn phí**: các trang
  `/manage/admin/tenant-support/[contextId]/…` render chính component của gian hàng, và
  `SupportWorkspaceProvider` đã cấp một `QueryClient` riêng cho mỗi phiên — ô chọn hỏi đúng tenant
  đang được hỗ trợ và không đụng cache chính. Đây là thứ bộ chọn cũ không làm được.
- **Ô lọc KHÔNG phải cơ chế phân quyền.** Nếu sau này cần "nhân viên chỉ thấy chi nhánh của mình",
  đó là một thay đổi ở backend (membership mang chi nhánh + guard), độc lập với ADR này; ô lọc khi
  đó chỉ liệt kê những chi nhánh người đó được phép xem.
- `apps/mobile` **chưa đồng bộ** — ADR 0031 nói rõ hai bản không tự đồng bộ. Nợ đã biết, làm ở đợt
  riêng.

## Mở rộng tiếp theo — và điều kiện để một màn XỨNG ĐÁNG có ô lọc

Ba điều kiện, phải đủ cả ba:

1. **Mỗi dòng thuộc đúng MỘT chi nhánh, suy được tất định.** Hôm nay nghĩa là: dòng đó gắn với
   một chiếc xe.
2. **Người vận hành một chi nhánh có một câu hỏi HẰNG NGÀY mà bản toàn gian hàng trả lời sai.**
   Không có câu hỏi đó thì ô lọc chỉ là thêm một điều khiển để bấm nhầm.
3. **Lọc không âm thầm giấu dòng "không thuộc chi nhánh nào".** Có dòng như vậy thì giao diện
   phải NÓI RA, nếu không người dùng cộng tay ra một tổng khác với tổng hệ thống.

Điều 3 là thứ loại sổ thu chi khỏi đợt này, không phải điều 1.

| Ứng viên | Điều kiện | Trạng thái |
| --- | --- | --- |
| **Công nợ** (`/manage/debts`) | ✅✅✅ — đã `JOIN vehicles`, `bookings.vehicle_id` NOT NULL | ✅ **ĐÃ LÀM.** Không có dòng vô chủ nên tổng các chi nhánh đúng bằng tổng gian hàng — có test khoá đẳng thức đó |
| **Giao dịch thu chi** · **Tổng quan doanh thu** | ✅✅ / điều 3 đã giải | ✅ **ĐÃ LÀM.** Điều 3 giải bằng `ReceiptPageMetaDto.unassignedCount` + một dòng tường minh trên màn: *"Chưa gồm N khoản chung không gắn xe nào"*. **KHÔNG** phân bổ chi phí chung theo tỉ lệ — đó là một quyết định kế toán, không phải một bộ lọc. Bảy bề mặt cùng đi qua `FinanceScope.branchId` (một phép `EXISTS` sang `vehicles`) nên chúng không thể lệch nhau |
| **Tổng quan** (dashboard) | ✅✅ / điều 3 theo từng thẻ | ✅ **ĐÃ LÀM TRỌN** — cả bốn khối (xe · đơn · doanh thu tháng · thu chi hôm nay) đi theo cùng một chi nhánh. Lọc nửa vời ở đây là tái lập đúng cái hiểu lầm ADR này vừa gỡ |
| **Tài xế** | ❌ điều 1 — `drivers` KHÔNG có `branch_id` | Cần đổi schema. Nhu cầu thật: gian hàng 4 tỉnh mà ô chọn tài xế khi gán đơn đang đưa ra tài xế của cả bốn — một tài xế Cần Thơ không phục vụ chuyến Hà Nội |
| **Nhân viên chỉ thấy chi nhánh mình** | ❌ — `tenant_memberships` không có `branch_id` | **Không phải bộ lọc, mà là PHÂN QUYỀN.** Đây là trần thật của đợt này: hôm nay một `shop_staff` ở Cần Thơ vẫn xem được tiền của Hà Nội. Cần ADR riêng |
| Ví điểm · Rút tiền | ❌ điều 1 — một ví cho một gian hàng (ADR 0038) | Không bao giờ |
| Trò chuyện | ❌ điều 1 — một hội thoại cho mỗi khách, khách thuê ở hai chi nhánh vẫn một luồng | Không |
| Khách hàng | ❌ điều 1 — khách thuộc GIAN HÀNG; "từng thuê ở chi nhánh nào" là thuộc tính, không phải chỗ ở | Không |
| Chính sách thuê | ❌ điều 2 — chính sách theo gian hàng + ghi đè theo XE; khác nhau giữa chi nhánh đã có đường giải | Không |
| Hợp đồng | ❌ điều 2 — không có màn danh sách, chỉ có `/manage/contracts/[id]` | Không |
| Cửa hàng · Chi nhánh · Hỗ trợ · Đánh giá | ❌ điều 2 | Không |

## Một hàm, một phép quyết định phạm vi

`resolveBranchScope(requested, allowed?)` ở `apps/api/src/common/dto/branch-scope.ts` là chỗ DUY
NHẤT quyết định "truy vấn này được đọc chi nhánh nào". Hôm nay nó chỉ trả lại thứ client xin —
`branchId` mới là một bộ lọc do người dùng tự chọn, và ranh giới thật vẫn là `tenantId` từ phiên.

Nó tồn tại để bước kế tiếp — **phân quyền theo chi nhánh** — là "điền vào một hàm" chứ không phải
rải `if` vào chín nhóm endpoint. Khi `tenant_memberships` mang phạm vi được giao, phép GIAO viết ở
đây một lần; sót một chỗ khi đó không phải lỗi hiển thị mà là lỗ hổng dữ liệu.

Hai ngoại lệ có chủ đích, đều là SQL thô nên không dùng được hình dạng `where` của Prisma:
`MaintenanceService.board()/boardSummary()` và `FinanceOverviewService`. Khi phạm vi thành một TẬP
HỢP, chúng đổi sang `= ANY($n)` — và phải đổi CÙNG LÚC với `HandoversService`, nếu không tab
"Thiếu KM trả" lại nói khác ba tab kia.

## Endpoint đã đổi

| Endpoint | Thay đổi |
| --- | --- |
| `GET /calendar/events` | Áp `branchId` (DTO đã có, service bỏ qua) |
| `GET /vehicles/fleet-summary` | Nhận `branchId` (trước đây không nhận query nào) |
| `GET /maintenance` | Nhận `branchId` |
| `GET /maintenance/summary` | Nhận `branchId` (trước đây không nhận query nào) |
| `GET /handovers/missing-odometer` | Nhận `branchId` |

| `GET /debts` | Nhận `branchId` (`AND v.branch_id = …`, JOIN đã có sẵn) |
| `GET /receipts` | Nhận `branchId` + trả thêm `meta.unassignedCount` |
| `GET /finance/{summary,series,by-category,by-vehicle,by-customer}` | Nhận `branchId` qua `FinanceScope` |
| `POST /calendar/bulk-day/preview` | DTO gom về `@BranchIdQuery()` |

`GET /vehicles`, `/bookings`, `/booking-requests`, `/calendar/{resources,availability,daily-prices}`
và `/calendar/bulk-day/*` đã hỗ trợ sẵn — không đổi.

## Phân quyền theo chi nhánh — đã chốt và đã làm (cùng đợt)

Ô lọc **không** phải cơ chế phân quyền — nó chỉ giúp đỡ phải nhìn. Hai câu hỏi để mở ở bản nháp
đầu đã được chốt (29/09/2026) và làm ngay trong cùng PR:

1. **Một nhân viên phụ trách được NHIỀU chi nhánh** ⇒ bảng nối `membership_branches`
   `(membership_id, branch_id, tenant_id)` + cột `tenant_memberships.branch_scope`
   (`all` | `limited`). `limited` mà không có dòng nối nào = CHẶN HẾT (fail-closed); đường ghi
   hợp lệ không tạo ra được trạng thái đó (`resolveMemberBranchScope` bắt ít nhất 1 chi nhánh,
   CHECK ở DB gác lời mời).
2. **Chi nhánh là trục THỨ BA**, song song quyền × năng lực gói (ADR 0027). Nó chỉ thu hẹp dòng
   dữ liệu bắt nguồn từ một chiếc xe; ví điểm/hoá đơn/khai thuế cấp gian hàng không cắt theo
   chi nhánh được (ADR 0038) và không bị nó đụng tới.

Đường dữ liệu:

- `TenantScopeGuard` đọc `branch_scope` + `membership_branches` mỗi request ⇒
  `TenantContext.allowedBranchIds: string[] | null` (`null` = toàn gian hàng — mọi thành viên
  có từ trước mặc định `all`).
- MỌI service đã nhận `branchId` giờ nhận thêm `allowedBranchIds` (tham số BẮT BUỘC — quên là
  lỗi biên dịch) và đi qua `resolveBranchScope(requested, allowed)`: xin một chi nhánh ngoài
  phạm vi nhận `{ in: [] }` — danh sách rỗng, không phải 403 lộ tin.
- Đường GHI xe (`create`/`update`/`applyOcr`) gác bằng `assertAssignable(..., allowedBranchIds)`
  — không gán xe vào chi nhánh ngoài phạm vi mình được giao; ngoài phạm vi trả 404 như không
  tồn tại.
- Phạm vi giao ở HAI cửa: lời mời (`tenant_invites.branch_scope`/`branch_ids` — mảng, không
  bảng nối, vì lời mời là bản ghi tạm; chép sang `membership_branches` lúc nhận, lọc chi nhánh
  đã xoá, còn 0 thì TỪ CHỐI `INVITE_SCOPE_STALE` — xem bên dưới) và màn Nhân sự (`PATCH /members/:userId` — `branchScope` vắng
  mặt nghĩa là GIỮ NGUYÊN: đổi vai không âm thầm xoá phạm vi đã giao).
- Chủ gian hàng LUÔN `all` — giới hạn chủ shop là tự khoá mình khỏi gian hàng của chính mình.

### Vá sau review nội bộ (29/09/2026)

Review sâu trên diff tìm ra 5 lỗ; theo quyết định cùng ngày, đợt này chỉ đóng những lỗ sau:

- **Sổ tiền khi lọc chi nhánh nói ra phần CHUNG** — `unassignedCost`/`unassignedRevenue` của
  `/finance/summary` tính bằng câu RIÊNG không mang vế chi nhánh (giao `vehicle_id IS NULL` với
  EXISTS trên vehicles cho ra 0 vĩnh viễn); mẫu số `sharePercent` của `by-customer` lọc theo
  CÙNG phạm vi với các dòng — không lộ tổng toàn gian hàng cho người bị giới hạn.
- **`PATCH` chỉ-đổi-vai không chạm cột `branch_scope`** — chống lost-update mở quyền khi hai
  lượt sửa vai và sửa phạm vi chạy sát nhau.
- **Lượt nhận lời mời FAIL-CLOSED** — mọi chi nhánh trong lời mời đã chết ⇒ `INVITE_SCOPE_STALE`,
  không âm thầm hạ về `all`.
- Web: người bị giới hạn còn ĐÚNG MỘT chi nhánh thấy ô lọc KHOÁ mang tên chi nhánh đó; phiên hỗ
  trợ (ADR 0050) có ô lọc dù không thuộc tenant; bộ nhớ menu chỉ ghi khi hook gắn với URL; lỗi
  mạng tạm thời không làm URL bị nhả `branchId`.

### Đóng nốt phần phân quyền sau review ngoài (01/10/2026)

Bản 29/09 mới thu hẹp DANH SÁCH. Review ngoài chỉ ra rằng như vậy chưa phải phân quyền: route
theo id vẫn chỉ khoá `{ id, tenantId }`. Đợt này đóng phần đó:

- **Route theo id — `BranchScopeGuard` + `@BranchScoped(resource)`.** Khai phạm vi cạnh route,
  một guard thi hành: tra chi nhánh của tài nguyên (xe · đơn · yêu cầu · phiếu thu chi · chi
  nhánh · lịch khoá · hợp đồng · thanh toán) bằng một phép tra khoá chính, ngoài phạm vi trả
  **404 `NOT_FOUND`** — cùng mã mọi service đang dùng, để "có nhưng ở chi nhánh khác" không phân
  biệt được với "không tồn tại". `allowedBranchIds = null` đi qua không tốn truy vấn nào. Route
  con (`bookings/:id/handovers/...`, `vehicles/:id/maintenance/...`) được phủ bằng decorator ở
  class vì mọi bản ghi con đều buộc vào cha trong `where` của service.
- **Spec quét `branch-scope-coverage.spec.ts`.** Route có tham số trong controller
  `@TenantScoped()` phải có `@BranchScoped`, hoặc nằm trong danh sách cấp-gian-hàng KÈM LÝ DO.
  Lần quét đầu bắt thêm `vehicles/:id/daily-prices`, `vehicles/:id/*-settings`, `payments` mà
  danh sách review viết tay bỏ sót.
- **Trần giao quyền — `assertWithinActorScope`.** Không ai cấp được phạm vi rộng hơn của chính
  mình: người bị giới hạn không mời "Tất cả", không giao chi nhánh mình không phụ trách, không
  sửa vai/phạm vi hay gỡ một thành viên rộng hơn mình, không huỷ lời mời rộng hơn mình ⇒
  `BRANCH_SCOPE_EXCEEDED` (403). `/auth/me` trả `tenant.branchScope` để web khoá sẵn các ô đó.
- **`PATCH /members` — `roleKey` thành tuỳ chọn**, đối xứng với `branchScope`: cú PATCH chỉ đổi
  chi nhánh không gửi vai trò đang nằm trong cache nữa (từng có thể ghi đè một lượt hạ vai).
- **Khoá/giá hàng loạt trên Lịch.** Lệnh ghi chỉ nhận xe trong phạm vi; xem trước chỉ báo lô
  khoá phủ CHÍNH tập xe đang xem; gỡ lô (`DELETE …/blocks/:batchId?branchId=`) chỉ gỡ phần xe
  thuộc chi nhánh đang xem — một lô tạo lúc xem "Tất cả" phủ mọi chi nhánh, và tắt công tắc khi
  đang lọc chi nhánh A từng gỡ luôn khoá của chi nhánh B, kể cả với chủ shop.
- **Tạo phiếu thu chi** — đơn, xe và chi nhánh tự khai đều phải nằm trong phạm vi người tạo.
- **Sổ thu chi** — phạm vi chi nhánh và ô tìm kiếm đều là `OR`; spread cả hai thì vế sau ghi đè
  vế trước, nên gõ một chữ vào ô tìm là thấy phiếu mọi chi nhánh. Gom vào một `AND`.

### Cố ý KHÔNG cắt theo chi nhánh — tài nguyên cấp gian hàng

`limited` thu hẹp những gì bắt nguồn từ một CHIẾC XE. Những thứ dưới đây là quan hệ của cả gian
hàng, và cắt chúng theo chi nhánh làm sản phẩm SAI chứ không an toàn hơn:

- **Khách hàng, CCCD/GPLX, ghi chú, cờ rủi ro.** Một người thuê ở nhiều chi nhánh. Giấu khách
  theo chi nhánh là để nhân viên chi nhánh B cho thuê xe một khách mà chi nhánh A đã đánh dấu
  rủi ro — đúng thứ cờ rủi ro tồn tại để chặn.
- **Hội thoại chat.** Một luồng là một KHÁCH với gian hàng; xe chỉ nằm ở từng tin nhắn. Tách luồng
  theo chi nhánh là cắt đôi một cuộc trò chuyện.
- **Tài xế, danh mục thu chi, ticket hỗ trợ** — nhân sự/cấu hình chung của gian hàng.
- **Ví, tài khoản ngân hàng** — `@ShopOwnerOnly()`, chủ shop luôn `all`.

Muốn che những thứ này với một người, công cụ đúng là PERMISSION (bỏ `customers.view`…), không
phải phạm vi chi nhánh. Danh sách này nằm trong `branch-scope-coverage.spec.ts`; thêm một dòng
vào đó là một quyết định sản phẩm, phải ghi lý do.

## Phiếu thu chi tự mang chi nhánh (bổ sung 01/10/2026)

Bản đầu suy chi nhánh của một phiếu CHỈ qua `vehicle_id`, nên phiếu nhập tay không gắn xe không
thuộc chi nhánh nào. Đo trên dữ liệu thật: **122/562 phiếu (21,7%)** rơi vào nhóm đó. Hệ quả người
dùng gặp: lọc chi nhánh A ra 0, B ra 0, … E ra 0, nhưng TỔNG vẫn có khoản đó — không đối chiếu
được con số nào nữa.

**Chốt: `receipts.branch_id`, và phiếu NHẬP TAY bắt buộc quy được về một chi nhánh.**

1. **Chi nhánh của phiếu = `COALESCE(vehicle.branch_id, receipt.branch_id)`.** Có xe thì suy TỪ
   XE (không bao giờ lệch khi xe đổi chi nhánh); không xe thì đọc cột của chính phiếu. CHECK
   `receipts_branch_only_without_vehicle` cấm một phiếu mang cả hai — một phiếu hai nguồn chi
   nhánh là hai báo cáo nói hai số về cùng một đồng.
2. **Không có lựa chọn "toàn gian hàng".** Nó nghe hợp lý (marketing, phí phần mềm) nhưng tạo
   đúng cái rổ vô hình ở mọi màn lọc. Mỗi đồng đều phát sinh ở một chỗ có thật; chọn chỗ đó là
   việc của người nhập, không phải việc của báo cáo đi đoán. CHECK
   `receipts_manual_needs_branch_or_vehicle` giữ bất biến ở DATABASE, không ở tầng app.
3. **Bắt buộc, không phải tuỳ chọn.** Ô "Xe" vốn tuỳ chọn, và đó CHÍNH LÀ cách 122 phiếu mồ côi
   ra đời. Thêm một ô tuỳ chọn nữa là hẹn gặp lại cùng một lỗi sau vài tháng.
4. **Danh mục không suy ra được chi nhánh** — "Chi phí văn phòng" ở Quận 5 và ở Cầu Giấy là hai
   khoản mang đúng một cái tên. Nhưng danh mục CÓ suy ra được "khoản này của một chiếc xe":
   `finance_categories.requires_vehicle` bật cho Đổ xăng · Rửa xe · Bảo dưỡng · Sửa chữa · Giao
   nhận xe · Mua bảo hiểm · Phí quá giờ · Phí đền bù · Phí phạt nguội, và form bắt buộc chọn xe.
   Không có cờ này thì nhóm "đáng lẽ phải gắn xe" cứ trôi vào rổ chung cùng tiền thuê mặt bằng.
5. **Gian hàng một chi nhánh** thì ô điền sẵn và khoá (vẫn HIỆN để thấy khoản này vào đâu);
   **chưa có chi nhánh nào** thì nói thẳng bằng một cảnh báo — một ô bắt buộc mà bị ẩn là form
   chặn người dùng ở chỗ họ không nhìn thấy.

Số liệu sau khi backfill (migration `20261001100000`): 0 phiếu mồ côi, và Σ từng chi nhánh =
tổng gian hàng, khớp tuyệt đối.

## Đường về và bộ nhớ menu (bổ sung 29/09/2026)

Hai lỗ người dùng gặp thật sau bản đầu, và cách vá — cả hai đều KHÔNG mở lại cái bẫy
hai-nguồn-sự-thật:

1. **Vào chi tiết rồi quay lại mất chi nhánh** — nút "Quay lại" đẩy một đường dẫn trần. Vá bằng
   `withBranchReturn`: link sang màn chi tiết mang `branchId` như MẨU ĐƯỜNG VỀ (màn chi tiết
   không đọc nó để truy vấn), và `useBranchReturnHref` dựng lại link danh sách từ mẩu đó.
2. **Đi ngang một tab trung lập (Khách hàng, Ví…) rồi về là mất** — link menu chỉ đọc được URL
   đang đứng. Vá bằng `branch-memory.ts`: `localStorage` nhớ chi nhánh lọc GẦN NHẤT, CHỈ để
   điền tham số vào href menu; các TRANG vẫn chỉ đọc URL nên không có gì phải hoà giải sau
   render. Đứng trên một màn lọc được thì bộ nhớ bị ghi đè theo URL (kể cả về "tất cả" = null).
