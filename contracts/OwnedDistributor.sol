//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import "./Distributor.sol";

contract OwnedDistributor is Distributor {
    address public admin;

    event SetAdmin(address newAdmin);

    constructor(
        address sonne_,
        address claimable_,
        address admin_
    ) Distributor(sonne_, claimable_) {
        admin = admin_;
    }

    function editRecipient(address account, uint256 shares) public virtual {
        require(msg.sender == admin, "OwnedDistributor: UNAUTHORIZED");
        editRecipientInternal(account, shares);
    }

    function setAdmin(address admin_) public virtual {
        require(msg.sender == admin, "OwnedDistributor: UNAUTHORIZED");
        admin = admin_;
        emit SetAdmin(admin_);
    }
}
