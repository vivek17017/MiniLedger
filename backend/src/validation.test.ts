
import { phoneSchema, loanInputSchema } from "./validation";

describe("MiniLedger input validation", () => {
  test("accepts a valid phone number", () => {
    expect(
      phoneSchema.safeParse({ phone: "+919876543210" }).success
    ).toBe(true);
  });

  test("rejects an invalid phone number", () => {
    expect(
      phoneSchema.safeParse({ phone: "abc" }).success
    ).toBe(false);
  });

  test("accepts a valid loan entry", () => {
    expect(
      loanInputSchema.safeParse({
        friendName: "Rahul",
        amount: 1500,
        dueDate: "2026-12-31",
      }).success
    ).toBe(true);
  });

  test("rejects zero or negative loan amounts", () => {
    expect(
      loanInputSchema.safeParse({
        friendName: "Rahul",
        amount: 0,
        dueDate: "2026-12-31",
      }).success
    ).toBe(false);
  });

  test("rejects a missing friend name", () => {
    expect(
      loanInputSchema.safeParse({
        friendName: "",
        amount: 1500,
        dueDate: "2026-12-31",
      }).success
    ).toBe(false);
  });
});
