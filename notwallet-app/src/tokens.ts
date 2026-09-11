/**
 * Testnet tokens — the ENSv2 Sepolia beta MockUSDC faucet.
 *
 * NOTE: claiming `<you>.notwallet.eth` costs NO USDC — the registry's claim() is
 * free (gas only). USDC was only needed once, to register the parent name, which
 * the deployer already did. This faucet exists for convenience: registering your
 * own 2LD, or testing token/approval flows. MockUSDC exposes a public mint.
 */
import { Contract, Interface, JsonRpcProvider, formatUnits } from 'ethers';

const SEPOLIA_RPC =
  process.env.EXPO_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

/** MockUSDC on the ENSv2 Sepolia beta (hackathon) deployment. 6 decimals. */
export const MOCK_USDC = '0xcbfd80f74375c54e545af34788ff465f96f66f05';
export const USDC_DECIMALS = 6;

const usdcIface = new Interface([
  'function mint(address to, uint256 amount)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]);

/** Base units for `whole` USDC. */
export function usdcAmount(whole: number): bigint {
  // Support fractional USD by scaling through 1e6 with rounding.
  return BigInt(Math.round(whole * 10 ** USDC_DECIMALS));
}

/** Build a USDC transfer (used to fund a sub-wallet with its budget). */
export function buildUsdcTransferTx(to: string, whole: number) {
  return {
    to: MOCK_USDC,
    data: usdcIface.encodeFunctionData('transfer', [to, usdcAmount(whole)]),
    value: 0n,
  };
}

/** Read an address's USDC balance as a display string (e.g. "50.00"). */
export async function usdcBalanceOf(address: string): Promise<string> {
  try {
    const usdc = new Contract(MOCK_USDC, usdcIface, new JsonRpcProvider(SEPOLIA_RPC));
    const bal: bigint = await usdc.balanceOf(address);
    return Number(formatUnits(bal, USDC_DECIMALS)).toFixed(2);
  } catch {
    return '0.00';
  }
}

/** Build a tx that mints `whole` test USDC to `to` (default 100). */
export function buildMintUsdcTx(to: string, whole = 100) {
  const amount = BigInt(whole) * 10n ** BigInt(USDC_DECIMALS);
  return {
    to: MOCK_USDC,
    data: usdcIface.encodeFunctionData('mint', [to, amount]),
    value: 0n,
  };
}
