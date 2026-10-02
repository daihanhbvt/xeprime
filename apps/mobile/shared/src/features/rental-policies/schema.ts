/**
 * Schema chính sách thuê + giá theo xe — nay sống ở `@xeprime/validators`.
 *
 * Web và app native từng giữ hai bản chép tay giống nhau đến từng dòng; file này còn lại làm
 * SHIM để mọi `import … from '../schema'` sẵn có không phải đổi, đúng lối `apps/web/src/lib/*`.
 *
 * Message của schema là MÃ: màn nào dùng nó phải bọc `useValidationResolver(schema,
 * 'Vehicles.pricing.validation')`, nếu không người dùng sẽ thấy nguyên mã lỗi.
 */
export {
  deliveryTierSchema,
  discountTierSchema,
  policyFormSchema,
  vehiclePricingFormSchema,
  type PolicyFormValues,
  type VehiclePricingFormValues,
} from '@xeprime/validators';
