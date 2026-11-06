# MiniLedger

MiniLedger is a React Native application for tracking money lent to friends. It provides mock phone OTP authentication, loan management, repayment tracking, and a financial summary.

## Features

- Mock OTP authentication with OTP printed in the backend server logs
- JWT-protected API endpoints
- Create and list loan entries
- Mark outstanding loans as repaid
- Summary of total lent, total repaid, and overdue amounts
- Overdue loan highlighting in the mobile UI
- Input validation and automated validation tests
- PostgreSQL persistence using Prisma ORM

## Tech Stack

- React Native, Expo, TypeScript
- Node.js, Express, TypeScript
- PostgreSQL, Prisma ORM
- JWT, Zod, Jest

## Prerequisites

Install Node.js, Git, Docker Desktop, and Expo Go or an Android emulator.

## 1. Start the database

```bash
cd backend
docker compose up -d
```

## 2. Configure the backend

Create `backend/.env` using the example file:

```dotenv
DATABASE_URL="postgresql://miniledger:miniledger_dev@localhost:5432/miniledger?schema=public"
JWT_SECRET="your-local-development-secret"
PORT=4000
```

Install dependencies and prepare the database:

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run dev
```

The API runs on port 4000.

## 3. Configure and start the mobile app

In a separate terminal:

```bash
cd mobile
npm install
```

Create `mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:4000
```

Replace the example with your computer's reachable LAN IP address. Use `http://10.0.2.2:4000` for the Android emulator.

Start Expo:

```bash
npx expo start
```

Scan the QR code using Expo Go or launch the Android emulator.

## 4. Mock OTP login

Enter a phone number in the app. The backend prints a six-digit OTP in its terminal. Enter that code in the app to log in.

OTP verification is mocked and is intended for development and demonstration only.

## 5. Run tests and build

From the backend directory:

```bash
npm test
npm run build
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/send-otp` | Generate mock OTP |
| POST | `/api/auth/verify-otp` | Verify OTP and issue JWT |
| GET | `/api/loans` | List the current user's loans |
| POST | `/api/loans` | Create a loan entry |
| PATCH | `/api/loans/:id/repay` | Mark a loan as repaid |
| GET | `/api/summary` | Retrieve financial totals |
| GET | `/api/health` | Check API health |

All loan and summary endpoints require a valid `Authorization: Bearer <token>` header.

## Notes

- Loan records are stored in PostgreSQL.
- The current mock OTP store is in memory and resets when the backend restarts.
- This project is a demonstration and is not production-ready authentication.
- Never commit `.env` files, real secrets, or personal financial data.

## Demo

Screen recording: 

## Repository

GitHub: https://github.com/vivek17017/MiniLedger
