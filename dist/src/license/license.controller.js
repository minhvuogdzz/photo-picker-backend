"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LicenseController = void 0;
const common_1 = require("@nestjs/common");
const license_service_1 = require("./license.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../auth/decorators/roles.decorator");
const client_1 = require("@prisma/client");
const license_dto_1 = require("./dto/license.dto");
let LicenseController = class LicenseController {
    licenseService;
    constructor(licenseService) {
        this.licenseService = licenseService;
    }
    generateKeys(body) {
        return this.licenseService.generateKeys(body.count, body.durationDays);
    }
    getAllKeys() {
        return this.licenseService.getAllKeys();
    }
    activateKey(req, body) {
        return this.licenseService.activateKey(req.user.userId, body.key);
    }
    requestKey(req, body) {
        return this.licenseService.requestKey(req.user.userId, body);
    }
};
exports.LicenseController = LicenseController;
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    (0, common_1.Post)('generate'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [license_dto_1.GenerateKeysDto]),
    __metadata("design:returntype", void 0)
], LicenseController.prototype, "generateKeys", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)(client_1.Role.ADMIN),
    (0, common_1.Get)('keys'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LicenseController.prototype, "getAllKeys", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('activate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, license_dto_1.ActivateKeyDto]),
    __metadata("design:returntype", void 0)
], LicenseController.prototype, "activateKey", null);
__decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Post)('request'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, license_dto_1.RequestKeyDto]),
    __metadata("design:returntype", void 0)
], LicenseController.prototype, "requestKey", null);
exports.LicenseController = LicenseController = __decorate([
    (0, common_1.Controller)('license'),
    __metadata("design:paramtypes", [license_service_1.LicenseService])
], LicenseController);
//# sourceMappingURL=license.controller.js.map