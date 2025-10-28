const express = require("express");
const http = require('http')
const app = express();


const PORT = 5000;

const connectDB = require('./database.js')

connectDB();

const server = http.createServer(app);

server.listen(PORT, () => {
    console.log(`Server is listening at the port ${PORT}`)
})