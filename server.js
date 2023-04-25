const express = require("express");

const app = express();

const auth = require("./modules/auth");

const contact = require("./modules/contact");
const chat = require("./modules/chat");

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

const http = require("http").createServer(app);

var mongodb = require("mongodb");

var MongoClient = mongodb.MongoClient;

var ObjectId = mongodb.ObjectId;

const expressFormidable = require("express-formidable");

app.use(expressFormidable());

const fileSystem = require("fs");

app.use("/uploads/profiles", express.static(__dirname + "/uploads/profiles"));

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

const jwtSecret = "jwtSecret1234567890";

const socketIO = require("socket.io")(http, {
  cors: {
    origin: ["http://localhost:8080", "http://172.20.10.4:8080"],
  },
});

const apiURL = "http://localhost:3000";
const mainURL = "http://localhost:8080";

global.users = [];

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

    socketIO.on("connection", function (socket) {
      socket.on("connected", function (email) {
        global.users[email] = socket.id;
      });
    });

    contact.init(app, express);
    chat.init(app, express);
    chat.socketIO = socketIO;

    app.post("/updateProfile", auth, async function (request, result) {
      const user = request.user;
      const name = request.fields.name;
      const picture = request.files.picture;
      const previousPicture = user.picture;

      let picturePath = "";
      if (picture != null && picture.size > 0) {
        if (picture.type == "image/jpeg" || picture.type == "image/png") {
          picturePath =
            "uploads/profiles/" + user.email.split(".")[0] + "-" + picture.name;

          fileSystem.readFile(picture.path, function (error, data) {
            if (error) {
              console.error(error);
              return;
            }

            fileSystem.writeFile(picturePath, data, function (error) {
              if (error) {
                console.error(error);
                return;
              }

              if (previousPicture) {
                fileSystem.unlink(previousPicture, function (error) {
                  if (error) {
                    console.error(error);
                  }
                });
              }
            });

            fileSystem.unlink(picture.path, function (error) {
              if (error) {
                console.error(error);
              }
            });
          });
        }
      }

      await db.collection("users").findOneAndUpdate(
        {
          _id: user._id,
        },
        {
          $set: {
            name: name,
            picture: picturePath,
          },
        }
      );

      user.name = name;
      user.picture = picturePath;

      delete user.password;
      delete user.accessToken;
      delete user.createdAt;
      delete user.verifiedAt;
      delete user.verificationCode;
      delete user.resetToken;

      result.json({
        status: "success",
        message: "Profile has been updated.",
        user: user,
      });
    });

    app.post("/deleteNotification", auth, async function (request, result) {
      const user = request.user;

      const _id = request.fields._id;

      await db.collection("users").findOneAndUpdate(
        {
          _id: user._id,
        },
        {
          $pull: {
            notifications: {
              _id: ObjectId(_id),
            },
          },
        }
      );

      result.json({
        status: "success",
        message: "Notification has been removed.",
      });
    });

    app.post(
      "/markNotificationsAsRead",
      auth,
      async function (request, result) {
        const user = request.user;

        await db.collection("users").findOneAndUpdate(
          {
            _id: user._id,
          },
          {
            $set: {
              "notifications.$[].isRead": true,
            },
          }
        );

        result.json({
          status: "success",
          message: "Notification has been marked as read.",
        });
      }
    );

    app.post("/search", auth, async function (request, result) {
      // get authenticated user
      const user = request.user;

      const query = request.fields.query;

      const contacts = [];

      for (let a = 0; a < user.contacts.length; a++) {
        if (
          user.contacts[a].name.includes(query) ||
          user.contacts[a].email.includes(query)
        ) {
          contacts.push(user.contacts[a]);
        }
      }

      result.json({
        status: "success",
        message: "Data has been fetched.",
        contacts: contacts,
      });
    });

    app.post("/logout", auth, async function (request, result) {
      const user = request.user;

      await db.collection("users").findOneAndUpdate(
        {
          _id: user._id,
        },
        {
          $set: {
            accessToken: "",
          },
        }
      );

      result.json({
        status: "success",
        message: "Logout successfully.",
      });
    });

    app.post("/getUser", auth, async function (request, result) {
      const user = request.user;

      let unreadNotifications = 0;
      if (user.notifications) {
        for (let a = 0; a < user.notifications.length; a++) {
          if (!user.notifications[a].isRead) {
            unreadNotifications++;
          }
        }
      }

      result.json({
        status: "success",
        message: "Data has been fetched.",
        user: user,

        unreadNotifications: unreadNotifications,
      });
    });

    app.post("/login", async function (request, result) {
      const email = request.fields.email;
      const password = request.fields.password;

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

      bcrypt.compare(password, user.password, async function (err, res) {
        if (res === true) {
          const accessToken = jwt.sign(
            {
              userId: user._id.toString(),
            },
            jwtSecret
          );

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

      /*bcrypt.compare(password, user.password, async function (error, isVerify) {
                if (isVerify) {

                    // generate JWT of user
                    const accessToken = jwt.sign({
                        "userId": user._id.toString()
                    }, jwtSecret);

                    // update JWT of user in database
                    await db.collection("users").findOneAndUpdate({
                        "email": email
                    }, {
                        $set: {
                            "accessToken": accessToken
                        }
                    });

                    result.json({
                        status: "success",
                        message: "Login successfully.",
                        accessToken: accessToken
                    });

                    return;
                }

                result.json({
                    "status": "error",
                    "message": "Password is not correct."
                });
            });*/
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

      bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(password, salt, async function (err, hash) {
          // insert in database
          await db.collection("users").insertOne({
            name: name,
            email: email,
            password: hash,
            picture: "",
            accessToken: "",
            contacts: [],
            notifications: [],
            verifiedAt: new Date().getTime(),
            resetToken: "",
            createdAt: createdAt,
          });

          result.status(200).json({
            status: "success",
            message: "User has been signed up.",
          });
        });
      });

      /*bcrypt.hash(password, 10, async function (error, hash) {

                // insert in database
                await db.collection("users").insertOne({
                    name: name,
                    email: email,
                    password: hash,
                    accessToken: "",
                    contacts: [],
                    notifications: [],
                    createdAt: createdAt
                });

                result.status(200).json({
                    status: "success",
                    message: "User has been signed up."
                });
            });*/
    });
  });
});
