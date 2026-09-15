# Runbook — đối chiếu backfill "hoàn khoản giữ chỗ sang ví điểm"

Ngày viết: 14/09/2026 · Đối tượng: migration `prisma/migrations/20260911190000_refund_to_wallet`
· ADR 0023 (sổ công nợ append-only) · ADR 0033 điều 5–6

Migration này vừa đổi schema vừa **chuyển tiền trên sổ**: mọi khoản `hold_refunds` đang chờ của
khách CÓ tài khoản được ghi có vào ví điểm và lật sang `credited`. Nó chạy tự động trong bước
`migrate deploy` của deploy, nên không có cách nào "chạy thử rồi xem" trên chính môi trường đó —
bằng chứng phải được thu THEO CẶP: một ảnh chụp trước khi deploy, một loạt truy vấn sau khi deploy.

> **Không đối chiếu bằng chuỗi `note`.** Bản thân migration dùng
> `note = 'Chuyển khoản hoàn đang chờ sang ví điểm (ADR 0033)'` làm khoá nối, và đó là điểm yếu
> của nó, không phải hợp đồng. `note` là text tự do, người vận hành sửa được, bút toán đảo sau này
> cũng mang note khác. Khoá THẬT có ba mảnh, đều có ràng buộc DB đỡ:
>
> | Mảnh | Ở đâu |
> | --- | --- |
> | `wallet_entries (wallet_id, kind, source_type, source_ref_id)` | unique `wallet_entries_source_key` |
> | `hold_refunds (status, settlement_mode, wallet_entry_id)` | check `hold_refunds_credited_needs_entry_check` |
> | Số dư TRƯỚC ↔ SAU của từng ví | ảnh chụp ở §2 |

## 1. Migration làm gì với ba lớp dữ liệu

| Đầu vào | Kết quả mong đợi | Bằng chứng |
| --- | --- | --- |
| `pending` + CÓ `customer_user_id` | `credited` · `settlement_mode='balance'` · `wallet_entry_id` trỏ tới một bút toán `hold_refund` · số dư tăng đúng số tiền đó | §3 Q1, Q2, Q3 |
| `pending` + KHÔNG có user (khách vãng lai) | **không đổi gì** — vẫn `pending` + `bank_transfer`, chờ admin chuyển tay | §3 Q4 |
| `paid` / `rejected` | **không đụng** — tiền đã rời tài khoản hoặc đã quyết | §3 Q5 |

Lớp thứ hai là lý do đường chuyển khoản tay vĩnh viễn tồn tại: XePrime cho đặt xe không cần đăng
ký, nên luôn có người được hoàn tiền mà không có ví để ghi có. Một backfill "dọn sạch `pending`"
là backfill SAI.

## 2. Trước khi deploy — chụp ảnh (bắt buộc, không bỏ qua được)

Chạy trên DB của môi trường đích, **trước** khi merge vào `staging`/`main`. Hai bảng này là
bằng chứng; giữ chúng tối thiểu tới khi đối chiếu xong rồi mới `DROP`.

```sql
-- Số dư và tổng sổ của TỪNG ví, ngay trước khi migration chạy.
CREATE TABLE ops_refund_backfill_before AS
SELECT w."id"                      AS wallet_id,
       w."owner_user_id",
       w."balance",
       w."pending_withdraw_amount",
       COALESCE((SELECT SUM(e."amount") FROM "wallet_entries" e
                  WHERE e."wallet_id" = w."id"), 0) AS ledger_sum
  FROM "wallets" w;

-- Tập hợp ĐỦ ĐIỀU KIỆN chuyển đổi — chốt lại theo id, không theo điều kiện, vì sau khi
-- migration chạy thì điều kiện `status = 'pending'` không còn khớp dòng nào nữa.
CREATE TABLE ops_refund_backfill_eligible AS
SELECT r."id" AS refund_id, r."hold_id", r."customer_user_id", r."amount"
  FROM "hold_refunds" r
 WHERE r."status" = 'pending' AND r."customer_user_id" IS NOT NULL;

-- Ba lớp còn lại, để §3 Q4/Q5 có cái mà so.
CREATE TABLE ops_refund_backfill_untouched AS
SELECT r."id" AS refund_id, r."status", r."settlement_mode", r."amount"
  FROM "hold_refunds" r
 WHERE r."status" <> 'pending' OR r."customer_user_id" IS NULL;

SELECT (SELECT COUNT(*) FROM ops_refund_backfill_eligible)  AS se_chuyen_doi,
       (SELECT COALESCE(SUM(amount),0) FROM ops_refund_backfill_eligible) AS tong_tien_chuyen_doi,
       (SELECT COUNT(*) FROM ops_refund_backfill_untouched) AS khong_dung_toi,
       (SELECT COUNT(*) FROM ops_refund_backfill_before)    AS so_vi_hien_co;
```

Ghi lại bốn con số đó vào PR/issue triển khai. Nếu `se_chuyen_doi = 0` thì backfill không có gì
để làm và §3 vẫn phải chạy — nó lúc đó chứng minh migration KHÔNG chạm vào tiền của ai.

## 3. Sau khi deploy — sáu truy vấn đối chiếu

Mọi truy vấn dưới đây phải trả về **0 dòng** (hoặc `0`). Một dòng trả về là một khoản tiền thật
đang sai.

### Q1 — cả tập hợp đủ điều kiện đã chuyển đổi, không sót, không nửa vời

```sql
SELECT b.refund_id, r."status", r."settlement_mode", r."wallet_entry_id"
  FROM ops_refund_backfill_eligible b
  JOIN "hold_refunds" r ON r."id" = b.refund_id
 WHERE r."status" <> 'credited'
    OR r."settlement_mode" <> 'balance'
    OR r."wallet_entry_id" IS NULL;
```

### Q2 — mỗi khoản đã ghi có nối đúng MỘT bút toán, khớp theo khoá cấu trúc

Nối bằng `(wallet_id, kind, source_type, source_ref_id)` — đúng cái unique index của bảng — rồi
kiểm cả chiều ngược: `wallet_entry_id` trên `hold_refunds` phải trỏ về chính bút toán đó, và số
tiền phải bằng nhau.

```sql
SELECT r."id" AS refund_id, r."amount" AS tien_hoan,
       e."id" AS entry_tim_duoc, r."wallet_entry_id" AS entry_dang_tro_toi, e."amount" AS tien_but_toan
  FROM "hold_refunds" r
  JOIN "wallets" w ON w."owner_user_id" = r."customer_user_id"
  LEFT JOIN "wallet_entries" e
         ON e."wallet_id"     = w."id"
        AND e."kind"          = 'hold_refund'
        AND e."source_type"   = 'booking_hold'
        AND e."source_ref_id" = r."hold_id"
 WHERE r."status" = 'credited' AND r."settlement_mode" = 'balance'
   AND (e."id" IS NULL OR e."id" <> r."wallet_entry_id" OR e."amount" <> r."amount");
```

### Q3 — số dư TRƯỚC–SAU: mỗi đồng số dư tăng thêm phải có một dòng sổ đứng sau nó

Đây là truy vấn quan trọng nhất, và là truy vấn duy nhất bắt được lỗi ở §4. Nó không so số dư
với một con số kỳ vọng tính tay; nó so **mức tăng của số dư** với **mức tăng của sổ**. Hai đại
lượng đó phải bằng nhau với mọi ví, bất kể backfill xử lý bao nhiêu khoản.

```sql
-- 3a. Ví đã tồn tại trước khi deploy.
SELECT w."id",
       b."balance"    AS so_du_truoc,  w."balance"  AS so_du_sau,
       w."balance" - b."balance"       AS tang_so_du,
       led.tong_now - b.ledger_sum     AS tang_so_cai
  FROM ops_refund_backfill_before b
  JOIN "wallets" w ON w."id" = b.wallet_id
  CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(e."amount"), 0) AS tong_now
        FROM "wallet_entries" e WHERE e."wallet_id" = w."id"
  ) led
 WHERE (w."balance" - b."balance")
     <> (led.tong_now - b.ledger_sum)
       - (w."pending_withdraw_amount" - b."pending_withdraw_amount");

-- 3b. Ví do chính backfill tạo (bước 2a) — chưa có trong ảnh chụp, nên số dư phải bằng đúng tổng sổ.
SELECT w."id", w."balance", led.tong_now
  FROM "wallets" w
  LEFT JOIN ops_refund_backfill_before b ON b.wallet_id = w."id"
  CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(e."amount"), 0) AS tong_now
        FROM "wallet_entries" e WHERE e."wallet_id" = w."id"
  ) led
 WHERE b.wallet_id IS NULL
   AND w."balance" + w."pending_withdraw_amount" <> led.tong_now;
```

Phần `pending_withdraw_amount` trong 3a không phải để trang trí: nếu có ai bấm yêu cầu rút trong
lúc deploy thì số dư khả dụng giảm mà sổ không đổi, và thiếu số hạng đó thì Q3 báo động giả
(ADR 0033 điều 6 — nghĩa vụ là `balance + pending_withdraw_amount`, không phải `balance`).

### Q4 — khách vãng lai KHÔNG bị chuyển đổi

```sql
SELECT r."id", r."status", r."settlement_mode"
  FROM "hold_refunds" r
 WHERE r."customer_user_id" IS NULL
   AND (r."settlement_mode" <> 'bank_transfer' OR r."status" = 'credited');
```

### Q5 — khoản đã `paid`/`rejected` không bị đụng

```sql
SELECT u.refund_id, u."status" AS truoc, r."status" AS sau,
       u."settlement_mode" AS mode_truoc, r."settlement_mode" AS mode_sau
  FROM ops_refund_backfill_untouched u
  JOIN "hold_refunds" r ON r."id" = u.refund_id
 WHERE r."status" <> u."status" OR r."settlement_mode" <> u."settlement_mode";
```

### Q6 — lệch sổ ví toàn hệ thống bằng 0

Cùng một công thức mà API đối chiếu ba chiều đang dùng (`walletDrift`), nên chạy tay ở đây và
mở `/manage/platform/money` → khối "Lệch sổ ví" phải cho cùng kết quả.

```sql
SELECT COUNT(*) AS so_vi_lech, COALESCE(SUM(ABS(diff)), 0) AS tong_lech
  FROM (
      SELECT w."id",
             COALESCE((SELECT SUM(e."amount") FROM "wallet_entries" e
                        WHERE e."wallet_id" = w."id"), 0)
               - (w."balance" + w."pending_withdraw_amount") AS diff
        FROM "wallets" w
  ) t
 WHERE diff <> 0;
```

Sau khi cả sáu xanh: `DROP TABLE ops_refund_backfill_before, ops_refund_backfill_eligible,
ops_refund_backfill_untouched;`

## 4. Khiếm khuyết đã biết — bước 2c KHÔNG idempotent

Header của migration nói: *"`ON CONFLICT DO NOTHING` ở bước chèn bút toán: chạy lại migration
trên một database đã backfill không cộng tiền lần hai."* Điều đó **chỉ đúng với bước 2b**. Bước
2c là:

```sql
UPDATE "wallets" w SET "balance" = w."balance" + agg.total
  FROM (SELECT e."wallet_id", SUM(e."amount") AS total
          FROM "wallet_entries" e
         WHERE e."note" = 'Chuyển khoản hoàn đang chờ sang ví điểm (ADR 0033)'
         GROUP BY e."wallet_id") agg
 WHERE w."id" = agg."wallet_id";
```

Không có gì chặn lần chạy thứ hai. Bút toán vẫn nằm đó, tổng vẫn thế, và số dư bị cộng thêm lần
nữa. Đã chứng minh trên `xeprime_test` (dựng một khoản hoàn 300.000 `pending` của khách có tài
khoản, chạy đủ 2a→2d, rồi chạy LẠI riêng 2c):

| Mốc | `wallets.balance` | `Σ wallet_entries` | Lệch |
| --- | --- | --- | --- |
| Trước backfill | (chưa có ví) | 0 | — |
| Sau lần chạy 1 | 300.000 | 300.000 | **0** ✅ |
| Sau khi chạy lại 2c | **600.000** | 300.000 | **300.000** ❌ |

Prisma chỉ chạy mỗi migration một lần nên `migrate deploy` bình thường không vấp. Đường vấp là
**chạy tay**: sao bốn câu SQL ra chạy lại để "kiểm tra", chạy lại một phần sau khi deploy lỗi
giữa đường, hoặc khôi phục DB từ bản dump đã backfill rồi chạy lại script. Cả ba đều là việc
người vận hành thật sẽ làm.

Không sửa được trong chính file migration: nó đã applied, đổi nội dung là đổi checksum và
`migrate deploy` sẽ từ chối chạy ở môi trường kế tiếp. Vì vậy:

- **Không bao giờ chạy lại đoạn 2a–2d bằng tay.** Nó thuộc về `migrate deploy`, không thuộc về
  ai khác. Cần biết backfill đã làm gì thì dùng §3, không phải chạy lại.
- Q3 và Q6 là bộ phát hiện. Q6 chạy hằng ngày trong đối chiếu ba chiều, nên lỗi này không thể
  nằm im quá một ngày.
- Regression test giữ cho bộ phát hiện không bị hỏng lặng lẽ:
  `apps/api/test/reconciliation-three-way.spec.ts` → *"chạy lại bước cộng số dư của backfill thì
  đối soát BẮT ĐƯỢC số dư cộng đôi"*. Nó chạy đúng câu 2c và đúng câu sửa ở §5b, nên đổi công
  thức `walletDrift` theo cách làm nó ngừng thấy lỗi này là đỏ ngay.

## 5. Nếu Q3/Q6 đỏ — câu lệnh sửa

Chỉ áp dụng khi **sổ là bên đúng và số dư là bên sai** (lệch ÂM ở Q6: `Σ bút toán < balance +
pending`). Sổ `wallet_entries` là append-only và là nguồn sự thật (ADR 0023); vì thế cách sửa là
kéo `balance` về khớp sổ, **không** phải chèn một bút toán âm — chèn bút toán âm sẽ làm cả sổ sai
theo và xoá mất bằng chứng.

Lệch DƯƠNG (`Σ bút toán > balance + pending`) là chuyện khác hẳn: có bút toán được ghi mà số dư
không được cộng. Đừng auto-fix; điều tra `WalletService` và dòng sổ liên quan trước.

```sql
BEGIN;

-- 5a. Xem trước — ai bị, lệch bao nhiêu, sau khi sửa còn âm không.
SELECT w."id", w."owner_user_id", w."balance", w."pending_withdraw_amount", led.tong,
       led.tong - w."pending_withdraw_amount" AS balance_dung
  FROM "wallets" w
  CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(e."amount"), 0) AS tong
        FROM "wallet_entries" e WHERE e."wallet_id" = w."id"
  ) led
 WHERE w."balance" + w."pending_withdraw_amount" > led.tong
 ORDER BY (w."balance" + w."pending_withdraw_amount") - led.tong DESC;

-- 5b. Sửa. `wallets_amounts_non_negative_check` sẽ NỔ nếu kết quả âm — đó là tính năng: một ví
-- phải về số âm nghĩa là chẩn đoán ở 5a sai, và transaction này phải chết thay vì ghi đè.
UPDATE "wallets" w
   SET "balance"    = led.tong - w."pending_withdraw_amount",
       "updated_at" = now()
  FROM (SELECT e."wallet_id", COALESCE(SUM(e."amount"), 0) AS tong
          FROM "wallet_entries" e GROUP BY e."wallet_id") led
 WHERE led."wallet_id" = w."id"
   AND w."balance" + w."pending_withdraw_amount" > led.tong;

-- 5c. Kiểm lại NGAY trong transaction: phải ra 0 dòng.
SELECT COUNT(*) AS con_lech FROM (
    SELECT w."id" FROM "wallets" w
     WHERE w."balance" + w."pending_withdraw_amount"
        <> COALESCE((SELECT SUM(e."amount") FROM "wallet_entries" e
                      WHERE e."wallet_id" = w."id"), 0)
) t;

-- 5c ra 0 thì COMMIT; khác 0 thì ROLLBACK và điều tra.
COMMIT;
```

Việc sửa số dư của người khác là hành động cần vết: ghi một dòng `audit_logs` mô tả số ví, số
tiền và lý do, hoặc tối thiểu dán kết quả 5a + 5c vào issue vận hành.

## 6. Trạng thái thực tế: CHƯA chạy trên staging

Runbook này **chưa được thực thi**. Lý do là blocker hạ tầng, không phải thiếu bước:

| Blocker | Bằng chứng |
| --- | --- |
| Chưa có môi trường staging | `.env` của repo không có biến nào cho staging; không có host/credential DB staging trên máy dev |
| Quy trình deploy chưa mở | `docs/deployment.md` §1.2 vẫn là hướng dẫn *cần mua gì* với các ô dịch vụ chưa tick — VPS, domain, GitHub Environment đều chưa dựng |
| Tự CD chưa chạy lần nào | Merge `develop`→`staging` là deploy tự động (`docs/git-workflow.md`), nhưng nhánh `staging` chưa từng nhận merge nào |

Đã làm được và có bằng chứng — **toàn bộ runbook đã chạy thử một lượt trên `xeprime_test`**
(schema thật, trong một transaction rồi `ROLLBACK`), với ba khoản hoàn dựng đúng ba lớp ở §1:
một khách chưa có ví (300.000), một khách ĐÃ có ví đang có 20.000 chờ rút (600.000), một khách
vãng lai (900.000).

| Chặng | Kết quả |
| --- | --- |
| §2 ảnh chụp | 2 khoản đủ điều kiện / 900.000đ · 1 khoản không đụng tới · 1 ví có sẵn |
| §3 Q1–Q6 sau một lần backfill ĐÚNG | cả sáu **0 dòng** · khách A 300.000 · khách B 650.000 khả dụng + 20.000 chờ rút (Q3a trừ đúng phần `pending`) |
| Cố ý chạy lại 2c | Q3a **1 dòng** · Q6 **2 ví / lệch 900.000** — bộ phát hiện bắt được |
| §5a → §5b → §5c | hai ví về đúng 300.000 và 650.000 + 20.000, `con_lech = 0` |
| Regression test | `reconciliation-three-way.spec.ts` 8/8 xanh với `REQUIRE_DB=1` (không có DB là cả run đỏ, nên đây là DB thật) |

Chưa làm được: chạy §2 trước một lần deploy thật và §3 sau nó. Đó là việc của release gate
"staging/UAT" trong `docs/completion-roadmap.md`, và nó không thể làm giả bằng DB local — giá trị
của §2/§3 nằm ở chỗ ảnh chụp được lấy trên dữ liệu thật mà không ai biết trước nội dung.
