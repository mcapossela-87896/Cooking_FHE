pragma solidity ^0.8.24;
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract CookingFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error RateLimited();
    error InvalidBatch();
    error StaleWrite();
    error ReplayAttempt();
    error InvalidStateHash();
    error BatchClosed();
    error BatchNotClosed();
    error InvalidConfig();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused();
    event Unpaused();
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId, address indexed opener);
    event BatchClosed(uint256 indexed batchId, address indexed closer);
    event OrderSubmitted(address indexed chef, uint256 indexed orderId, bytes32 encryptedOrder);
    event BatchSubmitted(uint256 indexed batchId, uint256 indexed orderId, bytes32 encryptedOrder);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalScore);
    event OrderRevealed(uint256 indexed batchId, uint256 orderId, uint32 score);
    event BatchScoreComputed(uint256 indexed batchId, uint256 totalScore);

    bool public paused;
    uint256 public constant MIN_INTERVAL = 5 seconds;
    uint256 public cooldownSeconds = 10;
    uint256 public currentModelVersion;
    uint256 public currentBatchId;
    bool public batchOpen;

    mapping(address => bool) public providers;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => Order) public orders;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    struct Order {
        euint32 encryptedScore;
        address chef;
        uint256 batchId;
        bool exists;
    }

    struct Batch {
        euint32 encryptedTotalScore;
        uint256 orderCount;
        bool closed;
    }

    struct DecryptionContext {
        uint256 modelVersion;
        bytes32 stateHash;
        uint256 batchId;
        bool processed;
        address requester;
    }

    modifier onlyOwner() {
        if (msg.sender != owner()) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!providers[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier rateLimit() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownSeconds) {
            revert RateLimited();
        }
        lastActionAt[msg.sender] = block.timestamp;
        _;
    }

    function initialize() external onlyOwner {
        currentModelVersion = 1;
        currentBatchId = 1;
        batchOpen = false;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused();
    }

    function setCooldownSeconds(uint256 newCooldown) external onlyOwner {
        if (newCooldown < MIN_INTERVAL) revert InvalidConfig();
        cooldownSeconds = newCooldown;
        emit CooldownUpdated(newCooldown);
    }

    function addProvider(address provider) external onlyOwner {
        providers[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        providers[provider] = false;
        emit ProviderRemoved(provider);
    }

    function openBatch() external onlyProvider whenNotPaused rateLimit {
        if (batchOpen) revert InvalidBatch();
        batchOpen = true;
        batches[currentBatchId] = Batch({ encryptedTotalScore: FHE.asEuint32(0), orderCount: 0, closed: false });
        emit BatchOpened(currentBatchId, msg.sender);
    }

    function closeBatch() external onlyProvider whenNotPaused rateLimit {
        if (!batchOpen) revert InvalidBatch();
        batchOpen = false;
        batches[currentBatchId].closed = true;
        emit BatchClosed(currentBatchId, msg.sender);
    }

    function submitOrder(euint32 encryptedScore) external onlyProvider whenNotPaused rateLimit {
        if (!batchOpen) revert BatchClosed();
        uint256 orderId = ordersCount();
        orders[orderId] = Order({
            encryptedScore: encryptedScore,
            chef: msg.sender,
            batchId: currentBatchId,
            exists: true
        });
        batches[currentBatchId].orderCount++;
        emit OrderSubmitted(msg.sender, orderId, FHE.toBytes32(encryptedScore));
    }

    function submitToBatch(euint32 encryptedScore, uint256 batchId) external onlyProvider whenNotPaused rateLimit {
        if (batchId != currentBatchId || !batchOpen) revert InvalidBatch();
        uint256 orderId = ordersCount();
        orders[orderId] = Order({
            encryptedScore: encryptedScore,
            chef: msg.sender,
            batchId: batchId,
            exists: true
        });
        batches[batchId].orderCount++;
        emit BatchSubmitted(batchId, orderId, FHE.toBytes32(encryptedScore));
    }

    function ordersCount() internal view returns (uint256) {
        // Simplified for example; in production, maintain a counter
        return batches[currentBatchId].orderCount;
    }

    function requestBatchScoreDecryption(uint256 batchId) external onlyProvider whenNotPaused rateLimit {
        if (batchId != currentBatchId || !batches[batchId].closed) revert InvalidBatch();
        euint32 memory totalScore = batches[batchId].encryptedTotalScore;
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(totalScore);
        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleBatchScoreDecryption.selector);
        decryptionContexts[requestId] = DecryptionContext({
            modelVersion: currentModelVersion,
            stateHash: stateHash,
            batchId: batchId,
            processed: false,
            requester: msg.sender
        });
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function handleBatchScoreDecryption(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];
        if (ctx.processed) revert ReplayAttempt();
        if (ctx.modelVersion != currentModelVersion) revert StaleWrite();

        euint32 memory currentTotalScore = batches[ctx.batchId].encryptedTotalScore;
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(currentTotalScore);
        bytes32 currHash = _hashCiphertexts(cts);

        if (currHash != ctx.stateHash) revert InvalidStateHash();
        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 totalScore = abi.decode(cleartexts, (uint32));
        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, totalScore);
        emit BatchScoreComputed(ctx.batchId, totalScore);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal view returns (euint32 memory) {
        if (!FHE.isInitialized(x)) {
            return FHE.asEuint32(0);
        }
        return x;
    }

    function _requireInitialized(euint32 x, string memory tag) internal view {
        if (!FHE.isInitialized(x)) {
            revert(string(abi.encodePacked(tag, " not initialized")));
        }
    }

    function aggregateBatchScore(uint256 batchId) public onlyProvider whenNotPaused {
        if (batchId != currentBatchId || !batches[batchId].closed) revert InvalidBatch();
        euint32 memory totalScore = batches[batchId].encryptedTotalScore;
        totalScore = _initIfNeeded(totalScore);
        for (uint256 i = 0; i < batches[batchId].orderCount; i++) {
            Order storage order = orders[i];
            if (order.batchId == batchId) {
                euint32 memory score = order.encryptedScore;
                _requireInitialized(score, "Order score");
                totalScore = FHE.add(totalScore, score);
            }
        }
        batches[batchId].encryptedTotalScore = totalScore;
    }

    function revealOrderScore(uint256 orderId) external onlyProvider whenNotPaused rateLimit {
        Order storage order = orders[orderId];
        if (!order.exists) revert InvalidBatch();
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(order.encryptedScore);
        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.handleOrderScoreReveal.selector);
        decryptionContexts[requestId] = DecryptionContext({
            modelVersion: currentModelVersion,
            stateHash: stateHash,
            batchId: order.batchId,
            processed: false,
            requester: msg.sender
        });
        emit DecryptionRequested(requestId, order.batchId, stateHash);
    }

    function handleOrderScoreReveal(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];
        if (ctx.processed) revert ReplayAttempt();
        if (ctx.modelVersion != currentModelVersion) revert StaleWrite();

        euint32 memory currentScore = orders[ctx.batchId].encryptedScore;
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(currentScore);
        bytes32 currHash = _hashCiphertexts(cts);

        if (currHash != ctx.stateHash) revert InvalidStateHash();
        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 score = abi.decode(cleartexts, (uint32));
        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, score);
        emit OrderRevealed(ctx.batchId, ctx.batchId, score);
    }
}