pragma solidity =0.6.6;

import "./libraries/SafeMath.sol";
import "./interfaces/ISonne.sol";
import "./interfaces/IClaimable.sol";

abstract contract Distributor is IClaimable {
    using SafeMath for uint256;

    address public immutable sonne;
    address public immutable claimable;

    struct Recipient {
        uint256 shares;
        uint256 lastShareIndex;
        uint256 credit;
    }
    mapping(address => Recipient) public recipients;

    uint256 public totalShares;
    uint256 public shareIndex;

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

    constructor(address sonne_, address claimable_) public {
        sonne = sonne_;
        claimable = claimable_;
    }

    function updateShareIndex()
        public
        virtual
        nonReentrant
        returns (uint256 _shareIndex)
    {
        if (totalShares == 0) return shareIndex;
        uint256 amount = IClaimable(claimable).claim();
        if (amount == 0) return shareIndex;
        _shareIndex = amount.mul(2**160).div(totalShares).add(shareIndex);
        shareIndex = _shareIndex;
        emit UpdateShareIndex(_shareIndex);
    }

    function updateCredit(address account) public returns (uint256 credit) {
        uint256 _shareIndex = updateShareIndex();
        if (_shareIndex == 0) return 0;
        Recipient storage recipient = recipients[account];
        credit =
            recipient.credit +
            _shareIndex.sub(recipient.lastShareIndex).mul(recipient.shares) /
            2**160;
        recipient.lastShareIndex = _shareIndex;
        recipient.credit = credit;
        emit UpdateCredit(account, _shareIndex, credit);
    }

    function claimInternal(address account)
        internal
        virtual
        returns (uint256 amount)
    {
        amount = updateCredit(account);
        if (amount > 0) {
            recipients[account].credit = 0;
            ISonne(sonne).transfer(account, amount);
            emit Claim(account, amount);
        }
    }

    function claim() external virtual override returns (uint256 amount) {
        return claimInternal(msg.sender);
    }

    function editRecipientInternal(address account, uint256 shares) internal {
        updateCredit(account);
        Recipient storage recipient = recipients[account];
        uint256 prevShares = recipient.shares;
        uint256 _totalShares = shares > prevShares
            ? totalShares.add(shares - prevShares)
            : totalShares.sub(prevShares - shares);
        totalShares = _totalShares;
        recipient.shares = shares;
        emit EditRecipient(account, shares, _totalShares);
    }

    // Prevents a contract from calling itself, directly or indirectly.
    bool internal _notEntered = true;
    modifier nonReentrant() {
        require(_notEntered, "Distributor: REENTERED");
        _notEntered = false;
        _;
        _notEntered = true;
    }
}
