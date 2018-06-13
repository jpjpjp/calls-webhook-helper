/*
 * authorization-db.js
 * 
 * This module maintains info about users who have authorized this app
 * to register webhooks and post messages on their behalf
 * 
 * JP Shipherd 6/11/2018
 */

// Keep track about "stuff" I learn from the users in a hosted Mongo DB
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

  // Keep track about "stuff" I learn from the users in a Mongo DB and in the bots memory store

  /**
   * Saves an instance of the auth_info object in a db.
   * We create an array of auth_info objet for each space where
   * users have authorized us
   *
   * @function saveAuthInfo
   * @param {Object} auth_info - The auth_info instance to store
   *
   */
  saveAuthInfo(auth_info) {
    let self = this;
    return new Promise(function(resolve, reject) {
      if (self.mCollection) {
        self.mCollection.findOne({'_id': auth_info.roomId})
          .then((reply) => {
            if (reply !== null) {
              console.log('There is already at least one auth_info object for this space');
              if ((!reply._id) && (reply.authInfoArray.length)) {
                reject(new Error('Authorized Users DB has invalid info.'));
              }
              // If this user already exists in this array
              // Overwrite that element with the new info
              let i= reply.authInfoArray.findIndex(u => u.person.id === auth_info.person.id);
              if (i != -1) {
                reply.authInfoArray[i] = auth_info;
                console.log('Updating info for ' + auth_info.person.displayName);
              } else {
                reply.authInfoArray.push(auth_info);
                console.log('Adding info for new user ' + auth_info.person.displayName);
              }
              return self.mCollection.replaceOne({'_id': auth_info.roomId}, 
                reply, { upsert : true });
            } else {
              console.log("This is the first authorized user for this room");
              let authInfoArray = [];
              authInfoArray.push(auth_info);
              let authArrayObject = {
                '_id': auth_info.roomId,
                'authInfoArray': authInfoArray 
              };
              // TODO WOuld be nice to figure out how to post instructions from here...
              return self.mCollection.insert(authArrayObject, {w:1});
            }
          })
          .then(() => resolve(auth_info))
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
            if (reply !== null) {
              if ((!reply._id) && (!reply.authInfoArray.length)) {
                throw new Error('Authorized Users DB has invalid info for space: ' + 
                                auth_info.roomId);
              }
              // console.log('Found ' + reply.authInfoArray.length + 
              //             ' Authorized Users in Space: ' +
              //             reply.authInfoArray[0].roomTitle);
              // Use this only in case of emergencies!
              // console.log(reply.authInfoArray[0].access_token);
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

// /**
//  * Removes all associatations with numbers associated with this space.
//  *
//  * @function cleanup
//  * @param {Object} bot - The addPhoneToSpace bot that is added to a space
//  * @property {Object} bot - Reference to the bot associated with a space
//  * @property {Array} botNumbers - Array for quickly getting a reference to a space's bot from the Tropo number
//  *
//  */
// SpaceNumberState.prototype.cleanup = function () {
//     var roomId = this.bot.room.id;
//     var roomTitle = this.bot.room.title;
//     // Remove the database info associated with thsi sapce
//     if (mCollection) {
//         mCollection.deleteOne({'_id': roomId}, function(err){
//             if (err) {
//                 console.error('Could not delete database entery for room id:'+roomId+", "+err.message);
//             }
//             console.log('Removing database info for room: '+roomTitle);
//         });
//     }
//     this.bot = null;
//     this.spaceNumberData = null;
// };

// /**
//  * Assign Number to Space
//  * This is the "from number", that phone users will see when our bot calls sends them an SMS
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The Tropo number assoicated with this space.  
//  *                          This will be the from number for messages and calls from the space
//  *                          And the numbers users can call or message to interact with the space
//  */
// SpaceNumberState.prototype.assignNumber = function(number) {
//     this.spaceNumberData.myNumber = number;
//     //update Mongo DB with this info so that this will persist across bot restarts
//     if (mCollection) {
//       mCollection.save(this.spaceNumberData, {w:1}, function(err) {
//         if (err) {return console.error("Can't store info about new space "+this.bot.room.title+" to db:" + err.message);}
//       });
//     } else {
//       console.error("Can't access persistent data so many not have correct settings for space " + this.spaceNumberData.bot.room.title);
//     }
// };

// /**
//  * Assign External Numbers to Space
//  * These are the numbers that our bot will call when a call happens or sms when a message is posted
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  * @param {String} name - The end users name that we will refer to them by
//  * @returns {String}  - The return value is the state of the newly added number.  Generally this will be ADDED
//  */
// SpaceNumberState.prototype.addNewOutboundNumber = function(number, name){
//     // Make sure number hasn't already been added
//     var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//     if (addedNumber) {
//         return addedNumber.state;
//     }    
//     this.spaceNumberData.addedNumbers.push(new AddedNumber(number, name));
//     /*
//      * Eventually we want to save this in the DB, but while we are building we will start from scratch with each restart
//      * 
//     if (mCollection) {
//         mCollection.save(this.spaceNumberData, {w:1}, function(err, result) {
//           if (err) {return console.error("Can't store info about newly added number: "+number+" in space "+this.bot.room.title+" to db:" + err.message);}
//         });
//       } else {
//         console.error("Can't access persistent data so many not have correct settings for space " + thisbot.room.title);
//       }
//     */
//     return this.spaceNumberData.addedNumbers[this.spaceNumberData.addedNumbers.length-1].state;
// };

// /**
//  * Get the number associated with a Space
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @returns {String}  - The Tropo number that has been assigned to this state
//  *                  
//  */
// SpaceNumberState.prototype.getFromNumber = function(){
//     return this.spaceNumberData.myNumber;
// };

// /**
//  * Get the name associated with an added number
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  * @returns {String}  - The name that was associated with the number when it was added
//  *                  
//  */
// SpaceNumberState.prototype.getNumberName = function(number){
//     var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//     if (addedNumber) {
//         return addedNumber.name;
//     } else {
//         console.log(number+'is not in SpaceNumber data for space: '+ this.bot.room.title);
//         return null;
//     }    
// };

// /**
//  * Get the state of the added number
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  * @returns {String}  - The return value is the state of the newly added number.  
//  *                            ADDED, JOINED, ACCEPTED, REJECTED
//  *                  
//  */
// SpaceNumberState.prototype.getNumberState = function(number){
//     var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//     if (addedNumber) {
//         return addedNumber.state;
//     } else {
//         console.log(number+'is not in SpaceNumber data for space: '+ this.bot.room.title);
//         return null;
//     }    
// };

// /**
//  * Set the state of an aadded number to ACCEPTED
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  *                  
//  */
// SpaceNumberState.prototype.setNumberAccepted = function(number){
//     var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//     if (addedNumber) {
//         addedNumber.state = 'ACCEPTED';
//     } else {
//         console.log(number+'is not in SpaceNumber data for space: '+ this.bot.room.title);
//     }        
// };

// /**
//  * Set the state of an added number to JOINED
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  *                  
//  */
// SpaceNumberState.prototype.setNumberJoined = function(number){
//     var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//     if (addedNumber) {
//         addedNumber.state = 'JOINED';
//     } else {
//         console.log(number+'is not in SpaceNumber data for space: '+ this.bot.room.title);
//     }        
// };



// /**
//  * Set the state of an aadded number to REJECTED
//  *
//  * @function setNumberRejected
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  *                  
//  */
// SpaceNumberState.prototype.setNumberRejected = function(number){
//     var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//     if (addedNumber) {
//         addedNumber.state = 'REJECTED';
//     } else {
//         console.log(number+'is not in SpaceNumber data for space: '+ this.bot.room.title);
//     }        
// };

// /**
//  * Set the state of an added number to ADDED
//  * This is called if an invited phone rejected the invite, but then
//  * texted back later.
//  *
//  * @function
//  * @memberof SpaceNumberState
//  * @param {String} number - The end users number that we will call or message
//  *                  
//  */
// SpaceNumberState.prototype.setNumberInvited = function(number){
//   var addedNumber = _.find(this.spaceNumberData.addedNumbers, numberItem => numberItem.number === number);
//   if (addedNumber) {
//       addedNumber.state = 'ADDED';
//   } else {
//       console.log(number+'is not in SpaceNumber data for space: '+ this.bot.room.title);
//   }        
// };



// /**
//  * Have the bot report on the status of the spaceNumberState
//  *
//  * @function showStatus
//  * @memberof SpaceNumberState
//  * @param {object} bot - The bot instance that we are responding to
//  *                  
//  */
// SpaceNumberState.prototype.showStatus = function(bot){
//     bot.say('JP Still needs to implement this');
// };


    
// // Internal object for keeping track of added numbers
// /**
//  * Creates an instance of AddedNumber.
//  *
//  * @constructor AddedNumber
//  * @private
//  * @param {String} number - The end users number that we will call or message to
//  * @param {String} name - The end users name that we will refer to them by
//  * @property {String} number - The end users number that we will call or message to
//  * @property {String} name - The end users name that we will refer to them by
//  * @property {String} state - When a number is added it needs to go through several states before we start using it:
//  *                            ADDED, INIVITED, JOINED, ACCEPTED, REJECTED
//  *                            We only call or message the numbers that are in the ACCEPTED state
//  *
//  */
// function AddedNumber(number, name) {
//     this.number = number;
//     this.name = name;
//     this.state = "ADDED";
//   }
}
  
module.exports = AuthorizationDB;
