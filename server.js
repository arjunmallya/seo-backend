// server.js
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const auditRoutes = require("./routes/auditRoutes");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", auditRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
