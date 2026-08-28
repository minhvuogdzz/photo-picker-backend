import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { KeyType } from '@prisma/client';

export class GenerateKeysDto {
  @IsNumber()
  count!: number;

  @IsOptional()
  @IsNumber()
  durationDays?: number;

  @IsOptional()
  @IsEnum(KeyType)
  keyType?: KeyType; // ORIGINAL | PREMIUM
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

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;
}
