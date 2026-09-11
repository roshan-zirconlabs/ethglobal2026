/**
 * Prove that `<sub>.<name>.notwallet.eth` works on-chain: claim a name, give it
 * its own child registry, register a sub-name resolving to an arbitrary address,
 * and confirm ENSv2's UniversalResolver resolves it. This is the mechanism the
 * app uses to register sub-wallets. Uses the deployer key (which can own a test
 * name and attach its subregistry).
 */
import { readFileSync } from 'fs';
import {
  JsonRpcProvider, Wallet, Contract, ContractFactory, namehash, Wallet as W,
} from 'ethers';
import { ENSV2, ENS_PARENT_NAME } from '../src/ens';

const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const pk=(env.PRIVATE_KEY.startsWith('0x')?'':'0x')+env.PRIVATE_KEY;
const RPC=env.EXPO_PUBLIC_SEPOLIA_RPC||'https://ethereum-sepolia-rpc.publicnode.com';
const REGISTRY=env.EXPO_PUBLIC_ENS_REGISTRAR;

const REG_ABI=[
  'function claim(string label) returns (bytes32)',
  'function available(string label) view returns (bool)',
  'function setSubregistry(string label, address registry)',
  'function setAddr(string label, address a)',
  'function getSubregistry(string label) view returns (address)',
];

(async()=>{
  const p=new JsonRpcProvider(RPC); const w=new Wallet(pk,p);
  const parent=new Contract(REGISTRY, REG_ABI, w);
  const name='agenttest';
  const sub='bnb';
  const agentAddr=W.createRandom().address; // pretend sub-wallet EOA

  // 1. Claim the parent test name (idempotent)
  if(await parent.available(name)){ console.log(`claiming ${name}.${ENS_PARENT_NAME}…`); await (await parent.claim(name)).wait(); }
  else console.log(`${name}.${ENS_PARENT_NAME} already owned`);

  // 2. Deploy a child registry for it
  let child=await parent.getSubregistry(name);
  if(!child || child==='0x0000000000000000000000000000000000000000'){
    const art=JSON.parse(readFileSync('contracts/out/NotWalletRegistry.sol/NotWalletRegistry.json','utf8'));
    const cf=new ContractFactory(art.abi, art.bytecode.object??art.bytecode, w);
    const parentNode=namehash(`${name}.${ENS_PARENT_NAME}`);
    console.log('deploying child registry…');
    const c=await cf.deploy(REGISTRY, name, parentNode); await c.waitForDeployment();
    child=await c.getAddress();
    console.log('  child registry:', child);
    console.log('attaching child registry to', name, '…');
    await (await parent.setSubregistry(name, child)).wait();
  } else console.log('child registry exists:', child);

  // 3. Register the sub-name and point it at the agent address
  const childReg=new Contract(child, REG_ABI, w);
  if(await childReg.available(sub)){ console.log(`claiming ${sub}.${name}.${ENS_PARENT_NAME}…`); await (await childReg.claim(sub)).wait(); }
  console.log(`setAddr ${sub} → ${agentAddr}`); await (await childReg.setAddr(sub, agentAddr)).wait();

  // 4. Resolve the full nested name via UniversalResolverV2
  const ur=new Contract(ENSV2.universalResolver,['function resolve(bytes name, bytes data) view returns (bytes,address)'],p);
  const full=`${sub}.${name}.${ENS_PARENT_NAME}`;
  const node=namehash(full);
  const dns=(n:string)=>'0x'+n.split('.').map(l=>{const b=Buffer.from(l);return b.length.toString(16).padStart(2,'0')+b.toString('hex');}).join('')+'00';
  const [res]=await ur.resolve(dns(full), '0x3b3b57de'+node.slice(2));
  const resolved='0x'+res.slice(-40);
  console.log(`\nUniversalResolver(${full}) = ${resolved}`);
  console.log(resolved.toLowerCase()===agentAddr.toLowerCase() ? '✅ NESTED NAME RESOLVES CORRECTLY' : '❌ mismatch');
})().catch(e=>{console.error('❌', e.shortMessage??e.reason??e.message??e);process.exit(1);});
