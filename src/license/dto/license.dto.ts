import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class GenerateKeysDto {
  @IsNumber()
  count!: number;

  @IsOptional()
  @IsNumber()
  durationDays?: number;
}

export class ActivateKeyDto {
  @IsString()
  @IsNotEmpty()
  key!: string;
}

export class RequestKeyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  email!: string;
}
