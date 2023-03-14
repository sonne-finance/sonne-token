import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const recipientAddress = '0x784B82a27029C9E114b521abcC39D02B3D1DEAf2'
const usdcAddress = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
const maxTotalDeposit = ethers.utils.parseUnits('50000', 6)
const minDepositPerAccount = ethers.utils.parseUnits('1000', 6)
const maxDepositPerAccount = ethers.utils.parseUnits('5000', 6)
const depositStart = new Date(2023, 2, 17, 0, 0, 0).getTime() / 1000
const depositEnd = new Date(2023, 2, 20, 0, 0, 0).getTime() / 1000

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {
        deployments: { deploy },
        network,
        getNamedAccounts,
    } = hre

    const { adminAccount } = await getNamedAccounts()

    // Sonne
    const fundraising = await deploy('Fundraising', {
        from: adminAccount,
        log: true,
        args: [
            [
                recipientAddress,
                usdcAddress,
                maxTotalDeposit,
                minDepositPerAccount,
                maxDepositPerAccount,
                depositStart,
                depositEnd,
            ],
        ],
    })
}

const tags = ['Fundraising']
export { tags }

export default func
