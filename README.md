# Arbitrum Transaction Preflight

Paid transaction simulation and risk reports for wallets, bots, and AI agents.
Before a transaction is signed, the API checks whether it simulates successfully,
estimates gas, detects token/NFT approvals, inspects the target, and returns a
machine-readable risk score.

Production API: https://arbitrum-mpp-transaction-preflight-production.up.railway.app

## Product and pricing

- Network: Arbitrum One (`42161`)
- Asset: native USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`)
- Launch price: `0.10 USDC` per report (`100000` raw USDC units)
- Primary payment channel: MPP with EIP-3009
- Optional distribution channel: x402 with Coinbase CDP/Bazaar
- Agent interface: MCP stdio server that pays the MPP endpoint with the caller's wallet

The service never asks for a transaction-signing wallet. The example MPP/MCP
clients use a separate low-value payer key only to authorize the API payment.

## Discovery endpoints

The hosted service exposes free discovery metadata:

- `GET /` — product, network, price, and endpoint summary
- `GET /health` — health check
- `GET /openapi.json` — MPP-aware OpenAPI 3.1 discovery document
- `GET /llms.txt` — concise instructions for AI agents
- `GET /.well-known/agent.json` — agent/service metadata

MPP clients call:

```text
POST /v1/preflight
```

When x402 is enabled, x402 clients call:

```text
POST /x402/v1/preflight
```

## Request and report

```json
{
  "from": "0x0000000000000000000000000000000000000001",
  "to": "0x0000000000000000000000000000000000000002",
  "data": "0x",
  "valueEth": "0"
}
```

`from` and `to` are required. `data` defaults to `0x`. Use either `valueEth`
or `valueWei` for native value. A successful paid response contains:

- call simulation success/revert details;
- gas estimate, gas price, and estimated ETH cost;
- EOA/contract target inspection;
- ERC-20 `approve` and NFT `setApprovalForAll` detection;
- weighted risk score and warnings;
- block number and check timestamp.

Automated simulation and heuristics reduce risk but are not a guarantee of safety.

## Run locally

Requirements: Node.js 22+ and a dedicated server wallet. On mainnet, the server
wallet needs a small Arbitrum One ETH balance for MPP settlement gas.

```bash
npm install
cp .env.example .env
npm run server
```

Minimum production configuration:

```dotenv
SERVER_PRIVATE_KEY=0x...
CHAIN_ID=42161
ARBITRUM_RPC=https://arb1.arbitrum.io/rpc
PRICE_RAW_USDC=100000
ENABLE_FREE_DEMO=false
SERVER_URL=https://arbitrum-mpp-transaction-preflight-production.up.railway.app
```

Never commit `.env` or expose `SERVER_PRIVATE_KEY`.

## MPP client

The included client performs the complete `402 -> authorization -> retry ->
receipt` flow:

```dotenv
CLIENT_PRIVATE_KEY=0x...
TARGET_ADDRESS=0x...
SERVER_URL=https://arbitrum-mpp-transaction-preflight-production.up.railway.app
CHAIN_ID=42161
```

```bash
npm run client
```

The payer needs native USDC on Arbitrum One. It does not need ETH for the MPP
payment; the merchant settles the signed EIP-3009 authorization.

## MCP integration

The MCP server exposes `check_arbitrum_transaction`. It uses the caller's
dedicated `CLIENT_PRIVATE_KEY` to pay the hosted MPP API, so each tool call
produces API revenue instead of bypassing payment.

```bash
npm run mcp
```

After the npm package is published, MCP hosts can run:

```json
{
  "mcpServers": {
    "arbitrum-preflight": {
      "command": "npx",
      "args": ["-y", "arbitrum-mpp-transaction-preflight"],
      "env": {
        "CLIENT_PRIVATE_KEY": "0x...",
        "SERVER_URL": "https://arbitrum-mpp-transaction-preflight-production.up.railway.app",
        "CHAIN_ID": "42161"
      }
    }
  }
}
```

Use a dedicated low-value payer wallet. Never reuse a valuable wallet key.

## Enable x402 and Bazaar

Production x402 settlement on Arbitrum uses Coinbase's CDP facilitator. Create
a CDP project and add these Railway variables:

```dotenv
ENABLE_X402=true
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
```

The server then exposes `POST /x402/v1/preflight` with Bazaar discovery metadata.
MPP remains available at `POST /v1/preflight`; the two payment channels share the
same analysis engine and merchant address.

## Development checks

```bash
npm run typecheck
npm run build
npm pack --dry-run
```

Set `ENABLE_FREE_DEMO=true` only for local development to expose
`POST /demo/preflight` without payment. Never enable it in production.

## Publishing surfaces

The repository includes `server.json` and npm metadata for the official MCP
Registry. Release order:

1. deploy this version to Railway;
2. publish `arbitrum-mpp-transaction-preflight` to npm;
3. publish `server.json` with `mcp-publisher`;
4. enable CDP x402 to become eligible for Bazaar indexing;
5. submit the live MPP endpoint to the MPP services catalog.

Official Arbitrum MPP guide:
https://docs.arbitrum.io/build-decentralized-apps/machine-payments-protocol
