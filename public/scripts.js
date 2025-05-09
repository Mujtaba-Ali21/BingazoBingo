// script.js

// Globals
let socket = null;
let device = null;
let localStream = null;

let producerTransport = null;
let producer = null;

let consumerTransport = null;
let consumer = null;

// Connect to socket.io server
const connectSocket = () => {
  socket = io("https://192.168.1.40:3030"); // Update IP as needed

  socket.on("connect", () => {
    console.log("Socket connected");
    publishButton.disabled = false;
    consumeButton.disabled = false;
  });
};

connectSocket(); // Connect immediately

// Device setup (runs automatically if needed)
const ensureDevice = async () => {
  if (!device) {
    device = new mediasoupClient.Device();
    const routerRtpCapabilities = await socket.emitWithAck("getRtpCap");
    await device.load({ routerRtpCapabilities });
  }
};

// ----------------------------------------
// Broadcaster flow
// ----------------------------------------

const publish = async () => {
  publishButton.disabled = true;

  await ensureDevice();

  // Get media
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error("getUserMedia error", err);
    return;
  }

  // Create transport
  const data = await socket.emitWithAck("create-producer-transport");

  producerTransport = device.createSendTransport(data);

  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      const res = await socket.emitWithAck("connect-transport", {
        dtlsParameters,
      });
      res === "success" ? callback() : errback();
    }
  );

  producerTransport.on(
    "produce",
    async ({ kind, rtpParameters }, callback, errback) => {
      const id = await socket.emitWithAck("start-producing", {
        kind,
        rtpParameters,
      });
      typeof id === "string" ? callback({ id }) : errback();
    }
  );

  const track = localStream.getVideoTracks()[0];
  producer = await producerTransport.produce({ track });

  broadcasterDisconnectButton.disabled = false;
};

const disconnectBroadcaster = async () => {
  try {
    await socket.emitWithAck("close-all");

    if (producerTransport) producerTransport.close();
    if (producer) producer.close();
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    producerTransport = null;
    producer = null;

    publishButton.disabled = false;
    broadcasterDisconnectButton.disabled = true;
    localVideo.srcObject = null;
  } catch (err) {
    console.error("Error during broadcaster disconnect", err);
  }
};

// ----------------------------------------
// Consumer flow
// ----------------------------------------

const consume = async () => {
  consumeButton.disabled = true;

  await ensureDevice();

  const data = await socket.emitWithAck("create-consumer-transport");

  consumerTransport = device.createRecvTransport(data);

  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      const res = await socket.emitWithAck("connect-consumer-transport", {
        dtlsParameters,
      });
      res === "success" ? callback() : errback();
    }
  );

  const consumerParams = await socket.emitWithAck("consume-media", {
    rtpCapabilities: device.rtpCapabilities,
  });

  if (consumerParams === "noProducer" || consumerParams === "cannotConsume") {
    console.log("No producer or cannot consume");
    return;
  }

  consumer = await consumerTransport.consume(consumerParams);

  const stream = new MediaStream([consumer.track]);
  remoteVideo.srcObject = stream;

  await socket.emitWithAck("unpauseConsumer");

  consumerDisconnectButton.disabled = false;
};

const disconnectConsumer = async () => {
  try {
    await socket.emitWithAck("close-consumer");

    if (consumerTransport) consumerTransport.close();
    if (consumer) consumer.close();

    consumerTransport = null;
    consumer = null;

    consumeButton.disabled = false;
    consumerDisconnectButton.disabled = true;
    remoteVideo.srcObject = null;
  } catch (err) {
    console.error("Error during consumer disconnect", err);
  }
};