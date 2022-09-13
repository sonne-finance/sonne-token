import { expect } from "chai";
import { ethers } from "hardhat";

describe("Sonne Token", function () {
  it("Should mint 100m tokens to given accounts", async function () {
    const totalSupply = ethers.utils.parseEther("100000000");
    const account = "0x1110000000000000000000000000000000000000";

    const Sonne = await ethers.getContractFactory("Sonne");
    const sonne = await Sonne.deploy(account);

    expect(await sonne.totalSupply()).to.equal(totalSupply);
    expect(await sonne.balanceOf(account)).to.equal(totalSupply);
  });
});
