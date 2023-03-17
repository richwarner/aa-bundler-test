import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

dotenv.config();

const ENDPOINT_MUMBAI = process.env.ENDPOINT_MUMBAI;
const ENDPOINT_GOERLI = process.env.ENDPOINT_GOERLI;

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: "0.8.15",
  networks: {
    mumbai: {
      url: ENDPOINT_MUMBAI,
      accounts: [`${PRIVATE_KEY}`],
    },
    goerli: {
      url: ENDPOINT_GOERLI,
      accounts: [`${PRIVATE_KEY}`],
    },
  },
};

export default config;
