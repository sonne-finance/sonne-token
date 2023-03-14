import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, BytesLike, Contract } from 'ethers'
import { ethers } from 'hardhat'

const maxTotalDeposit = ethers.utils.parseUnits('50000', 6)
const minDepositPerAccount = ethers.utils.parseUnits('1000', 6)
const maxDepositPerAccount = ethers.utils.parseUnits('5000', 6)
const depositStart = new Date(2023, 2, 17, 0, 0, 0).getTime() / 1000
const depositEnd = new Date(2023, 2, 20, 0, 0, 0).getTime() / 1000

const setup = async () => {
    const [deployer, recipient, user1, user2, user3] = await ethers.getSigners()

    const users = [user1, user2, user3]

    const USDC = await ethers.getContractFactory('MockERC20Token')
    const usdc = await USDC.deploy(ethers.utils.parseUnits('100000000', 6), 6)

    // fund users
    await Promise.all(
        users.map((user) => [
            usdc.transfer(user.address, ethers.utils.parseUnits('15000', 6)),
        ]),
    )

    const Fundraising = await ethers.getContractFactory('Fundraising')
    const fundraising = await Fundraising.deploy([
        recipient.address,
        usdc.address,
        maxTotalDeposit,
        minDepositPerAccount,
        maxDepositPerAccount,
        depositStart,
        depositEnd,
    ])
    await fundraising.deployed()

    return {
        deployer,
        recipient,
        user1,
        user2,
        user3,
        usdc,
        fundraising,
    }
}

describe.only('Fundraising', function () {
    let deployment: {
        deployer: SignerWithAddress
        recipient: SignerWithAddress
        user1: SignerWithAddress
        user2: SignerWithAddress
        user3: SignerWithAddress
        usdc: Contract
        fundraising: Contract
    }

    this.beforeEach(async function () {
        deployment = await loadFixture(setup)
    })

    it('Should deploy Fundraising contract', async function () {
        const { fundraising } = deployment

        expect(fundraising.address).to.be.properAddress
    })

    describe('Constructor', () => {
        let recipient: SignerWithAddress
        let usdc: Contract

        this.beforeEach(async function () {
            recipient = deployment.recipient
            usdc = deployment.usdc
        })

        it('Should revert on zero address recipient', async () => {
            const FundraisingFactory = await ethers.getContractFactory(
                'Fundraising',
            )

            await expect(
                FundraisingFactory.deploy([
                    ethers.constants.AddressZero,
                    usdc.address,
                    maxTotalDeposit,
                    minDepositPerAccount,
                    maxDepositPerAccount,
                    depositStart,
                    depositEnd,
                ]),
            ).to.revertedWith('Fundraising: invalid recipient')
        })

        it('Should revert on zero address token', async () => {
            const FundraisingFactory = await ethers.getContractFactory(
                'Fundraising',
            )

            await expect(
                FundraisingFactory.deploy([
                    recipient.address,
                    ethers.constants.AddressZero,
                    maxTotalDeposit,
                    minDepositPerAccount,
                    maxDepositPerAccount,
                    depositStart,
                    depositEnd,
                ]),
            ).to.revertedWith('Fundraising: invalid usdc')
        })

        it('Should revert past deposit start', async () => {
            const FundraisingFactory = await ethers.getContractFactory(
                'Fundraising',
            )

            const networkNow = (await ethers.provider.getBlock('latest'))
                .timestamp

            await expect(
                FundraisingFactory.deploy([
                    recipient.address,
                    usdc.address,
                    maxTotalDeposit,
                    minDepositPerAccount,
                    maxDepositPerAccount,
                    networkNow - 2,
                    depositEnd,
                ]),
            ).to.revertedWith('Fundraising: past deposit start')
        })

        it('Should revert deposit end before deposit start', async () => {
            const FundraisingFactory = await ethers.getContractFactory(
                'Fundraising',
            )

            await expect(
                FundraisingFactory.deploy([
                    recipient.address,
                    usdc.address,
                    maxTotalDeposit,
                    minDepositPerAccount,
                    maxDepositPerAccount,
                    depositStart,
                    depositStart - 2,
                ]),
            ).to.revertedWith('Fundraising: deposit end before deposit start')
        })
    })

    describe('Deposit', () => {
        it('Should deposit after deposit start', async () => {
            const { usdc, recipient, user1, fundraising } = deployment

            // go to deposit start
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                depositStart,
            ])

            const amount = ethers.utils.parseUnits('1000', 6)

            const recipientPrevBalance = await usdc.balanceOf(recipient.address)

            const prevDeposit = await fundraising.deposits(user1.address)
            const nextDeposit = prevDeposit.add(amount)
            const prevTotalDeposit = await fundraising.totalDeposit()
            const nextTotalDeposit = prevTotalDeposit.add(amount)

            await expect(
                usdc.connect(user1).approve(fundraising.address, amount),
            ).to.not.reverted
            await expect(fundraising.connect(user1).deposit(amount))
                .to.emit(fundraising, 'Deposited')
                .withArgs(user1.address, amount, nextDeposit, nextTotalDeposit)

            const recipientNewBalance = await usdc.balanceOf(recipient.address)
            expect(recipientNewBalance).to.be.equal(
                recipientPrevBalance.add(amount),
                'Recipient balance did not match',
            )

            const afterDeposit = await fundraising.deposits(user1.address)
            expect(afterDeposit).to.be.equal(
                nextDeposit,
                "Deposit didn't match",
            )
        })

        it('Should revert deposit before deposit start', async () => {
            const { usdc, user1, fundraising } = deployment

            // go to before deposit start
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                depositStart - 5,
            ])

            const amount = ethers.utils.parseUnits('1000', 6)

            await expect(
                usdc.connect(user1).approve(fundraising.address, amount),
            ).to.not.reverted
            await expect(
                fundraising.connect(user1).deposit(amount),
            ).to.revertedWith('Fundraising: not started')
        })

        it('Should revert deposit after deposit end', async () => {
            const { usdc, user1, fundraising } = deployment

            // go to deposit end
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                depositEnd + 5,
            ])

            const amount = ethers.utils.parseUnits('1000', 6)

            await expect(
                usdc.connect(user1).approve(fundraising.address, amount),
            ).to.not.reverted
            await expect(
                fundraising.connect(user1).deposit(amount),
            ).to.revertedWith('Fundraising: ended')
        })

        it('Should revert deposit if deposit below min account limit', async () => {
            const { usdc, deployer, user1, fundraising } = deployment

            // go to deposit start
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                depositStart,
            ])

            const amount = ethers.utils.parseUnits('500', 6)

            await expect(
                usdc.connect(user1).approve(fundraising.address, amount),
            ).to.not.reverted
            await expect(
                fundraising.connect(user1).deposit(amount),
            ).to.revertedWith('Fundraising: min deposit per account')
        })

        it('Should revert deposit if deposit above max account limit', async () => {
            const { usdc, deployer, user1, fundraising } = deployment

            // go to deposit start
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                depositStart,
            ])

            const amount1 = ethers.utils.parseUnits('1000', 6)
            const amount2 = ethers.utils.parseUnits('4001', 6)

            await expect(
                usdc
                    .connect(user1)
                    .approve(fundraising.address, amount1.add(amount2)),
            ).to.not.reverted
            await expect(fundraising.connect(user1).deposit(amount1)).to.not
                .reverted
            await expect(
                fundraising.connect(user1).deposit(amount2),
            ).to.revertedWith('Fundraising: max deposit per account')
        })

        it('Should revert deposit if total deposit above max total limit', async () => {
            const { usdc, deployer, user1, fundraising } = deployment

            // go to deposit start
            await ethers.provider.send('evm_setNextBlockTimestamp', [
                depositStart,
            ])

            // set total deposits storage to 50000
            const totalDepositSlot = '0x1'
            await setUint256Storage(
                totalDepositSlot,
                ethers.utils.parseUnits('50000', 6),
                fundraising.address,
            )
            const totalDeposit = await fundraising.totalDeposit()
            expect(totalDeposit).to.be.equal(
                ethers.utils.parseUnits('50000', 6),
            )

            const amount = ethers.utils.parseUnits('1000', 6)

            await expect(
                usdc.connect(user1).approve(fundraising.address, amount),
            ).to.not.reverted
            await expect(
                fundraising.connect(user1).deposit(amount),
            ).to.revertedWith('Fundraising: max total deposit')
        })
    })
})

async function setUint256Storage(
    slot: BytesLike,
    value: BigNumber,
    contractAddress: string,
) {
    const paddedValue = ethers.utils.hexZeroPad(ethers.utils.hexlify(value), 32)
    await ethers.provider.send('hardhat_setStorageAt', [
        contractAddress,
        slot,
        paddedValue,
    ])
}

async function getUint256Storage(slot: BytesLike, contractAddress: string) {
    const storageValue = await ethers.provider.getStorageAt(
        contractAddress,
        slot,
    )
    const value = ethers.BigNumber.from(storageValue)
    return value
}
