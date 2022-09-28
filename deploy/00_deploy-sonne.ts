import { ethers } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    if (hre.network.name !== 'localhost') {
        return
    }
    const {
        deployments: { deploy, get, getOrNull },
        network,
        getNamedAccounts,
    } = hre

    const { adminAccount } = await getNamedAccounts()

    // Sonne
    const sonne = await deploy('Sonne', {
        from: adminAccount,
        log: true,
        args: [adminAccount],
    })
}

const tags = ['Sonne']
export { tags }

export default func
