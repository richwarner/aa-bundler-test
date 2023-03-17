import { assert, expect, AssertionError } from "chai";
import { ethers } from "hardhat";
import { BigNumberish, Signer } from "ethers";
import { Network } from "ethers/providers";
import { SimpleEventEmitter } from "../typechain-types";
import { CONTRACT_MUMBAI, CONTRACT_GOERLI, ENTRY_POINT, SIMPLE_ACCOUNT_FACTORY, ACCOUNT_ADDRESS } from "../config.js";
import SimpleEventEmitterArtifact from "../artifacts/contracts/SimpleEventEmitter.sol/SimpleEventEmitter.json";
import { SimpleAccountAPI, HttpRpcClient } from "@account-abstraction/sdk";
import { JsonRpcProvider } from "@ethersproject/providers";

interface Gas {
  maxFeePerGas: BigNumberish;
  maxPriorityFeePerGas: BigNumberish;
}
async function getGasFee(provider: JsonRpcProvider): Promise<Gas> {
  const [fee, block] = await Promise.all([provider.send("eth_maxPriorityFeePerGas", []), provider.getBlock("latest")]);
  const tip = ethers.BigNumber.from(fee);
  const buffer = tip.div(100).mul(13);
  const maxPriorityFeePerGas = tip.add(buffer);
  const maxFeePerGas = block.baseFeePerGas
    ? block.baseFeePerGas.mul(2).add(maxPriorityFeePerGas)
    : maxPriorityFeePerGas;

  return { maxFeePerGas, maxPriorityFeePerGas };
}

describe("AATester", async () => {
  let signers: any[];
  let signer: Signer;
  let contract: SimpleEventEmitter;
  let simpleAccountApi: SimpleAccountAPI;
  let network: Network;
  let bundlerEndpoint: string;
  let bundlerClient: any;
  let contractAddress: string;

  before(async () => {
    network = await ethers.provider.getNetwork();
    console.log(`     Using network: ${JSON.stringify(network.name)} with chain id: ${network.chainId}`);
    bundlerEndpoint = network.name == "goerli" ? process.env.BUNDLER_GOERLI! : process.env.BUNDLER_MUMBAI!;
    bundlerClient = new HttpRpcClient(bundlerEndpoint, ENTRY_POINT, network.chainId);
    contractAddress = network.name === "goerli" ? CONTRACT_GOERLI : CONTRACT_MUMBAI;
    signers = await ethers.getSigners();
    signer = signers[0];
    contract = new ethers.Contract(contractAddress, SimpleEventEmitterArtifact.abi, signer) as SimpleEventEmitter;
    simpleAccountApi = new SimpleAccountAPI({
      provider: ethers.provider,
      entryPointAddress: ENTRY_POINT,
      owner: signer,
      factoryAddress: SIMPLE_ACCOUNT_FACTORY,
    });
  });

  const testDesc1 = "should make a simple contract call without using account abstraction";
  it(testDesc1, async function () {
    console.log('\n     > TEST: Running "' + testDesc1 + '"...');
    const parameter = ethers.utils.toUtf8Bytes("Test 1");
    const tx = await contract.emitEvent(parameter);
    await expect(tx).to.emit(contract, "ParameterEmitted").withArgs(parameter);
  });

  const testDesc2 = "should make a simple contract call using account abstraction";
  it("should make a simple contract call using account abstraction", async function () {
    console.log('\n     > TEST: Running "' + testDesc2 + '"...');
    const parameter = ethers.utils.toUtf8Bytes("Test 2");
    const userOp = await simpleAccountApi.createSignedUserOp({
      target: contract.address,
      value: 0,
      data: contract.interface.encodeFunctionData("emitEvent", [parameter]),
      ...(await getGasFee(ethers.provider)),
    });
    const userOpHash = await bundlerClient.sendUserOpToBundler(userOp);
    console.log(`       UserOperation hash: ${userOpHash}`);
    console.log("       Waiting for transaction...");
    const txHash = await simpleAccountApi.getUserOpReceipt(userOpHash);
    console.log(`       Transaction hash: ${txHash}`);
    await expect(txHash).to.emit(contract, "ParameterEmitted").withArgs(parameter);
  });

  const testDesc3 =
    "should fail 0 of 10 simple contract calls using account abstraction with gradually increasing calldata lengths";
  it(testDesc3, async function () {
    console.log('\n     > TEST: Running "' + testDesc3 + '"...');
    let failed: number = 0;
    for (
      let parameterLengthInBytes = 100;
      parameterLengthInBytes <= 51200;
      parameterLengthInBytes *= 2 // 100 200 400 800 1600 3200 6400 12800 25600 51200
    ) {
      let success = true;
      const parameter = ethers.utils.hexlify(ethers.utils.randomBytes(parameterLengthInBytes));
      try {
        const userOp = await simpleAccountApi.createSignedUserOp({
          target: contract.address,
          value: 0,
          data: contract.interface.encodeFunctionData("emitEvent", [parameter]),
          ...(await getGasFee(ethers.provider)),
        });
        console.log(
          `       Testing param of byte size: ${parameterLengthInBytes} | Call data length: ${userOp.callData.length}`
        );
        const userOpHash = await bundlerClient.sendUserOpToBundler(userOp);
        // console.log(`     UserOperation hash: ${userOpHash}`);
        // console.log("     Waiting for transaction...");
        const txHash = await simpleAccountApi.getUserOpReceipt(userOpHash);
        // console.log(`     Transaction hash: ${txHash}`);
        await expect(txHash).to.emit(contract, "ParameterEmitted").withArgs(parameter);
      } catch (error: any) {
        if (error.message.includes("preVerificationGas: below expected gas")) {
          console.log("       Error: preVerificationGas: below expected gas");
          success = false;
        } else {
          console.log("       Unexpected Error: ", error.message);
          success = false;
        }
      }
      if (!success) failed++;
      console.log("       Result: ", success ? "Success" : "Failed");
      console.log("       --------------------------------------------");
    }
    console.log(`     Failed: ${failed}/10`);
    expect(failed).to.equal(0);
  }).timeout(70000);
});
