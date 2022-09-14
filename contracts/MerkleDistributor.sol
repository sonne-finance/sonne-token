//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

//import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./Distributor.sol";

contract MerkleDistributor is Distributor {
    using SafeMath for uint256;

    struct Shareholder {
        address recipient;
        uint256 shares;
    }

    constructor(
        address sonne_,
        address claimable_,
        bytes[] memory data
    ) Distributor(sonne_, claimable_) {
        uint256 _totalShares = 0;
        for (uint256 i = 0; i < data.length; i++) {
            Shareholder memory shareholder = abi.decode(data[i], (Shareholder));
            recipients[shareholder.recipient].shares = shareholder.shares;
            _totalShares = _totalShares.add(shareholder.shares);
        }
        totalShares = _totalShares;
    }
}
