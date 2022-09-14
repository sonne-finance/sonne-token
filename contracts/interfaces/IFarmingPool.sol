//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.0;

interface IFarmingPool {
    function sonne() external pure returns (address);

    function claimable() external pure returns (address);

    function borrowable() external pure returns (address);

    function vestingBegin() external pure returns (uint256);

    function segmentLength() external pure returns (uint256);

    function recipients(address)
        external
        view
        returns (
            uint256 shares,
            uint256 lastShareIndex,
            uint256 credit
        );

    function totalShares() external view returns (uint256);

    function shareIndex() external view returns (uint256);

    function epochBegin() external view returns (uint256);

    function epochAmount() external view returns (uint256);

    function lastUpdate() external view returns (uint256);

    function updateShareIndex() external returns (uint256 _shareIndex);

    function updateCredit(address account) external returns (uint256 credit);

    function advance() external;

    function claim() external returns (uint256 amount);

    function claimAccount(address account) external returns (uint256 amount);

    function trackBorrow(
        address borrower,
        uint256 borrowBalance,
        uint256 borrowIndex
    ) external;

    event UpdateShareIndex(uint256 shareIndex);
    event UpdateCredit(
        address indexed account,
        uint256 lastShareIndex,
        uint256 credit
    );
    event Claim(address indexed account, uint256 amount);
    event EditRecipient(
        address indexed account,
        uint256 shares,
        uint256 totalShares
    );
    event Advance(uint256 epochBegin, uint256 epochAmount);
}
