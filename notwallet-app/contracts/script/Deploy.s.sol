// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {NotWalletRegistrar} from "../src/NotWalletRegistrar.sol";

/**
 * Deploy the NotWalletRegistrar.
 *
 *   PARENT_REGISTRY = notwallet.eth's OWN registry address (NOT the ETHRegistry).
 *                     Get it from scripts/setup-registrar.ts output, or via:
 *                       cast call <ETHRegistry> "getSubregistry(string)(address)" notwallet
 *   DEFAULT_RESOLVER = ENSv2 PublicResolverV2 (0xf9de…33f6 on Sepolia beta)
 *
 *   forge script script/Deploy.s.sol --rpc-url sepolia --broadcast \
 *     --private-key $DEPLOYER_KEY
 */
contract Deploy is Script {
    function run() external {
        address parentRegistry = vm.envAddress("PARENT_REGISTRY");
        address defaultResolver = vm.envAddress("DEFAULT_RESOLVER");

        vm.startBroadcast();
        NotWalletRegistrar registrar = new NotWalletRegistrar(parentRegistry, defaultResolver);
        vm.stopBroadcast();

        console.log("NotWalletRegistrar:", address(registrar));
        console.log("Next: grant it ROLE_REGISTRAR on the parent registry (EnhancedAccessControl.grantRootRoles),");
        console.log("then set EXPO_PUBLIC_ENS_REGISTRAR to the address above.");
    }
}
