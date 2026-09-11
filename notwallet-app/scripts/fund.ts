/**
 * Fund any address with Sepolia ETH for gas, from the deployer key in .env.
 * This is the "sponsor gas for users" tool: a new phone wallet has no ETH, so
 * top it up once and it can claim its name / set a guardian itself.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/fund.ts <address> [amountEth=0.02]
 */
import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, isAddress, parseEther, formatEther } from 'ethers';

const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const pk=(env.PRIVATE_KEY.startsWith('0x')?'':'0x')+env.PRIVATE_KEY;
const RPC=env.EXPO_PUBLIC_SEPOLIA_RPC||'https://ethereum-sepolia-rpc.publicnode.com';

(async()=>{
  const to=process.argv[2];
  const amount=process.argv[3]||'0.02';
  if(!to||!isAddress(to)){ console.error('Usage: fund.ts <address> [amountEth]'); process.exit(1); }
  const p=new JsonRpcProvider(RPC); const w=new Wallet(pk,p);
  const before=await p.getBalance(to);
  console.log(`Funding ${to}`);
  console.log(`  current balance: ${formatEther(before)} ETH`);
  const tx=await w.sendTransaction({ to, value: parseEther(amount) });
  console.log(`  tx: ${tx.hash}  (sending ${amount} ETH)`);
  await tx.wait();
  console.log(`  new balance: ${formatEther(await p.getBalance(to))} ETH ✓`);
})().catch(e=>{ console.error('❌', e.shortMessage??e.message??e); process.exit(1); });
