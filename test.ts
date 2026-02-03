import { Elysia } from "elysia";

new Elysia()
  .ws("/ws", {
    open(ws) {
      console.log("ws opened");
    },
    close(ws) {
      console.log("ws closed");
    },
    message(ws, message) {
      console.log("message", message);
      ws.send(message);
    },
  })
  .listen(3001);
