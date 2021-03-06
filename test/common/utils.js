const fs = require('fs');
const { expectEvent } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { BN, ether, balance } = require('@openzeppelin/test-helpers');
const { initialSettings } = require('../../deployments/settings');
const { validatorRegistrationArgs } = require('./validatorRegistrationArgs');

const Pools = artifacts.require('Pools');
const Individuals = artifacts.require('Individuals');
const ValidatorsRegistry = artifacts.require('ValidatorsRegistry');
const ValidatorTransfers = artifacts.require('ValidatorTransfers');

function getDepositAmount({
  min = new BN(initialSettings.userDepositMinUnit),
  max = ether('320'),
} = {}) {
  let randomDeposit = ether(Math.random().toFixed(8))
    .mul(max.sub(min))
    .div(ether('1'))
    .add(min);

  return randomDeposit.sub(
    randomDeposit.mod(new BN(initialSettings.userDepositMinUnit))
  );
}

function getEntityId(collectorAddress, entitiesCount) {
  return web3.utils.soliditySha3(collectorAddress, entitiesCount);
}

function getUserId(entityId, sender, recipient) {
  return web3.utils.soliditySha3(entityId, sender, recipient);
}

function removeNetworkFile(network) {
  if (fs.existsSync(`.openzeppelin/${network}.json`)) {
    fs.unlinkSync(`.openzeppelin/${network}.json`);
  }
}

async function checkPendingPool(poolsContract, poolId, expectedPending) {
  let isPending = await poolsContract.pendingPools(poolId);
  expect(isPending).to.equal(expectedPending);
  if (expectedPending) {
    let poolsCount = await poolsContract.poolsCount();
    expect(poolId).to.not.equal(getEntityId(poolsContract.address, poolsCount));
  }
}

async function checkPendingGroup(groupsContract, groupId, expectedAmount) {
  let collectedAmount = await groupsContract.pendingGroups(groupId);
  expect(collectedAmount).to.bignumber.equal(expectedAmount);
}

async function checkPendingIndividual(
  individualsContract,
  individualId,
  expectedPending
) {
  let isPending = await individualsContract.pendingIndividuals(individualId);
  expect(isPending).to.equal(expectedPending);
}

async function checkCollectorBalance(collectorContract, correctBalance) {
  expect(
    await balance.current(collectorContract.address)
  ).to.be.bignumber.equal(correctBalance);
}

async function checkNewPoolCollectedAmount(poolsContract, correctAmount) {
  let collectedAmount = await poolsContract.collectedAmount();
  expect(collectedAmount).to.be.bignumber.equal(correctAmount);
}

async function checkUserTotalAmount({
  depositsContract,
  entityId,
  senderAddress,
  recipientAddress,
  expectedAmount,
}) {
  expect(
    await depositsContract.amounts(
      getUserId(entityId, senderAddress, recipientAddress)
    )
  ).to.be.bignumber.equal(expectedAmount);
}

async function checkDepositAdded({
  transaction,
  depositsContract,
  collectorAddress,
  entityId,
  senderAddress,
  recipientAddress,
  addedAmount,
  totalAmount,
}) {
  // Check event log
  await expectEvent.inTransaction(
    transaction,
    depositsContract,
    'DepositAdded',
    {
      collector: collectorAddress,
      entityId,
      sender: senderAddress,
      recipient: recipientAddress,
      amount: addedAmount,
    }
  );

  // Check user's total amount
  await checkUserTotalAmount({
    depositsContract,
    entityId,
    senderAddress,
    recipientAddress,
    expectedAmount: totalAmount,
  });
}

async function checkDepositCanceled({
  transaction,
  depositsContract,
  collectorAddress,
  entityId,
  senderAddress,
  recipientAddress,
  canceledAmount,
  totalAmount,
}) {
  // Check event log
  await expectEvent.inTransaction(
    transaction,
    depositsContract,
    'DepositCanceled',
    {
      collector: collectorAddress,
      entityId,
      sender: senderAddress,
      recipient: recipientAddress,
      amount: canceledAmount,
    }
  );

  // Check user's total amount
  await checkUserTotalAmount({
    depositsContract,
    entityId,
    senderAddress,
    recipientAddress,
    expectedAmount: totalAmount,
  });
}

async function checkValidatorRegistered({
  vrc,
  transaction,
  pubKey,
  entityId,
  signature,
  validatorsRegistry,
  stakingDuration,
  maintainerFee = new BN(initialSettings.maintainerFee),
  minStakingDuration = new BN(initialSettings.minStakingDuration),
  withdrawalCredentials = initialSettings.withdrawalCredentials,
  validatorDepositAmount = new BN(initialSettings.validatorDepositAmount),
}) {
  // Check VRC record created
  await expectEvent.inTransaction(transaction, vrc, 'DepositEvent', {
    pubkey: pubKey,
    withdrawal_credentials: withdrawalCredentials,
    amount: web3.utils.bytesToHex(
      new BN(web3.utils.fromWei(validatorDepositAmount, 'gwei')).toArray(
        'le',
        8
      )
    ),
    signature: signature,
  });

  // Check ValidatorsRegistry log emitted
  await expectEvent.inTransaction(
    transaction,
    ValidatorsRegistry,
    'ValidatorRegistered',
    {
      pubKey: pubKey,
      entityId,
      withdrawalCredentials,
      stakingDuration,
      depositAmount: validatorDepositAmount,
      maintainerFee,
      minStakingDuration,
    }
  );

  // Check validator entry created
  let validator = await validatorsRegistry.validators(
    web3.utils.soliditySha3(pubKey)
  );
  expect(validator.depositAmount).to.be.bignumber.equal(validatorDepositAmount);
  expect(validator.maintainerFee).to.be.bignumber.equal(maintainerFee);
  expect(validator.entityId).equal(entityId);
}

async function checkValidatorTransferred({
  transaction,
  validatorId,
  newEntityId,
  prevEntityId,
  validatorsRegistry,
  validatorTransfers,
  userDebt,
  totalUserDebt,
  maintainerDebt,
  totalMaintainerDebt,
  newStakingDuration,
  newMaintainerFee = new BN(initialSettings.maintainerFee),
  newMinStakingDuration = new BN(initialSettings.minStakingDuration),
}) {
  // Check ValidatorsRegistry log emitted
  await expectEvent.inTransaction(
    transaction,
    ValidatorTransfers,
    'ValidatorTransferred',
    {
      validatorId,
      prevEntityId,
      newEntityId,
      userDebt,
      maintainerDebt,
      newMaintainerFee,
      newMinStakingDuration,
      newStakingDuration,
    }
  );

  // check validator entry update
  let validator = await validatorsRegistry.validators(validatorId);
  expect(validator.maintainerFee).to.be.bignumber.equal(newMaintainerFee);
  expect(validator.entityId).equal(newEntityId);

  // check debt entry created
  let validatorDebt = await validatorTransfers.validatorDebts(validatorId);
  expect(validatorDebt.userDebt).to.be.bignumber.equal(totalUserDebt);
  expect(validatorDebt.maintainerDebt).to.be.bignumber.equal(
    totalMaintainerDebt
  );

  // check previous entity rewards recorded
  let entityReward = await validatorTransfers.entityRewards(prevEntityId);
  expect(entityReward.validatorId).to.equal(validatorId);
  expect(entityReward.amount).to.be.bignumber.equal(userDebt);
}

async function registerValidator({
  args = validatorRegistrationArgs[0],
  entityId,
  poolsProxy,
  individualsProxy,
  operator,
  sender,
  recipient,
}) {
  let collector;
  if (individualsProxy) {
    collector = await Individuals.at(individualsProxy);
  } else if (poolsProxy) {
    collector = await Pools.at(poolsProxy);
  }

  if (!entityId) {
    // add deposit
    await collector.addDeposit(recipient, {
      from: sender,
      value: initialSettings.validatorDepositAmount,
    });
    // FIXME: invalid if not the first entity created
    entityId = getEntityId(collector.address, new BN(1));
  }

  // register validator for the entity
  await collector.registerValidator(
    args.pubKey,
    args.signature,
    args.hashTreeRoot,
    entityId,
    {
      from: operator,
    }
  );

  return web3.utils.soliditySha3(args.pubKey);
}

module.exports = {
  validatorRegistrationArgs,
  registerValidator,
  checkPendingPool,
  checkPendingGroup,
  checkPendingIndividual,
  checkNewPoolCollectedAmount,
  checkCollectorBalance,
  checkValidatorRegistered,
  checkValidatorTransferred,
  removeNetworkFile,
  getDepositAmount,
  getUserId,
  getEntityId,
  checkUserTotalAmount,
  checkDepositAdded,
  checkDepositCanceled,
};
