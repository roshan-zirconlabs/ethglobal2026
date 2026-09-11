// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NotWalletRegistry
 * @notice A self-contained ENSv2 subname registry for `notwallet.eth`.
 *
 * ENSv2 is hierarchical: any name can point to its own registry implementing the
 * minimal `IRegistry` interface, and resolution traverses down through it. This
 * contract IS that registry for `notwallet.eth` — set via
 * `ETHRegistry.setSubregistry(labelId("notwallet"), thisAddress)`. It also acts
 * as the resolver for the names it issues (ENSIP-10 `resolve`), so a claimed
 * `<you>.notwallet.eth` resolves to its owner immediately, in one transaction,
 * with no dependency on ENS's proxy factory.
 *
 * Design goals: permissionless self-claim (users sign their own claim — full
 * self-custody), instant resolution, and owner-writable records (the recovery
 * guardian pointer lives here as a text record). It never holds or moves funds.
 */

interface IRegistry {
    function getSubregistry(string calldata label) external view returns (address);
    function getResolver(string calldata label) external view returns (address);
    function getParent() external view returns (address parent, string memory label);
}

contract NotWalletRegistry is IRegistry {
    /// @notice The parent registry (ENSv2 ETHRegistry) and our label under it.
    address public immutable parentRegistry;
    string public parentLabel; // "notwallet"
    /// @notice namehash("notwallet.eth") — base for child node hashes.
    bytes32 public immutable parentNode;

    uint64 public constant REGISTRATION = 365 days;

    struct Name {
        address owner;
        uint64 expiry;
    }

    // labelhash(label) => registration
    mapping(bytes32 => Name) public names;
    // child node (namehash of full name) => resolved address
    mapping(bytes32 => address) internal _addr;
    // child node => (key => text value)
    mapping(bytes32 => mapping(string => string)) internal _text;
    // labelhash(label) => child registry (for agent hierarchies)
    mapping(bytes32 => address) internal _subregistry;

    event Claimed(string label, address indexed owner, bytes32 node);
    event AddrChanged(bytes32 indexed node, address a);
    event TextChanged(bytes32 indexed node, string key, string value);
    event SubregistrySet(string label, address registry);

    error EmptyLabel();
    error NameTaken();
    error NotNameOwner();

    constructor(address _parentRegistry, string memory _parentLabel, bytes32 _parentNode) {
        parentRegistry = _parentRegistry;
        parentLabel = _parentLabel;
        parentNode = _parentNode;
    }

    // ── Node math ─────────────────────────────────────────────────────────────
    function labelhash(string memory label) public pure returns (bytes32) {
        return keccak256(bytes(label));
    }

    /// @notice namehash of `<label>.notwallet.eth`.
    function nodeOf(string memory label) public view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }

    function _expired(bytes32 lh) internal view returns (bool) {
        uint64 e = names[lh].expiry;
        return e != 0 && block.timestamp >= e;
    }

    // ── Claiming (permissionless, self-custodial) ──────────────────────────────
    /// @notice Claim `<label>.notwallet.eth`. First-come-first-served; the caller
    ///         becomes the owner and the name resolves to them immediately.
    function claim(string calldata label) external returns (bytes32 node) {
        if (bytes(label).length == 0) revert EmptyLabel();
        bytes32 lh = keccak256(bytes(label));
        if (names[lh].owner != address(0) && !_expired(lh)) revert NameTaken();

        names[lh] = Name({owner: msg.sender, expiry: uint64(block.timestamp) + REGISTRATION});
        node = keccak256(abi.encodePacked(parentNode, lh));
        _addr[node] = msg.sender;
        emit Claimed(label, msg.sender, node);
        emit AddrChanged(node, msg.sender);
    }

    /**
     * @notice Claim `<label>` and point it at `target` in one call — used to
     *         register a sub-wallet's name resolving to the sub-wallet's address,
     *         while the CALLER (your main wallet) remains the on-chain owner so it
     *         can manage/nest further. First-come-first-served.
     */
    function claimFor(string calldata label, address target) external returns (bytes32 node) {
        if (bytes(label).length == 0) revert EmptyLabel();
        bytes32 lh = keccak256(bytes(label));
        if (names[lh].owner != address(0) && !_expired(lh)) revert NameTaken();
        names[lh] = Name({owner: msg.sender, expiry: uint64(block.timestamp) + REGISTRATION});
        node = keccak256(abi.encodePacked(parentNode, lh));
        _addr[node] = target;
        emit Claimed(label, msg.sender, node);
        emit AddrChanged(node, target);
    }

    function available(string calldata label) external view returns (bool) {
        bytes32 lh = keccak256(bytes(label));
        return names[lh].owner == address(0) || _expired(lh);
    }

    function ownerOf(string calldata label) external view returns (address) {
        bytes32 lh = keccak256(bytes(label));
        return _expired(lh) ? address(0) : names[lh].owner;
    }

    // ── Owner-writable records ─────────────────────────────────────────────────
    modifier onlyNameOwner(string calldata label) {
        bytes32 lh = keccak256(bytes(label));
        if (names[lh].owner != msg.sender || _expired(lh)) revert NotNameOwner();
        _;
    }

    function setAddr(string calldata label, address a) external onlyNameOwner(label) {
        bytes32 node = nodeOf(label);
        _addr[node] = a;
        emit AddrChanged(node, a);
    }

    /// @notice Set a text record (e.g. the recovery guardian pointer).
    function setText(string calldata label, string calldata key, string calldata value)
        external
        onlyNameOwner(label)
    {
        bytes32 node = nodeOf(label);
        _text[node][key] = value;
        emit TextChanged(node, key, value);
    }

    /// @notice Attach a child registry so `<label>` can host its own subnames
    ///         (agent hierarchy: bnb.you.notwallet.eth).
    function setSubregistry(string calldata label, address registry)
        external
        onlyNameOwner(label)
    {
        _subregistry[keccak256(bytes(label))] = registry;
        emit SubregistrySet(label, registry);
    }

    // ── IRegistry (traversal) ──────────────────────────────────────────────────
    function getSubregistry(string calldata label) external view returns (address) {
        bytes32 lh = keccak256(bytes(label));
        return _expired(lh) ? address(0) : _subregistry[lh];
    }

    /// @notice This registry resolves the names it issues, so it returns itself.
    function getResolver(string calldata label) external view returns (address) {
        bytes32 lh = keccak256(bytes(label));
        return _expired(lh) ? address(0) : address(this);
    }

    function getParent() external view returns (address, string memory) {
        return (parentRegistry, parentLabel);
    }

    // ── Resolver (ENSIP-10 + addr/text) ────────────────────────────────────────
    function addr(bytes32 node) external view returns (address) {
        return _addr[node];
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _text[node][key];
    }

    /// @notice ENSIP-10 wildcard resolution entrypoint used by UniversalResolver.
    function resolve(bytes calldata, bytes calldata data) external view returns (bytes memory) {
        bytes4 selector = bytes4(data[:4]);
        if (selector == 0x3b3b57de) {
            // addr(bytes32)
            bytes32 node = abi.decode(data[4:], (bytes32));
            return abi.encode(_addr[node]);
        }
        if (selector == 0xf1cb7e06) {
            // addr(bytes32,uint256) — coin type; return EVM address as bytes for 60
            (bytes32 node, ) = abi.decode(data[4:], (bytes32, uint256));
            return abi.encode(abi.encodePacked(_addr[node]));
        }
        if (selector == 0x59d1d43c) {
            // text(bytes32,string)
            (bytes32 node, string memory key) = abi.decode(data[4:], (bytes32, string));
            return abi.encode(_text[node][key]);
        }
        return "";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 || // ERC165
            interfaceId == 0x9061b923 || // IExtendedResolver (ENSIP-10)
            interfaceId == 0x3b3b57de || // addr(bytes32)
            interfaceId == 0x59d1d43c;   // text(bytes32,string)
    }
}
