const Web3 = require("web3");
const dotenv = require("dotenv");

const IOrderbookExchangeABI = require(__dirname + '/../Interface/IOrderBook.json');
const IERC20 = require(__dirname + '/../Interface/IERC20Upgradeable.json');
const IOracle = require(__dirname + '/../Interface/IPriceFeed.json');

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
const OracleAddress = process.env.ORACLE_ADDRESS;

const exchange = new web3.eth.Contract(IOrderbookExchangeABI.abi, OrderbookAddress);

const perp = new web3.eth.Contract(IERC20.abi, PerpAddress);

const usdc = new web3.eth.Contract(IERC20.abi, USDCAddress);

const oracle = new web3.eth.Contract(IOracle.abi, OracleAddress);

const liquidityIndex = process.env.LIQUIDITY_INDEX;

const minimumSpread = web3.utils.toBN(process.env.MINIMUM_SPREAD).mul(_10To18);

const usdcAvailable = web3.utils.toBN(process.env.USDC_BALANCE_AVAILABLE).mul(_10To18);

const perpAvailable = web3.utils.toBN(process.env.PERP_BALANCE_AVAILABLE).mul(_10To18);

const key = process.env.ORACLE_KEY;

const inFilename = __dirname + '/../JsonStorage/GeneratedPlan.json';
const outFilename = __dirname + '/../JsonStorage/LoadedPlan.json';

async function fileExists(filename) {
	return await new Promise((res, rej) => {
		fs.access(filename, fs.constants.F_OK, (err) => {
			if (err) res(false);
			else res(true);
		})
	});
}

async function getPrice() {
	let bestBid = await exchange.methods.getBuyHead(liquidityIndex);
	let bid = new BN(bestBid.price);
	let bestAsk = await exchange.methods.getSellHead(liquidityIndex);
	let ask = new BN(bestAsk.Price);
	if (ask == _0 || bid == _0) {
		return (await oracle.methods.getPrice(key));
	}
	let dividend = ask.mul(bid);
	let divisor = _2.mul(_10To18);
	return dividend.div(divisor);
}

(async function () {
	try {
	let zones;
	let OrderbookAddress;
	let accounts = await web3.eth.getAccounts();
	try {
		let inData = fs.readFileSync(inFilename, 'utf8');
		let mainAccount;
		[zones, OrderbookAddress, mainAccount] = JSON.parse(inData);
		if (mainAccount !== accounts[0]) {
			throw new Error("Please Configure The .env file to ensure the first account provided is "+accounts[0]+" the current main account is "+mainAccount);
		}
		// ----S-A-N-I-T-Y---C-H-E-C-K-S---- //
		if (await perp.methods.balanceOf(mainAccount) < perpAvailable) {
			throw new Error("Available perp balance set too high");
		}

		if (await usdc.methods.balanceOf(mainAccount) < usdcAvailable) {
			throw new Error("Available usdc balance set too high");	
		}

		console.log("----S-A-N-I-T-Y---C-H-E-C-K-S---P-A-S-S-E-D----");

	}
	catch(err) {
		console.error(err);
		process.exit();
	}

	for (let i = 0; i < zones.length; i++) {
		zones[i].lower = new BN("0x" + zones[i].lower.toString());
		zones[i].upper = new BN("0x" + zones[i].upper.toString());
		zones[i].weightScalar = new BN("0x" + zones[i].weightScalar.toString());
		for (let j = 0; j < zones[i].orders.length; j++) {
			zones[i].orders[j].price = new BN("0x" + zones[i].orders[j].price.toString());
			zones[i].orders[j].status = NULL_ORDER_STATUS;
			zones[i].orders[j].amount = _0;
			zones[i].orders[j].ID = '0';
		}
	}

	let Price = await getPrice();
	let lowerBoundSpread = Price.sub(minimumSpread.div(_2));
	let upperBoundSpread = Price.add(minimumSpread.div(_2));

	let highestActiveZone = -1; //BuyZone
	let lowestActiveZone = -1; //SellZone

	let totalBuyWeightedScalars = _0;
	let totalSellWeightedScalars = _0;

	for (let i = zones.length - 1; i >= 0; i--) {
		let lowestOrder = zones[i].orders[0].price;
		if (lowerBoundSpread.gte(lowestOrder) && highestActiveZone == -1) {
			highestActiveZone = i;
		}
		if (highestActiveZone != -1) {
			totalBuyWeightedScalars = totalBuyWeightedScalars.add(zones[i].weightScalar);
		}
	}

	for (let i = 0; i < zones.length; i++) {
		let orders = zones[i].orders;
		let highestOrder = orders[orders.length - 1].price;
		if (upperBoundSpread.lte(highestOrder) && lowestActiveZone == -1) {
			lowestActiveZone = i;
		}
		if (lowestActiveZone != -1) {
			totalSellWeightedScalars = totalSellWeightedScalars.add(zones[i].weightScalar);
		}
	}

	let pctWeightSuppliedLowestActiveZone;
	let pctWeightSuppliedHighestActiveZone;

	let buyAmtPctIncrease;
	let sellAmtPctIncrease;

	let highestActiveBuyOrderIndex = -2;
	let lowestActiveSellOrderIndex = -2;

	if (highestActiveZone > -1) {
		for (let i = 0; i < zones[highestActiveZone].orders.length; i++) {
			if (zones[highestActiveZone].orders[i].price.lte(lowerBoundSpread)) {
				continue;
			}
			else if (highestActiveBuyOrderIndex == -2) {
				highestActiveBuyOrderIndex = i-1;
			}
		}
	}

	if (lowestActiveZone > -1) {
		for (let i = zones[lowestActiveZone].orders.length - 1; i >= 0; i--) {
			if (zones[lowestActiveZone].orders[i].price.gte(upperBoundSpread)) {
				continue;
			}
			else if (lowestActiveSellOrderIndex == -2) {
				lowestActiveSellOrderIndex = i+1;
			}
		}
	}

	console.log("Placing buy orders");

	for (let i = 0; i <= highestActiveZone; i++) {
		console.log("ZONE", i);
		let orders = zones[i].orders;
		let numOrders = i == highestActiveZone ? highestActiveBuyOrderIndex+1 : orders.length;
		let weightScalar = zones[i].weightScalar;
		let zoneUSDCAllocation = usdcAvailable.mul(weightScalar).div(totalBuyWeightedScalars);
		let totalOrderValue = Div(zoneUSDCAllocation, Mul(new BN(numOrders), _10To18)).div(_10To18);
		console.log(totalOrderValue.toString());
		for (let j = 0; j < numOrders; j++) {
			let amount = Div(totalOrderValue, orders[j].price);
			orders[j].amount = amount;
			orders[j].status = BUY_STATUS;
			let txn = exchange.methods.limitBuy(liquidityIndex, orders[j].price, amount, 0);
			let gas = await txn.estimateGas();
			let rec = await txn.send({from: accounts[0], gas});
			let eventVals = rec.events.limitBuy.returnValues;
			orders[j].ID = eventVals.newID;
			console.log("ZONE[",i,"] Order[",j,"] ID:", orders[j].ID," Price:",orders[j].price.toString()," Amount:",amount.toString());
		}
	}

	console.log("Placing sell orders");

	for (let i = zones.length-1; i >= lowestActiveZone; i--) {
		console.log("ZONE", i);
		let orders = zones[i].orders;
		let weightScalar = zones[i].weightScalar;
		let minIndex = i == lowestActiveZone ? lowestActiveSellOrderIndex : 0;
		let numOrders = i == lowestActiveZone ? (orders.length - lowestActiveSellOrderIndex) : orders.length;
		let zonePerpAllocation = perpAvailable.mul(weightScalar).div(totalSellWeightedScalars);
		let amount = Div(zonePerpAllocation, Mul(new BN(numOrders), _10To18)).div(_10To18);
		for (let j = orders.length-1; j >= minIndex; j--) {
			orders[j].amount = amount;
			orders[j].status = SELL_STATUS;
			let txn = exchange.methods.limitSell(liquidityIndex, orders[j].price, amount, 0);
			let gas = await txn.estimateGas();
			let rec = await txn.send({from: accounts[0], gas});
			let eventVals = rec.events.limitSell.returnValues;
			orders[j].ID = eventVals.newID;
			console.log("ZONE[",i,"] Order[",j,"] ID:", orders[j].ID," Price:",orders[j].price.toString()," Amount:",amount.toString());
		}
	}

	for (let i = 0; i < zones.length; i++) {
		console.log("ZONE", i);
		console.log("liquidity range prices", zones[i].lower.toString(), "to", zones[i].upper.toString());
		zones[i].lower = zones[i].lower.toString();
		zones[i].upper = zones[i].upper.toString();
		console.log("Zone weight scalar:", zones[i].weightScalar.toString());
		zones[i].weightScalar = zones[i].weightScalar.toString();
		console.log(zones[i].orders.length, "orders in zone", i);
		for (let j = 0; j < zones[i].orders.length; j++) {
			console.log("\torder index:", j, "order ID:", zones[i].orders[j].ID,"Price: ", zones[i].orders[j].price.toString());
			zones[i].orders[j].price = zones[i].orders[j].price.toString();
			zones[i].orders[j].amount = zones[i].orders[j].amount.toString();
		}
	}

	console.log("\n-------------------------JSON OUTPUT----------------------\n");

	let jsonOut = JSON.stringify([zones, OrderbookAddress, accounts[0]]);
	console.log(jsonOut);
	fs.writeFile(outFilename, jsonOut, 'utf8', () => {});

	}
	catch (err) {
		console.error(err);
		process.exit();
	}

})();