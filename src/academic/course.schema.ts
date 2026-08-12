import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CourseDocument = HydratedDocument<Course>;

@Schema({ timestamps: true })
export class Course {
  @Prop({
    required: true,
    trim: true,
    unique: true,
  })
  courseName!: string;
}

export const CourseSchema =
  SchemaFactory.createForClass(Course);