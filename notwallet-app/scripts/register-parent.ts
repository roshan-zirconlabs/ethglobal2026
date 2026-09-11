/**
 * One-time: register `notwallet.eth` to the deployer on the ENSv2 hackathon
 * deployment, funding the deployer with test USDC as needed. Idempotent — safe
 * to re-run. Reads PRIVATE_KEY from notwallet-app/.env.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/register-parent.ts
 */
import { readFileSync } from 'fs';
import {
  JsonRpcProvider, Wallet, Contract, parseUnits, formatUnits,
  hexlify, randomBytes, ZeroAddress, ZeroHash,
} from 'ethers';
import { ENSV2, ENS_PARENT_LABEL } from '../src/ens';

const USDC = '0xcbfd80f74375c54e545af34788ff465f96f66f05';
const RESOLVER = ENSV2.publicResolver;
const DURATION = 31536000n; // 1 year

const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const pk=(env.PRIVATE_KEY.startsWith('0x')?'':'0x')+env.PRIVATE_KEY;
const RPC=env.EXPO_PUBLIC_SEPOLIA_RPC||'https://ethereum-sepolia-rpc.publicnode.com';

const REGISTRAR_ABI = [
  'function isAvailable(string label) view returns (bool)',
  'function getRegisterPrice(string label, uint64 duration, address paymentToken) view returns (uint256 base, uint256 premium)',
  'function makeCommitment(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)',
  'function commit(bytes32 commitment)',
  'function register(string label, address owner, bytes32 secret, address subregistry, address resolver, uint64 duration, address paymentToken, bytes32 referrer) returns (uint256)',
  'error UnexpiredCommitmentExists(bytes32 commitment)',
  'error CommitmentTooNew(bytes32 commitment, uint64 validFrom, uint64 blockTimestamp)',
  'error CommitmentTooOld(bytes32 commitment, uint64 validTo, uint64 blockTimestamp)',
  'error NameNotAvailable(string label)',
];
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const p=new JsonRpcProvider(RPC); const w=new Wallet(pk,p);
  const net=await p.getNetwork();
  if(net.chainId!==11155111n){ throw new Error(`Wrong network ${net.chainId}, expected Sepolia`); }
  console.log('Deployer:', w.address);

  const reg=new Contract(ENSV2.ethRegistrar, REGISTRAR_ABI, w);
  if(!(await reg.isAvailable(ENS_PARENT_LABEL))){
    console.log(`✓ ${ENS_PARENT_LABEL}.eth is already registered — nothing to do.`);
    return;
  }

  // 1. Fund with test USDC
  const usdc=new Contract(USDC,[
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function mint(address,uint256)','function approve(address,uint256) returns (bool)',
  ], w);
  const [base,premium]=await reg.getRegisterPrice(ENS_PARENT_LABEL, DURATION, USDC);
  const price=base+premium;
  console.log('Price:', formatUnits(price,6), 'USDC');
  let bal:bigint=await usdc.balanceOf(w.address);
  if(bal<price){
    console.log('Minting 100 test USDC…');
    await (await usdc.mint(w.address, parseUnits('100',6))).wait();
    bal=await usdc.balanceOf(w.address);
  }
  console.log('USDC balance:', formatUnits(bal,6));
  if((await usdc.allowance(w.address, ENSV2.ethRegistrar))<price){
    console.log('Approving registrar to spend USDC…');
    await (await usdc.approve(ENSV2.ethRegistrar, parseUnits('1000000',6))).wait();
  }

  // 2. Commit
  const secret=hexlify(randomBytes(32));
  const commitment=await reg.makeCommitment(ENS_PARENT_LABEL, w.address, secret, ZeroAddress, RESOLVER, DURATION, ZeroHash);
  console.log('Committing…', commitment);
  await (await reg.commit(commitment)).wait();

  // 3. Register — poll until the commitment matures
  for(let i=0;i<24;i++){
    try {
      await reg.register.staticCall(ENS_PARENT_LABEL, w.address, secret, ZeroAddress, RESOLVER, DURATION, USDC, ZeroHash);
      console.log('Commitment mature — registering…');
      const tx=await reg.register(ENS_PARENT_LABEL, w.address, secret, ZeroAddress, RESOLVER, DURATION, USDC, ZeroHash);
      console.log('  tx:', tx.hash);
      await tx.wait();
      console.log(`✅ Registered ${ENS_PARENT_LABEL}.eth to ${w.address}`);
      return;
    } catch(e:any){
      const name=e?.revert?.name; const m=e.shortMessage??e.message??'';
      if(name==='CommitmentTooNew' || /CommitmentTooNew|too new|unknown custom error|commitment/i.test(m)){
        console.log(`  commitment maturing… waited ${(i+1)*10}s ${name?`(${name})`:''}`);
        await sleep(10000); continue;
      }
      if(name==='NameNotAvailable'){ throw new Error('Name became unavailable (someone else took it).'); }
      throw e;
    }
  }
  throw new Error('Commitment never matured within timeout.');
})().catch(e=>{ console.error('\n❌', e.shortMessage??e.message??e); process.exit(1); });
