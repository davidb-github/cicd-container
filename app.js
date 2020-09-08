const express = require("express");
const app = express();

app.get("/", (req, res) => res.send("Hello from AWS Elastic Container Service - demo1!"));

app.get("/health", (req, res) => {
  res.status(200);
  res.send("healthy");
});

app.listen(3000, () => {
  console.log("App listening on port 3000!");
});
