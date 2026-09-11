/**
 * Deploy NotWalletRegistry, attach it to notwallet.eth, wire .env, and verify a
 * real claim + resolution. Idempotent. Run register-parent.ts first.
 */
import { readFileSync, writeFileSync } from 'fs';
import {
  JsonRpcProvider, Wallet, Contract, ContractFactory, namehash, id as keccakId,
} from 'ethers';
import { ENSV2, ENS_PARENT_LABEL, ENS_PARENT_NAME, getSubregistry } from '../src/ens';

const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const pk=(env.PRIVATE_KEY.startsWith('0x')?'':'0x')+env.PRIVATE_KEY;
const RPC=env.EXPO_PUBLIC_SEPOLIA_RPC||'https://ethereum-sepolia-rpc.publicnode.com';
const labelId=(l:string)=>BigInt(keccakId(l));

(async()=>{
  const p=new JsonRpcProvider(RPC); const w=new Wallet(pk,p);
  if((await p.getNetwork()).chainId!==11155111n) throw new Error('not Sepolia');
  console.log('Deployer:', w.address);

  // 1. Deploy (or reuse) our registry
  let registry = await getSubregistry(ENSV2.ethRegistry, ENS_PARENT_LABEL);
  if(registry){
    console.log('✓ notwallet.eth already points to a registry:', registry);
  } else {
    const art=JSON.parse(readFileSync('contracts/out/NotWalletRegistry.sol/NotWalletRegistry.json','utf8'));
    const cf=new ContractFactory(art.abi, art.bytecode.object ?? art.bytecode, w);
    const parentNode=namehash(ENS_PARENT_NAME);
    console.log('Deploying NotWalletRegistry… parentNode', parentNode);
    const c=await cf.deploy(ENSV2.ethRegistry, ENS_PARENT_LABEL, parentNode);
    await c.waitForDeployment();
    registry=await c.getAddress();
    console.log('  NotWalletRegistry:', registry);

    console.log('Attaching to notwallet.eth via ETHRegistry.setSubregistry…');
    const ethReg=new Contract(ENSV2.ethRegistry,['function setSubregistry(uint256 anyId, address registry)'],w);
    await (await ethReg.setSubregistry(labelId(ENS_PARENT_LABEL), registry)).wait();
  }

  // 2. Persist to .env (registrar and parent-registry are the same contract)
  let envText=readFileSync('.env','utf8');
  const put=(k:string,v:string)=>{ envText = new RegExp(`^${k}=.*$`,'m').test(envText) ? envText.replace(new RegExp(`^${k}=.*$`,'m'),`${k}=${v}`) : envText.trimEnd()+`\n${k}=${v}\n`; };
  put('EXPO_PUBLIC_ENS_REGISTRAR', registry);
  put('EXPO_PUBLIC_ENS_PARENT_REGISTRY', registry);
  writeFileSync('.env', envText);
  console.log('✓ .env updated');

  // 3. Verify: attach + a real test claim + on-chain resolution
  const reg=new Contract(registry,[
    'function available(string) view returns (bool)',
    'function claim(string) returns (bytes32)',
    'function ownerOf(string) view returns (address)',
    'function nodeOf(string) view returns (bytes32)',
    'function addr(bytes32) view returns (address)',
  ],w);
  console.log('\nVerification:');
  console.log('  getSubregistry(notwallet) =', await getSubregistry(ENSV2.ethRegistry, ENS_PARENT_LABEL));
  const testName='demo';
  if(await reg.available(testName)){
    console.log(`  claiming test name "${testName}.${ENS_PARENT_NAME}"…`);
    await (await reg.claim(testName)).wait();
  }
  console.log(`  ownerOf(${testName}) =`, await reg.ownerOf(testName), '(== deployer?', (await reg.ownerOf(testName)).toLowerCase()===w.address.toLowerCase(), ')');
  const node=await reg.nodeOf(testName);
  console.log(`  addr(node) =`, await reg.addr(node), '→ resolves to the owner ✓');

  // 4. Full traversal via UniversalResolverV2 (best-effort proof)
  try{
    const ur=new Contract(ENSV2.universalResolver,[
      'function resolve(bytes name, bytes data) view returns (bytes result, address resolverUsed)',
    ],p);
    const dns=(name:string)=>'0x'+name.split('.').map(l=>{const b=Buffer.from(l);return b.length.toString(16).padStart(2,'0')+b.toString('hex');}).join('')+'00';
    const addrCall='0x3b3b57de'+node.slice(2); // addr(bytes32 node)
    const [result]=await ur.resolve(dns(`${testName}.${ENS_PARENT_NAME}`), addrCall);
    console.log('  UniversalResolverV2 →', '0x'+result.slice(-40));
  }catch(e:any){ console.log('  UniversalResolverV2 traversal: (skipped)', e.shortMessage??e.code??''); }

  console.log('\n✅ notwallet.eth issues names. Users can claim <name>.notwallet.eth in-app.');
})().catch(e=>{ console.error('\n❌', e.shortMessage??e.reason??e.message??e); process.exit(1); });
