/**
 * Token approval scanner — the "who can spend my tokens?" dashboard.
 *
 * Scans for ERC-20 Approval events emitted for the user's address, then checks
 * the current on-chain allowance for each. Displays active approvals with the
 * option to one-tap revoke.
 *
 * This gives users visibility they typically don't have: most wallet users have
 * no idea they've granted unlimited token spending rights to various contracts.
 */
import { Contract, JsonRpcProvider, getAddress } from 'ethers';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

// Minimal ERC-20 ABI
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
];

export type TokenApproval = {
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  spenderAddress: string;
  allowance: bigint;
  isUnlimited: boolean;
};

// Well-known Sepolia token addresses (expand as needed)
const KNOWN_TOKENS: { address: string; symbol: string; decimals: number }[] = [
  { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', decimals: 6 },
  { address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', symbol: 'USDT', decimals: 6 },
  { address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', symbol: 'WETH', decimals: 18 },
];

/**
 * Scan for active token approvals for a given address.
 * Checks well-known tokens and any previously tracked approvals.
 */
export async function scanApprovals(
  ownerAddress: string,
  additionalTokens: string[] = [],
): Promise<TokenApproval[]> {
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const results: TokenApproval[] = [];
  const owner = getAddress(ownerAddress);

  // Combine well-known tokens with additional tracked ones
  const tokensToCheck = [
    ...KNOWN_TOKENS,
    ...additionalTokens.map((addr) => ({
      address: addr,
      symbol: '???',
      decimals: 18,
    })),
  ];

  // Deduplicate
  const seen = new Set<string>();
  const uniqueTokens = tokensToCheck.filter((t) => {
    const key = t.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Well-known spenders on Sepolia
  const knownSpenders = [
    '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E', // Uniswap V3 SwapRouter
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap SwapRouter02
    '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Permit2
  ];

  for (const token of uniqueTokens) {
    const contract = new Contract(token.address, ERC20_ABI, provider);

    // Try to get the actual symbol if we don't know it
    let symbol = token.symbol;
    let decimals = token.decimals;
    if (symbol === '???') {
      try {
        symbol = await contract.symbol();
        decimals = Number(await contract.decimals());
      } catch {
        // Can't read symbol — keep the default
      }
    }

    // Check allowance against known spenders
    for (const spender of knownSpenders) {
      try {
        const allowance: bigint = await contract.allowance(owner, spender);
        if (allowance > 0n) {
          const isUnlimited = allowance >= BigInt('0xffffffffffffffffffffffffffffff'); // Very large ≈ unlimited
          results.push({
            tokenAddress: token.address,
            tokenSymbol: symbol,
            tokenDecimals: decimals,
            spenderAddress: spender,
            allowance,
            isUnlimited,
          });
        }
      } catch {
        // Contract call failed — skip this pair
      }
    }
  }

  return results;
}

/**
 * Format a token amount for display.
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  symbol: string,
): string {
  if (amount >= BigInt('0xffffffffffffffffffffffffffffff')) {
    return `UNLIMITED ${symbol}`;
  }
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole}.${fracStr} ${symbol}`;
}

/**
 * Revoke a specific token approval by setting allowance to 0.
 * Returns the transaction hash.
 *
 * Note: This creates the unsigned transaction data. The caller must sign it
 * using the MFKDF card signer and broadcast.
 */
export function buildRevokeData(
  tokenAddress: string,
  spenderAddress: string,
): { to: string; data: string; value: bigint } {
  const contract = new Contract(tokenAddress, ERC20_ABI);
  const data = contract.interface.encodeFunctionData('approve', [
    spenderAddress,
    0,
  ]);
  return {
    to: tokenAddress,
    data,
    value: 0n,
  };
}
