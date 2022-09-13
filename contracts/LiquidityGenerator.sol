pragma solidity =0.6.6;

import "./interfaces/IERC20.sol";
import "./interfaces/IOwnedDistributor.sol";
import "./interfaces/IVelodromeGauge.sol";
import "./interfaces/IVelodromePairFactory.sol";
import "./interfaces/IVelodromeRouter.sol";
import "./interfaces/IVelodromeVoter.sol";
import "./libraries/SafeMath.sol";
import "./libraries/SafeToken.sol";

contract LiquidityGenerator {
    using SafeMath for uint256;
    using SafeToken for address;

    uint256 public constant lockDuration = 6 * 30 * 24 * 60 * 60; // 6 months

    address public immutable admin;
    address public immutable sonne;
    address public immutable usdc;
    address public immutable velo;
    address public immutable router0;
    address public immutable voter;
    address public immutable reservesManager;
    address public immutable distributor;
    address public immutable bonusDistributor;
    uint256 public immutable periodBegin;
    uint256 public immutable periodEnd;
    uint256 public immutable bonusEnd;
    uint256 public unlockTimestamp;
    bool public finalized = false;
    bool public delivered = false;

    // Generated velodrome addresses
    address public immutable pair0;
    address public immutable gauge;

    event Finalized(uint256 amountSonne, uint256 amountUSDC);
    event Deposit(
        address indexed sender,
        uint256 amount,
        uint256 distributorTotalShares,
        uint256 bonusDistributorTotalShares,
        uint256 newShares,
        uint256 newBonusShares
    );
    event PostponeUnlockTimestamp(
        uint256 prevUnlockTimestamp,
        uint256 unlockTimestamp
    );
    event Delivered(uint256 amountPair0);
    event VeloRewardClaimed(uint256 amountVelo);

    constructor(
        address admin_,
        address sonne_,
        address usdc_,
        address velo_,
        address router0_,
        address voter_,
        address reservesManager_,
        address distributor_,
        address bonusDistributor_,
        uint256 periodBegin_,
        uint256 periodDuration_,
        uint256 bonusDuration_
    ) public {
        require(
            periodDuration_ > 0,
            "LiquidityGenerator: INVALID_PERIOD_DURATION"
        );
        require(
            bonusDuration_ > 0 && bonusDuration_ <= periodDuration_,
            "LiquidityGenerator: INVALID_BONUS_DURATION"
        );
        admin = admin_;
        sonne = sonne_;
        usdc = usdc_;
        velo = velo_;
        router0 = router0_;
        voter = voter_;
        reservesManager = reservesManager_;
        distributor = distributor_;
        bonusDistributor = bonusDistributor_;
        periodBegin = periodBegin_;
        periodEnd = periodBegin_.add(periodDuration_);
        bonusEnd = periodBegin_.add(bonusDuration_);

        address _veloPairFactory = IVelodromeRouter(router0_).factory();
        address _pair0 = IVelodromePairFactory(_veloPairFactory).createPair(
            sonne_,
            usdc_,
            false
        );
        address _gauge = IVelodromeVoter(voter_).createGauge(_pair0);

        pair0 = _pair0;
        gauge = _gauge;
    }

    function distributorTotalShares()
        public
        view
        returns (uint256 totalShares)
    {
        return IOwnedDistributor(distributor).totalShares();
    }

    function bonusDistributorTotalShares()
        public
        view
        returns (uint256 totalShares)
    {
        return IOwnedDistributor(bonusDistributor).totalShares();
    }

    function distributorRecipients(address account)
        public
        view
        returns (
            uint256 shares,
            uint256 lastShareIndex,
            uint256 credit
        )
    {
        return IOwnedDistributor(distributor).recipients(account);
    }

    function bonusDistributorRecipients(address account)
        public
        view
        returns (
            uint256 shares,
            uint256 lastShareIndex,
            uint256 credit
        )
    {
        return IOwnedDistributor(bonusDistributor).recipients(account);
    }

    function postponeUnlockTimestamp(uint256 newUnlockTimestamp) public {
        require(msg.sender == admin, "LiquidityGenerator: UNAUTHORIZED");
        require(
            newUnlockTimestamp > unlockTimestamp,
            "LiquidityGenerator: INVALID_UNLOCK_TIMESTAMP"
        );
        uint256 prevUnlockTimestamp = unlockTimestamp;
        unlockTimestamp = newUnlockTimestamp;
        emit PostponeUnlockTimestamp(prevUnlockTimestamp, unlockTimestamp);
    }

    function deliverLiquidityToReservesManager() public {
        require(msg.sender == admin, "LiquidityGenerator: UNAUTHORIZED");
        require(!delivered, "LiquidityGenerator: ALREADY_DELIVERED");
        require(finalized, "LiquidityGenerator: NOT_FINALIZED");
        uint256 blockTimestamp = getBlockTimestamp();
        require(
            blockTimestamp >= unlockTimestamp,
            "LiquidityGenerator: STILL_LOCKED"
        );
        IVelodromeGauge(gauge).withdrawAll();
        uint256 _amountPair0 = pair0.myBalance();
        pair0.safeTransfer(reservesManager, _amountPair0);
        delivered = true;
        emit Delivered(_amountPair0);
    }

    function claimVeloRewards() public {
        require(msg.sender == admin, "LiquidityGenerator: UNAUTHORIZED");
        require(!delivered, "LiquidityGenerator: ALREADY_DELIVERED");
        require(finalized, "LiquidityGenerator: ALREADY_DELIVERED");

        address[] memory tokens = new address[](1);
        tokens[0] = velo;
        IVelodromeGauge(gauge).getReward(address(this), tokens);

        uint256 _amountVelo = velo.myBalance();
        velo.safeTransfer(reservesManager, _amountVelo);
        emit VeloRewardClaimed(_amountVelo);
    }

    function finalize() public {
        require(!finalized, "LiquidityGenerator: FINALIZED");
        uint256 blockTimestamp = getBlockTimestamp();
        require(blockTimestamp >= periodEnd, "LiquidityGenerator: TOO_SOON");
        uint256 _amountSonne = sonne.myBalance();
        uint256 _amountUSDC = usdc.myBalance();

        sonne.safeApprove(router0, _amountSonne);
        usdc.safeApprove(router0, _amountUSDC);
        IVelodromeRouter(router0).addLiquidity(
            sonne,
            usdc,
            false,
            _amountSonne,
            _amountUSDC,
            _amountSonne,
            _amountUSDC,
            address(this),
            blockTimestamp
        );

        uint256 _amountPair0 = pair0.myBalance();
        pair0.safeApprove(gauge, _amountPair0);
        IVelodromeGauge(gauge).deposit(_amountPair0, 0);

        unlockTimestamp = blockTimestamp.add(lockDuration);
        finalized = true;
        emit Finalized(_amountSonne, _amountUSDC);
    }

    function deposit(uint256 amountUSDC) external payable {
        uint256 blockTimestamp = getBlockTimestamp();
        require(blockTimestamp >= periodBegin, "LiquidityGenerator: TOO_SOON");
        require(blockTimestamp < periodEnd, "LiquidityGenerator: TOO_LATE");
        require(amountUSDC >= 1e8, "LiquidityGenerator: INVALID_VALUE"); // minimum 100 USDC

        // Pull usdc to this contract
        usdc.safeTransferFrom(msg.sender, address(this), amountUSDC);

        (uint256 _prevSharesBonus, , ) = IOwnedDistributor(bonusDistributor)
            .recipients(msg.sender);
        uint256 _newSharesBonus = _prevSharesBonus;
        if (blockTimestamp < bonusEnd) {
            _newSharesBonus = _prevSharesBonus.add(amountUSDC);
            IOwnedDistributor(bonusDistributor).editRecipient(
                msg.sender,
                _newSharesBonus
            );
        }
        (uint256 _prevShares, , ) = IOwnedDistributor(distributor).recipients(
            msg.sender
        );
        uint256 _newShares = _prevShares.add(amountUSDC);
        IOwnedDistributor(distributor).editRecipient(msg.sender, _newShares);
        emit Deposit(
            msg.sender,
            amountUSDC,
            distributorTotalShares(),
            bonusDistributorTotalShares(),
            _newShares,
            _newSharesBonus
        );
    }

    receive() external payable {
        revert("LiquidityGenerator: BAD_CALL");
    }

    function getBlockTimestamp() public view virtual returns (uint256) {
        return block.timestamp;
    }
}
