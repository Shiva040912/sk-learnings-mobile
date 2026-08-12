import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BatchDocument = HydratedDocument<Batch>;

@Schema({ timestamps: true })
export class Batch {
  @Prop({
    required: true,
    trim: true,
    unique: true,
  })
  batchName!: string;

  @Prop({
    required: true,
    trim: true,
  })
  startTime!: string;

  @Prop({
    required: true,
    trim: true,
  })
  endTime!: string;
}

export const BatchSchema =
  SchemaFactory.createForClass(Batch);