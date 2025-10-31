import bodyParser from "body-parser";
import express from "express";
const net = require('net');
const WebSocket = require('ws');
const http = require('http');

const logcb = (...args) => console.log.bind(console, new Date().toISOString(), ...args);
const errcb = (...args) => console.error.bind(console, new Date().toISOString(), ...args);

const app = express();
const port = process.env.PORT || 3333;

app.use(bodyParser.json());
app.use(bodyParser.raw({ type: "application/vnd.custom-type" }));
app.use(bodyParser.text({ type: "text/html" }));

app.get("/", async (req, res) => {
  res.json({ Hello: "World" });
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server }, logcb('WebSocket server is listening on port:', port));

wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    const clientPort = req.socket.remotePort;
    logcb('New connection established from', `${clientIP}:${clientPort}`)();

    ws.once('message', (msg) => {
        let i = msg.readUInt8(17) + 19;
        const targetPort = msg.readUInt16BE(i);
        i += 2;

        const ATYP = msg.slice(i, i += 1).readUInt8();
        const host = ATYP === 1 ? msg.slice(i, i += 4).join('.') : // IPv4
            (ATYP === 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) : // Domain
                (ATYP === 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : '')); // IPv6

        logcb('Resolved target', `Host: ${host}, Port: ${targetPort}`)();

        ws.send(Buffer.from([msg[0], 0]));

        const duplex = WebSocket.createWebSocketStream(ws);

        const socket = net.connect({ host, port: targetPort }, function () {
            logcb('Connected to target', `Host: ${host}, Port: ${targetPort}`)();
            this.write(msg.slice(i));

            duplex.on('error', errcb('Duplex Stream Error:'))
                .pipe(this)
                .on('error', errcb('Target Socket Error:'))
                .pipe(duplex);
        });

        socket.on('error', errcb('Connection Error:', { host, port: targetPort }));
    }).on('error', errcb('WebSocket Error:'));

    ws.on('close', logcb('Connection closed with', `${clientIP}:${clientPort}`));
});

server.listen(port, () => {
    logcb('Server is listening on port:', port)();
});
