//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./interfaces/IBorrowable.sol";
import "./interfaces/IFarmingPool.sol";

contract ClaimAggregator {
    constructor() {}

    function trackBorrows(address account, address[] calldata borrowables)
        external
    {
        for (uint256 i = 0; i < borrowables.length; i++) {
            IBorrowable(borrowables[i]).trackBorrow(account);
        }
    }

    function claims(address account, address[] calldata farmingPools)
        external
        returns (uint256 amount)
    {
        for (uint256 i = 0; i < farmingPools.length; i++) {
            amount += IFarmingPool(farmingPools[i]).claimAccount(account);
        }
    }
}
