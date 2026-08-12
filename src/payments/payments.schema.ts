import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import {
  HydratedDocument,
  Types,
} from 'mongoose';

export type PaymentDocument =
  HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  @Prop({
    type: Types.ObjectId,
    ref: 'Student',
    required: true,
  })
  studentId!: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
  })
  studentName!: string;

  @Prop({
    required: true,
    trim: true,
  })
  phone!: string;

  @Prop({
    required: true,
    trim: true,
  })
  course!: string;

  @Prop({
    required: true,
    min: 0,
  })
  amount!: number;

  @Prop({
    required: true,
    type: Date,
    default: Date.now,
  })
  paymentDate!: Date;

  @Prop({
    enum: [
      'cash',
      'bank',
      'upi',
      'qr',
    ],
    required: true,
  })
  paymentMethod!:
    | 'cash'
    | 'bank'
    | 'upi'
    | 'qr';

  @Prop({
    enum: ['paid'],
    default: 'paid',
  })
  paymentStatus!: 'paid';
}

export const PaymentSchema =
  SchemaFactory.createForClass(Payment);