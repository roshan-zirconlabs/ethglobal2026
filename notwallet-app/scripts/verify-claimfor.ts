import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, Contract, ContractFactory, namehash, ZeroAddress } from 'ethers';
import { ENSV2, ENS_PARENT_NAME } from '../src/ens';
import { NOTWALLET_REGISTRY_ABI, NOTWALLET_REGISTRY_BYTECODE } from '../src/registryArtifact';

const env=Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(Boolean).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const pk=(env.PRIVATE_KEY.startsWith('0x')?'':'0x')+env.PRIVATE_KEY;
const RPC=env.EXPO_PUBLIC_SEPOLIA_RPC||'https://ethereum-sepolia-rpc.publicnode.com';
const TOP=env.EXPO_PUBLIC_ENS_REGISTRAR;

(async()=>{
  const p=new JsonRpcProvider(RPC); const w=new Wallet(pk,p);
  const top=new Contract(TOP, NOTWALLET_REGISTRY_ABI, w);
  const name='agentx'+(Math.floor(Date.now()/1000)%1000); // fresh
  const agentAddr=Wallet.createRandom().address;
  const botAddr=Wallet.createRandom().address;

  console.log(`claim ${name}…`); await (await top.claim(name)).wait();
  // deploy child registry (NEW bytecode with claimFor)
  const cf=new ContractFactory(NOTWALLET_REGISTRY_ABI, NOTWALLET_REGISTRY_BYTECODE, w);
  const child=await cf.deploy(TOP, name, namehash(`${name}.${ENS_PARENT_NAME}`)); await child.waitForDeployment();
  const childAddr=await child.getAddress();
  await (await top.setSubregistry(name, childAddr)).wait();
  const childReg=new Contract(childAddr, NOTWALLET_REGISTRY_ABI, w);

  console.log(`claimFor bnb → agent`); await (await childReg.claimFor('bnb', agentAddr)).wait();

  // NEST: bot under bnb → deploy bnb's child registry, claimFor bot
  const bnbChild=await cf.deploy(childAddr, 'bnb', namehash(`bnb.${name}.${ENS_PARENT_NAME}`)); await bnbChild.waitForDeployment();
  await (await childReg.setSubregistry('bnb', await bnbChild.getAddress())).wait();
  const bnbReg=new Contract(await bnbChild.getAddress(), NOTWALLET_REGISTRY_ABI, w);
  console.log(`claimFor bot1 → bot (nested 2 levels)`); await (await bnbReg.claimFor('bot1', botAddr)).wait();

  // resolve both
  const ur=new Contract(ENSV2.universalResolver,['function resolve(bytes,bytes) view returns (bytes,address)'],p);
  const dns=(n:string)=>'0x'+n.split('.').map(l=>{const b=Buffer.from(l);return b.length.toString(16).padStart(2,'0')+b.toString('hex');}).join('')+'00';
  const R=async(full:string)=>{const node=namehash(full);const [r]=await ur.resolve(dns(full),'0x3b3b57de'+node.slice(2));return '0x'+r.slice(-40);};
  const r1=await R(`bnb.${name}.${ENS_PARENT_NAME}`);
  const r2=await R(`bot1.bnb.${name}.${ENS_PARENT_NAME}`);
  console.log(`\nbnb.${name}.${ENS_PARENT_NAME} = ${r1}  ${r1.toLowerCase()===agentAddr.toLowerCase()?'✅':'❌'}`);
  console.log(`bot1.bnb.${name}.${ENS_PARENT_NAME} = ${r2}  ${r2.toLowerCase()===botAddr.toLowerCase()?'✅ (2-level nesting)':'❌'}`);
})().catch(e=>{console.error('❌',e.shortMessage??e.reason??e.message??e);process.exit(1);});
