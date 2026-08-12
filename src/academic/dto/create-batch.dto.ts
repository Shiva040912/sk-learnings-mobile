import {
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  batchName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/,
    {
      message:
        'Enter a valid start time in AM/PM format',
    },
  )
  startTime!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/,
    {
      message:
        'Enter a valid end time in AM/PM format',
    },
  )
  endTime!: string;
}