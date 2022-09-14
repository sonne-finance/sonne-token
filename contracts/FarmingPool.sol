//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./Distributor.sol";
import "./interfaces/IBorrowTracker.sol";
import "./interfaces/IVester.sol";
import "./libraries/Math.sol";

// ASSUMTPIONS:
// - advance is called at least once for each epoch
// - farmingPool shares edits are effective starting from the next epoch

contract FarmingPool is IBorrowTracker, Distributor {
    using SafeMath for uint256;

    address public immutable borrowable;

    uint256 public immutable vestingBegin;
    uint256 public immutable segmentLength;

    uint256 public epochBegin;
    uint256 public epochAmount;
    uint256 public lastUpdate;

    event Advance(uint256 epochBegin, uint256 epochAmount);

    constructor(
        address sonne_,
        address claimable_,
        address borrowable_,
        address vester_
    ) Distributor(sonne_, claimable_) {
        borrowable = borrowable_;
        uint256 _vestingBegin = IVester(vester_).vestingBegin();
        vestingBegin = _vestingBegin;
        segmentLength = IVester(vester_).vestingEnd().sub(_vestingBegin).div(
            IVester(vester_).segments()
        );
    }

    function updateShareIndex()
        public
        virtual
        override
        returns (uint256 _shareIndex)
    {
        if (totalShares == 0) return shareIndex;
        if (epochBegin == 0) return shareIndex;
        uint256 epochEnd = epochBegin + segmentLength;
        uint256 blockTimestamp = getBlockTimestamp();
        uint256 timestamp = Math.min(blockTimestamp, epochEnd);
        uint256 timeElapsed = timestamp - lastUpdate;
        assert(timeElapsed <= segmentLength);
        if (timeElapsed == 0) return shareIndex;

        uint256 amount = epochAmount.mul(timeElapsed).div(segmentLength);
        _shareIndex = amount.mul(2**160).div(totalShares).add(shareIndex);
        shareIndex = _shareIndex;
        lastUpdate = timestamp;
        emit UpdateShareIndex(_shareIndex);
    }

    function advance() public nonReentrant {
        uint256 blockTimestamp = getBlockTimestamp();
        if (blockTimestamp < vestingBegin) return;
        uint256 _epochBegin = epochBegin;
        if (_epochBegin != 0 && blockTimestamp < _epochBegin + segmentLength)
            return;
        uint256 amount = IClaimable(claimable).claim();
        if (amount == 0) return;
        updateShareIndex();
        uint256 timeSinceBeginning = blockTimestamp - vestingBegin;
        epochBegin = blockTimestamp.sub(timeSinceBeginning.mod(segmentLength));
        epochAmount = amount;
        lastUpdate = epochBegin;
        emit Advance(epochBegin, epochAmount);
    }

    function claimInternal(address account)
        internal
        override
        returns (uint256 amount)
    {
        advance();
        return super.claimInternal(account);
    }

    function claimAccount(address account) external returns (uint256 amount) {
        return claimInternal(account);
    }

    function trackBorrow(
        address borrower,
        uint256 borrowBalance,
        uint256 borrowIndex
    ) external override {
        require(msg.sender == borrowable, "FarmingPool: UNAUTHORIZED");
        uint256 newShares = borrowBalance.mul(2**96).div(borrowIndex);
        editRecipientInternal(borrower, newShares);
    }

    function getBlockTimestamp() public view virtual returns (uint256) {
        return block.timestamp;
    }
}
