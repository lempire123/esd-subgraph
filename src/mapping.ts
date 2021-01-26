import { BigInt, Address, log } from "@graphprotocol/graph-ts"
import {
  Contract,
  Advance,
  CouponExpiration,
  CouponPurchase,
  CouponRedemption,
  SupplyDecrease,
  SupplyIncrease,
  SupplyNeutral,
  Deposit,
  Withdraw,
  Bond,
  Unbond
} from "../generated/Contract/Contract"
import {
  LPContract,
} from "../generated/Contract/LPContract"
import {
  DollarContract,
} from "../generated/Contract/DollarContract"
import {
  UniswapV2PairContract,
} from "../generated/Contract/UniswapV2PairContract"
import { Epoch, Account } from "../generated/schema"
import { getEpoch } from "./helper"

// epochs needed to expire the coupons
let COUPON_EXPIRATION = BigInt.fromI32(90)

// Uniswap Pool
let UNISWAP_PAIR_CONTRACT_ADDRESS = Address.fromString('0x88ff79eb2bc5850f27315415da8685282c7610f9')

// Dollar ERC20 Contract
let DOLLAR_CONTRACT_ADDRESS = Address.fromString('36F3FD68E7325a35EB768F1AedaAe9EA0689d723')

export function handleAdvance(event: Advance): void {
  let epochId = event.params.epoch.toString()
  let epoch = new Epoch(epochId)

  epoch.startTimestamp = event.params.timestamp
  epoch.startBlock = event.params.block

  let contract = Contract.bind(event.address)
  epoch.startDAOTotalBonded = contract.totalBonded()
  epoch.startDAOTotalStaged = contract.totalStaged()
  epoch.startTotalDebt = contract.totalDebt()
  epoch.startTotalRedeemable = contract.totalRedeemable()
  epoch.startTotalCoupons = contract.totalCoupons()
  epoch.startTotalNet = contract.totalNet()
  epoch.bootstrappingAt = contract.bootstrappingAt(event.params.epoch)
  epoch.couponsExpiration = event.params.epoch + COUPON_EXPIRATION

  let poolStakingAddress = contract.pool() 

  let startLPTotalBondedTokens = BigInt.fromI32(0)
  let startLPTotalStagedTokens = BigInt.fromI32(0)
  if(poolStakingAddress) {
    let lpContract = LPContract.bind(poolStakingAddress)
    startLPTotalBondedTokens = lpContract.totalBonded()
    startLPTotalStagedTokens = lpContract.totalStaged()
  }

  let dollarContract = DollarContract.bind(DOLLAR_CONTRACT_ADDRESS)
  let startTotalLPESD = dollarContract.balanceOf(UNISWAP_PAIR_CONTRACT_ADDRESS)

  let uniswapContract = UniswapV2PairContract.bind(UNISWAP_PAIR_CONTRACT_ADDRESS)
  let startTotalLPTokens = uniswapContract.totalSupply()

  if(startTotalLPTokens > BigInt.fromI32(0)) {
    epoch.startLPTotalBondedESD = (startLPTotalBondedTokens * startTotalLPESD) / startTotalLPTokens
    epoch.startLPTotalStagedESD = (startLPTotalStagedTokens * startTotalLPESD) / startTotalLPTokens

  }

  epoch.startLPTotalStagedTokens = startLPTotalStagedTokens
  epoch.startLPTotalBondedTokens = startLPTotalBondedTokens
  epoch.startTotalLPTokens = startTotalLPTokens
  epoch.startTotalLPESD = startTotalLPESD

  epoch.save()
}

export function handleCouponExpiration(event: CouponExpiration): void {
  let epochId = event.params.epoch.toString()
  let epoch = new Epoch(epochId)
  epoch.outstandingCoupons = BigInt.fromI32(0)
  epoch.expiredCoupons = event.params.couponsExpired
  epoch.save()
}

export function handleCouponPurchase(event: CouponPurchase): void {
  let epochId = event.params.epoch.toString()
  let epoch = Epoch.load(epochId)
  if (epoch == null) {
    epoch = new Epoch(epochId)
  }
  
  let couponAmount = event.params.couponAmount
  epoch.outstandingCoupons = epoch.outstandingCoupons + couponAmount
  epoch.save()
}

export function handleCouponRedemption(event: CouponRedemption): void {
  let epochId = event.params.epoch.toString()
  let epoch = Epoch.load(epochId)
  if (epoch == null) {
    epoch = new Epoch(epochId)
  }
  
  let couponAmount = event.params.couponAmount
  epoch.outstandingCoupons = epoch.outstandingCoupons - couponAmount
  epoch.save()
}

export function handleSupplyDecrease(event: SupplyDecrease): void {
  let epochId = event.params.epoch.toString()
  let epoch = new Epoch(epochId)
  epoch.oraclePrice = event.params.price
  epoch.deltaSupply = -event.params.newDebt
  epoch.save()
}

export function handleSupplyIncrease(event: SupplyIncrease): void {
  let epochId = event.params.epoch.toString()
  let epoch = new Epoch(epochId)
  epoch.oraclePrice = event.params.price
  epoch.deltaSupply = event.params.newRedeemable + event.params.lessDebt + event.params.newBonded
  epoch.save()
}

export function handleSupplyNeutral(event: SupplyNeutral): void {
  let epochId = event.params.epoch.toString()
  let epoch = new Epoch(epochId)
  epoch.oraclePrice = BigInt.fromI32(1).pow(18)
  epoch.deltaSupply = BigInt.fromI32(0)
  epoch.save()
}

// Account methods

// handles deposit to DAO, funds move to staging
export function handleDeposit(event: Deposit): void {
  let accountId = event.params.account.toHexString()
  let account = Account.load(accountId)
  if (account == null){
    account = new Account(accountId)
  }

  let contract = Contract.bind(event.address)
  account.stagedBalance = account.stagedBalance + event.params.value
  account.bondedBalance = contract.balanceOfBonded(Address.fromString(accountId))
  account.holdingBalance = contract.balanceOf(Address.fromString(accountId))
  log.debug("Depositing ESD to DAO {} {} {} {}", [event.params.account.toHexString(), account.stagedBalance.toString(), account.bondedBalance.toString(), account.holdingBalance.toString()])
  // account.holdingBalance = account.holdingBalance - event.params.value

  let epochNo = getEpoch(event.block.timestamp.toI32())
  account.epochNo = epochNo
  account.save()
}

export function handleWithdraw(event: Withdraw): void {
  let accountId = event.params.account.toHexString()
  let account = Account.load(accountId)

  if(account == null){
    log.debug("Unable to load User Entity {}", [event.params.account.toHexString()])
    account.stagedBalance = BigInt.fromI32(0)
  }
  else{
    account.stagedBalance = account.stagedBalance - event.params.value
  }

  let contract = Contract.bind(event.address)
  account.bondedBalance = contract.balanceOfBonded(Address.fromString(accountId))
  account.holdingBalance = contract.balanceOf(Address.fromString(accountId))
  log.debug("Withdrawing ESD from DAO {} {} {} {}", [event.params.account.toHexString(), account.stagedBalance.toString(), account.bondedBalance.toString(), account.holdingBalance.toString()])
  // account.holdingBalance = account.holdingBalance - event.params.value
  let epochNo = getEpoch(event.block.timestamp.toI32())
  account.epochNo = epochNo
  account.save()
}


export function handleBond(event: Bond): void {
  let accountId = event.params.account.toHexString()
  let account = Account.load(accountId)
  if (account == null){
    account = new Account(accountId)
  }
  let contract = Contract.bind(event.address)
  account.bondedBalance = account.bondedBalance + event.params.value
  account.epochNo = event.params.start - BigInt.fromI32(1)
  account.stagedBalance = account.stagedBalance - event.params.value
  account.holdingBalance = contract.balanceOf(Address.fromString(accountId))
  log.debug("Bonding ESD to DAO {} {} {} {} {}", [event.params.start.toHexString(), event.params.account.toHexString(), account.stagedBalance.toString(), account.bondedBalance.toString(), account.holdingBalance.toString()])
  account.save()
}

export function handleUnbond(event: Unbond): void {
  let accountId = event.params.account.toHexString()
  let account = Account.load(accountId)
  if (account == null){
    account = new Account(accountId)
  }
  let contract = Contract.bind(event.address)
  account.bondedBalance = account.bondedBalance - event.params.value
  account.epochNo = event.params.start - BigInt.fromI32(1)
  account.stagedBalance = account.stagedBalance + event.params.value
  account.holdingBalance = contract.balanceOf(Address.fromString(accountId))
  log.debug("Unbonding ESD to DAO {} {} {} {} {}", [event.params.start.toHexString(), event.params.account.toHexString(), account.stagedBalance.toString(), account.bondedBalance.toString(), account.holdingBalance.toString()])
  account.save()
}