const fs = require("fs");
const https = require("https");

const express = require("express");
const app = express();

app.use(express.static("public"));

//get the keys we made with mkcert
const key = fs.readFileSync("./config/cert.key");
const cert = fs.readFileSync("./config/cert.crt");
const options = { key, cert };

//use those keys with the https module to have https
const httpsServer = https.createServer(options, app);

const socketio = require("socket.io");
const mediasoup = require("mediasoup");

const config = require("./config/config");
const createWorkers = require("./createWorkers");
const createWebRtcTransportBothKinds = require("./createWebRtcTransportBothKinds");

const io = socketio(httpsServer, {
  cors: [`https://localhost:${config.port}`],
});

let workers = null;
let router = null;
let theProducer = null;

const initMediaSoup = async () => {
  workers = await createWorkers();

  router = await workers[0].createRouter({
    mediaCodecs: config.routerMediaCodecs,
  });
};

initMediaSoup(); // start the mediasoup server/sfu

// SocketIo Listeners
io.on("connection", (socket) => {
  let thisClientProducerTransport = null;
  let thisClientProducer = null;

  let thisClientConsumerTransport = null;
  let thisClientConsumer = null;

  socket.on("getRtpCap", (ack) => {
    ack(router.rtpCapabilities);
  });

  socket.on("create-producer-transport", async (ack) => {
    const { transport, clientTransportParams } =
      await createWebRtcTransportBothKinds(router);
    thisClientProducerTransport = transport;
    ack(clientTransportParams); //what we send back to the client
  });

  socket.on("connect-transport", async (dtlsParameters, ack) => {
    try {
      await thisClientProducerTransport.connect(dtlsParameters);
      ack("success");
    } catch (error) {
      console.log(error);
      ack("error");
    }
  });

  socket.on("start-producing", async ({ kind, rtpParameters }, ack) => {
    try {
      thisClientProducer = await thisClientProducerTransport.produce({
        kind,
        rtpParameters,
      });
      theProducer = thisClientProducer;
      ack(thisClientProducer.id);
    } catch (error) {
      console.log(error);
      ack("error");
    }
  });

  socket.on("create-consumer-transport", async (ack) => {
    const { transport, clientTransportParams } =
      await createWebRtcTransportBothKinds(router);
    thisClientConsumerTransport = transport;
    ack(clientTransportParams); //what we send back to the client
  });

  socket.on("connect-consumer-transport", async (dtlsParameters, ack) => {
    try {
      await thisClientConsumerTransport.connect(dtlsParameters);
      ack("success");
    } catch (error) {
      console.log(error);
      ack("error");
    }
  });

  socket.on("consume-media", async ({rtpCapabilities}, ack) => {
    if (!theProducer) {
      ack("noProducer");
    } else if (!router.canConsume({producerId: theProducer.id, rtpCapabilities})){
      ack("cannotConsume");
    } else {
      thisClientConsumer = await thisClientConsumerTransport.consume({
        producerId: theProducer.id,
        rtpCapabilities,
        paused: true,
      });

      const consumerParams = {
        producerId: theProducer.id,
        id: thisClientConsumer.id,
        kind: thisClientConsumer.kind,
        rtpParameters: thisClientConsumer.rtpParameters,
      };
      ack(consumerParams);
    }
  })

 socket.on("unpauseConsumer", async (ack) => {
   await thisClientConsumer.resume();
 });
});

httpsServer.listen(config.port);
