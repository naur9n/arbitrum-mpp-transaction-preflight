# Launch Kit

## Canonical listing

**Name:** Arbitrum Transaction Preflight

**One line:** Simulate and risk-score an Arbitrum transaction before a wallet or AI agent signs it.

**Short description:** Paid Arbitrum One transaction simulation with gas estimation, revert detection, approval analysis, target inspection, and structured risk warnings. No account or API key; pay per report in USDC over HTTP 402.

**Price:** 0.10 USDC per request

**Category:** Blockchain / Security / AI Agents / Developer Tools

**Tags:** `arbitrum`, `wallet-security`, `transaction-simulation`, `ai-agent`, `mpp`, `x402`, `mcp`, `usdc`, `http-402`

**Production URL:** https://arbitrum-mpp-transaction-preflight-production.up.railway.app

**OpenAPI:** https://arbitrum-mpp-transaction-preflight-production.up.railway.app/openapi.json

**Agent instructions:** https://arbitrum-mpp-transaction-preflight-production.up.railway.app/llms.txt

**Source:** https://github.com/naur9n/arbitrum-mpp-transaction-preflight

## Launch post

We launched Arbitrum Transaction Preflight: a pay-per-call safety API for wallets, bots, and AI agents. Before signing, an agent can simulate the transaction, estimate gas, inspect the target, detect dangerous approvals, and receive a structured risk score. It costs 0.10 USDC per report on Arbitrum One and requires no account or API key.

Try the discovery document: https://arbitrum-mpp-transaction-preflight-production.up.railway.app/openapi.json

## Direct outreach

Hi — we built a pre-sign transaction safety API for Arbitrum wallets and agents. It returns simulation status, gas cost, approval warnings, target inspection, and a machine-readable risk score. Integration is one HTTP call and payment is per use in USDC, with no account or API key. We are looking for three design partners and can integrate the first endpoint with you directly.

Live API: https://arbitrum-mpp-transaction-preflight-production.up.railway.app

## Distribution checklist

- [ ] Deploy v4 to Railway and verify `/`, `/api`, `/openapi.json`, and `/llms.txt`
- [ ] Set `PRICE_RAW_USDC=100000`
- [ ] Publish npm package `arbitrum-mpp-transaction-preflight`
- [ ] Publish `server.json` to the official MCP Registry
- [ ] Create CDP credentials, set `ENABLE_X402=true`, and verify x402 `402` response
- [ ] Confirm the endpoint is indexed by Coinbase Bazaar
- [ ] Submit the production URL to x402scan
- [ ] Submit the production URL to the MPP Services catalog
- [ ] Add GitHub topics from the canonical tag list
- [ ] Publish the launch post on X and LinkedIn
- [ ] Post to Arbitrum developer channels and forum
- [ ] Contact 30 wallet, bot, and agent teams

## Revenue targets

- 1,000 calls/month = 100 USDC gross revenue
- 10,000 calls/month = 1,000 USDC gross revenue
- 100,000 calls/month = 10,000 USDC gross revenue

Network gas, facilitator charges, hosting, refunds, taxes, and other operating costs are not included in gross revenue.
