// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NotWalletRegistrar
 * @notice Permissionless issuer of `<label>.notwallet.eth` identities on the
 *         ENSv2 Sepolia beta deployment.
 *
 * WHY THIS EXISTS
 * ---------------
 * In ENSv2, `PermissionedRegistry.register()` requires the caller to hold
 * `ROLE_REGISTRAR` on that registry. A normal user's wallet never does, so users
 * cannot self-issue subnames under `notwallet.eth` directly. This contract is the
 * standard fix (the same pattern behind cb.id / base.eth / uni.eth): it holds
 * `ROLE_REGISTRAR` on the parent registry and exposes a permissionless `claim()`
 * that mints the name to `msg.sender`. Self-custody is preserved — the user signs
 * their own claim; this contract only carries the minting privilege.
 *
 * The interface below is a self-contained subset of ENSv2's `IStandardRegistry`
 * (types verified against ensdomains/contracts-v2). `IRegistry` params are typed
 * as `address` here; that is ABI-identical, so this file needs no ENS imports and
 * compiles/deploys standalone.
 */

/// @dev Minimal view of the ENSv2 permissioned registry we call into.
interface IEnsRegistry {
    function register(
        string calldata label,
        address owner,
        address registry, // IRegistry — address(0) = no child registry yet
        address resolver,
        uint256 roleBitmap,
        uint64 expiry
    ) external returns (uint256 tokenId);

    /// @return status 0 = AVAILABLE, 1 = RESERVED, 2 = REGISTERED
    function getStatus(uint256 anyId) external view returns (uint8 status);
}

contract NotWalletRegistrar {
    // ── ENSv2 EAC role bits (RegistryRolesLib), name-scoped ──────────────────
    uint256 internal constant ROLE_UNREGISTER = 1 << 12;
    uint256 internal constant ROLE_RENEW = 1 << 16;
    uint256 internal constant ROLE_SET_SUBREGISTRY = 1 << 20;
    uint256 internal constant ROLE_SET_RESOLVER = 1 << 24;
    uint256 internal constant ADMIN_SHIFT = 128;

    /**
     * Roles granted to a claimed identity on its OWN name. It gets full control
     * of its branch — crucially `ROLE_SET_SUBREGISTRY`, so the owner can later
     * attach their own registry and mint agent subnames (bnb.alice.notwallet.eth)
     * — plus the admin bits to re-delegate resolver/subregistry control.
     */
    uint256 public constant IDENTITY_ROLES =
        ROLE_UNREGISTER |
        ROLE_RENEW |
        ROLE_SET_SUBREGISTRY |
        ROLE_SET_RESOLVER |
        ((ROLE_SET_SUBREGISTRY | ROLE_SET_RESOLVER) << ADMIN_SHIFT);

    /// @notice The registry of `notwallet.eth` (where identities are minted).
    IEnsRegistry public immutable parentRegistry;
    /// @notice Resolver assigned to each new identity (ENSv2 PublicResolverV2).
    address public immutable defaultResolver;
    /// @notice Admin (deployer) — may tune duration and hand off ownership only.
    address public owner;
    /// @notice Registration length. Renewable by the name owner (ROLE_RENEW).
    uint64 public duration = 365 days;

    event Claimed(string label, address indexed owner, uint256 tokenId);
    event DurationChanged(uint64 duration);
    event OwnerChanged(address indexed owner);

    error EmptyLabel();
    error NotOwner();

    constructor(address _parentRegistry, address _defaultResolver) {
        parentRegistry = IEnsRegistry(_parentRegistry);
        defaultResolver = _defaultResolver;
        owner = msg.sender;
    }

    /**
     * @notice Claim `label.notwallet.eth`. First-come-first-served; reverts if the
     *         label is already registered. The name is minted to `msg.sender`.
     * @dev The child registry is left as address(0): the identity owns no agent
     *      registry yet, but holds ROLE_SET_SUBREGISTRY to attach one later.
     */
    function claim(string calldata label) external returns (uint256 tokenId) {
        if (bytes(label).length == 0) revert EmptyLabel();
        tokenId = parentRegistry.register(
            label,
            msg.sender,
            address(0),
            defaultResolver,
            IDENTITY_ROLES,
            uint64(block.timestamp) + duration
        );
        emit Claimed(label, msg.sender, tokenId);
    }

    /// @notice True if `label.notwallet.eth` can be claimed right now.
    function available(string calldata label) external view returns (bool) {
        uint256 id = uint256(keccak256(bytes(label)));
        return parentRegistry.getStatus(id) == 0; // AVAILABLE
    }

    // ── Admin (no power over user funds or issued names) ─────────────────────
    function setDuration(uint64 d) external {
        if (msg.sender != owner) revert NotOwner();
        duration = d;
        emit DurationChanged(d);
    }

    function transferOwnership(address next) external {
        if (msg.sender != owner) revert NotOwner();
        owner = next;
        emit OwnerChanged(next);
    }
}
