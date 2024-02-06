const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors')
require('dotenv').config()

const app = express();

app.use(
    cors({
      origin: "*",
    })
);
const server = http.createServer(app);
const io = socketIO(server,{
    cors: {
      origin: "*",
    },
  });


const PORT = process.env.PORT || 4000;
const KEEPALIVE_TIMEOUT = 30000; // 30 seconds

let peers = new Map();
let sessions = new Map();
let rooms = new Map();

app.get('/', (req, res) => {
    res.status(200).send('OK');
});
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});



io.on('connection', (socket) => {
    let peerId = null;
    let peerStatus = null;

    console.log('New connection:', socket.id);

    socket.on('HELLO', (uid) => {
        if (!uid || peers.has(uid) || /\s/.test(uid)) {
            socket.disconnect(true);
            return;
        }
        peerId = uid;
        peers.set(peerId, socket);
        console.log('Registered peer:', peerId);

        // Send back a HELLO
        socket.emit('HELLO');

        socket.on('disconnect', () => {
            console.log('Disconnected peer:', peerId);
            removePeer(peerId);
        });
    });

    socket.on('SESSION', (calleeId) => {
        if (!calleeId || !peers.has(calleeId) || peerStatus !== null) {
            return;
        }
        peerStatus = 'session';
        sessions.set(peerId, calleeId);
        sessions.set(calleeId, peerId);
        console.log('Session from', peerId, 'to', calleeId);
        socket.emit('SESSION_OK');
    });

    socket.on('ROOM', (roomId) => {
        if (!roomId || /\s/.test(roomId)) {
            return;
        }
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(peerId);
        peerStatus = roomId;
        console.log('Peer', peerId, 'joined room', roomId);
        socket.emit('ROOM_OK', Array.from(rooms.get(roomId)));
    });

    socket.on('ROOM_PEER_MSG', ({ peerId: otherId, msg }) => {
        if (!otherId || !peers.has(otherId) || peerStatus !== roomId) {
            return;
        }
        console.log('Received message from', peerId, 'to', otherId, ':', msg);
        peers.get(otherId).emit('ROOM_PEER_MSG', { peerId, msg });
    });

    socket.on('ROOM_PEER_LIST', () => {
        if (peerStatus !== roomId) {
            return;
        }
        const roomPeers = Array.from(rooms.get(roomId)).filter(id => id !== peerId);
        console.log('Sending room peer list to', peerId, ':', roomPeers);
        socket.emit('ROOM_PEER_LIST', roomPeers);
    });
});

function removePeer(peerId) {
    peers.delete(peerId);
    if (sessions.has(peerId)) {
        const otherId = sessions.get(peerId);
        sessions.delete(peerId);
        sessions.delete(otherId);
        console.log('Cleaned up session between', peerId, 'and', otherId);
        removePeer(otherId);
    }
    if (rooms.has(peerId)) {
        const roomId = rooms.get(peerId);
        rooms.get(roomId).delete(peerId);
        console.log('Peer', peerId, 'left room', roomId);
    }
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
