#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { charge } from '@arbitrum/mpp/client';
import { Mppx } from 'mppx/client';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { config, privateKey } from './config.js';

const payer = privateKeyToAccount(privateKey('CLIENT_PRIVATE_KEY'));
const payments = Mppx.create({
  methods: [charge({ account: payer, chainId: config.chainId })],
});

const server = new McpServer({
  name: 'arbitrum-transaction-preflight',
  version: '4.0.0',
});

server.registerTool('check_arbitrum_transaction', {
  title: 'Check Arbitrum Transaction',
  description: 'Pays for and returns an Arbitrum transaction simulation, gas estimate, approval analysis, and risk score before signing.',
  inputSchema: {
    from: z.string().describe('EVM sender address.'),
    to: z.string().describe('EVM target address.'),
    data: z.string().default('0x').describe('0x-prefixed calldata.'),
    valueEth: z.string().default('0').describe('Native ETH value as a decimal string.'),
  },
}, async (input) => {
  const response = await payments.fetch(`${config.serverUrl}/v1/preflight`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json();

  if (!response.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Preflight request failed (${response.status}): ${JSON.stringify(body)}` }],
    };
  }

  const receipt = response.headers.get('payment-receipt');
  return {
    content: [{ type: 'text', text: JSON.stringify({ report: body, paymentReceipt: receipt }, null, 2) }],
  };
});

await server.connect(new StdioServerTransport());
