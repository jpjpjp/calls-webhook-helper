/*
 * authorization-db.js
 * 
 * This module maintains info about users who have authorized this app
 * to register webhooks and post messages on their behalf
 * 
 * JP Shipherd 6/11/2018
 */

// Keep track about stuff I learn from the users in a hosted Mongo DB
var mongo_client = require('mongodb').MongoClient;
var mConfig = {};
if ((process.env.MONGO_USER) && (process.env.MONGO_PW) &&
  (process.env.MONGO_URL) && (process.env.MONGO_DB)) {
  mConfig.mongoUser = process.env.MONGO_USER;
  mConfig.mongoPass = process.env.MONGO_PW;
  mConfig.mongoUrl = process.env.MONGO_URL;
  mConfig.mongoDb = process.env.MONGO_DB;
} else {
  // sets config and the mongo DB vars for dev instances.
  console.error('Unable to read DB Config from environment.  Will look for a local config');
  mConfig = require("./mongo.json");
}
var mongo_collection_name ="AuthUserData";
var mongoUri = 'mongodb://'+mConfig.mongoUser+':'+mConfig.mongoPass+'@'+mConfig.mongoUrl+mConfig.mongoDb+'?ssl=true&replicaSet=Cluster0-shard-0&authSource=admin';

class AuthorizationDB {
  constructor() {
    this.mCollection = {};
    mongo_client.connect(mongoUri)
      .then((db) => db.collection(mongo_collection_name))
      .then((collection) => {
        this.mCollection = collection;
      })
      .catch((e) => console.error('Error connecting to Mongo '+ e.message));
  }

  /**
   * Saves an instance of the authInfo object in a db.
   * We create an array of authInfo objet for each space where
   * users have authorized us
   *
   * @function saveAuthInfo
   * @param {Object} authInfo - The authInfo instance to store
   *
   */
  saveAuthInfo(authInfo) {
    let self = this;
    return new Promise(function(resolve, reject) {
      console.log('Updating authorizations for space: ' + authInfo.roomTitle);
      if (self.mCollection) {
        self.mCollection.findOne({'_id': authInfo.roomId})
          .then((reply) => {
            if (reply !== null) {
              console.log('There is already at least one authInfo object for this space');
              if ((!reply._id) && (reply.authInfoArray.length)) {
                reject(new Error('Authorized Users DB has invalid info.'));
              }
              // If this user already exists in this array
              // Overwrite that element with the new info
              let i= reply.authInfoArray.findIndex(u => u.person.id === authInfo.person.id);
              if (i != -1) {
                reply.authInfoArray[i] = authInfo;
                console.log('Updating info for ' + authInfo.person.displayName);
              } else {
                reply.authInfoArray.push(authInfo);
                console.log('Adding info for new user ' + authInfo.person.displayName);
              }
              return self.mCollection.replaceOne({'_id': reply._id}, reply, { upsert : true });
            } else {
              console.log(authInfo.person.displayName + " is the first authorized user for this room");
              let authInfoArray = [];
              authInfoArray.push(authInfo);
              let authArrayObject = {
                '_id': authInfo.roomId,
                'authInfoArray': authInfoArray 
              };
              // TODO WOuld be nice to figure out how to post instructions from here...
              return self.mCollection.insert(authArrayObject, {w:1});
            }
          })
          .then(() => resolve(authInfo))
          .catch((e) => reject(e));
      } else {
        reject(new Error("Database initiatlization did not complete."));
      }
    });
  }

  /**
   * Gets the authorization info for users in a room
   *
   * @function getAuthorizedUsers
   * @param {string} roomId - The space to check for authorized users
   *
   */
  getAuthorizedUsers(roomId) {
    let self = this;
    return new Promise(function(resolve, reject) {
      if (self.mCollection) {
        self.mCollection.findOne({'_id': roomId})
          .then((reply) => {
            if ((reply !== null) && (reply.authInfoArray.length)) {
              if (!reply.authInfoArray[0].access_token) {
                throw new Error('Authorized Users DB has invalid info for space: ' + 
                                authInfo.roomId);
              }
              console.log('Found ' + reply.authInfoArray.length + 
                          ' Authorized Users in Space: ' +
                          reply.authInfoArray[0].roomTitle);
              // Use this only in case of emergencies!
              //console.log(reply.authInfoArray[0].access_token);
              resolve(reply.authInfoArray);
            } else {
              console.log("No Authorized Users saved in DB for this space.");
              resolve(null);
            }
          });
      } else {
        reject(new Error("Database initiatlization did not complete."));
      }
    });
  }

  /**
   * deletes one user in a specific room
   *
   * @function deleteOneAuthorizedUser
   * @param {string} roomId - The space to check for authorized users
   * @param {string} personId - The person to delete
   *
   */
  deleteOneAuthorizedUser(roomId, personId) {
    let self = this;
    return new Promise(function(resolve, reject) {
      if (self.mCollection) {
        self.mCollection.findOne({'_id': roomId})
          .then((reply) => {
            let deletedUser = null;
            if (reply !== null) {
              if ((!reply._id) && (!reply.authInfoArray.length)) {
                throw new Error('Authorized Users DB has invalid info for space: ' + roomId);
              }
              let userFound = false;
              let i = 0;
              for (i=0; i<reply.authInfoArray.length; i++) {
                if (reply.authInfoArray[i].person.id === personId) {
                  userFound = true;
                  break;
                }
              }
              if (userFound) {
                deletedUser = reply.authInfoArray[i];
                reply.authInfoArray.splice(i,1);
                self.mCollection.replaceOne({'_id': reply._id}, reply, { upsert : true });
                resolve(deletedUser);
              } else {
                console.error('deleteOneAuthorizedUser: PersonID: '+ personId +
                  'is not in RoomID: ' + roomId);
                resolve(null);
              }
            } else {
              console.log("deleteOneAuthorizedUser: No Authorized Users saved in DB for RoomId: " + roomId);
              resolve(null);
            }
          });
      } else {
        reject(new Error("Database initiatlization did not complete."));
      }
    });
  }

  /**
   * delete the all the authorized users in a room
   *
   * @function deleteAuthorizedUsers
   * @param {string} roomId - The space to check for authorized users
   *
   */
  deleteAuthorizedUsers(roomId) {
    let self = this;
    return new Promise(function(resolve, reject) {
      if (self.mCollection) {
        // There should only be one entry per room but we use
        // deleteMany just in case....
        self.mCollection.deleteMany({'_id': roomId})
          .then((ack) => {
            if (ack.deletedCount) {
              console.log('Deleted ' + ack.deletedCount + 'from space: ' + roomId);
            } else {
              console.log('Deleted something, not sure what....');
            }
            resolve(ack);
          })
          .catch((e) => reject(e));
      } else {
        reject(new Error("Database initiatlization did not complete."));
      }
    });
  }
}
  
module.exports = AuthorizationDB;
