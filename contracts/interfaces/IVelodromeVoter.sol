//SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.0;

interface IVelodromeVoter {
    function createGauge(address _pool) external returns (address);

    function whitelist(address token) external;

    function gauges(address _pool) external view returns (address);
}
