import { Mppx } from 'mppx/client';
import { charge } from '@arbitrum/mpp/client';
import { privateKeyToAccount } from 'viem/accounts';
import { config, privateKey, targetAddress } from './config.js';

const payer = privateKeyToAccount(privateKey('CLIENT_PRIVATE_KEY'));
const payments = Mppx.create({
  methods: [charge({ account: payer, chainId: config.chainId })],
});

const url = `${config.serverUrl}/v1/preflight`;
console.log(`Paying client: ${payer.address}`);
console.log(`Requesting: ${url}`);

const response = await payments.fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    from: payer.address,
    to: targetAddress(),
    valueEth: '0',
    data: '0x',
  }),
});
const body = await response.json();

if (!response.ok) {
  throw new Error(`Request failed (${response.status}): ${JSON.stringify(body)}`);
}

console.log('Paid API response:');
console.log(JSON.stringify(body, null, 2));

const encodedReceipt = response.headers.get('payment-receipt');
if (encodedReceipt) {
  console.log('Payment receipt:');
  console.log(Buffer.from(encodedReceipt, 'base64').toString('utf8'));
}
