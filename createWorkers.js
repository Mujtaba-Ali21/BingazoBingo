const os = require("os"); 
const mediasoup = require("mediasoup");
const totalThreads = os.cpus().length; //maximum number of allowed workers
const config = require("./config/config");

const createWorkers = () =>
  new Promise(async (resolve, reject) => {
    let workers = [];
    for (let i = 0; i < totalThreads; i++) {
      const worker = await mediasoup.createWorker({
        //useful for firewall or networking rules
        rtcMinPort: config.workerSettings.rtcMinPort,
        rtcMaxPort: config.workerSettings.rtcMaxPort,
        logLevel: config.workerSettings.logLevel,
        logTags: config.workerSettings.logTags,
      });
      worker.on("died", () => {
        console.log("Worker has died");
        process.exit(1); //kill the node program
      });
      workers.push(worker);
    }

    resolve(workers);
  });

module.exports = createWorkers;
