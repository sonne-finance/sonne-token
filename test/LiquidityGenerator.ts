import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { expect } from 'chai'
import { BigNumber, Contract } from 'ethers'
import { ethers } from 'hardhat'

const mantissa = ethers.utils.parseEther('1')
const sonneAmount = ethers.utils.parseEther('2500000')
const vestingAmount = ethers.utils.parseEther('3200000')
const bonusVestingAmount = ethers.utils.parseEther('300000')
const initial = 5000
const periodDuration = 3 * 24 * 60 * 60 // 3 days
const bonusDuration = 1 * 24 * 60 * 60 // 1 day
const vestingBeginGap = 30 * 60 // 30 minutes
const vestingDuration = 1 * 360 * 24 * 60 * 60 // 1 year

let sonneAddress = '0x1db2466d9f5e10d7090e7152b68d62703a2245f0'
let usdcAddress = '0x7f5c764cbc14f9669b88837ca1490cca17c31607'

describe.skip('Liquidity Generator', function () {
    const deployFixture = async () => {
        // Accounts
        const [admin, reservesManager, participant1, participant2] =
            await ethers.getSigners()

        // Times
        const periodBegin = (await ethers.provider.getBlock('latest')).timestamp
        const periodEnd = periodBegin + periodDuration
        const vestingBegin = periodEnd + vestingBeginGap
        const vestingEnd = vestingBegin + vestingDuration

        // Sonne
        const sonne = await getTokenContract({
            adminAddress: admin.address,
            mintAmount: ethers.utils.parseEther('100000000'),
            existingAddress: sonneAddress,
            whaleAddress: '0xfb59ce8986943163f14c590755b29db2998f2322',
            decimals: '18',
        })

        // USDC
        const usdc = await getTokenContract({
            adminAddress: admin.address,
            mintAmount: ethers.utils.parseEther('100000'),
            existingAddress: usdcAddress,
            whaleAddress: '0xebe80f029b1c02862b9e8a70a7e5317c06f62cae',
            decimals: '6',
        })

        // Distributor
        const Vester = await ethers.getContractFactory('VesterSale')
        const vester = await Vester.deploy(
            sonne.address,
            admin.address,
            vestingAmount,
            vestingBegin,
            vestingEnd,
        )

        const Distributor = await ethers.getContractFactory('OwnedDistributor')
        const distributor = await Distributor.deploy(
            sonne.address,
            vester.address,
            admin.address,
        )
        await (await vester.setRecipient(distributor.address)).wait(1)

        // Bonus Distributor
        const BonusVester = await ethers.getContractFactory('VesterSale')
        const bonusVester = await BonusVester.deploy(
            sonne.address,
            admin.address,
            bonusVestingAmount,
            vestingBegin,
            vestingEnd,
        )

        const BonusDistributor = await ethers.getContractFactory(
            'OwnedDistributor',
        )
        const bonusDistributor = await BonusDistributor.deploy(
            sonne.address,
            bonusVester.address,
            admin.address,
        )
        await (await bonusVester.setRecipient(bonusDistributor.address)).wait(1)

        // Velodrome Contracts
        const velo = await ethers.getContractAt(
            './contracts/interfaces/IERC20.sol:IERC20',
            '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05',
        )
        const router = await ethers.getContractAt(
            'IVelodromeRouter',
            '0x9c12939390052919af3155f41bf4160fd3666a6f',
        )
        const voter = await ethers.getContractAt(
            'IVelodromeVoter',
            '0x09236cfF45047DBee6B921e00704bed6D6B8Cf7e',
        )
        const veNFT = await ethers.getContractAt(
            'IVelodromeVotingEscrow',
            '0x9c7305eb78a432ced5c4d14cac27e8ed569a2e26',
        )

        // Liquidity Generator
        const LiquidityGenerator = await ethers.getContractFactory(
            'LiquidityGenerator',
        )
        const liquidityGenerator = await LiquidityGenerator.deploy([
            admin.address,
            sonne.address,
            usdc.address,
            velo.address,
            router.address,
            voter.address,
            reservesManager.address,
            distributor.address,
            bonusDistributor.address,
            periodBegin,
            periodDuration,
            bonusDuration,
        ])

        // Add Sonne to the liquidity generator
        await (
            await sonne.transfer(liquidityGenerator.address, sonneAmount)
        ).wait(1)

        // Add Sonne to Vester
        await (await sonne.transfer(vester.address, vestingAmount)).wait(1)

        // Add Sonne to Bonus Vester
        await (
            await sonne.transfer(bonusVester.address, bonusVestingAmount)
        ).wait(1)

        // Set the liquidity generator as the distributor's admin
        await (await distributor.setAdmin(liquidityGenerator.address)).wait(1)
        await (
            await bonusDistributor.setAdmin(liquidityGenerator.address)
        ).wait(1)

        // Get Pair
        const pairFactory = await ethers.getContractAt(
            'IVelodromePairFactory',
            await router.factory(),
        )
        const pairAddress = await pairFactory.getPair(
            sonne.address,
            usdc.address,
            false,
        )
        const pair = await ethers.getContractAt(
            './contracts/interfaces/IERC20.sol:IERC20',
            pairAddress,
        )

        // Go to 5 hours later
        await ethers.provider.send('evm_increaseTime', [5 * 60 * 60])
        await ethers.provider.send('evm_mine', [])

        // Whitelist tokens in behalf of the governor
        const gaugeGovernor = await ethers.getImpersonatedSigner(
            '0xb074ec6c37659525eef2fb44478077901f878012',
        )
        try {
            await (
                await voter.connect(gaugeGovernor).whitelist(sonne.address)
            ).wait(1)
        } catch {}
        try {
            await (
                await voter.connect(gaugeGovernor).whitelist(usdc.address)
            ).wait(1)
        } catch {}

        return {
            admin,
            reservesManager,
            participant1,
            participant2,
            sonne,
            usdc,
            distributor,
            vester,
            bonusDistributor,
            bonusVester,
            velo,
            router,
            voter,
            veNFT,
            periodBegin,
            vestingBegin,
            liquidityGenerator,
            pair,
            gauge: {},
        }
    }

    it('Should deploy the liquidity generation contract', async function () {
        const deployment = await loadFixture(deployFixture)
        const { liquidityGenerator, pair } = deployment

        const gauge = await getGauge(deployment)

        expect(liquidityGenerator.address).to.be.properAddress
        expect(pair.address).to.be.properAddress
        expect(gauge.address).to.be.properAddress
    })

    it('Should finalize and stake the liquidity', async function () {
        const deployment = await loadFixture(deployFixture)
        const { liquidityGenerator, pair, participant1, participant2 } =
            deployment

        // Participates
        await depositParticipant(participant1, deployment)
        await depositParticipant(participant2, deployment)

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_increaseTime', [3 * 24 * 60 * 60]) // increase time by 3 days
        await ethers.provider.send('evm_mine', []) // mine the next block

        await (await liquidityGenerator.finalize()).wait(1)

        expect(await pair.balanceOf(liquidityGenerator.address)).to.equals(
            0,
            'generator LP balance is 0 after finalize',
        )

        const gauge = await getGauge(deployment)
        expect(await gauge.balanceOf(liquidityGenerator.address)).to.gt(
            0,
            'generator gauge balance is greater than 0 after finalize',
        )
    })

    it('Should withdraw liquidity and send to reserves manager', async function () {
        const deployment = await loadFixture(deployFixture)
        const {
            reservesManager,
            liquidityGenerator,
            pair,
            participant1,
            participant2,
        } = deployment

        // Participates
        await depositParticipant(participant1, deployment)
        await depositParticipant(participant2, deployment)

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_increaseTime', [3 * 24 * 60 * 60]) // increase time by 3 days
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (await liquidityGenerator.finalize()).wait(1)

        // Go to the end of the lock time and deliver lp to reserves
        await ethers.provider.send('evm_increaseTime', [6 * 30 * 24 * 60 * 60]) // increase time by 6 monts
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (
            await liquidityGenerator.deliverLiquidityToReservesManager()
        ).wait(1)

        expect(await pair.balanceOf(liquidityGenerator.address)).to.equals(
            0,
            'generator LP balance is 0 after deliver',
        )

        const gauge = await getGauge(deployment)
        expect(await gauge.balanceOf(liquidityGenerator.address)).to.equals(
            0,
            'generator gauge balance is 0 after deliver',
        )
        expect(await pair.balanceOf(reservesManager.address)).to.gt(
            0,
            'reserves LP balance is greater than 0 after deliver',
        )
    })

    it('Should claim velo rewards after vote and bribe', async function () {
        const deployment = await loadFixture(deployFixture)
        const {
            reservesManager,
            velo,
            voter,
            veNFT,
            liquidityGenerator,
            pair,
            participant1,
            participant2,
        } = deployment

        // Participates
        await depositParticipant(participant1, deployment)
        await depositParticipant(participant2, deployment)

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_increaseTime', [3 * 24 * 60 * 60]) // increase time by 3 days
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (await liquidityGenerator.finalize()).wait(1)

        // Create Lock for a person
        const veNFTOwner = await ethers.getImpersonatedSigner(
            '0x9a69a19f189585da168c6f125ac23db866caff11',
        )
        const tokenIdIndex = await veNFT.balanceOf(veNFTOwner.address)
        await (
            await veNFT
                .connect(veNFTOwner)
                .create_lock(
                    await velo.balanceOf(veNFTOwner.address),
                    126142880,
                )
        ).wait(1)
        const tokenId = await veNFT.tokenOfOwnerByIndex(
            veNFTOwner.address,
            tokenIdIndex,
        )

        // Vote for Sonne pair on velodrome
        await (
            await voter
                .connect(veNFTOwner)
                .vote(tokenId, [pair.address], [10000])
        ).wait(1)

        // Go to 1 week later and claim velo rewards
        await ethers.provider.send('evm_increaseTime', [7 * 24 * 60 * 60]) // increase time by 7 days
        await ethers.provider.send('evm_mine', []) // mine the next block

        const gauge = await getGauge(deployment)
        await (await voter.distribute(gauge.address)).wait(1)

        await (await liquidityGenerator.claimVeloRewards()).wait(1)
        // check velo balance after velo claim
        expect(await velo.balanceOf(reservesManager.address)).to.gt(
            0,
            'reserves velo balance is greater than 0 after claim',
        )
    })

    it('Participants should claim their tokens', async function () {
        const deployment = await loadFixture(deployFixture)
        const {
            sonne,
            participant1,
            participant2,
            distributor,
            vester,
            bonusDistributor,
            bonusVester,
            vestingBegin,
            liquidityGenerator,
        } = deployment

        // Participate for Participant 1
        const part1Amount = ethers.utils.parseUnits('100', 6)
        await depositParticipant(participant1, deployment, part1Amount)

        // Participate for Participant 2
        const part2Amount = ethers.utils.parseUnits('155', 6)
        await depositParticipant(participant2, deployment, part2Amount)

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_increaseTime', [3 * 24 * 60 * 60]) // increase time by 3 days
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (await liquidityGenerator.finalize()).wait(1)

        // Go to claim time
        const time = (await ethers.provider.getBlock('latest')).timestamp
        await ethers.provider.send('evm_increaseTime', [vestingBegin - time]) // go to vesting begin
        await ethers.provider.send('evm_mine', []) // mine the next block

        // Claim tokens for Participant 1 on vester
        const part1Share = part1Amount
            .mul(mantissa)
            .div(part1Amount.add(part2Amount))
        const part1Claim = vestingAmount
            .mul(initial)
            .div(10000)
            .mul(part1Share)
            .div(mantissa)
        await (await distributor.connect(participant1).claim()).wait(1)
        expect(await sonne.balanceOf(participant1.address)).to.lt(
            part1Claim.add(ethers.utils.parseEther('10')), // can slightly differ due to first second of claim
            'participant 1 sonne balance is not correct after claim',
        )
        // Participant 1 claimed own share but distributor claim all claimable tokens from vester
        const claimedShare = vestingAmount.mul(initial).div(10000)
        expect(await sonne.balanceOf(vester.address)).to.gt(
            vestingAmount.sub(claimedShare).sub(ethers.utils.parseEther('10')),
            'vester sonne balance is not correct after claim',
        )

        // Claim tokens for Participant 2 on bonus vester
        const part2Share = part2Amount
            .mul(mantissa)
            .div(part1Amount.add(part2Amount))
        const part2Claim = bonusVestingAmount
            .mul(initial)
            .div(10000)
            .mul(part2Share)
            .div(mantissa)
        await (await bonusDistributor.connect(participant2).claim()).wait(1)
        expect(await sonne.balanceOf(participant2.address)).to.lt(
            part2Claim.add(ethers.utils.parseEther('10')), // can slightly differ due to first second of claim
            'participant 2 sonne balance is not correct after claim',
        )
        // Participant 2 claimed own share but distributor claim all claimable tokens from bonus vester
        const bonusClaimedShare = bonusVestingAmount.mul(initial).div(10000)
        expect(await sonne.balanceOf(bonusVester.address)).to.gt(
            bonusVestingAmount
                .sub(bonusClaimedShare)
                .sub(ethers.utils.parseEther('10')),
            'bonus vester sonne balance is not correct after claim',
        )
    })
})

const getTokenContract = async (opts: {
    adminAddress: string
    mintAmount?: BigNumber
    existingAddress?: string
    whaleAddress?: string
    decimals?: string
}) => {
    if (opts.existingAddress) {
        const token = await ethers.getContractAt(
            'MockERC20Token',
            opts.existingAddress,
        )

        if (opts.whaleAddress) {
            const whale = await ethers.getImpersonatedSigner(opts.whaleAddress)

            const balance = await token.balanceOf(whale.address)
            await (
                await token.connect(whale).transfer(opts.adminAddress, balance)
            ).wait(1)
        }

        return token
    } else {
        const Token = await ethers.getContractFactory('MockERC20Token')
        const token = await Token.deploy(
            opts.mintAmount || ethers.utils.parseEther('100000000'),
            18,
        )
        return token
    }
}

const depositParticipant = async (
    participant: SignerWithAddress,
    deployment: {
        usdc: Contract
        liquidityGenerator: Contract
    },
    depositAmount?: BigNumber,
) => {
    const { usdc, liquidityGenerator } = deployment
    const amount = depositAmount ?? (await usdc.balanceOf(participant.address))
    await (
        await usdc
            .connect(participant)
            .approve(liquidityGenerator.address, amount)
    ).wait(1)
    await (
        await liquidityGenerator.connect(participant).deposit(amount)
    ).wait(1)
}

const getGauge = async (deployment: { voter: Contract; pair: Contract }) => {
    const { voter, pair } = deployment
    return await ethers.getContractAt(
        'IVelodromeGauge',
        await voter.gauges(pair.address),
    )
}
