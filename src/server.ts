import express from 'express';
import { Mppx } from 'mppx/express';
import { charge } from '@arbitrum/mpp/server';
import * as defaults from '@arbitrum/mpp/default';
import { createPublicClient, formatEther, getAddress, http, isAddress } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { config, privateKey } from './config.js';
import { parsePreflightInput, runPreflight } from './preflight.js';

const serverKey = privateKey('SERVER_PRIVATE_KEY');
const merchant = privateKeyToAccount(serverKey);
const chainClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(config.rpcUrl),
});

const payments = Mppx.create({
  methods: [
    charge({
      recipient: merchant.address,
      currency: defaults.TOKEN_CONTRACTS.USDC_ARBITRUM_SEPOLIA,
      methodDetails: { chainId: config.chainId, decimals: 6 },
      account: merchant,
    }),
  ],
  secretKey: serverKey,
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/', (_req, res) => {
  res.json({
    product: 'Arbitrum MPP Wallet Preflight API',
    network: 'Arbitrum Sepolia',
    payment: 'MPP / EIP-3009 / USDC',
    priceRawUsdc: config.priceRawUsdc,
    priceUsdc: (Number(config.priceRawUsdc) / 1_000_000).toString(),
    paidEndpoint: '/api/preflight/:address',
    transactionPreflight: 'POST /v1/preflight',
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
    currency: defaults.TOKEN_CONTRACTS.USDC_ARBITRUM_SEPOLIA,
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
        network: 'Arbitrum Sepolia',
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
  payments.charge({
    amount: config.priceRawUsdc,
    currency: defaults.TOKEN_CONTRACTS.USDC_ARBITRUM_SEPOLIA,
    recipient: merchant.address,
    description: 'Arbitrum transaction simulation and risk report',
    methodDetails: {
      chainId: config.chainId,
      credentialTypes: ['authorization'],
    },
  }),
  async (_req, res, next) => {
    try {
      const report = await runPreflight(chainClient, res.locals.preflightInput);
      res.json(report);
    } catch (error) {
      next(error);
    }
  },
);

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
  console.log(`Server: http://localhost:${config.port}`);
  console.log(`Price: ${config.priceRawUsdc} raw USDC units`);
});
