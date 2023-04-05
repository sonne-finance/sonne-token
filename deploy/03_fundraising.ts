import { BigNumber } from 'ethers'
import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const networkConfigs: INetworkDeployConfig = {
    optimism: {
        recipientAddress: '0x784B82a27029C9E114b521abcC39D02B3D1DEAf2',
        usdcAddress: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
        maxTotalDeposit: ethers.utils.parseUnits('50000', 6),
        minDepositPerAccount: ethers.utils.parseUnits('1000', 6),
        maxDepositPerAccount: ethers.utils.parseUnits('5000', 6),
        depositStart: new Date(2023, 2, 18, 3, 0, 0).getTime() / 1000,
        depositEnd: new Date(2023, 2, 25, 3, 0, 0).getTime() / 1000,
    },
    kava: {
        recipientAddress: '0x67e633b2494f126c7e828B63b32E4d2667091bE4',
        usdcAddress: '0xfA9343C3897324496A05fC75abeD6bAC29f8A40f',
        maxTotalDeposit: ethers.utils.parseUnits('50', 6),
        minDepositPerAccount: ethers.utils.parseUnits('1', 6),
        maxDepositPerAccount: ethers.utils.parseUnits('5', 6),
        depositStart: new Date(2023, 2, 16, 12, 0, 0).getTime() / 1000,
        depositEnd: new Date(2023, 2, 16, 13, 0, 0).getTime() / 1000,
    },
}

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {
        deployments: { deploy },
        network,
        getNamedAccounts,
    } = hre

    const config = networkConfigs[network.name]

    const { adminAccount } = await getNamedAccounts()

    // Fundraising
    const fundraising = await deploy('Fundraising', {
        from: adminAccount,
        log: true,
        args: [
            [
                config.recipientAddress,
                config.usdcAddress,
                config.maxTotalDeposit,
                config.minDepositPerAccount,
                config.maxDepositPerAccount,
                config.depositStart,
                config.depositEnd,
            ],
        ],
    })
}

const tags = ['Fundraising']
export { tags }

export default func

type INetworkDeployConfig = {
    [network: string]: {
        recipientAddress: string
        usdcAddress: string
        maxTotalDeposit: BigNumber
        minDepositPerAccount: BigNumber
        maxDepositPerAccount: BigNumber
        depositStart: number
        depositEnd: number
    }
}
