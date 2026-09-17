import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
export const secret = (): string => randomBytes(32).toString("base64url");
export const passwordHash = (value: string): Promise<string> => hash(value, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (encoded: string, value: string): Promise<boolean> => verify(encoded, value);

export class ServiceError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}
