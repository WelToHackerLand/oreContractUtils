import { BigNumber, BigNumberish } from "ethers";
import AllBigNumber from "bignumber.js";

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const maxUint256 = BigNumber.from(2).pow(256).sub(1);

export async function unlockForkAddress(
  ethers: any,
  address: string
): Promise<any> {
  return ethers.provider.send("hardhat_impersonateAccount", [address]);
}

export async function unlockForkAddresses(
  ethers: any,
  addresses: string[]
): Promise<any[]> {
  return Promise.all(
    addresses.map((address) => unlockForkAddress(ethers, address))
  );
}

export async function forkBlockNumber(
  ethers: any,
  blockNumber: number
): Promise<any> {
  if (!process.env.ALCHEMY_API_KEY) {
    throw Error("Please set ALCHEMY_API_KEY in .env file.");
  }
  await ethers.provider.send("hardhat_reset", [
    {
      forking: {
        blockNumber: blockNumber,
        jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      },
    },
  ]);
}

export function toWei(n: BigNumberish): BigNumber {
  return expandDecimals(n, 18);
}

export function expandDecimals(n: BigNumberish, decimals = 18): BigNumber {
  return BigNumber.from(
    new AllBigNumber(n.toString())
      .multipliedBy(new AllBigNumber(10).pow(decimals))
      .toFixed(0)
  );
}

export function expandDecimalsString(n: BigNumberish, decimals = 18): string {
  return new AllBigNumber(n.toString())
    .multipliedBy(new AllBigNumber(10).pow(decimals))
    .toFixed();
}
