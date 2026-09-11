/**
 * On-chain registration of sub-wallet ENS names (the ENSv2 hierarchy).
 *
 * Registering `bnb.roshan.notwallet.eth` requires roshan's name to own a child
 * registry; registering `bot1.uni.roshan.notwallet.eth` requires uni's too.
 * `ensureChildRegistry` walks the path from the identity down to the parent,
 * deploying + attaching a child `NotWalletRegistry` at each level that lacks one,
 * then `claimFor` points the leaf at the sub-wallet's address.
 *
 * Everything runs under a single `executeWithKey` (one card tap): the derived
 * key signs each tx sequentially, then is dropped. Names resolve immediately via
 * ENSv2's UniversalResolver (proven on-chain).
 */
import {
  Contract, ContractFactory, JsonRpcProvider, Wallet, ZeroAddress, namehash,
} from 'ethers';

import { NOTWALLET_REGISTRY_ABI, NOTWALLET_REGISTRY_BYTECODE } from './registryArtifact';
import { ENS_PARENT_NAME } from './ens';
import { agentParentName } from './agents';
import type { MfkdfSigner } from './mfkdf';

const RPC = process.env.EXPO_PUBLIC_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';

/** Returns the registry that holds `name`'s children, deploying it if missing. */
async function ensureChildRegistry(
  wallet: Wallet,
  topRegistry: string,
  name: string,
  identityName: string,
  addrOf: (fullName: string) => string | undefined,
): Promise<string> {
  if (name.toLowerCase() === ENS_PARENT_NAME.toLowerCase()) return topRegistry;

  const parent = agentParentName(name);
  const leaf = name.split('.')[0];
  const holdingAddr = await ensureChildRegistry(wallet, topRegistry, parent, identityName, addrOf);
  const holding = new Contract(holdingAddr, NOTWALLET_REGISTRY_ABI, wallet);

  // Ensure `name` is claimed in its holding registry (identity is already owned).
  if (name.toLowerCase() !== identityName.toLowerCase()) {
    if (await holding.available(leaf)) {
      const target = addrOf(name) ?? (await wallet.getAddress());
      await (await holding.claimFor(leaf, target)).wait();
    }
  }

  let child: string = await holding.getSubregistry(leaf);
  if (!child || child === ZeroAddress) {
    const factory = new ContractFactory(NOTWALLET_REGISTRY_ABI, NOTWALLET_REGISTRY_BYTECODE, wallet);
    const deployed = await factory.deploy(holdingAddr, leaf, namehash(name));
    await deployed.waitForDeployment();
    child = await deployed.getAddress();
    await (await holding.setSubregistry(leaf, child)).wait();
  }
  return child;
}

/** Register `agent`'s full name on-chain, resolving to its address. */
export async function registerSubwalletOnChain(
  mainSigner: MfkdfSigner,
  opts: {
    topRegistry: string;
    identityName: string;
    agentFullName: string;
    agentLabel: string;
    agentAddress: string;
    addrOf: (fullName: string) => string | undefined;
  },
): Promise<{ name: string; txHash: string }> {
  return mainSigner.executeWithKey(async (pk) => {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(pk, provider);
    const parent = agentParentName(opts.agentFullName);
    const holdingAddr = await ensureChildRegistry(
      wallet, opts.topRegistry, parent, opts.identityName, opts.addrOf,
    );
    const holding = new Contract(holdingAddr, NOTWALLET_REGISTRY_ABI, wallet);
    let tx;
    if (await holding.available(opts.agentLabel)) {
      tx = await holding.claimFor(opts.agentLabel, opts.agentAddress);
    } else {
      tx = await holding.setAddr(opts.agentLabel, opts.agentAddress);
    }
    await tx.wait();
    return { name: opts.agentFullName, txHash: tx.hash };
  });
}
