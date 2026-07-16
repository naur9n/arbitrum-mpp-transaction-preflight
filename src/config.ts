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

export const config = {
  chainId: Number(process.env.CHAIN_ID ?? '421614'),
  rpcUrl: process.env.ARBITRUM_RPC,
  priceRawUsdc: process.env.PRICE_RAW_USDC ?? '100000',
  port: Number(process.env.PORT ?? '3000'),
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  enableFreeDemo: process.env.ENABLE_FREE_DEMO === 'true',
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

export function targetAddress() {
  return getAddress(required('TARGET_ADDRESS'));
}
