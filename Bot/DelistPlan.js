const Web3 = require("web3");
const dotenv = require("dotenv");

const IOrderbookExchange = require(__dirname + '/../Interface/IOrderBook.json');

dotenv.config();

if (process.env.WEB3_HTTP_PROVIDER_URL === null || process.env.WEB3_HTTP_PROVIDER_URL === undefined) {
	console.error("Invalid Web3 http provider url", process.env.WEB3_HTTP_PROVIDER_URL);
	process.exit();
}

var web3 = new Web3(new Web3.providers.HttpProvider(process.env.WEB3_HTTP_PROVIDER_URL));
let accounts;

const fs = require('fs');
const BN = web3.utils.BN;
let Mul, Div, Pow, ApproxNthRoot;
({Mul, Div, Pow, ApproxNthRoot} = require('../helper/BBN.js').getFunctionality(BN));
const _0 = new BN(0);
const _1 = new BN(1);
const _2 = new BN(2);
const _10To18 = (new BN(10)).pow(new BN(18));

const inFilename = __dirname + '/../JsonStorage/LoadedPlan.json';

async function sendTxn(txn) {
	let gas = await txn.estimateGas();
	let rec = await txn.send({from: accounts[0], gas});
	return rec;
}

(async function(callback) {
	try {

	let zones;
	let OrderbookAddress;
	accounts = await web3.eth.getAccounts();
	try {
		let output = fs.readFileSync(inFilename, 'utf8');
		let mainAccount;
		[zones, OrderbookAddress, mainAccount] = JSON.parse(output);

		if (mainAccount !== accounts[0]) {
			throw new Error("Please Configure The .env file to ensure the first account provided is "+mainAccount+" the current main account is "+accounts[0]);
		}
	}
	catch(err) {
		console.error(err);
		process.exit();
	}

	let exchange = new web3.eth.Contract(IOrderbookExchange.abi, OrderbookAddress);4

	for (let i = 0; i < zones.length; i++) {
		zones[i].lower = new BN(zones[i].lower);
		zones[i].upper = new BN(zones[i].upper);
		zones[i].weightScalar = new BN(zones[i].weightScalar);
		for (let j = 0; j < zones[i].orders.length; j++) {
			zones[i].orders[j].price = new BN(zones[i].orders[j].price);
			zones[i].orders[j].amount = new BN(zones[i].orders[j].amount);
			if (zones[i].orders[j].status == "LimitBuy") {
				// await sendTxn(exchange.methods.deleteBuy(zones[i].orders[j].ID));
				console.log("removed buy, ID: ", zones[i].orders[j].ID);
			} else if (zones[i].orders[j].status == "LimitSell") {
				// await sendTxn(exchange.methods.deleteSell(zones[i].orders[j].ID));
				console.log("removed sell, ID: ", zones[i].orders[j].ID);
			}
		}
	}

	fs.unlinkSync(inFilename);
	console.log("deleted file " + inFilename);

	}
	catch (err) {
		console.error(err);
	}
})();