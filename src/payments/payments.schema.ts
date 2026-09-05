import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import {
  HydratedDocument,
  Schema as MongooseSchema,
  Types,
} from 'mongoose';

export type PaymentDocument =
  HydratedDocument<Payment>;

@Schema({ timestamps: true })
export class Payment {
  // MongooseSchema.Types.ObjectId (not Types.ObjectId — a different
  // reference in this Mongoose version, unrecognized by the schema type
  // registry) is required here or Mongoose silently treats the path as
  // Mixed: no casting, so a plain id string and a real ObjectId both get
  // stored as whatever was passed in, and later queries stop reliably
  // matching older records.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Student',
    required: true,
  })
  studentId!: Types.ObjectId;

  // Which fee cycle this collection belongs to — the hard boundary that
  // keeps history and balances from ever mixing across cycles. `cycleNumber`
  // is denormalized purely so the frontend can group/label history without
  // an extra lookup.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'FeeCycle',
    required: true,
  })
  feeCycleId!: Types.ObjectId;

  @Prop({
    required: true,
    min: 1,
  })
  cycleNumber!: number;

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
    trim: true,
  })
  billingMonth!: string;

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

  @Prop({ default: '' })
  paymentProofImage?: string;
}

export const PaymentSchema =
  SchemaFactory.createForClass(
    Payment,
  );