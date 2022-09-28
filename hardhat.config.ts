import 'hardhat-deploy'
import 'solidity-coverage'
import '@nomiclabs/hardhat-waffle'
import { HardhatUserConfig } from 'hardhat/config'

import accounts, { apiKeys } from './_accounts'

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            forking: {
                url: 'https://rpc.ankr.com/optimism',
            },
            initialBaseFeePerGas: 100000000,
            gasPrice: 100000000,
        },
        localhost: {
            url: 'http://localhost:8545',
            accounts: [
                '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
                '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
                '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
                '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
            ],
        },
        optimism: {
            url: 'https://rpc.ankr.com/optimism',
            accounts,
            verify: {
                etherscan: {
                    apiUrl: 'https://api-optimistic.etherscan.io',
                    apiKey: apiKeys.optimistic,
                },
            },
        },
    },
    solidity: {
        compilers: [
            {
                version: '0.6.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.5.16',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
            {
                version: '0.8.10',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                },
            },
        ],
    },
    mocha: {
        timeout: 100 * 1000,
    },
    namedAccounts: {
        adminAccount: 0,
        reservesAccount: 1,
    },
}

export default config
