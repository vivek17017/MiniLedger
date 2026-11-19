
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { phoneSchema, loanInputSchema } from "./validation";

const app = express();
const prisma = new PrismaClient();

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET: string = process.env.JWT_SECRET ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing from .env");
}

app.use(cors());
app.use(express.json());

// Store uploaded receipt images in backend/uploads.
const uploadsDir = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

// Make uploaded images accessible through /uploads/<filename>.
app.use("/uploads", express.static(uploadsDir));

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const receiptStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadsDir);
  },

  filename: (_req, file, callback) => {
    const extension =
      file.mimetype === "image/jpeg"
        ? ".jpg"
        : file.mimetype === "image/png"
          ? ".png"
          : ".webp";

    callback(null, `${randomUUID()}${extension}`);
  },
});

const receiptUpload = multer({
  storage: receiptStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
  fileFilter: (_req, file, callback) => {
    if (
      !allowedMimeTypes.includes(
        file.mimetype as (typeof allowedMimeTypes)[number]
      )
    ) {
      return callback(
        new Error("Only JPEG, PNG, and WebP images are allowed")
      );
    }

    callback(null, true);
  },
});

type AuthRequest = Request & { userId?: string };

const otpStore = new Map<
  string,
  { otp: string; expires: number }
>();

// Health check.
app.get("/", (_req: Request, res: Response) => {
  res.send("MiniLedger API is running. Visit /api/health to check status.");
});

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Generate a mock OTP.
app.post("/api/auth/send-otp", (req: Request, res: Response) => {
  const result = phoneSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({ error: "Invalid phone number" });
  }

  const { phone } = result.data;
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  otpStore.set(phone, {
    otp,
    expires: Date.now() + 5 * 60 * 1000,
  });

  console.log(`MiniLedger mock OTP for ${phone}: ${otp}`);

  return res.json({
    message: "OTP generated. Check server logs.",
  });
});

// Verify OTP and issue a JWT.
app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
  const schema = z.object({
    phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
    otp: z.string().regex(/^\d{6}$/),
  });

  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      error: "Invalid phone or OTP format",
    });
  }

  const { phone, otp } = result.data;
  const saved = otpStore.get(phone);

  if (!saved || saved.otp !== otp || Date.now() > saved.expires) {
    return res.status(401).json({
      error: "Invalid or expired OTP",
    });
  }

  otpStore.delete(phone);

  try {
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
    });

    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: { id: user.id, phone: user.phone },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Login failed" });
  }
});

// JWT authentication middleware.
function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : undefined;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required",
    });
  }

  try {
    const payload = jwt.verify(
      token,
      JWT_SECRET
    ) as jwt.JwtPayload;

    if (typeof payload.userId !== "string") {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired token",
    });
  }
}

// List loans belonging to the authenticated user.
app.get(
  "/api/loans",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const loans = await prisma.loan.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: "desc" },
      });

      return res.json(loans);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: "Could not fetch loans",
      });
    }
  }
);

// Create a loan.
app.post(
  "/api/loans",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    const result = loanInputSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        error: "Invalid loan details",
        details: result.error.flatten(),
      });
    }

    try {
      const loan = await prisma.loan.create({
        data: {
          ...result.data,
          dueDate: new Date(
            `${result.data.dueDate}T00:00:00.000Z`
          ),
          userId: req.userId!,
        },
      });

      return res.status(201).json(loan);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: "Could not create loan",
      });
    }
  }
);

// Upload a receipt photo for a loan.
// The client must send multipart/form-data with field name "receipt".
app.post(
  "/api/loans/:id/receipt",
  authenticate,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    receiptUpload.single("receipt")(req, res, (error: unknown) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              error: "Receipt image must be 5 MB or smaller",
            });
          }

          return res.status(400).json({
            error: `Upload error: ${error.message}`,
          });
        }

        return res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Could not upload receipt",
        });
      }

      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    let uploadedPath: string | undefined;

    try {
      const loanId = req.params.id;

      if (typeof loanId !== "string" || !loanId) {
        return res.status(400).json({ error: "Invalid loan ID" });
      }

      if (!req.file) {
        return res.status(400).json({
          error: "Please attach an image using the 'receipt' field",
        });
      }

      uploadedPath = req.file.path;

      // Check ownership before attaching the receipt.
      const loan = await prisma.loan.findFirst({
        where: {
          id: loanId,
          userId: req.userId!,
        },
      });

      if (!loan) {
        fs.unlink(uploadedPath, () => {});
        return res.status(404).json({ error: "Loan not found" });
      }

      const receiptUrl = `/uploads/${req.file.filename}`;

      const updatedLoan = await prisma.loan.update({
        where: { id: loan.id },
        data: { receiptUrl },
      });

      return res.status(200).json({
        message: "Receipt uploaded successfully",
        receiptUrl,
        loan: updatedLoan,
      });
    } catch (error) {
      console.error(error);

      if (uploadedPath) {
        fs.unlink(uploadedPath, () => {});
      }

      return res.status(500).json({
        error: "Could not save receipt",
      });
    }
  }
);

// Mark a loan as repaid.
app.patch(
  "/api/loans/:id/repay",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const loanId = req.params.id;

      if (typeof loanId !== "string") {
        return res.status(400).json({ error: "Invalid loan ID" });
      }

      const loan = await prisma.loan.findFirst({
        where: {
          id: loanId,
          userId: req.userId!,
        },
      });

      if (!loan) {
        return res.status(404).json({ error: "Loan not found" });
      }

      if (loan.repaid) {
        return res.status(400).json({
          error: "Loan is already repaid",
        });
      }

      const updated = await prisma.loan.update({
        where: { id: loan.id },
        data: {
          repaid: true,
          repaidAt: new Date(),
        },
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: "Could not update loan",
      });
    }
  }
);

// Calculate loan summary.
app.get(
  "/api/summary",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const loans = await prisma.loan.findMany({
        where: { userId: req.userId! },
      });

      const totalLent = loans.reduce(
        (sum, loan) => sum + Number(loan.amount),
        0
      );

      const totalRepaid = loans.reduce(
        (sum, loan) =>
          sum + (loan.repaid ? Number(loan.amount) : 0),
        0
      );

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const overdueAmount = loans.reduce(
        (sum, loan) =>
          sum +
          (!loan.repaid && loan.dueDate < today
            ? Number(loan.amount)
            : 0),
        0
      );

      return res.json({
        totalLent: Number(totalLent.toFixed(2)),
        totalRepaid: Number(totalRepaid.toFixed(2)),
        overdueAmount: Number(overdueAmount.toFixed(2)),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        error: "Could not calculate summary",
      });
    }
  }
);

// Public portfolio demo login. Uses a dedicated account, not an existing user's data.
const DEMO_PHONE = "+10000000000";

app.post("/api/auth/demo", async (_req: Request, res: Response) => {
  try {
    const user = await prisma.user.upsert({
      where: { phone: DEMO_PHONE },
      update: {},
      create: { phone: DEMO_PHONE },
    });

    const token = jwt.sign(
      { userId: user.id },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({
      token,
      user: { id: user.id, phone: user.phone, isDemo: true },
    });
  } catch (error) {
    console.error("Demo login failed:", error);
    return res.status(500).json({ error: "Demo login failed" });
  }
});

// Start server.
const server = app.listen(PORT, () => {
  console.log(`MiniLedger API running on http://localhost:${PORT}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
 