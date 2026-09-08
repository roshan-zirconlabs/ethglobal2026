// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NotWalletRegistrar
 * @notice ENSv2 Subname Registrar with Enhanced Access Control (EAC).
 *
 * Implements hierarchical subname issuance under a parent domain (e.g. `notwallet.eth` on Sepolia).
 * Features:
 * 1. Free, non-custodial subname issuance for NotWallet users (`user.notwallet.eth`).
 * 2. Enhanced Access Control (EAC):
 *    - Domain Owner (the user): Full control over their subname records.
 *    - Guardian Role: Scoped delegate that can ONLY update the `recovery-target` text record.
 *      Guardians CANNOT transfer name ownership, touch funds, or alter other records.
 * 3. Enforces 1 subname per address to prevent name squatting.
 */

interface IENSRegistry {
    function setSubnodeRecord(
        bytes32 node,
        bytes32 label,
        address owner,
        address resolver,
        uint64 ttl
    ) external;
    function owner(bytes32 node) external view returns (address);
}

interface IENSResolver {
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function setAddr(bytes32 node, address a) external;
    function text(bytes32 node, string calldata key) external view returns (string memory);
    function addr(bytes32 node) external view returns (address);
}

contract NotWalletRegistrar {
    /// @notice Parent domain nodehash (e.g. namehash("notwallet.eth"))
    bytes32 public immutable parentNode;

    /// @notice ENS Registry address on Sepolia
    IENSRegistry public immutable registry;

    /// @notice Public Resolver address on Sepolia
    IENSResolver public immutable defaultResolver;

    /// @notice Contract administrator
    address public owner;

    /// @notice Mapping from address to registered subname label
    mapping(address => string) public addressToLabel;

    /// @notice Mapping from subname node to authorized guardian address
    mapping(bytes32 => address) public nodeGuardians;

    event SubnameRegistered(
        string label,
        bytes32 indexed subnode,
        address indexed owner,
        address resolver
    );

    event GuardianGranted(bytes32 indexed subnode, address indexed guardian);
    event GuardianRevoked(bytes32 indexed subnode, address indexed guardian);
    event RecoveryPointerUpdated(bytes32 indexed subnode, address indexed recoveryAddress, address updatedBy);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not registrar owner");
        _;
    }

    constructor(
        bytes32 _parentNode,
        address _registry,
        address _defaultResolver
    ) {
        parentNode = _parentNode;
        registry = IENSRegistry(_registry);
        defaultResolver = IENSResolver(_defaultResolver);
        owner = msg.sender;
    }

    /**
     * @notice Register a new subname `label.notwallet.eth` for msg.sender.
     * @param label The alphanumeric label (e.g. "roshan")
     * @param initialRecoveryAddress Optional immutable recovery address to record
     */
    function registerSubname(
        string calldata label,
        address initialRecoveryAddress
    ) external returns (bytes32 subnode) {
        bytes32 labelHash = keccak256(bytes(label));
        subnode = keccak256(abi.encodePacked(parentNode, labelHash));

        require(bytes(label).length >= 3, "Label too short");
        require(registry.owner(subnode) == address(0), "Subname already registered");
        require(bytes(addressToLabel[msg.sender]).length == 0, "Address already has a subname");

        addressToLabel[msg.sender] = label;

        // Register in ENS Registry: set msg.sender as owner, defaultResolver as resolver
        registry.setSubnodeRecord(
            parentNode,
            labelHash,
            msg.sender,
            address(defaultResolver),
            0
        );

        // Point address record to msg.sender
        defaultResolver.setAddr(subnode, msg.sender);
        defaultResolver.setText(subnode, "wallet", "notwallet-mfkdf");

        // Optionally record recovery target
        if (initialRecoveryAddress != address(0)) {
            defaultResolver.setText(
                subnode,
                "recovery-target",
                _toHexString(initialRecoveryAddress)
            );
        }

        emit SubnameRegistered(label, subnode, msg.sender, address(defaultResolver));
    }

    /**
     * @notice Enhanced Access Control: Grant a trusted guardian role on your subname.
     * @dev Guardians can ONLY update the recovery-target record during emergencies.
     */
    function grantGuardianRole(bytes32 subnode, address guardian) external {
        require(registry.owner(subnode) == msg.sender, "Must be subname owner");
        require(guardian != address(0), "Invalid guardian address");
        nodeGuardians[subnode] = guardian;
        emit GuardianGranted(subnode, guardian);
    }

    /**
     * @notice Revoke guardian role from a subname.
     */
    function revokeGuardianRole(bytes32 subnode) external {
        require(registry.owner(subnode) == msg.sender, "Must be subname owner");
        address oldGuardian = nodeGuardians[subnode];
        nodeGuardians[subnode] = address(0);
        emit GuardianRevoked(subnode, oldGuardian);
    }

    /**
     * @notice Guardian action: Update the recovery vault pointer.
     * @dev Can be called by either the subname owner OR the authorized guardian.
     */
    function updateRecoveryPointer(bytes32 subnode, address newRecoveryVault) external {
        address subnameOwner = registry.owner(subnode);
        address guardian = nodeGuardians[subnode];

        require(
            msg.sender == subnameOwner || (guardian != address(0) && msg.sender == guardian),
            "Not authorized as owner or guardian"
        );
        require(newRecoveryVault != address(0), "Invalid recovery vault");

        defaultResolver.setText(
            subnode,
            "recovery-target",
            _toHexString(newRecoveryVault)
        );

        emit RecoveryPointerUpdated(subnode, newRecoveryVault, msg.sender);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        bytes16 hexAlphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint160(addr) / (2**(8 * (19 - i)))));
            s[2 + i * 2] = hexAlphabet[uint8(b >> 4)];
            s[3 + i * 2] = hexAlphabet[uint8(b & 0x0f)];
        }
        return string(s);
    }
}
