"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer = __importStar(require("nodemailer"));
let EmailService = class EmailService {
    transporter;
    constructor() {
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }
    async sendVerificationCode(to, code) {
        const mailOptions = {
            from: `"Photo Picker Pro" <${process.env.SMTP_USER}>`,
            to,
            subject: 'Mã xác nhận quên mật khẩu',
            text: `Mã xác nhận của bạn là: ${code}. Mã này có hiệu lực trong 10 phút.`,
            html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Khôi phục mật khẩu</h2>
          <p>Mã xác nhận của bạn là:</p>
          <h1 style="color: #4F46E5; letter-spacing: 5px;">${code}</h1>
          <p>Mã này có hiệu lực trong 10 phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
        </div>
      `,
        };
        try {
            await this.transporter.sendMail(mailOptions);
            return true;
        }
        catch (error) {
            console.error('Lỗi khi gửi email:', error);
            return false;
        }
    }
    async sendEmail(to, subject, content) {
        const mailOptions = {
            from: `"Photo Picker Pro" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text: content,
        };
        try {
            await this.transporter.sendMail(mailOptions);
            return true;
        }
        catch (error) {
            console.error('Lỗi khi gửi email:', error);
            return false;
        }
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], EmailService);
//# sourceMappingURL=email.service.js.map