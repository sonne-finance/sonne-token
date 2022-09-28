import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatNetworkConfig, HardhatRuntimeEnvironment } from 'hardhat/types'

const liquidityAmount = ethers.utils.parseEther('2500000')
const vestingAmount = ethers.utils.parseEther('3200000')
const bonusVestingAmount = ethers.utils.parseEther('300000')
const periodBegin = 1664139600 // 2022-06-25 9:00:00 PM UTC
const periodDuration = 3 * 24 * 60 * 60 // 3 days
const bonusDuration = 1 * 24 * 60 * 60 // 1 day
const vestingBegin = 1664409600 // 2022-09-29 12:00:00 AM UTC
const vestingDuration = 1 * 365 * 24 * 60 * 60 // 1 year
const usdcAddress = '0x7f5c764cbc14f9669b88837ca1490cca17c31607'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    if (hre.network.name !== 'localhost') {
        return
    }
    const {
        deployments: { deploy, get, getOrNull },
        network,
        getNamedAccounts,
    } = hre
    const vestingEnd = vestingBegin + vestingDuration

    const { adminAccount, reservesAccount } = await getNamedAccounts()
    const admin = await ethers.getSigner(adminAccount)
    const reserves = await ethers.getSigner(reservesAccount)

    // Sonne
    const sonneDeploy = await get('Sonne')
    const sonne = await ethers.getContractAt(
        'contracts/interfaces/IERC20.sol:IERC20',
        sonneDeploy.address,
    )

    // USDC
    const usdc = await ethers.getContractAt(
        'contracts/interfaces/IERC20.sol:IERC20',
        usdcAddress,
    )
    /*const usdcWhale = await impersonate(
            hre,
            '0xebe80f029b1c02862b9e8a70a7e5317c06f62cae',
        )
        const whaleBalance = await usdc.balanceOf(usdcWhale._address)
        await (
            await usdc.connect(usdcWhale).transfer(adminAccount, whaleBalance)
        ).wait(1)
    */

    // Distributor
    const vesterDeploy = await deploy('VesterSale', {
        from: admin.address,
        log: true,
        args: [
            sonne.address,
            admin.address,
            vestingAmount,
            vestingBegin,
            vestingEnd,
        ],
    })
    const vester = await ethers.getContractAt(
        'VesterSale',
        vesterDeploy.address,
    )
    // await (await sonne.transfer(vester.address, vestingAmount)).wait(1)

    const distributorDeploy = await deploy('OwnedDistributor', {
        from: admin.address,
        log: true,
        args: [sonne.address, vester.address, admin.address],
    })
    const distributor = await ethers.getContractAt(
        'OwnedDistributor',
        distributorDeploy.address,
    )
    await (await vester.setRecipient(distributor.address)).wait(1)

    // Bonus Distributor
    const bonusVesterDeploy = await deploy('VesterSale', {
        from: admin.address,
        log: true,
        args: [
            sonne.address,
            admin.address,
            bonusVestingAmount,
            vestingBegin,
            vestingEnd,
        ],
    })
    const bonusVester = await ethers.getContractAt(
        'VesterSale',
        bonusVesterDeploy.address,
    )
    /*await (
        await sonne.transfer(bonusVester.address, bonusVestingAmount)
    ).wait(1)*/

    const bonusDistributorDeploy = await deploy('OwnedDistributor', {
        from: admin.address,
        log: true,
        args: [sonne.address, bonusVester.address, admin.address],
    })
    const bonusDistributor = await ethers.getContractAt(
        'OwnedDistributor',
        bonusDistributorDeploy.address,
    )
    await (await bonusVester.setRecipient(bonusDistributor.address)).wait(1)

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

    /*    // Whitelist tokens in behalf of the governor
        const gaugeGovernorAddress =
            '0xb074ec6c37659525eef2fb44478077901f878012'
        const gaugeGovernor = await impersonate(hre, gaugeGovernorAddress)
        try {
            await (
                await voter.connect(gaugeGovernor).whitelist(sonne.address)
            ).wait(1)
        } catch {
            console.log('sonne whitelist failed, probably already whitelisted')
        }
        try {
            await (
                await voter.connect(gaugeGovernor).whitelist(usdc.address)
            ).wait(1)
        } catch {
            console.log('sonne whitelist failed, probably already whitelisted')
        }
    }
    //*/

    const liquidityGeneratorDeploy = await deploy('LiquidityGenerator', {
        from: admin.address,
        log: true,
        args: [
            [
                admin.address,
                sonne.address,
                usdc.address,
                velo.address,
                router.address,
                voter.address,
                reserves.address,
                distributor.address,
                bonusDistributor.address,
                periodBegin,
                periodDuration,
                bonusDuration,
            ],
        ],
    })
    const liquidityGenerator = await ethers.getContractAt(
        'LiquidityGenerator',
        liquidityGeneratorDeploy.address,
    )
    /*await (
        await sonne.transfer(liquidityGenerator.address, liquidityAmount)
    ).wait(1)*/

    // Set the liquidity generator as the distributor's admin
    await (await distributor.setAdmin(liquidityGenerator.address)).wait(1)
    await (await bonusDistributor.setAdmin(liquidityGenerator.address)).wait(1)
}

const impersonate = async (hre: HardhatRuntimeEnvironment, address: string) => {
    const network = hre.network

    let provider
    if (network.config.url !== undefined) {
        provider = new ethers.providers.JsonRpcProvider(network.config.url)
    } else {
        // if network.config.url is undefined, then this is the hardhat network
        provider = hre.ethers.provider
    }

    await provider.send('hardhat_impersonateAccount', [address])
    const account = provider.getSigner(address)

    return account
}

const tags = [
    'LiquidityGenerator',
    'VesterSale',
    'OwnedDistributor',
    'MockERC20Token',
]
export { tags }

export default func
