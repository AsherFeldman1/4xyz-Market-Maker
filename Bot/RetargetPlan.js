const ENV = process.env;

let askPrices = [];
let bidPrices = [];
let askVolume = [];
let bidVolume = [];

const priceUpdateFrequency = 60;

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });