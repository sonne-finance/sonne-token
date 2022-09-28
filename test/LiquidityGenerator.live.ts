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
const periodBegin = 1664139600 // 2022-06-25 9:00:00 PM UTC
const periodDuration = 3 * 24 * 60 * 60 // 3 days
const periodEnd = periodBegin + periodDuration
const bonusDuration = 1 * 24 * 60 * 60 // 1 day
const vestingBegin = 1664409600 // 2022-09-29 12:00:00 AM UTC
const vestingDuration = 1 * 365 * 24 * 60 * 60 // 1 year

let sonneAddress = '0x1db2466d9f5e10d7090e7152b68d62703a2245f0'
let usdcAddress = '0x7f5c764cbc14f9669b88837ca1490cca17c31607'
let lgeAddress = '0x17063Ad4e83B0aBA4ca0F3fC3a9794E807A00ED7'

describe('Liquidity Generator', function () {
    const deployFixture = async () => {
        // Accounts
        const [participant1, participant2] = await ethers.getSigners()

        const reservesManager = await ethers.getImpersonatedSigner(
            '0x201ECB1C439F92aFd5df5d399e195F73b01bB0F3',
        )
        const admin = await ethers.getImpersonatedSigner(
            '0xfb59ce8986943163f14c590755b29db2998f2322',
        )

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

        // Give participants some USDC
        await (
            await usdc
                .connect(admin)
                .transfer(
                    participant1.address,
                    ethers.utils.parseUnits('1500', 6),
                )
        ).wait(1)
        await (
            await usdc
                .connect(admin)
                .transfer(
                    participant2.address,
                    ethers.utils.parseUnits('5000', 6),
                )
        ).wait(1)

        // Liquidity Generator
        const liquidityGenerator = await ethers.getContractAt(
            'LiquidityGenerator',
            lgeAddress,
        )

        const distributor = await ethers.getContractAt(
            'OwnedDistributor',
            await liquidityGenerator.distributor(),
        )

        const vester = await ethers.getContractAt(
            'VesterSale',
            await distributor.claimable(),
        )

        const bonusDistributor = await ethers.getContractAt(
            'OwnedDistributor',
            await liquidityGenerator.bonusDistributor(),
        )

        const bonusVester = await ethers.getContractAt(
            'VesterSale',
            await bonusDistributor.claimable(),
        )

        // Velodrome Contracts
        const velo = await ethers.getContractAt(
            './contracts/interfaces/IERC20.sol:IERC20',
            await liquidityGenerator.velo(),
        )
        const router = await ethers.getContractAt(
            'IVelodromeRouter',
            await liquidityGenerator.router0(),
        )
        const voter = await ethers.getContractAt(
            'IVelodromeVoter',
            await liquidityGenerator.voter(),
        )
        const veNFT = await ethers.getContractAt(
            'IVelodromeVotingEscrow',
            '0x9c7305eb78a432ced5c4d14cac27e8ed569a2e26',
        )

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
        const { liquidityGenerator, pair } = deployment

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_setNextBlockTimestamp', [periodEnd])
        await ethers.provider.send('evm_mine', []) // mine the next block

        await (await liquidityGenerator.finalize()).wait(1)

        expect(await pair.balanceOf(liquidityGenerator.address)).to.equals(
            0,
            'generator LP balance is 0 after finalize',
        )

        const gauge = await getGauge(deployment)
        expect(await pair.balanceOf(gauge.address)).to.gt(
            0,
            'gauge LP balance is greater than 0 after finalize',
        )
        expect(await gauge.balanceOf(liquidityGenerator.address)).to.gt(
            0,
            'generator gauge balance is greater than 0 after finalize',
        )
    })

    it('Should withdraw liquidity and send to reserves manager', async function () {
        const deployment = await loadFixture(deployFixture)
        const { admin, reservesManager, liquidityGenerator, pair } = deployment

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_setNextBlockTimestamp', [periodEnd])
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (await liquidityGenerator.finalize()).wait(1)

        // Go to the end of the lock time and deliver lp to reserves
        await ethers.provider.send('evm_increaseTime', [6 * 30 * 24 * 60 * 60]) // increase time by 6 monts
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (
            await liquidityGenerator
                .connect(admin)
                .deliverLiquidityToReservesManager()
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
            admin,
            reservesManager,
            velo,
            voter,
            veNFT,
            liquidityGenerator,
            pair,
        } = deployment

        // Go to the end of the event and finalize
        await ethers.provider.send('evm_setNextBlockTimestamp', [periodEnd])
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

        await (
            await liquidityGenerator.connect(admin).claimVeloRewards()
        ).wait(1)
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
        await ethers.provider.send('evm_setNextBlockTimestamp', [periodEnd])
        await ethers.provider.send('evm_mine', []) // mine the next block
        await (await liquidityGenerator.finalize()).wait(1)

        // Go to claim time
        await ethers.provider.send('evm_setNextBlockTimestamp', [vestingBegin])
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
