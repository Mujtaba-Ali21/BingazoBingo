// Globals
let socket = null;
let device = null;
let localStream = null;

let producerTransport = null;
let producer = null;

let consumerTransport = null;
let consumer = null;

// Connect To The Server
const initConnect = () => {
  socket = io("https://localhost:3030");
  connectButton.innerHTML = "Connecting...";
  connectButton.disabled = true;
  addSocketListeners();
};

const deviceSetup = async () => {
  device = new mediasoupClient.Device();
  const routerRtpCapabilities = await socket.emitWithAck("getRtpCap");
  await device.load({ routerRtpCapabilities });
  deviceButton.innerHTML = "Device Created";
  deviceButton.disabled = true;
  createProdButton.disabled = false;
  createConsButton.disabled = false;
  disconnectButton.disabled = false;
};

const createProducer = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch (error) {
    console.log("GUM Error", error);
  }

  // Ask The Socket.io (Signaling) For Transport Information
  const data = await socket.emitWithAck("create-producer-transport");

  const { id, iceParameters, iceCandidates, dtlsParameters } = data;

  const transport = device.createSendTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });

  producerTransport = transport;

  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      const resp = await socket.emitWithAck("connect-transport", {
        dtlsParameters,
      });

      if (resp == "success") {
        callback();
      } else if (resp == "error") {
        errback();
      }
    }
  );

  producerTransport.on("produce", async (parameters, callback, errback) => {
    const { kind, rtpParameters } = parameters;
    const resp = await socket.emitWithAck("start-producing", {
      kind,
      rtpParameters,
    });

    if (resp == "error") {
      errback();
    } else {
      callback({ id: resp });
    }

    publishButton.disabled = true;
    createConsButton.disabled = false;
  });

  createProdButton.disabled = true;
  publishButton.disabled = false;
};

const publish = async () => {
  const track = localStream.getVideoTracks()[0];
  producer = await producerTransport.produce({ track });
};

const createConsumer = async () => {
  // Ask The Socket.io (Signaling) For Transport Information
  const data = await socket.emitWithAck("create-consumer-transport");

  const { id, iceParameters, iceCandidates, dtlsParameters } = data;

  const transport = device.createRecvTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });

  consumerTransport = transport;

  consumerTransport.on("connectionstatechange", (state) => {
    console.log("....Connection State Change....");
    console.log(state);
  });
  consumerTransport.on("icegatheringstatechange", (state) => {
    console.log("....ICE Gathering Change....");
    console.log(state);
  });

  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      const resp = await socket.emitWithAck("connect-consumer-transport", {
        dtlsParameters,
      });

      if (resp == "success") {
        callback();
      } else if (resp == "error") {
        errback();
      }
    }
  );

  createConsButton.disabled = true;
  consumeButton.disabled = false;
};

const consume = async () => {
  const consumerParams = await socket.emitWithAck("consume-media", {
    rtpCapabilities: device.rtpCapabilities,
  });

  if (consumerParams == "noProducer") {
    console.log("there is no producer");
  } else if (consumerParams == "cannotConsume") {
    console.log("cannot consume");
  } else {
    consumer = await consumerTransport.consume(consumerParams);
    const { track } = consumer;

    console.log("The Track Is Live:", track);
    track.addEventListener("ended", () => {
      console.log("Track has ended");
    });

    track.onmute = (event) => {
      console.log("Track has muted");
    };

    track.onunmute = (event) => {
      console.log("Track has unmuted");
    };

    remoteVideo.srcObject = new MediaStream([track]);
    await socket.emitWithAck("unpauseConsumer");
  }
};

const disconnect = async () => {
  const closedResp = await socket.emitWithAck("close-all");
  producerTransport?.close();
  consumerTransport?.close();

  if (closedResp == "errorClosing") {
    console.log("error closing");
  }
};

function addSocketListeners() {
  socket.on("connect", () => {
    connectButton.innerHTML = "Connected";
    deviceButton.disabled = false;
  });
}
