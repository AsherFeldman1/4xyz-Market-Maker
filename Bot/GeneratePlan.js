const Web3 = require("web3");
const dotenv = require("dotenv");

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

const OrderbookAddress = process.env.ORDERBOOK_ADDRESS;

const numOrdersByZone = [
	new BN("5"),
	new BN("3"),
	new BN("4")	
];

const zoneBorders = [
	_2.mul(_10To18),
	new BN(3).mul(_10To18),
	new BN(4).mul(_10To18),
	new BN(5).mul(_10To18)
];

const zoneWeightScalars = [
	new BN("1"),
	new BN("5"),
	new BN("1")
];

const outFilename = __dirname + '/../JsonStorage/GeneratedPlan.json';

async function fileExists(filename) {
	return await new Promise((res, rej) => {
		fs.access(filename, fs.constants.F_OK, (err) => {
			if (err) res(false);
			else res(true);
		})
	});
}

(async function() {

	try {
		if (await fileExists(outFilename) && fs.readFileSync(outFilename).length > 0) {
			throw new Error("Out File "+outFilename+" must be empty to execute the LoadPlan script");
		}
	} catch (err) {
		console.error(err);
		process.exit();
	}


	// Sanity Checks

	if (numOrdersByZone.length + 1 != zoneBorders.length) {
		throw new Error("zoneBorders must be one larget than numOrdersByZone");
	}

	if (numOrdersByZone.length != zoneWeightScalars.length) {
		throw new Error("Implied number of zones by numOrdersByZone must be same as length of zoneWeightScalars");
	}

	for (let i = 0; i < numOrdersByZone.length; i++) {
		if (numOrdersByZone[i].lt(_1)) {
			throw new Error("Each zone must have at least one order");
		}

		if (zoneBorders[i].gte(zoneBorders[i+1])) {
			throw new Error("Borders must be ascending");
		}
	}

	let account = web3.eth.accounts.privateKeyToAccount(process.env.ETHEREUM_ADMIN_PRIVATE_KEY);
	let accounts = await web3.eth.getAccounts();
	if (web3.eth.defaultAccount === null || typeof(web3.eth.defaultAccount) === "undefined") {
		console.log('setting default account');
		web3.eth.defaultAccount = accounts[0];
	}
	let defaultAccount = await web3.eth.defaultAccount;
	if (defaultAccount !== process.env.ETHEREUM_ADMIN_ACCOUNT) {
		console.error("default account was not the same as env.ETHEREUM_ADMIN_ACCOUNT");
		process.exit();
	}

	console.log("----P-A-S-S-E-D---S-A-N-I-T-Y---C-H-E-C-K-S----");

	const zones = (() => {
		let ret = new Array(numOrdersByZone.length);
		for (let i = 0; i < ret.length; i++) {
			let lower = zoneBorders[i];
			let upper = zoneBorders[i+1];

			let numOrders = numOrdersByZone[i];
			if (numOrders.lt(_1)) {
				let zone = {
					lower,
					upper,
					orders: [],
					weightScalar: _0
				}
				ret[i] = zone;
				continue;
			}
			let orders = new Array(numOrders);
			let weightScalar = zoneWeightScalars[i];

			for (let j = 0; j < numOrders; j++) {
				let bigJ = new BN(j);
				let numerator =  ApproxNthRoot(upper.pow(_2.mul(bigJ).add(_1)), _2.mul(numOrders));
				let denominator =  ApproxNthRoot(lower.pow(_2.mul(bigJ).add(_1)), _2.mul(numOrders));
				let res = Div(numerator, denominator);
				let price = Mul(res, lower);
				let order = {
					price
				}
				orders[j] = order;
			}
			let zone = {
				lower,
				upper,
				orders,
				weightScalar
			}
			ret[i] = zone;
		}
		return ret;
	})();

	let objOut = [zones, OrderbookAddress, accounts[0]];

	let jsonOut = JSON.stringify(objOut);

	fs.writeFile(outFilename, jsonOut, 'utf8', () => {});

	console.log(jsonOut);
})();
