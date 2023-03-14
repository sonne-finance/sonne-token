//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.10;

import './interfaces/IERC20.sol';
import './libraries/SafeMath.sol';
import './libraries/SafeToken.sol';

contract Fundraising {
    using SafeToken for address;

    struct ConstuctorParams {
        address recipient;
        address usdc;
        uint256 maxTotalDeposit;
        uint256 minDepositPerAccount;
        uint256 maxDepositPerAccount;
        uint256 depositStart;
        uint256 depositEnd;
    }

    event Deposited(
        address indexed sender,
        uint256 deposit,
        uint256 accountDeposit,
        uint256 totalDeposit
    );

    address public immutable recipient;
    address public immutable usdc;
    uint256 public immutable maxTotalDeposit;
    uint256 public immutable minDepositPerAccount;
    uint256 public immutable maxDepositPerAccount;
    uint256 public immutable depositStart;
    uint256 public immutable depositEnd;

    mapping(address => uint256) public deposits;
    uint256 public totalDeposit;

    constructor(ConstuctorParams memory params) {
        require(
            params.recipient != address(0),
            'Fundraising: invalid recipient'
        );
        require(params.usdc != address(0), 'Fundraising: invalid usdc');
        require(
            params.depositStart > block.timestamp,
            'Fundraising: past deposit start'
        );
        require(
            params.depositEnd > params.depositStart,
            'Fundraising: deposit end before deposit start'
        );

        recipient = params.recipient;
        usdc = params.usdc;
        maxTotalDeposit = params.maxTotalDeposit;
        minDepositPerAccount = params.minDepositPerAccount;
        maxDepositPerAccount = params.maxDepositPerAccount;
        depositStart = params.depositStart;
        depositEnd = params.depositEnd;
    }

    function deposit(uint256 amount) external {
        require(block.timestamp >= depositStart, 'Fundraising: not started');
        require(block.timestamp <= depositEnd, 'Fundraising: ended');

        // Check account deposit limits
        uint256 prevDeposit = deposits[msg.sender];
        uint256 newDeposit = prevDeposit + amount;
        require(
            newDeposit >= minDepositPerAccount,
            'Fundraising: min deposit per account'
        );
        require(
            newDeposit <= maxDepositPerAccount,
            'Fundraising: max deposit per account'
        );

        // Check total deposit limits
        uint256 newTotalDeposit = totalDeposit + amount;
        require(
            newTotalDeposit <= maxTotalDeposit,
            'Fundraising: max total deposit'
        );

        // Transfer USDC from sender to recipient
        usdc.safeTransferFrom(msg.sender, recipient, amount);

        // Update state
        deposits[msg.sender] = newDeposit;
        totalDeposit = newTotalDeposit;

        emit Deposited(msg.sender, amount, newDeposit, newTotalDeposit);
    }
}
