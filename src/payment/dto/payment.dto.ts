import { IsNotEmpty, IsNumber, IsOptional, IsString, IsEmail } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  packageId!: string; // e.g. "super_1m", "picker_1m" — server looks up price & duration

  @IsString()
  @IsNotEmpty()
  buyerName!: string;

  @IsEmail()
  @IsNotEmpty()
  buyerEmail!: string;

  @IsString()
  @IsNotEmpty()
  buyerPhone!: string;
}

export class SePayWebhookDto {
  @IsNumber()
  id!: number;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  code?: string;

  // SePay có thể gửi webhook không kèm "content" (ví dụ giao dịch chỉ có "code").
  // Nếu bắt buộc, ValidationPipe sẽ trả 400 và SePay retry 7 lần rồi bỏ → mất đơn.
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  transferType?: string;

  @IsNumber()
  transferAmount!: number;

  @IsOptional()
  @IsNumber()
  accumulated?: number;

  @IsOptional()
  @IsString()
  subAccount?: string;

  @IsOptional()
  @IsString()
  referenceCode?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
