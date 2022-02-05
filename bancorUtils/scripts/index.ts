import {ethers} from "hardhat";
import {expect} from "chai";

import {forkBlockNumber, unlockForkAddresses} from "./utilities";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { Address } from "cluster";
import { showThrottleMessage, TransactionResponse } from "@ethersproject/providers";
import { BigNumber } from "ethers/lib/ethers";
import { assert } from "console";


//============================ SIMULATE HERE ==============================
const PPM_RESOLUTION = BigNumber.from('1000000');
const STANDARD_CONVERTER_TYPE = 3;
const STANDARD_POOL_CONVERTER_WEIGHT = 500_000;

const getFeeSimulation = (amountOut: BigNumber, conversionFee: BigNumber): BigNumber => {
    // function _calculateFee(uint256 targetAmount) private view returns (uint256) {
    //     return targetAmount.mul(_conversionFee) / PPM_RESOLUTION;
    // }
    return amountOut.mul(conversionFee).div(PPM_RESOLUTION);
}
 
const getAmountOutSimulation = (reserve0: BigNumber, reserve1: BigNumber, amountIn: BigNumber, conversionFee: BigNumber): [BigNumber, BigNumber] => {
    // return targetReserveBalance.mul(sourceAmount) / sourceReserveBalance.add(sourceAmount);
    let amountOut = reserve1.mul(amountIn).div(
        reserve0.add(amountIn)
    );
    amountOut = BigNumber.from(amountOut.toBigInt());

    let fee = getFeeSimulation(amountOut, conversionFee);
    fee = BigNumber.from(fee.toBigInt());

    return [amountOut.sub(fee), fee];
}

//=========================== END SIMULATE =================================

const getBancorComponentAddress = async(name: string, contractRegistry: Contract): Promise<string> => {
    const hexName = ethers.utils.formatBytes32String(name);
    const address = await contractRegistry.addressOf(hexName);
    console.log("address of", name, ":", address);
    return address;
}

const getContract = async(abiPath: string, address: string, signer: SignerWithAddress): Promise<Contract> => {
    const contractJson = require(abiPath);
    let contract: Contract;
    try {
        contract = await ethers.getContractAt(contractJson.abi, address, signer);
    } catch (error) {
        contract = await ethers.getContractAt(contractJson, address, signer);
    }
    return contract;
}

const getAnchorPool = async(converterRegistry: Contract, token0Address: string, token1Address: string, signer: SignerWithAddress): Promise<Contract> => {
    const anchorAddress = await converterRegistry.getLiquidityPoolByConfig(
        STANDARD_CONVERTER_TYPE,
        [token0Address, token1Address],
        [STANDARD_POOL_CONVERTER_WEIGHT, STANDARD_POOL_CONVERTER_WEIGHT]
    );
    const anchor: Contract = await getContract(
        "../abi/bancorArtifacts/utility/interfaces/IOwned.sol/IOwned.json",
        anchorAddress,
        signer
    );
    return anchor;
}

const getPool = async(anchor: Contract, signer: SignerWithAddress): Promise<Contract> => {
    const poolAddress: string = await anchor.owner();
    const pool: Contract = await getContract(
        "../abi/bancorArtifacts/converter/types/standard-pool/StandardPoolConverter.sol/StandardPoolConverter.json",
        poolAddress,
        signer
    );
    return pool;
}

const getConversionFee = async(pool: Contract): Promise<BigNumber> => {
    const conversionFee = await pool.conversionFee();
    return conversionFee;
}

const getTokensPool = async(pool: Contract): Promise<[string, string]> => {
    const tokens: string[] = await pool.reserveTokens();
    assert(tokens.length == 2);
    return [tokens[0], tokens[1]];
}

const getTokenBalance = async(pool: Contract, token: string): Promise<BigNumber> => {
    const balance = await pool.reserveBalance(token);
    return balance;
}

const exchange = async(bancorNetwork: Contract, path: string[], from: SignerWithAddress, to: SignerWithAddress, swapAmount: BigNumber, minReturn: BigNumber, gasPrice: BigNumber): Promise<BigNumber> => {
    const amountOut = await bancorNetwork.connect(from).callStatic.convertByPath(
        path, 
        BigNumber.from('10000'),
        BigNumber.from('1'),
        to.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        {gasPrice: gasPrice}
    );
    const tx: TransactionResponse = await bancorNetwork.connect(from).convertByPath(
        path, 
        BigNumber.from('10000'),
        BigNumber.from('1'),
        to.address,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        {gasPrice: gasPrice}
    );
    const receipt = await tx.wait();
    console.log("transaction status: ", receipt.status);
    assert(receipt.status == 1);
    return amountOut;
}

async function main() {
    //============================== INITIALIZE ==================================
    await forkBlockNumber(ethers, 14099980);
    console.log("current block number", await ethers.provider.getBlockNumber());

    const signers: SignerWithAddress[] = await ethers.getSigners();
    const developer: SignerWithAddress = signers[0];

    const whaleAddress = '0x55fe002aeff02f77364de339a1292923a15844b8';
    await unlockForkAddresses(ethers, [whaleAddress]);
    let whale = await ethers.getSigner(whaleAddress);

    // get contractRegistry  
    const contractRegistry: Contract = await getContract(
        '../abi/bancorArtifacts/utility/ContractRegistry.sol/ContractRegistry.json',
        '0x52Ae12ABe5D8BD778BD5397F99cA900624CfADD4',
        developer
    )
    console.log("contract registry address:", contractRegistry.address);

    // get bancorNetwork 
    const bancorNetwork: Contract = await getContract(
        "../abi/bancorArtifacts/BancorNetwork.sol/BancorNetwork.json",
        await getBancorComponentAddress('BancorNetwork', contractRegistry),
        developer
    );

    // get converterRegistry 
    const converterRegistry: Contract = await getContract(
        "../abi/bancorArtifacts/converter/ConverterRegistry.sol/ConverterRegistry.json",
        await getBancorComponentAddress('BancorConverterRegistry', contractRegistry),
        developer
    );

    //============================== SAMPLE EXCHANGE ==================================
    const usdcTokenAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const bntTokenAddress = '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C';   
    
    // get anchor 
    const anchor: Contract = await getAnchorPool(
        converterRegistry,
        usdcTokenAddress, 
        bntTokenAddress,
        developer
    )
    console.log("anchor of bnt/usdc pool", anchor.address);

    // get pool 
    const pool: Contract = await getPool(
        anchor, 
        developer
    );
    console.log("pool bnt/usdc address: ", pool.address); 

    // get pool's conversion fee 
    const conversionFee: BigNumber = await getConversionFee(pool);
    console.log("conversion fee: ", conversionFee.toString());

    // get tokens of pool (assertion)
    const [tokens0, tokens1] = await getTokensPool(pool);
    assert(tokens0 == usdcTokenAddress || tokens1 == usdcTokenAddress);
    assert(tokens0 == bntTokenAddress || tokens1 == bntTokenAddress);

    // get token balance (assertion)
    const usdcBalance: BigNumber = await getTokenBalance(pool, usdcTokenAddress);
    const bntBalance: BigNumber = await getTokenBalance(pool, bntTokenAddress);
    console.log("usdc-bnt balance of pool: ", usdcBalance.toString(), bntBalance.toString());
    
    const usdcToken: Contract = await getContract(
        "../abi/usdcToken.json",
        usdcTokenAddress,
        developer
    );
    const bntToken: Contract = await getContract(
        "../abi/bntToken.json",
        bntTokenAddress,
        developer
    );
    assert(usdcBalance.toString() == (await usdcToken.balanceOf(pool.address)).toString());
    assert(bntBalance.toString() == (await bntToken.balanceOf(pool.address)).toString());
    
    // some additional information 
    const whaleUsdcBalance: BigNumber = await usdcToken.balanceOf(whaleAddress);
    const whaleBntBalance: BigNumber = await bntToken.balanceOf(whaleAddress);
    console.log("usdc-bnt balance of whale: ", whaleUsdcBalance.toString(), whaleBntBalance.toString());

    const devUsdcBalance: BigNumber = await usdcToken.balanceOf(developer.address);
    const devBntBalance: BigNumber = await bntToken.balanceOf(developer.address);
    console.log("usdc-bnt balance of dev: ", devUsdcBalance.toString(), devBntBalance.toString());

    //=============================== SWAP =================================== 

    // approve all 
    await usdcToken.connect(whale).approve(bancorNetwork.address, whaleUsdcBalance, {gasPrice: 80213921120});
    
    // swap 
    let path: string[] = [usdcToken.address, anchor.address, bntToken.address];
    let amountIn = BigNumber.from('10000');
    const realRate = await exchange(
        bancorNetwork,
        path,
        whale,
        developer,
        amountIn,
        BigNumber.from('1'),
        BigNumber.from('80213921120')
    );
    console.log("rate =", realRate.toString());
    const [rateSimulation, fee] = getAmountOutSimulation(usdcBalance, bntBalance, BigNumber.from('10000'), conversionFee);

    expect(rateSimulation.toString()).to.be.equal(realRate.toString());
    expect( (devBntBalance.add(realRate)).toString() ).to.be.equal( (await bntToken.balanceOf(developer.address)).toString() );
    expect( (whaleUsdcBalance.sub(amountIn)).toString() ).to.be.equal( (await usdcToken.balanceOf(whale.address)).toString() );

    console.log("after trade | bnt balance of developer:", (await bntToken.balanceOf(developer.address)).toString());
    console.log("after trade | usdc balance of whale:", (await usdcToken.balanceOf(whale.address)).toString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
