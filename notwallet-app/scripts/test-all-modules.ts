/**
 * Automated Test Suite — Tests all NotWallet modules one by one.
 * Run with: npx ts-node scripts/test-all-modules.ts
 */
import {
  parseEther,
  formatEther,
  getBytes,
  keccak256,
  toUtf8Bytes,
  recoverAddress,
  MaxUint256,
  Interface,
} from 'ethers';

// 1. Test MFKDF
import { MfkdfSigner } from '../src/mfkdf';
// 2. Test ClearSign
import { clearSign, type DecodedTx } from '../src/clearsign';
// 3. Test Policies
import { checkPolicy, DEFAULT_POLICY } from '../src/policies';
// 4. Test Approvals
import { buildRevokeData, formatTokenAmount } from '../src/approvals';
// 5. Test ENS builders
import { buildSubnodeRecordTx, buildSetTextRecordTx, buildSetAddrTx } from '../src/ens';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🚀 Running NotWallet Automated Module Tests');
  console.log('========================================\n');

  // ---- TEST 1: MFKDF Signer & Determinism ----
  console.log('📦 [1/6] Testing MFKDF Key Derivation...');
  const cardId1 = '04a1b2c3d4e5f6';
  const pass1 = 'TestPass123!#';
  const secret1 = '0x1111111111111111111111111111111111111111111111111111111111111111';

  const signer1 = new MfkdfSigner(cardId1, pass1, 'main');
  const id1 = await signer1.getIdentity();

  const signer2 = new MfkdfSigner(cardId1, pass1, 'main');
  const id2 = await signer2.getIdentity();

  assert(id1.address.startsWith('0x') && id1.address.length === 42, 'Address is valid 42-char hex');
  assert(id1.address.toLowerCase() === id2.address.toLowerCase(), 'Deterministic: same inputs produce identical address');

  // Subaccount test (Daily vs Main)
  const signerDaily = new MfkdfSigner(cardId1, pass1, 'daily');
  const idDaily = await signerDaily.getIdentity();
  assert(idDaily.address.toLowerCase() !== id1.address.toLowerCase(), 'Subaccounts: daily envelope produces distinct address from same card');

  // Signing & Signature Recovery Test
  const testDigest = keccak256(toUtf8Bytes('NotWallet Test Message'));
  const sig = await signer1.signDigest(getBytes(testDigest));
  const recovered = recoverAddress(testDigest, {
    r: sig.r,
    s: sig.s,
    v: sig.v,
  });
  assert(recovered.toLowerCase() === id1.address.toLowerCase(), 'Signature correctly recovers to derived address');

  // ---- TEST 2: Clear-Signing Engine ----
  console.log('\n📦 [2/6] Testing Clear-Signing Engine...');
  const erc20Iface = new Interface([
    'function approve(address spender, uint256 amount)',
    'function transfer(address to, uint256 amount)',
  ]);

  // Infinite approval detection
  const infiniteData = erc20Iface.encodeFunctionData('approve', [
    '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    MaxUint256,
  ]);
  const txInfinite: DecodedTx = {
    to: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    valueWei: 0n,
    data: infiniteData,
    chainId: 11155111,
  };
  const csInfinite = clearSign(txInfinite, new Set());
  assert(csInfinite.worstLevel === 'danger', 'Infinite approval correctly flagged as DANGER');
  assert(csInfinite.summary.includes('UNLIMITED'), 'Summary explicitly mentions UNLIMITED approval');

  // Standard ETH transfer
  const txEth: DecodedTx = {
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    valueWei: parseEther('0.5'),
    data: '0x',
    chainId: 11155111,
  };
  const csEth = clearSign(txEth, new Set());
  assert(csEth.summary.includes('Send 0.5 ETH'), 'ETH transfer generates plain-English sentence');

  // Impersonation detection
  const mockResolvedNames = new Map([
    [
      '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
      {
        name: 'uniswap.eth',
        verified: false,
        impersonation: true,
        display: '🚨 uniswap.eth (IMPERSONATION)',
      },
    ],
  ]);
  const csImpersonation = clearSign(txEth, new Set(), mockResolvedNames);
  assert(
    csImpersonation.flags.some((f) => f.message.includes('IMPERSONATION')),
    'ENS impersonation detected and flagged as threat',
  );

  // ---- TEST 3: Spending Policies Engine ----
  console.log('\n📦 [3/6] Testing Spending Policies...');
  const policy = { ...DEFAULT_POLICY, perTxLimitWei: parseEther('0.1'), dailyLimitWei: parseEther('0.5') };

  // Per-tx limit test
  const bigTx: DecodedTx = {
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    valueWei: parseEther('0.2'), // > 0.1
    data: '0x',
    chainId: 11155111,
  };
  const check1 = checkPolicy(bigTx, policy, 0n, parseEther('1.0'));
  assert(Boolean(!check1.allowed && check1.reason?.toLowerCase().includes('per-transaction limit')), 'Per-transaction spending limit enforced');

  // Daily limit test
  const normalTx: DecodedTx = {
    to: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    valueWei: parseEther('0.05'),
    data: '0x',
    chainId: 11155111,
  };
  const check2 = checkPolicy(normalTx, policy, parseEther('0.48'), parseEther('1.0')); // 0.48 + 0.05 = 0.53 > 0.5
  assert(Boolean(!check2.allowed && check2.reason?.toLowerCase().includes('daily spending limit')), 'Daily cumulative limit enforced');

  // ---- TEST 4: Token Approvals & Revoke ----
  console.log('\n📦 [4/6] Testing Approvals & Revocation...');
  const spender = '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E';
  const token = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const revokeTx = buildRevokeData(token, spender);
  assert(revokeTx.to.toLowerCase() === token.toLowerCase(), 'Revoke target is the token contract');
  assert(revokeTx.data.startsWith('0x095ea7b3'), 'Revoke data encodes approve(address,uint256)');
  assert(revokeTx.data.endsWith('0000000000000000000000000000000000000000000000000000000000000000'), 'Revoke sets allowance amount to 0');

  const formattedUnlimited = formatTokenAmount(MaxUint256, 6, 'USDC');
  assert(formattedUnlimited === 'UNLIMITED USDC', 'Amount formatter recognizes MaxUint256 as UNLIMITED');

  // ---- TEST 5: ENSv2 Transaction Builders ----
  console.log('\n📦 [5/6] Testing ENSv2 Builders...');
  const subTx = buildSubnodeRecordTx(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    keccak256(toUtf8Bytes('alice')),
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  );
  assert(subTx.data.length > 10, 'Subnode registration transaction generated');

  const textTx = buildSetTextRecordTx(
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    'recovery-target',
    '0x1234567890123456789012345678901234567890',
  );
  assert(textTx.data.length > 10, 'Text record configuration transaction generated');

  // ---- TEST 6: Subaccounts & Envelopes ----
  console.log('\n📦 [6/6] Testing Money Envelopes...');
  const { STANDARD_SUBACCOUNTS } = await import('../src/subaccounts');
  assert(STANDARD_SUBACCOUNTS.length === 4, 'Standard envelopes (Primary, Daily, Savings, Sandbox) defined');

  console.log('\n========================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
