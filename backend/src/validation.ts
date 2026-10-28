
import { z } from "zod";

export const phoneSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
});

export const loanInputSchema = z.object({
  friendName: z.string().trim().min(1).max(100),
  amount: z.number().positive().finite().max(9999999999),
  dueDate: z.string().date(),
});
