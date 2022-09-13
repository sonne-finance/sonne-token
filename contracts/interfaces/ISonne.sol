pragma solidity =0.6.6;

//IERC20
interface ISonne {
    function balanceOf(address account) external view returns (uint256);

    function transfer(address dst, uint256 rawAmount) external returns (bool);
}
