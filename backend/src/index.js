require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const db = require('./db');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'Forklift system server running' });
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/forklifts', require('./routes/forklifts'));
app.use('/api/cells', require('./routes/cells'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/config', require('./routes/config'));

// Attach io to app so routes can access it
app.set('io', io);

// Socket handler
require('./socket/handler')(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
  console.log('Accepting connections on all network interfaces');
});

module.exports = { app, io };
