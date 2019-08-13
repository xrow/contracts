const { scripts } = require('@openzeppelin/cli');
const { log } = require('./common');

// TODO: Replace with actual values
const initialSettings = {
  userDepositMinUnit: '1000000000000000',
  validatorDepositAmount: '32000000000000000000',
  maintainerFee: '523', // 5.23%,
  maintainer: '0xF4904844B4aF87f4036E77Ad1697bEcf703c8439',
  withdrawalCredentials:
    '0x2222222222222222222222222222222222222222222222222222222222222222'
};

async function deploySettingsProxy({ networkConfig, adminsProxy }) {
  const proxy = await scripts.create({
    contractAlias: 'Settings',
    methodName: 'initialize',
    methodArgs: [
      initialSettings.maintainer,
      initialSettings.maintainerFee,
      initialSettings.userDepositMinUnit,
      initialSettings.validatorDepositAmount,
      initialSettings.withdrawalCredentials,
      adminsProxy
    ],
    ...networkConfig
  });

  log(`Settings contract: ${proxy.address}`);
  return proxy.address;
}

module.exports = {
  deploySettingsProxy,
  initialSettings
};
