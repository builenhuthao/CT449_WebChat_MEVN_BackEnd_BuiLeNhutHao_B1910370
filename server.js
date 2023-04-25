const express = require("express");

const app = express();

const http = require("http").createServer(app);

var mongodb = require("mongodb");

var MongoClient = mongodb.MongoClient;

var ObjectId = mongodb.ObjectId;

const expressFormidable = require("express-formidable");
app.use(expressFormidable());

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const jwtSecret = "jwtSecret1234567890";

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type,Authorization"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

http.listen(process.env.PORT || 3000, function () {
  console.log("Server has been started at: " + (process.env.PORT || 3000));

  MongoClient.connect("mongodb://127.0.0.1:27017", function (error, client) {
    if (error) {
      console.error(error);
      return;
    }
    db = client.db("mevn_chat_app");
    global.db = db;
    console.log("Database connected");

    app.post("/login", async function (request, result) {
      // get values from login form
      const email = request.fields.email;
      const password = request.fields.password;

      // check if email exists
      const user = await db.collection("users").findOne({
        email: email,
      });

      if (user == null) {
        result.json({
          status: "error",
          message: "Email does not exists.",
        });
        return;
      }

      if (user.verifiedAt == null) {
        result.json({
          status: "error",
          message: "Your email is not verified. Kindly verify your account.",
        });
        return;
      }

      // check if password is correct
      bcrypt.compare(password, user.password, async function (error, isVerify) {
        if (isVerify) {
          // generate JWT of user
          const accessToken = jwt.sign(
            {
              userId: user._id.toString(),
            },
            jwtSecret
          );

          // update JWT of user in database
          await db.collection("users").findOneAndUpdate(
            {
              email: email,
            },
            {
              $set: {
                accessToken: accessToken,
              },
            }
          );

          result.json({
            status: "success",
            message: "Login successfully.",
            accessToken: accessToken,
          });

          return;
        }

        result.json({
          status: "error",
          message: "Password is not correct.",
        });
      });
    });

    app.post("/registration", async function (request, result) {
      const name = request.fields.name;
      const email = request.fields.email;
      const password = request.fields.password;
      const createdAt = new Date().getTime();

      if (!name || !email || !password) {
        result.json({
          status: "error",
          message: "Please enter all values.",
        });
        return;
      }

      var user = await db.collection("users").findOne({
        email: email,
      });

      if (user != null) {
        result.json({
          status: "error",
          message: "Email already exists.",
        });
        return;
      }

      bcrypt.hash(password, 10, async function (error, hash) {
        // insert in database
        await db.collection("users").insertOne({
          name: name,
          email: email,
          password: hash,
          accessToken: "",
          contacts: [],
          notifications: [],
          createdAt: createdAt,
        });

        result.status(200).json({
          status: "success",
          message: "User has been signed up.",
        });
      });
    });
  });
});
