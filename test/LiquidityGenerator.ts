import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

const vestingAmount = ethers.utils.parseEther("3200000");
const bonusVestingAmount = ethers.utils.parseEther("300000");
const periodDuration = 3 * 24 * 60 * 60; // 3 days
const bonusDuration = 1 * 24 * 60 * 60; // 1 day
const vestingBeginGap = 30 * 60; // 30 minutes
const vestingDuration = 1 * 360 * 24 * 60 * 60; // 1 year

describe.only("Liquidity Generator", function () {
  async function deployTokensFixture() {
    // Accounts
    const [admin, reservesManager] = await ethers.getSigners();

    // Times
    const periodBegin = (await ethers.provider.getBlock("latest")).timestamp;
    const periodEnd = periodBegin + periodDuration;
    const vestingBegin = periodEnd + vestingBeginGap;
    const vestingEnd = vestingBegin + vestingDuration;

    // Sonne
    const Sonne = await ethers.getContractFactory("MockERC20Token");
    const sonne = await Sonne.deploy(ethers.utils.parseUnits("10000", 18), 18);

    // USDC
    const USDC = await ethers.getContractFactory("MockERC20Token");
    const usdc = await USDC.deploy(ethers.utils.parseUnits("100", 6), 6);

    // Distributor
    const Vester = await ethers.getContractFactory("Vester");
    const vester = await Vester.deploy(
      sonne.address,
      admin.address,
      vestingAmount,
      vestingBegin,
      vestingEnd
    );

    const Distributor = await ethers.getContractFactory("OwnedDistributor");
    const distributor = await Distributor.deploy(
      sonne.address,
      vester.address,
      admin.address
    );
    await (await vester.setRecipient(distributor.address)).wait(1);

    // Bonus Distributor
    const BonusVester = await ethers.getContractFactory("Vester");
    const bonusVester = await BonusVester.deploy(
      sonne.address,
      admin.address,
      bonusVestingAmount,
      vestingBegin,
      vestingEnd
    );

    const BonusDistributor = await ethers.getContractFactory(
      "OwnedDistributor"
    );
    const bonusDistributor = await BonusDistributor.deploy(
      sonne.address,
      bonusVester.address,
      admin.address
    );
    await (await bonusVester.setRecipient(bonusDistributor.address)).wait(1);

    // Velodrome Contracts
    const velo = await ethers.getContractAt(
      "./contracts/interfaces/IERC20.sol:IERC20",
      "0x3c8B650257cFb5f272f799F5e2b4e65093a11a05"
    );
    const router = await ethers.getContractAt(
      "IVelodromeRouter",
      "0x9c12939390052919af3155f41bf4160fd3666a6f"
    );
    const voter = await ethers.getContractAt(
      "IVelodromeVoter",
      "0x09236cfF45047DBee6B921e00704bed6D6B8Cf7e"
    );

    // Whitelist tokens in behalf of the governor
    const gaugeGovernor = await ethers.getImpersonatedSigner(
      "0xb074ec6c37659525eef2fb44478077901f878012"
    );
    await (await voter.connect(gaugeGovernor).whitelist(sonne.address)).wait(1);
    await (await voter.connect(gaugeGovernor).whitelist(usdc.address)).wait(1);
    //

    return {
      admin,
      reservesManager,
      sonne,
      usdc,
      distributor,
      bonusDistributor,
      velo,
      router,
      voter,
      periodBegin,
    };
  }

  async function deployLiquidityGenerator() {
    const {
      admin,
      sonne,
      usdc,
      reservesManager,
      distributor,
      bonusDistributor,
      velo,
      router,
      voter,
      periodBegin,
    } = await loadFixture(deployTokensFixture);

    const LiquidityGenerator = await ethers.getContractFactory(
      "LiquidityGenerator"
    );
    const liquidityGenerator = await LiquidityGenerator.deploy(
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
      bonusDuration
    );

    // Set the liquidity generator as the distributor's admin
    await (await distributor.setAdmin(liquidityGenerator.address)).wait(1);
    await (await bonusDistributor.setAdmin(liquidityGenerator.address)).wait(1);

    // Get Pair
    const pairFactory = await ethers.getContractAt(
      "IVelodromePairFactory",
      await router.factory()
    );
    const pairAddress = await pairFactory.getPair(
      sonne.address,
      usdc.address,
      false
    );
    const pair = await ethers.getContractAt(
      "./contracts/interfaces/IERC20.sol:IERC20",
      pairAddress
    );

    // Get Gauge
    const gauge = await ethers.getContractAt(
      "IVelodromeGauge",
      await voter.gauges(pair.address)
    );

    return { liquidityGenerator, pair, gauge };
  }

  it("Should deploy the liquidity generation contract", async function () {
    const { sonne, usdc, reservesManager } = await loadFixture(
      deployTokensFixture
    );
    const { liquidityGenerator, pair, gauge } = await loadFixture(
      deployLiquidityGenerator
    );

    expect(liquidityGenerator.address).to.be.properAddress;
    expect(pair.address).to.be.properAddress;
    expect(gauge.address).to.be.properAddress;

    await (
      await sonne.transfer(
        liquidityGenerator.address,
        ethers.utils.parseEther("1000")
      )
    ).wait(1);

    await (
      await usdc.approve(
        liquidityGenerator.address,
        ethers.utils.parseUnits("100", 6)
      )
    ).wait(1);
    await (
      await liquidityGenerator.deposit(ethers.utils.parseUnits("100", 6))
    ).wait(1);

    // Go to the end of the event and finalize
    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]); // increase time by 3 days
    await ethers.provider.send("evm_mine", []); // mine the next block
    await (await liquidityGenerator.finalize()).wait(1);

    expect(await pair.balanceOf(liquidityGenerator.address)).to.equals(
      0,
      "generator LP balance is 0 after finalize"
    );

    expect(await gauge.balanceOf(liquidityGenerator.address)).to.gt(
      0,
      "generator gauge balance is greater than 0 after finalize"
    );

    // Go to the end of the lock time and deliver lp to reserves
    await ethers.provider.send("evm_increaseTime", [6 * 30 * 24 * 60 * 60]); // increase time by 6 monts
    await ethers.provider.send("evm_mine", []); // mine the next block
    await (
      await liquidityGenerator.deliverLiquidityToReservesManager()
    ).wait(1);

    expect(await pair.balanceOf(liquidityGenerator.address)).to.equals(
      0,
      "generator LP balance is 0 after deliver"
    );
    expect(await gauge.balanceOf(liquidityGenerator.address)).to.equals(
      0,
      "generator gauge balance is 0 after deliver"
    );
    expect(await pair.balanceOf(reservesManager.address)).to.gt(
      0,
      "reserves LP balance is greater than 0 after deliver"
    );
  });
});
