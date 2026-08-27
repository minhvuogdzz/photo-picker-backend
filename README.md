<div align="center">

# ☁️ Photo Picker Pro — Cloud Backend Service
### *Enterprise License Management, Hardware Fingerprinting & Realtime Gateway*

[![NestJS](https://img.shields.io/badge/NestJS-v11.0-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-v5.21-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Socket.IO](https://img.shields.io/badge/Socket.io-v4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)

</div>

<br/>

## 📖 Overview

The **Photo Picker Pro Backend** provides optional cloud licensing, hardware-bound device activation, user authentication, subscription management, and real-time WebSocket communication for the Photo Picker Pro desktop client ecosystem.

> **Privacy Notice**: This backend **never** ingests, stores, or processes client photo files. All heavy image processing is strictly local. The backend only handles licensing, user subscriptions, and app update alerts.

<br/>

## 🛠️ Tech Stack & Key Services

- **Framework**: [NestJS 11](https://nestjs.com/) (Modular Architecture)
- **Database & ORM**: MongoDB with [Prisma ORM 5](https://www.prisma.io/)
- **Authentication**: JWT, bcryptjs password hashing & Device Hardware Fingerprint matching
- **Realtime Gateway**: Socket.IO for instant license revocation & broadcast announcements
- **Email Service**: Nodemailer for password reset & OTP verification
- **Task Scheduling**: `@nestjs/schedule` for automatic license expiry auditing

<br/>

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env` file in the root of `photo-picker-pro-backend`:

```env
DATABASE_URL="mongodb+srv://<username>:<password>@cluster.mongodb.net/photopicker?retryWrites=true&w=majority"
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
PORT=3001

# SMTP Email Configuration (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="Photo Picker Pro <support@photopicker.pro>"
```

### 2. Install & Run

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Seed initial admin account
npm run seed

# Run in development mode
npm run start:dev
```

<br/>

## 📄 License

MIT License.
