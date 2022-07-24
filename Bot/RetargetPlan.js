const Web3 = require("web3");
const dotenv = require("dotenv");

const IOrderbookExchangeABI = require(__dirname + '/../Interface/IOrderBook.json');
const IERC20 = require(__dirname + '/../Interface/IERC20Upgradeable.json');

dotenv.config();

if (process.env.WEB3_HTTP_PROVIDER_URL === null || process.env.WEB3_HTTP_PROVIDER_URL === undefined) {
  console.error("Invalid Web3 http provider url", process.env.WEB3_HTTP_PROVIDER_URL);
  process.exit();
}

var web3 = new Web3(new Web3.providers.HttpProvider(process.env.WEB3_HTTP_PROVIDER_URL));

const fs = require('fs');
const BN = web3.utils.BN;
let Mul, Div, Pow, ApproxNthRoot;
({Mul, Div, Pow, ApproxNthRoot} = require('../helper/BBN.js').getFunctionality(BN));
const _0 = new BN(0);
const _1 = new BN(1);
const _2 = new BN(2);
const _10To18 = (new BN(10)).pow(new BN(18));
const NULL_ORDER_STATUS = 'Null';
const BUY_STATUS = 'LimitBuy';
const SELL_STATUS = 'LimitSell';

const OrderbookAddress = process.env.ORDERBOOK_ADDRESS;
const PerpAddress = process.env.PERP_ADDRESS;
const USDCAddress = process.env.USDC_ADDRESS;

const exchange = new web3.eth.Contract(IOrderbookExchangeABI.abi, OrderbookAddress);

const perp = new web3.eth.Contract(IERC20.abi, PerpAddress);

const usdc = new web3.eth.Contract(IERC20.abi, USDCAddress);

const liquidityIndex = process.env.LIQUIDITY_INDEX;

const minimumSpread = web3.utils.toBN(process.env.MINIMUM_SPREAD).mul(_10To18);

const usdcAvailable = web3.utils.toBN(process.env.USDC_BALANCE_AVAILABLE).mul(_10To18);

const perpAvailable = web3.utils.toBN(process.env.PERP_BALANCE_AVAILABLE).mul(_10To18);

const inFilename = __dirname + '/../JsonStorage/LoadedPlan.json';
const outFilename = inFilename;

async function fileExists(filename) {
  return await new Promise((res, rej) => {
    fs.access(filename, fs.constants.F_OK, (err) => {
      if (err) res(false);
      else res(true);
    })
  });
}

async function getPrice() {
  return _10To18.mul(new BN(3));
  let bestBid = await exchange.methods.getBuyHead(liquidityIndex);
  let bid = new BN(bestBid.price);
  let bestAsk = await exchange.methods.getSellHead(liquidityIndex);
  let ask = new BN(bestAsk.Price);
  if (ask == _0 || bid == _0) {
    oracle.getPrice();
  }
  let dividend = ask.mul(bid);
  let divisor = _2.mul(_10To18);
  return dividend.div(divisor);
}

let retarget = async () => {
  try {
  let zones1;
  let zones0;
  let OrderbookAddress;
  let accounts = await web3.eth.getAccounts();
  try {
    let inData = fs.readFileSync(inFilename, 'utf8');
    let mainAccount;
    [zones1, OrderbookAddress, mainAccount] = JSON.parse(inData);
    [zones0, OrderbookAddress, mainAccount] = JSON.parse(inData);
    if (mainAccount !== accounts[0]) {
      throw new Error("Please Configure The .env file to ensure the first account provided is "+accounts[0]+" the current main account is "+mainAccount);
    }
  }
  catch(err) {
    console.error(err);
    process.exit();
  }

  for (let i = 0; i < zones1.length; i++) {
    zones1[i].lower = new BN(zones1[i].lower);
    zones1[i].upper = new BN(zones1[i].upper);
    zones1[i].weightScalar = new BN(zones1[i].weightScalar);
    for (let j = 0; j < zones1[i].orders.length; j++) {
      zones1[i].orders[j].price = new BN(zones1[i].orders[j].price);
      zones1[i].orders[j].amount = new BN(zones1[i].orders[j].amount);
      zones1[i].orders[j].status = NULL_ORDER_STATUS;
    }
  }

  let Price = await getPrice();
  let lowerBoundSpread = Price.sub(minimumSpread.div(_2));
  let upperBoundSpread = Price.add(minimumSpread.div(_2));

  let highestActiveZone = -1; //BuyZone
  let lowestActiveZone = -1; //SellZone

  let totalBuyWeightedScalars = _0;
  let totalSellWeightedScalars = _0;

  for (let i = zones1.length - 1; i >= 0; i--) {
    let lowestOrder = zones1[i].orders[0].price;
    if (lowerBoundSpread.gte(lowestOrder) && highestActiveZone == -1) {
      highestActiveZone = i;
    }
    if (highestActiveZone != -1) {
      totalBuyWeightedScalars = totalBuyWeightedScalars.add(zones1[i].weightScalar);
    }
  }

  for (let i = 0; i < zones1.length; i++) {
    let orders = zones1[i].orders;
    let highestOrder = orders[orders.length - 1].price;
    if (upperBoundSpread.lte(highestOrder) && lowestActiveZone == -1) {
      lowestActiveZone = i;
    }
    if (lowestActiveZone != -1) {
      totalSellWeightedScalars = totalSellWeightedScalars.add(zones1[i].weightScalar);
    }
  }

  let pctWeightSuppliedLowestActiveZone;
  let pctWeightSuppliedHighestActiveZone;

  let buyAmtPctIncrease;
  let sellAmtPctIncrease;

  let highestActiveBuyOrderIndex = -2;
  let lowestActiveSellOrderIndex = -2;

  if (highestActiveZone > -1) {
    for (let i = 0; i < zones1[highestActiveZone].orders.length; i++) {
      if (zones1[highestActiveZone].orders[i].price.lte(lowerBoundSpread)) {
        continue;
      }
      else if (highestActiveBuyOrderIndex == -2) {
        highestActiveBuyOrderIndex = i-1;
      }
    }
  }

  if (lowestActiveZone > -1) {
    for (let i = zones1[lowestActiveZone].orders.length - 1; i >= 0; i--) {
      if (zones1[lowestActiveZone].orders[i].price.gte(upperBoundSpread)) {
        continue;
      }
      else if (lowestActiveSellOrderIndex == -2) {
        lowestActiveSellOrderIndex = i+1;
      }
    }
  }

  console.log("Calculating buy orders");

  for (let i = 0; i <= highestActiveZone; i++) {
    console.log("ZONE", i);
    let orders = zones1[i].orders;
    let numOrders = i == highestActiveZone ? highestActiveBuyOrderIndex+1 : orders.length;
    let weightScalar = zones1[i].weightScalar;
    let zoneUSDCAllocation = usdcAvailable.mul(weightScalar).div(totalBuyWeightedScalars);
    let totalOrderValue = Div(zoneUSDCAllocation, Mul(new BN(numOrders), _10To18)).div(_10To18);
    console.log(totalOrderValue.toString());
    for (let j = 0; j < numOrders; j++) {
      let amount = Div(totalOrderValue, orders[j].price);
      orders[j].amount = amount;
      orders[j].status = BUY_STATUS;
      console.log("ZONE[",i,"] Order[",j,"] ID:", orders[j].ID," Price:",orders[j].price.toString()," Amount:",amount.toString());
    }
  }

  console.log("Calculating sell orders");

  for (let i = zones1.length-1; i >= lowestActiveZone; i--) {
    console.log("ZONE", i);
    let orders = zones1[i].orders;
    let weightScalar = zones1[i].weightScalar;
    let minIndex = i == lowestActiveZone ? lowestActiveSellOrderIndex : 0;
    let numOrders = i == lowestActiveZone ? (orders.length - lowestActiveSellOrderIndex) : orders.length;
    let zonePerpAllocation = perpAvailable.mul(weightScalar).div(totalSellWeightedScalars);
    let amount = Div(zonePerpAllocation, Mul(new BN(numOrders), _10To18)).div(_10To18);
    for (let j = orders.length-1; j >= minIndex; j--) {
      orders[j].amount = amount;
      orders[j].status = SELL_STATUS;
      console.log("ZONE[",i,"] Order[",j,"] ID:", orders[j].ID," Price:",orders[j].price.toString()," Amount:",amount.toString());
    }
  }

  console.log("Placing, modifying, and deleting orders");

  for (let i = 0; i < zones1.length; i++) {
    for (let j = 0; j < zones1[i].orders.length; j++) {
      let oldOrder = zones0[i].orders[j];
      let newOrder = zones1[i].orders[j];
      if (oldOrder.status != newOrder.status && oldOrder.status != NULL_ORDER_STATUS) {
        // let txn = oldOrder.status == BUY_STATUS ? exchange.methods.deleteBuy(oldOrder.ID) : exchange.methods.deleteSell(oldOrder.ID);
        // let gas = await txn.estimateGas();
        // await txn.send({from: accounts[0], gas});
        if (newOrder.status != NULL_ORDER_STATUS) {
          // let txn1 = newOrder.status == BUY_STATUS ? 
          // exchange.methods.limitBuy(liquidityIndex, newOrder.price, newOrder.amount, 0) :
          // exchange.methods.limitSell(liquidityIndex, newOrder.price, newOrder.amount, 0);
          // let gas = await txn1.estimateGas();
          // let rec = await txn1.send({from: accounts[0], gas});
          // let eventVals = newOrder.status == BUY_STATUS ? rec.events.limitBuy.returnValues : rec.events.limitSell.returnValues;
          // newOrder.ID = eventVals.newID;
        }
      } else if (oldOrder.status != newOrder.status) {
          // let txn = newOrder.status == BUY_STATUS ? 
          // exchange.methods.limitBuy(liquidityIndex, newOrder.price, newOrder.amount, 0) :
          // exchange.methods.limitSell(liquidityIndex, newOrder.price, newOrder.amount, 0);
          // let gas = await txn.estimateGas();
          // let rec = await txn.send({from: accounts[0], gas});
          // let eventVals = newOrder.status == BUY_STATUS ? rec.events.limitBuy.returnValues : rec.events.limitSell.returnValues;
          // newOrder.ID = eventVals.newID;
      } else if (oldOrder.amount != newOrder.amount && (oldOrder.status != NULL_ORDER_STATUS || newOrder.status != NULL_ORDER_STATUS)) {
          // let txn = oldOrder.status == BUY_STATUS ? exchange.methods.modifyBuy(oldOrder.ID, newOrder.amount) : exchange.methods.modifySell(oldOrder.ID, newOrder.amount);
          // let gas = await txn.estimateGas();
          // await txn.send({from: accounts[0], gas});
      }
    }
  }

  for (let i = 0; i < zones1.length; i++) {
    console.log("ZONE", i);
    console.log("liquidity range prices", zones1[i].lower.toString(), "to", zones1[i].upper.toString());
    zones1[i].lower = zones1[i].lower.toString();
    zones1[i].upper = zones1[i].upper.toString();
    console.log("Zone weight scalar:", zones1[i].weightScalar.toString());
    zones1[i].weightScalar = zones1[i].weightScalar.toString();
    console.log(zones1[i].orders.length, "orders in zone", i);
    for (let j = 0; j < zones1[i].orders.length; j++) {
      console.log("\torder index:", j, "order ID:", zones1[i].orders[j].ID,"Price: ", zones1[i].orders[j].price.toString());
      zones1[i].orders[j].price = zones1[i].orders[j].price.toString();
      zones1[i].orders[j].amount = zones1[i].orders[j].amount.toString();
    }
  }

  console.log("\n-------------------------JSON OUTPUT----------------------\n");

  let jsonOut = JSON.stringify([zones1, OrderbookAddress, accounts[0]]);
  console.log(jsonOut);
  fs.writeFile(outFilename, jsonOut, 'utf8', () => {});
  
  }
  catch (err) {
    console.error(err);
    process.exit();
  }

};

let sleep = (seconds) => {
  let ms = seconds * 1000;
  return new Promise(resolve => setTimeout(resolve, ms));
};

let main = async () => {
  try {
    while (true) {
      console.log("-------------------------R-E-T-A-R-G-E-T-I-N-G---------------------");
      await retarget();
      await sleep(process.env.RETARGET_INTERVAL_SECONDS);
    }
  }
  catch(err) {
    console.error(err);
  }
};
main();