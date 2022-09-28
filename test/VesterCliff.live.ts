import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'

const sonneAddress = '0x1DB2466d9F5e10D7090E7152B68d62703a2245F0'
const multiSigAddress = '0x784B82a27029C9E114b521abcC39D02B3D1DEAf2'

const vestingAmount = ethers.utils.parseEther('12000000')
const vestingBegin = 1664409600 // 2022-09-29 12:00:00 AM UTC
const vestingEnd = vestingBegin + 2 * 365 * 24 * 60 * 60 // 2 years
const vestingCliff = vestingBegin + 3 * 30 * 24 * 60 * 60 // 3 months

const recipients: any = {
    '0x8E72a24221517E51502f20f387415a06b27A5b51':
        ethers.utils.parseEther('250'),
    '0x40Bd6e764DBc5C7268aaC775D8978881B16221F1':
        ethers.utils.parseEther('4500'),
    '0xA07f2E459773733b15A1eB95Be7530EE6DaDb515':
        ethers.utils.parseEther('250'),
    '0x87Cd8B143992D6BBaFb4701E8c463dF59D787568':
        ethers.utils.parseEther('500'),
    '0xEF70c2783E81C634F2331B4aD41E547e2F704Ed1':
        ethers.utils.parseEther('4500'),
    '0xB58Ee267704ec4529e1B1f17B81Db73279DC4821':
        ethers.utils.parseEther('2000'),
}

const deployFixture = async () => {
    const [deployer] = await ethers.getSigners()
    const admin = await ethers.getImpersonatedSigner(
        '0xfb59ce8986943163f14c590755b29db2998f2322',
    )

    const rec1 = await ethers.getImpersonatedSigner(Object.keys(recipients)[0])
    const rec2 = await ethers.getImpersonatedSigner(Object.keys(recipients)[1])

    // give admin some eth
    await (
        await deployer.sendTransaction({
            to: multiSigAddress,
            value: ethers.utils.parseEther('100'),
        })
    ).wait(1)

    // Sonne

    const sonne = await getTokenContract({
        adminAddress: admin.address,
        mintAmount: ethers.utils.parseEther('12000000'),
        existingAddress: sonneAddress,
        whaleAddress: multiSigAddress,
        decimals: '18',
    })

    // Deploy Vester Cliff
    const vesterCliff = await ethers.getContractAt(
        'VesterCliff',
        '0xb4bF17210844418F9F2D3B90036E11aa40517971',
    )

    // Transfer Sonne to Vester Cliff
    await (
        await sonne.connect(admin).transfer(vesterCliff.address, vestingAmount)
    ).wait(1)

    // Distributor
    const distributor = await ethers.getContractAt(
        'OwnedDistributor',
        await vesterCliff.recipient(),
    )

    return { admin, sonne, vesterCliff, distributor, rec1, rec2 }
}

describe('Vester Cliff Live', function () {
    it('Should deploy contract correctly', async function () {
        const { vesterCliff, distributor } = await loadFixture(deployFixture)

        expect(await vesterCliff.sonne()).to.equal(sonneAddress)
        expect(await vesterCliff.recipient()).to.equal(distributor.address)
        expect(await vesterCliff.vestingAmount()).to.equal(vestingAmount)
        expect(await vesterCliff.vestingBegin()).to.equal(vestingBegin)
        expect(await vesterCliff.vestingEnd()).to.equal(vestingEnd)
        expect(await vesterCliff.vestingCliff()).to.equal(vestingCliff)
    })

    it('Should vest correctly', async function () {
        const { sonne, vesterCliff, distributor, rec1, rec2 } =
            await loadFixture(deployFixture)

        let _rec1Balance = await sonne.balanceOf(rec1.address)
        let rec1Balance_
        let _rec2Balance = await sonne.balanceOf(rec2.address)
        let rec2Balance_
        const rec1Last = vestingAmount
            .mul(recipients[rec1.address])
            .div(ethers.utils.parseEther('12000'))
        const rec2Last = vestingAmount
            .mul(recipients[rec2.address])
            .div(ethers.utils.parseEther('12000'))

        // Zero claim before vesting
        await (await distributor.connect(rec1).claim()).wait(1)
        rec1Balance_ = await sonne.balanceOf(rec1.address)
        expect(rec1Balance_).to.equal(_rec1Balance)
        _rec1Balance = rec1Balance_

        // Go to vesting begin
        await ethers.provider.send('evm_setNextBlockTimestamp', [vestingBegin])
        await ethers.provider.send('evm_mine', [])

        // Zero claim before cliff
        await (await distributor.connect(rec1).claim()).wait(1)
        rec1Balance_ = await sonne.balanceOf(rec1.address)
        expect(rec1Balance_).to.equal(_rec1Balance)
        _rec1Balance = rec1Balance_

        // Go to cliff
        await ethers.provider.send('evm_setNextBlockTimestamp', [vestingCliff])
        await ethers.provider.send('evm_mine', [])

        // Claim on vesting begin
        await (await distributor.connect(rec1).claim()).wait(1)
        rec1Balance_ = await sonne.balanceOf(rec1.address)
        expect(rec1Balance_).to.gt(_rec1Balance)
        _rec1Balance = rec1Balance_

        // Go to vesting end
        await ethers.provider.send('evm_setNextBlockTimestamp', [vestingEnd])
        await ethers.provider.send('evm_mine', [])

        // Claim on vesting end
        await (await distributor.connect(rec1).claim()).wait(1)
        rec1Balance_ = await sonne.balanceOf(rec1.address)
        expect(rec1Balance_.sub(rec1Last)).to.lt(1000)
        _rec1Balance = rec1Balance_

        // Claim on vesting end
        await (await distributor.connect(rec2).claim()).wait(1)
        rec2Balance_ = await sonne.balanceOf(rec2.address)
        expect(rec2Balance_.sub(rec2Last)).to.lt(1000)
        _rec2Balance = rec2Balance_

        // Check if vester has no tokens left
        expect(await sonne.balanceOf(vesterCliff.address)).to.equal(0)
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
