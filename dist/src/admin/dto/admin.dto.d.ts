import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
export declare class CreateUserDto {
    email: string;
    name: string;
    password: string;
}
export declare class UpdateSubscriptionDto {
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    addDays?: number;
}
