# Arbitrum MPP Wallet Preflight API

A small, sellable Machine Payments Protocol integration demo and transaction
simulation API. An AI agent or
script calls a paid HTTP endpoint, receives `402 Payment Required`, signs a
gasless USDC authorization, retries automatically, and receives an Arbitrum
wallet preflight report after the merchant settles payment onchain.

## What it proves

- HTTP 402 machine-payment flow
- Gasless payment experience for the payer
- USDC settlement on Arbitrum Sepolia using EIP-3009
- Merchant-side verification and settlement
- A useful paid response: transaction simulation, revert detection, gas estimate,
  target-code inspection, approval analysis, risk score, and checked block

MPP is currently v0.1.0 and experimental. Use separate test wallets. Never put
a valuable mainnet wallet key in this demo.

## Requirements

- Node.js 23+
- One server wallet with Arbitrum Sepolia ETH for settlement gas
- One client wallet with Arbitrum Sepolia USDC

The payer does not pay gas. The server pays gas when it submits the signed USDC
authorization.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```dotenv
SERVER_PRIVATE_KEY=0x...
CLIENT_PRIVATE_KEY=0x...
TARGET_ADDRESS=0x...
```

The default price is `1000` raw USDC units, equal to `0.001 USDC`. Change
`PRICE_RAW_USDC` to set another price. MPP currently expects raw units.

## Run

Terminal 1:

```bash
npm run server
```

Free product metadata:

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
```

Calling the paid endpoint without an MPP client returns a payment challenge:

```bash
curl -i http://localhost:3000/api/preflight/0x0000000000000000000000000000000000000000
```

The product endpoint accepts an unsigned transaction request. Invalid JSON is
rejected before payment; valid requests receive an MPP challenge:

```bash
curl -i -X POST http://localhost:3000/v1/preflight \
  -H "content-type: application/json" \
  -d '{"from":"0x0000000000000000000000000000000000000001","to":"0x0000000000000000000000000000000000000002","valueEth":"0","data":"0x"}'
```

Accepted fields:

- `from`: required EVM address
- `to`: required EVM address
- `data`: optional hex calldata; defaults to `0x`
- `valueEth`: optional decimal ETH string
- `valueWei`: optional integer wei string; use either this or `valueEth`

The report detects simulation reverts, estimates gas cost, distinguishes an EOA
from a contract, and flags ERC-20 `approve` and NFT `setApprovalForAll` calls.

### Test the analysis engine without a wallet

Set `ENABLE_FREE_DEMO=true` only while developing locally, restart the server,
and send the same JSON body to `POST /demo/preflight`. This bypasses payment so
the simulation report can be tested independently. The route does not exist
when the flag is false. Never enable it in production.

Terminal 2 performs the full payment flow:

```bash
npm run client
```

The response includes the paid report. The `payment-receipt` response header
contains the settlement transaction information.

## Type-check

```bash
npm run typecheck
```

## Turning this into a client integration package

Replace the final route handler with the customer's valuable operation—for
example an AI inference, market data query, transaction simulation, document
conversion, or agent action. Keep the MPP middleware and configure:

1. recipient wallet;
2. USDC price in raw units;
3. network and RPC;
4. endpoint description;
5. deployment environment and secret storage.

For production, move to Arbitrum One, use a dedicated RPC, store the merchant
key in a secrets manager, add rate limiting and observability, and complete a
security review before accepting real payments.

## Current protocol constraints

- The bundled Arbitrum method currently registers USDC on Arbitrum One/Sepolia.
- EIP-3009 authorization avoids prior approval and payer gas.
- Permit2 is available for other ERC-20 flows and payment splits, but requires
  a one-time token approval.
- Amounts use raw token units.
- MPP and the Arbitrum payment plugin are early/experimental.

Official guide: https://docs.arbitrum.io/build-decentralized-apps/machine-payments-protocol
