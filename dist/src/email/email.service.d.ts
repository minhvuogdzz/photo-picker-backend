export declare class EmailService {
    private transporter;
    constructor();
    sendVerificationCode(to: string, code: string): Promise<boolean>;
    sendEmail(to: string, subject: string, content: string): Promise<boolean>;
}
