import express from 'express';
import { Mppx, discovery } from 'mppx/express';
import { charge } from '@arbitrum/mpp/server';
import * as defaults from '@arbitrum/mpp/default';
import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from '@x402/extensions/bazaar';
import { createPublicClient, formatEther, getAddress, http, isAddress } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config, network, privateKey } from './config.js';
import { parsePreflightInput, runPreflight } from './preflight.js';

const serverKey = privateKey('SERVER_PRIVATE_KEY');
const merchant = privateKeyToAccount(serverKey);
const selectedChain = network.isMainnet ? arbitrum : arbitrumSepolia;
const usdc = network.isMainnet
  ? defaults.TOKEN_CONTRACTS.USDC_ARBITRUM_ONE
  : defaults.TOKEN_CONTRACTS.USDC_ARBITRUM_SEPOLIA;
const chainClient = createPublicClient({
  chain: selectedChain,
  transport: http(config.rpcUrl),
});

const payments = Mppx.create({
  methods: [
    charge({
      recipient: merchant.address,
      currency: usdc,
      methodDetails: { chainId: config.chainId, decimals: 6 },
      account: merchant,
    }),
  ],
  secretKey: serverKey,
});

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

const preflightRequestSchema = {
  type: 'object',
  required: ['from', 'to'],
  properties: {
    from: { type: 'string', description: 'Checksummed or lowercase EVM sender address.' },
    to: { type: 'string', description: 'EVM transaction target address.' },
    data: { type: 'string', default: '0x', description: '0x-prefixed calldata.' },
    valueEth: { type: 'string', default: '0', description: 'Native ETH value as a decimal string.' },
    valueWei: { type: 'string', description: 'Alternative native value in wei.' },
  },
};

app.get('/', (req, res) => {
  if (req.get('accept')?.includes('text/html')) {
    res.sendFile('index.html', { root: `${process.cwd()}/public` });
    return;
  }
  res.json({
    product: 'Arbitrum MPP Wallet Preflight API',
    network: network.name,
    payment: 'MPP / EIP-3009 / USDC',
    priceRawUsdc: config.priceRawUsdc,
    priceUsdc: (Number(config.priceRawUsdc) / 1_000_000).toString(),
    paidEndpoint: '/api/preflight/:address',
    transactionPreflight: 'POST /v1/preflight',
    x402Preflight: config.enableX402 ? 'POST /x402/v1/preflight' : 'available after CDP activation',
    mcp: 'npm run mcp',
    discovery: ['/openapi.json', '/llms.txt', '/.well-known/agent.json'],
  });
});

app.get('/api', (_req, res) => {
  res.json({
    product: 'Arbitrum MPP Wallet Preflight API',
    network: network.name,
    chainId: config.chainId,
    priceUsdc: (Number(config.priceRawUsdc) / 1_000_000).toString(),
    mppEndpoint: '/v1/preflight',
    x402Endpoint: config.enableX402 ? '/x402/v1/preflight' : null,
    openapi: '/openapi.json',
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get(
  '/api/preflight/:address',
  (req, res, next) => {
    const rawAddress = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
    if (!rawAddress || !isAddress(rawAddress)) {
      res.status(400).json({ error: 'Invalid EVM address' });
      return;
    }
    next();
  },
  payments.charge({
    amount: config.priceRawUsdc,
    currency: usdc,
    recipient: merchant.address,
    description: 'Arbitrum wallet preflight report',
    methodDetails: {
      chainId: config.chainId,
      credentialTypes: ['authorization'],
    },
  }),
  async (req, res, next) => {
    try {
      const rawAddress = Array.isArray(req.params.address) ? req.params.address[0] : req.params.address;
      if (!rawAddress) throw new Error('Missing address');
      const address = getAddress(rawAddress);
      const [balance, transactionCount, bytecode, blockNumber] = await Promise.all([
        chainClient.getBalance({ address }),
        chainClient.getTransactionCount({ address }),
        chainClient.getCode({ address }),
        chainClient.getBlockNumber(),
      ]);

      res.json({
        address,
        network: network.name,
        chainId: config.chainId,
        accountType: bytecode && bytecode !== '0x' ? 'contract' : 'EOA',
        ethBalance: formatEther(balance),
        transactionCount,
        checkedAtBlock: blockNumber.toString(),
        checkedAt: new Date().toISOString(),
        note: 'This is an onchain preflight snapshot, not a guarantee of safety.',
      });
    } catch (error) {
      next(error);
    }
  },
);

const mppTransactionCharge = payments.charge({
  amount: config.priceRawUsdc,
  currency: usdc,
  recipient: merchant.address,
  description: 'Arbitrum transaction simulation and risk report',
  methodDetails: {
    chainId: config.chainId,
    credentialTypes: ['authorization'],
  },
});

async function sendPreflightReport(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const input = res.locals.preflightInput ?? parsePreflightInput(req.body);
    const report = await runPreflight(chainClient, input);
    res.json(report);
  } catch (error) {
    next(error);
  }
}

app.post(
  '/v1/preflight',
  (req, res, next) => {
    try {
      res.locals.preflightInput = parsePreflightInput(req.body);
      next();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
  },
  mppTransactionCharge,
  sendPreflightReport,
);

discovery(app, payments, {
  info: { title: 'Arbitrum Transaction Preflight API', version: '4.0.0' },
  serviceInfo: {
    name: 'Arbitrum MPP Wallet Preflight',
    description: 'Paid transaction simulation, gas estimation, approval detection, and risk scoring for Arbitrum wallets and AI agents.',
    categories: ['blockchain', 'security', 'ai'],
    docs: {
      homepage: config.serverUrl,
      apiReference: `${config.serverUrl}/openapi.json`,
      llms: `${config.serverUrl}/llms.txt`,
      github: 'https://github.com/naur9n/arbitrum-mpp-transaction-preflight',
    },
  },
  routes: [{
    handler: mppTransactionCharge,
    method: 'post',
    path: '/v1/preflight',
    summary: 'Simulate and risk-score an Arbitrum transaction before signing.',
    requestBody: preflightRequestSchema,
  }],
});

app.get('/llms.txt', (_req, res) => {
  res.type('text/plain').send([
    '# Arbitrum Transaction Preflight API',
    '',
    'Paid transaction simulation and risk scoring for Arbitrum One.',
    `Price: ${Number(config.priceRawUsdc) / 1_000_000} USDC per request.`,
    'MPP endpoint: POST /v1/preflight',
    ...(config.enableX402 ? ['x402 endpoint: POST /x402/v1/preflight'] : []),
    'OpenAPI: /openapi.json',
    'Input JSON: {"from":"0x...","to":"0x...","data":"0x","valueEth":"0"}',
    'Output: simulation status, gas estimate, approval analysis, risk score, warnings, and checked block.',
  ].join('\n'));
});

app.get('/.well-known/agent.json', (_req, res) => {
  res.json({
    name: 'Arbitrum Transaction Preflight',
    description: 'Pre-sign transaction simulation and risk analysis for wallets and autonomous agents.',
    url: config.serverUrl,
    protocols: ['mpp', ...(config.enableX402 ? ['x402'] : [])],
    network: `eip155:${config.chainId}`,
    currency: usdc,
    price: (Number(config.priceRawUsdc) / 1_000_000).toString(),
    openapi: `${config.serverUrl}/openapi.json`,
    llms: `${config.serverUrl}/llms.txt`,
  });
});

if (config.enableX402) {
  const x402Network = `eip155:${config.chainId}` as const;
  const facilitatorClient = new HTTPFacilitatorClient(
    createFacilitatorConfig(config.cdpApiKeyId, config.cdpApiKeySecret),
  );
  const x402Server = new x402ResourceServer(facilitatorClient)
    .register(x402Network, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  const x402Price = `$${(Number(config.priceRawUsdc) / 1_000_000).toFixed(2)}`;

  app.use(paymentMiddleware({
    'POST /x402/v1/preflight': {
      accepts: [{
        scheme: 'exact',
        price: x402Price,
        network: x402Network,
        payTo: merchant.address,
      }],
      description: 'Simulate and risk-score an Arbitrum transaction before signing.',
      mimeType: 'application/json',
      serviceName: 'Arbitrum Transaction Preflight',
      tags: ['arbitrum', 'wallet', 'transaction-simulation', 'risk', 'ai-agent'],
      extensions: declareDiscoveryExtension({
          bodyType: 'json',
          input: {
            from: '0x0000000000000000000000000000000000000001',
            to: '0x0000000000000000000000000000000000000002',
            data: '0x',
            valueEth: '0',
          },
          inputSchema: {
            properties: {
              from: { type: 'string', description: 'EVM sender address.' },
              to: { type: 'string', description: 'Arbitrum transaction target.' },
              data: { type: 'string', description: '0x-prefixed calldata.' },
              valueEth: { type: 'string', description: 'Native ETH value as a decimal string.' },
            },
            required: ['from', 'to'],
          },
          output: {
            example: {
              network: 'Arbitrum One',
              chainId: 42161,
              simulation: { success: true },
              risk: { score: 0, level: 'low', warnings: [] },
            },
          },
      }),
    },
  }, x402Server));

  app.post('/x402/v1/preflight', sendPreflightReport);
  console.log('x402 enabled: POST /x402/v1/preflight');
}

if (config.enableFreeDemo) {
  app.post('/demo/preflight', async (req, res, next) => {
    try {
      const input = parsePreflightInput(req.body);
      const report = await runPreflight(chainClient, input);
      res.setHeader('x-demo-mode', 'true');
      res.json(report);
    } catch (error) {
      if (error instanceof Error && /must be|required|JSON body/.test(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });
  console.warn('FREE DEMO ENABLED: /demo/preflight bypasses payment. Never enable this in production.');
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Request failed' });
});

app.listen(config.port, () => {
  console.log(`MPP merchant: ${merchant.address}`);
  console.log(`Network: ${network.name} (${config.chainId})`);
  console.log(`Server: http://localhost:${config.port}`);
  console.log(`Price: ${config.priceRawUsdc} raw USDC units`);
});
