/**
 * ENSv2 setup diagnostic.
 *
 * Answers, against the live Sepolia ENSv2 beta deployment: is the parent name
 * registered, does it own a subname registry, and can the wallet issue names?
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/ensv2-status.ts
 */
import { Contract, JsonRpcProvider } from 'ethers';
import {
  ENSV2,
  ENS_PARENT_LABEL,
  ENS_PARENT_NAME,
  REGISTRY_ABI,
  getSubregistry,
} from '../src/ens';

const RPC = process.env.EXPO_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

(async () => {
  const provider = new JsonRpcProvider(RPC);
  const net = await provider.getNetwork();
  console.log(`\nENSv2 status — chainId ${net.chainId} (${RPC})\n`);

  console.log('Deployment:');
  for (const [name, addr] of Object.entries(ENSV2)) {
    const code = await provider.getCode(addr);
    console.log(`  ${code === '0x' ? '❌' : '✓'} ${name.padEnd(26)} ${addr}`);
  }

  console.log(`\nParent name: ${ENS_PARENT_NAME}`);
  const ethRegistry = new Contract(ENSV2.ethRegistry, REGISTRY_ABI, provider);

  let resolver = '0x0000000000000000000000000000000000000000';
  try {
    resolver = await ethRegistry.getResolver(ENS_PARENT_LABEL);
  } catch {
    /* ignore */
  }
  const registered = resolver !== '0x0000000000000000000000000000000000000000';
  const parentRegistry = await getSubregistry(ENSV2.ethRegistry, ENS_PARENT_LABEL);

  console.log(`  ${registered ? '✓' : '❌'} registered on ETHRegistry`);
  console.log(`  ${parentRegistry ? '✓' : '❌'} owns a subname registry ${parentRegistry ?? ''}`);

  console.log('\nVerdict:');
  if (parentRegistry) {
    console.log(`  ✅ Ready. The app can mint <you>.${ENS_PARENT_NAME} in ${parentRegistry}.`);
    console.log(`     Pin it with EXPO_PUBLIC_ENS_PARENT_REGISTRY=${parentRegistry}`);
  } else if (registered) {
    console.log(`  ⚠️  ${ENS_PARENT_NAME} exists but owns no subname registry, so it cannot`);
    console.log('     issue children. Deploy a UserRegistry proxy via the VerifiableFactory');
    console.log(`     (impl ${ENSV2.userRegistryImpl}) and attach it with setSubregistry().`);
  } else {
    console.log(`  ❌ ${ENS_PARENT_NAME} is not registered on this deployment.`);
    console.log(`     Register it via the ETHRegistrar (${ENSV2.ethRegistrar}), then deploy`);
    console.log('     and attach its subname registry. Until then, claims will revert —');
    console.log('     which is exactly the require(false) you saw.');
  }
  console.log('');
})();
