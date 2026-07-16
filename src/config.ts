import 'dotenv/config';
import { getAddress, type Hex } from 'viem';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and set it.`);
  return value;
}

export function privateKey(name: 'SERVER_PRIVATE_KEY' | 'CLIENT_PRIVATE_KEY'): Hex {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed 32-byte private key.`);
  }
  return value as Hex;
}

const inferredServerUrl = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:3000';

export const config = {
  chainId: Number(process.env.CHAIN_ID ?? '42161'),
  rpcUrl: process.env.ARBITRUM_RPC,
  priceRawUsdc: process.env.PRICE_RAW_USDC ?? '100000',
  port: Number(process.env.PORT ?? '3000'),
  serverUrl: process.env.SERVER_URL ?? inferredServerUrl,
  enableFreeDemo: process.env.ENABLE_FREE_DEMO === 'true',
  enableX402: process.env.ENABLE_X402 === 'true',
  cdpApiKeyId: process.env.CDP_API_KEY_ID,
  cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
};

if (config.chainId !== 42161 && config.chainId !== 421614) {
  throw new Error('CHAIN_ID must be 42161 (Arbitrum One) or 421614 (Arbitrum Sepolia).');
}

export const network = {
  name: config.chainId === 42161 ? 'Arbitrum One' : 'Arbitrum Sepolia',
  isMainnet: config.chainId === 42161,
} as const;

if (!/^\d+$/.test(config.priceRawUsdc) || BigInt(config.priceRawUsdc) <= 0n) {
  throw new Error('PRICE_RAW_USDC must be a positive integer in raw 6-decimal USDC units.');
}

if (config.enableX402 && (!config.cdpApiKeyId || !config.cdpApiKeySecret)) {
  throw new Error('ENABLE_X402=true requires CDP_API_KEY_ID and CDP_API_KEY_SECRET.');
}

export function targetAddress() {
  return getAddress(required('TARGET_ADDRESS'));
}
