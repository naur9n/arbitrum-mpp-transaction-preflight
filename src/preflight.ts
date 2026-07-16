import {
  decodeFunctionData,
  formatEther,
  getAddress,
  isAddress,
  isHex,
  maxUint256,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

const approvalAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const;

export type PreflightInput = {
  from: Address;
  to: Address;
  value: bigint;
  data: Hex;
};

export type RiskWarning = {
  severity: 'low' | 'medium' | 'high';
  code: string;
  message: string;
};

export function parsePreflightInput(body: unknown): PreflightInput {
  if (!body || typeof body !== 'object') throw new Error('JSON body is required');
  const input = body as Record<string, unknown>;

  if (typeof input.from !== 'string' || !isAddress(input.from)) {
    throw new Error('from must be a valid EVM address');
  }
  if (typeof input.to !== 'string' || !isAddress(input.to)) {
    throw new Error('to must be a valid EVM address');
  }

  const data = input.data ?? '0x';
  if (typeof data !== 'string' || !isHex(data)) {
    throw new Error('data must be a 0x-prefixed hex string');
  }

  let value = 0n;
  if (input.valueEth !== undefined) {
    if (typeof input.valueEth !== 'string') throw new Error('valueEth must be a decimal string');
    value = parseEther(input.valueEth);
  } else if (input.valueWei !== undefined) {
    if (typeof input.valueWei !== 'string' || !/^\d+$/.test(input.valueWei)) {
      throw new Error('valueWei must be an unsigned integer string');
    }
    value = BigInt(input.valueWei);
  }

  return {
    from: getAddress(input.from),
    to: getAddress(input.to),
    data: data as Hex,
    value,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const candidate = error as Error & { shortMessage?: string };
    return candidate.shortMessage ?? error.message;
  }
  return String(error);
}

function inspectApproval(data: Hex, warnings: RiskWarning[]) {
  if (data === '0x') return null;

  try {
    const decoded = decodeFunctionData({ abi: approvalAbi, data });
    if (decoded.functionName === 'approve') {
      const [spender, amount] = decoded.args;
      const unlimited = amount === maxUint256;
      warnings.push({
        severity: unlimited ? 'high' : 'medium',
        code: unlimited ? 'UNLIMITED_TOKEN_APPROVAL' : 'TOKEN_APPROVAL',
        message: unlimited
          ? `Grants unlimited token spending permission to ${spender}.`
          : `Grants ${spender} permission to spend ${amount.toString()} raw token units.`,
      });
      return { type: 'ERC20_APPROVE', spender, amount: amount.toString(), unlimited };
    }

    if (decoded.functionName === 'setApprovalForAll') {
      const [operator, approved] = decoded.args;
      if (approved) {
        warnings.push({
          severity: 'high',
          code: 'NFT_APPROVAL_FOR_ALL',
          message: `Grants ${operator} control over every token in this NFT collection.`,
        });
      }
      return { type: 'NFT_APPROVAL_FOR_ALL', operator, approved };
    }
  } catch {
    // The calldata does not match one of the approval functions we inspect.
  }

  return null;
}

export async function runPreflight(client: PublicClient, input: PreflightInput) {
  const warnings: RiskWarning[] = [];
  const bytecode = await client.getCode({ address: input.to });
  const targetType = bytecode && bytecode !== '0x' ? 'contract' : 'EOA';

  if (targetType === 'EOA' && input.data !== '0x') {
    warnings.push({
      severity: 'high',
      code: 'CALLDATA_TO_EOA',
      message: 'Transaction sends calldata to an address with no deployed contract code.',
    });
  }

  const approval = inspectApproval(input.data, warnings);
  const [blockNumber, gasPrice] = await Promise.all([
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);

  let simulation:
    | { success: true; returnData: Hex | undefined }
    | { success: false; error: string };
  try {
    const result = await client.call({
      account: input.from,
      to: input.to,
      data: input.data,
      value: input.value,
    });
    simulation = { success: true, returnData: result.data };
  } catch (error) {
    const message = errorMessage(error);
    simulation = { success: false, error: message };
    warnings.push({
      severity: 'high',
      code: 'SIMULATION_REVERTED',
      message,
    });
  }

  let gas:
    | { estimate: string; gasPriceWei: string; estimatedCostEth: string }
    | { estimate: null; gasPriceWei: string; error: string };
  try {
    const estimate = await client.estimateGas({
      account: input.from,
      to: input.to,
      data: input.data,
      value: input.value,
    });
    gas = {
      estimate: estimate.toString(),
      gasPriceWei: gasPrice.toString(),
      estimatedCostEth: formatEther(estimate * gasPrice),
    };
  } catch (error) {
    gas = { estimate: null, gasPriceWei: gasPrice.toString(), error: errorMessage(error) };
  }

  const weights = { low: 10, medium: 30, high: 60 } as const;
  const riskScore = Math.min(100, warnings.reduce((sum, item) => sum + weights[item.severity], 0));
  const riskLevel = riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

  return {
    network: 'Arbitrum Sepolia',
    chainId: 421614,
    transaction: {
      ...input,
      value: input.value.toString(),
    },
    target: { type: targetType, hasCode: targetType === 'contract' },
    simulation,
    gas,
    approval,
    risk: { score: riskScore, level: riskLevel, warnings },
    checkedAtBlock: blockNumber.toString(),
    checkedAt: new Date().toISOString(),
    disclaimer: 'Automated simulation and heuristics are not a guarantee of transaction safety.',
  };
}
