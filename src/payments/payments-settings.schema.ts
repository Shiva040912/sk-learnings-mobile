import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PaymentSettingDocument =
  HydratedDocument<PaymentSetting>;

@Schema({ timestamps: true })
export class PaymentSetting {
  @Prop({
    required: true,
    type: Date,
  })
  feeDueDate!: Date;

  @Prop({
    default: true,
  })
  isActive!: boolean;
}

export const PaymentSettingSchema =
  SchemaFactory.createForClass(PaymentSetting);