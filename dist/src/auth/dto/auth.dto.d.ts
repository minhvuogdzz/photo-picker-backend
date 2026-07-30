export declare class LoginDto {
    email: string;
    password: string;
    deviceFingerprint: string;
}
export declare class ForgotPasswordDto {
    email: string;
}
export declare class ResetPasswordDto {
    email: string;
    code: string;
    newPassword: string;
}
export declare class RegisterDto {
    email: string;
}
export declare class VerifyRegisterDto {
    email: string;
    code: string;
    password: string;
    name: string;
    deviceFingerprint: string;
}
export declare class VerifyCodeDto {
    email: string;
    code: string;
}
