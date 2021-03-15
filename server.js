const app = require("express")();
const http = require("http").Server(app);
var middleware = require("socketio-wildcard")();
require("dotenv").config();
const corsConfig = {
  cors: {
    origin: process.env.FRONT_API,
    methods: ["GET", "POST"],
    credentials: true,
  },
};
const io = require("socket.io")(http, corsConfig);

const port = process.env.PORT || 3005;

const TIME_TO_CLEAR_SESSION_IN_SECONDS = 120;

const dataBase = {};

let setTimeOuts = [];

const generateNewTimeout = (id, socket) => {
  const timeOutId = dataBase[id]["timeoutArrayId"];

  clearTimeout(setTimeOuts[timeOutId]);

  let timeoutToClearSession = setTimeout(() => {
    socket.emit(`session-clear-${id}`);
    delete dataBase[id];
    setTimeOuts = setTimeOuts.filter((_, index) => index !== timeOutId);
  }, TIME_TO_CLEAR_SESSION_IN_SECONDS * 1000);

  setTimeOuts[timeOutId] = timeoutToClearSession;
};

io.use(middleware);

io.on("connection", (socket) => {
  // Generate new timeout to every socket interaction based on id
  socket.on("*", (socketData) => {
    const {
      data: [, clientData],
    } = socketData;
    const { id } = clientData;

    if (dataBase[id]) {
      generateNewTimeout(id, socket);
    }
  });

  socket.on("canIEnter", ({ username, id }, callback) => {
    if (!dataBase[id]) {
      dataBase[id] = {};
      dataBase[id]["points"] = {};
      dataBase[id]["choice"] = {};
      dataBase[id]["response"] = {};
      dataBase[id]["users"] = [];
      dataBase[id]["timeoutArrayId"] = setTimeOuts.push(null) - 1;
    }

    const users = dataBase[id]["users"];

    if (users.length < 2 || users.includes(username)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  socket.on("sendNick", ({ username, id }) => {
    dataBase[id]["points"][username] = 0;
    dataBase[id]["choice"][username] = "";
    dataBase[id]["response"][username] = null;

    const nameIsNotSetted = !dataBase[id]["users"].includes(username);

    if (nameIsNotSetted) {
      dataBase[id]["users"].push(username);
    }

    const users = dataBase[id]["users"];

    io.emit(`setUsers-${id}`, users);

    if (users.length === 2) {
      const points = dataBase[id]["points"];
      io.emit(`setPoints-${id}`, points);
      io.emit(`start-${id}`, true);
    }
  });

  socket.on("getChoice", ({ id }, callback) => {
    const userChoice = dataBase[id]["choice"];

    callback(userChoice);
  });

  socket.on("setParOrImpar", (data) => {
    const { username, par, impar, id } = data;

    const otherUser = dataBase[id]["users"].find((user) => user !== username);

    if (par) {
      dataBase[id]["choice"][username] = "par";
      dataBase[id]["choice"][otherUser] = "impar";
      io.emit(`setImpar-${id}`, username);
    }

    if (impar) {
      dataBase[id]["choice"][username] = "impar";
      dataBase[id]["choice"][otherUser] = "par";
      io.emit(`setPar-${id}`, username);
    }
  });

  socket.on("sendUserResponse", (data) => {
    const { username, response, id } = data;

    dataBase[id]["response"][username] = response;

    let bothHaveResponded = true;
    for (const [, eachResponse] of Object.entries(dataBase[id]["response"])) {
      if (eachResponse === null) {
        bothHaveResponded = false;
        break;
      }
    }

    if (
      Object.keys(dataBase[id]["response"]).length === 2 &&
      bothHaveResponded
    ) {
      let calc = 0;

      for (const eachResponse of Object.values(dataBase[id]["response"])) {
        calc += eachResponse;
      }
      calc = calc % 2 === 0 ? "par" : "impar";

      for (const nick of Object.keys(dataBase[id]["response"])) {
        dataBase[id]["response"][nick] = null;
      }

      let winner = "";

      for (const [name, choice] of Object.entries(dataBase[id]["choice"])) {
        if (choice === calc) {
          winner = name;
        }
      }

      dataBase[id]["points"][winner] += 1;

      const points = dataBase[id]["points"];

      io.emit(`setPoints-${id}`, points);
      io.emit(`winner-${id}`, winner);
    } else {
      io.emit(`wait-${username}`);
    }
  });
});

http.listen(port, () => {
  console.log(`listening on *:${port}`);
});
