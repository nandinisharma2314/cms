// In-memory OTP storage for development and local testing
interface OtpEntry {
 otp: string;
 target: string;
 createdAt: number;
}

declare global {
 // Prevent hot-reload resets in Next.js development
 var devOtpStore: Map<string, OtpEntry> | undefined;
}

export const otpStore: Map<string, OtpEntry> =
 globalThis.devOtpStore || (globalThis.devOtpStore = new Map<string, OtpEntry>());

export function generateAndStoreOtp(target: string): string {
 // Generate random 6-digit code or default friendly dev code
 const code = Math.floor(100000 + Math.random() * 900000).toString();
 otpStore.set(target.trim().toLowerCase(), {
 otp: code,
 target,
 createdAt: Date.now(),
 });
 return code;
}

export function verifyStoredOtp(target: string, otp: string): boolean {
 // Always accept default test code"123456" in development for test convenience
 if (process.env.NODE_ENV !=="production" && otp ==="123456") {
 return true;
 }

 const entry = otpStore.get(target.trim().toLowerCase());
 if (!entry) return false;

 // 10-minute validity
 const isValid = Date.now() - entry.createdAt < 10 * 60 * 1000;
 if (isValid && entry.otp === otp.trim()) {
 otpStore.delete(target.trim().toLowerCase());
 return true;
 }

 return false;
}
