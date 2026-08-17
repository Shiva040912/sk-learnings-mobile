import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
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
    trim: true,
    default: '',
  })
  upiId?: string;

  @Prop({
    trim: true,
    default: '',
  })
  receiverName?: string;

  @Prop({
    trim: true,
    default: '',
  })
  paymentPhone?: string;

  @Prop({
    type: String,
    default: '',
  })
  upiQrImage?: string;

  @Prop({
    default: true,
  })
  isActive!: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  lastReminderSentAt?: Date | null;
}

export const PaymentSettingSchema =
  SchemaFactory.createForClass(
    PaymentSetting,
  );