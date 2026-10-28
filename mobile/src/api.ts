
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export const API_BASE_URL = BASE_URL;

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  token?: string;
  body?: unknown;
};

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data as T;
}

export async function api<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token
        ? { Authorization: `Bearer ${options.token}` }
        : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });

  return readResponse<T>(response);
}

// Upload a receipt image. Do not set Content-Type manually;
// fetch will set the multipart boundary for FormData.
export async function uploadReceiptImage<T>(
  path: string,
  token: string,
  imageUri: string
): Promise<T> {
  const formData = new FormData();

  formData.append(
    "receipt",
    {
      uri: imageUri,
      name: `receipt-${Date.now()}.jpg`,
      type: "image/jpeg",
    } as any
  );

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return readResponse<T>(response);
}

export type Loan = {
  id: string;
  friendName: string;
  amount: string | number;
  dueDate: string;
  repaid: boolean;
  repaidAt?: string | null;
  receiptUrl?: string | null;
};

export type Summary = {
  totalLent: number;
  totalRepaid: number;
  overdueAmount: number;
};

export type ReceiptUploadResult = {
  message: string;
  receiptUrl: string;
  loan: Loan;
};
