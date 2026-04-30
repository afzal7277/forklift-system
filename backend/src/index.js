require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initDb } = require('./db');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'Forklift system server running' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/forklifts', require('./routes/forklifts'));
app.use('/api/cells', require('./routes/cells'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/config', require('./routes/config'));
app.use('/api/devices', require('./routes/devices'));

app.set('io', io);

require('./socket/handler')(io);

const PORT = process.env.PORT || 3000;

initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Server running on port ' + PORT);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

module.exports = { app, io };