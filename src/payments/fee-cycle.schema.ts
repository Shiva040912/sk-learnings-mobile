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

export type FeeCycleDocument =
  HydratedDocument<FeeCycle>;

// A single round of fee collection for a student. Every fee a student is
// asked to pay — the first one and every "generate next fee" afterwards —
// is its own FeeCycle document with its own totalFee/paidAmount/pendingAmount
// and its own Payment history (via Payment.feeCycleId). Cycles are never
// merged or recalculated against each other; a new one only starts once the
// previous one's status is 'paid' (enforced in PaymentsService).
@Schema({ timestamps: true })
export class FeeCycle {
  // MongooseSchema.Types.ObjectId, not Types.ObjectId — see the same note
  // in payments.schema.ts for why the distinction matters here.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Student',
    required: true,
  })
  studentId!: Types.ObjectId;

  // 1-based, per student — "Fee Cycle 1", "Fee Cycle 2", ... Purely
  // cosmetic/for display and ordering; not used for any balance math.
  @Prop({
    required: true,
    min: 1,
  })
  cycleNumber!: number;

  @Prop({
    required: true,
    min: 0,
  })
  totalFee!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  paidAmount!: number;

  @Prop({
    required: true,
    min: 0,
  })
  pendingAmount!: number;

  @Prop({
    enum: ['unpaid', 'partial', 'paid'],
    default: 'unpaid',
  })
  status!: 'unpaid' | 'partial' | 'paid';
}

export const FeeCycleSchema =
  SchemaFactory.createForClass(FeeCycle);
