/*
 * calls-connector.js
 * 
 * This module handles the setup and maintanance for each authorized user
 * who wants to get details about their calls and callmembership events
 * 
 * JP Shipherd 6/07/2018
 */


const request = require('request');
const when = require('when');

// SDK library for calling Webex Teams
const nodeSparky = require('node-sparky');

// Module for managing authorization info stored in a mongo db
const AuthorizationDB = require('./authorization-db.js');

class CallStuff {
  constructor(config) {
    this.myUserAuthorizations = [];
    this.config = config;
    this.authDb = new AuthorizationDB();
    this.webex_sdk = new nodeSparky({
      token: config.token
    });

  }


  /**
   * Do the back and forth with the spark platform to get the authorization
   * to register webhooks and post messages on a users behalf
   *
   * @function oAuthDance
   * @param {Object} req - request object from OAuth link
   * @param {Object} res - response to send
   * @param {Object} flint - flint object
   * 
   * @returns {Promise} -- of an object with the authentication info and bot instance
   *                      from the webex teams space where the user authentication from
   *                      -- or reject when error occurs
   * 
   * side effect -- sends response under error conditions
   */
  oAuthDance(req, res, flint) {
    return new Promise(function(resolve, reject) {
      // Did the user decline
      if (req.query.error) {
        if (req.query.error == "access_denied") {
          console.log("user declined, received err: " + req.query.error);
          res.send("<h1>OAuth Integration could not complete</h1><p>Got your NO, ciao.</p>");
        }
        if (req.query.error == "invalid_scope") {
          console.log("wrong scope requested, received err: " + req.query.error);
          res.send("<h1>OAuth Integration could not complete</h1><p>The application is requesting an invalid scope, Bye bye.</p>");
        }
        if (req.query.error == "server_error") {
          console.log("server error, received err: " + req.query.error);
          res.send("<h1>OAuth Integration could not complete</h1><p>Cisco Spark sent a Server Error, Auf Wiedersehen.</p>");
        }
        console.log("received err: " + req.query.error);
        res.send("<h1>OAuth Integration could not complete</h1><p>Error case not implemented, au revoir.</p>");
        reject(new Error(req.query.error));
      }

      // Make sure that this request came from a valid Webex Space where our bot is
      // This won't work in Flint 5.   Will need to create a local copy of this info
      let roomId = req.query.state;
      let bot = flint.bots.find(function(bot) {return(bot.room.id === roomId);});
      if (!bot) {
        res.send('<h1>OAuth Integration could not complete</h1><p>'+
                'You can only authorization the Calls Helper when you click on a link ' +
                'supplied by the Calls Helper bot in a Webex Teams Space');
        reject(new Error('Could not find a bot for Webex Teams room associated with OAuth link'));
      }

      /*  Take the code passed in here and submit it for an auth token */

      var options = { method: 'POST', 
        url: 'https://api.ciscospark.com/v1/access_token',
        headers: 
        { 'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded' },
        form: 
        { grant_type: 'authorization_code',
          client_id: 'C7afc0a91f2b78720b5b079159123b20f69295dc489dceeced55ee61faf996f38',
          client_secret: '4cb2ec286084c5a0374b1def973ddf5b335ec26bfbad01c684ea771eb6501d7d',
          //code: 'ZDcyYTAxOWYtYjFjMy00N2M4LTg5NDktOTVhMGUxZTkyYzJlZDk0YjQ5MTgtMWM3',
          code: req.query.code,
          redirect_uri: 'https://addPhoneToSpace.ngrok.io/auth'

        } 
      };
      // options.url is 'https://api.ciscospark.com/v1/access_token',
      request(options, function (error, response, body) {
        if (error) {
          console.error("Error attemptig to retreive access & refresh tokens: "+ error.message);
          res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
          reject(error);
        }
        if (response.statusCode != 200) {
          console.error("access token not issued with status code: " + response.statusCode);
          switch (response.statusCode) {
            case 400:
              var responsePayload = JSON.parse(response.body);
              res.send("<h1>OAuth Integration could not complete</h1><p>Bad request. <br/>" + responsePayload.message + "</p>");
              break;
            case 401:
              res.send("<h1>OAuth Integration could not complete</h1><p>OAuth authentication error. Ask the service contact to check the secret.</p>");
              break;
            default:
              res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
              break;
          }
          if (response.statusMessage) {
            reject(new Error('https://api.ciscospark.com/v1/access_token returned ' + 
                              response.statusMessage));
          } else {
            reject(new Error('https://api.ciscospark.com/v1/access_token returned ' + 
                              response.statusMessage));
          }
        }

        // OK we got a response make sure its good and return it
        var auth_info = JSON.parse(body);
        if ((!auth_info) || (!auth_info.access_token)) {
          res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
          reject(new Error('Webex returned invalid access_token object'));
        }
        auth_info.bot = bot;
        auth_info.roomId = roomId;
        auth_info.roomTitle = bot.room.title;
        // TODO validate that auth_info has the exptected body
        resolve(auth_info);
      });
    });
  }

  /**
   * Once we have a valid auth token setup the webhooks so 
   * we can report on any call related webhook events
   *
   * @function setupUser
   * @param {Object} req - request object from OAuth link
   * @param {Object} res - response to send
   * @param {Object} auth_info - Details about the user who just authorized us
   * 
   * @returns {Object} -- an object with the authentication info and bot instance
   *                      from the webex teams space where the user authentication from
   *                      -- or null when error occurs
   * 
   * side effect -- sends response under error conditions
   */
  setupUser(req, res, auth_info) {
    let self = this;
    return new Promise(function(resolve, reject) {
      // before we go into our promise chain lets create the webhook json
      auth_info.webhookIds = [];
      let callsWebhookOptions = {
        resource: 'calls',
        event: 'created',
        targetUrl: 'https://addPhoneToSpace.ngrok.io/callsWebhook',
        name: 'Something went wrong if you see this' // Will be set below
      };
      
      //Set this users token in our SDK for these calls
      self.webex_sdk.setToken(auth_info.access_token)
        // First lets find out who this is
        .then(() => self.webex_sdk.personMe())
        // Then get the info for the room associated with this authorization
        .then((person) => {
          auth_info.person = person;
          callsWebhookOptions.name = 'Authorized by '+person.displayName + 
                                     ': '+ auth_info.person.id;
          return self.webex_sdk.membershipsGet({ "roomId": auth_info.roomId });
        })
        .then(memberships => {
          // Make sure the authorizer is in the space we'll be posting to  
          let user_found = false;
          for(var i = 0, len = memberships.length; i < len; i++) {
            if (memberships[i].personId == auth_info.person.id) {
              user_found = true;
              break;
            }
          }
          if (!user_found) {
            auth_info.bot.say("I just got an authorization but the user is not a member of this space! Try again...");
            postInstructions(auth_info.bot, false, true);
            throw new Error('Authorizing user is not a member of the Webex Teams space associated with the OAuth link.');
          }
          // OK we have a valid user who is in the space that generated the auth link.  
          // First lets get rid of any previously registered webhooks
          return self.webex_sdk.webhooksGet()
            .then((webhooks) => {
              when.map(webhooks, webhook => {
                // TODO make this more configurable -- EVERYWHERE
                if ((webhook.targetUrl == "https://addPhoneToSpace.ngrok.io/callsWebhook") &&
                    ((webhook.resource == "calls") || (webhook.resource == "callMemberships")) && 
                    (webhook.secret.includes(auth_info.roomId)) &&
                    (webhook.name.includes(auth_info.person.id))) {
                  self.webex_sdk.webhookRemove(webhook.id);
                }
              });
            })
            .then(() => {
              // Now add the new webhooks..
              // We register a webhook per user, per room, using the secret for the room
              self.webex_sdk.webhookSecret = 'For Space: ' +auth_info.roomTitle + 
                                              ', ID: ' + auth_info.roomId;  
              return self.webex_sdk.webhookAdd(callsWebhookOptions);
            })
            .then((webhook) => {
              auth_info.webhookIds.push(webhook.id);
              callsWebhookOptions.event = 'updated';
              return self.webex_sdk.webhookAdd(callsWebhookOptions);
            })
            .then((webhook) => {
              auth_info.webhookIds.push(webhook.id);
              callsWebhookOptions.resource = 'callMemberships';
              callsWebhookOptions.event = 'created';
              return self.webex_sdk.webhookAdd(callsWebhookOptions);
            })
            .then((webhook) => {
              auth_info.webhookIds.push(webhook.id);
              callsWebhookOptions.event = 'updated';
              return self.webex_sdk.webhookAdd(callsWebhookOptions);
            })
            .then((webhook) => {
              auth_info.webhookIds.push(webhook.id);
              callsWebhookOptions.event = 'deleted';
              return self.webex_sdk.webhookAdd(callsWebhookOptions);
            })
            .then((webhook) => {
              auth_info.webhookIds.push(webhook.id);
              resolve(auth_info);
            })
            .catch((e) => {
              console.log(e.message);
              auth_info.bot.say('Failed to setup webhooks for '+auth_info.person.displayName +
                      '\n\nMake sure they are in this space and that the correct toggles are enabled');
              res.send("<h1>OAuth Integration could not complete</h1><p>" + 
                        "Check the Webex Teams space that provided this link for more details.</p>");
              reject(e);
            });
        })
        .catch((e) => {
          // I think this catch will be triggered if the membership call fails
          auth_info.bot.say('The users who attempted to authorixe me: '+auth_info.person.displayName +
          ' is not a member of this space.  Only space members can use this link');
          res.send("<h1>OAuth Integration could not complete</h1><p>" + 
                    "Check the Webex Teams space that provided this link for more details.</p>");
          reject(e);
        });
    });
  }

  /**
   * Sends a message on behalf of the Authenticating user back to the 
   * Webex Teams space where the authentication link was first displayed
   *
   * @function sendAuthorizationCompleteMessage
   * @param {Object} auth_info - Details about the user who just authorized us
   */
  sendAuthorizationCompleteMessage(auth_info) {
    let message = {
      'roomId': auth_info.roomId,
      text: auth_info.person.displayName + 
          ' has authorized me to post calls webhook data to this space.\n\n' +
          'Make a call and see what happens...'
    };
    let self = this;
    // Set the token for the user who we are sending this message for (just in case)
    return self.webex_sdk.setToken(auth_info.access_token)        
      // And post a message in the space on behalf of the authentication user
      .then(() => self.webex_sdk.messageSend(message))
      .catch((e) => reject(e));
  }

  /**
   * Adds an instance of the AuthUserState data when a new user
   * authorizes our bot/integration
   *
   * @function setupNewUser
   * @param {Object} auth_info - Details about the user who just authorized us
   */
  setupNewUser(auth_info) {       // arrow function binds the "this"
    let self = this;
    return new Promise(function(resolve) {
      // Strip out some of the non-needed info in the auth_info
      if (auth_info.person) {
        let person = auth_info.person;
        auth_info.person = {};
        auth_info.person.id = person.id;
        auth_info.person.displayName = person.displayName;
      }
      if (auth_info.bot) {
        delete auth_info.bot;
      }
      self.myUserAuthorizations.push(auth_info);

      // Store this in a db and return our promise of a new auth_info
      self.authDb.saveAuthInfo(auth_info)
        .then(() => resolve(auth_info))
        .catch((e) => console.error('Failed saving authorization information ' +
          'for user '+auth_info.person.displayName + ' in space "' 
          + auth_info.roomTitle + '": ' + e.message));
    });
  }

  /**
   * Load any authorized user information stored in the database
   * when our bot spawns in a new room
   *
   * @function loadUsersFromDB
   * @param {string} roomId - roomId returned in the secret field of the webhook payload
   */
  loadUsersFromDB(roomId) {
    this.authDb.getAuthorizedUsers(roomId)
      .then((authUsersArray) => {
        if ((authUsersArray) && (authUsersArray.length)) {
          for (let i=0; i<authUsersArray.length; i++) {
            this.myUserAuthorizations.push(authUsersArray[i]);
          }
          //TODO -- this is a good opportunity to refresh the tokens
        }
      })
      .catch((e) => console.error('Failed to load authorized users from DB ' +
      'for RoomID ' + roomId + ': ' + e.message));
  }

  /**
   * Delete all webhooks registered for authorized users and 
   * delete their authorization data in the database
   *
   * @function deleteAllAuthoritizations
   * @param {string} roomId - roomId where /deleteall was posted
   */
  deleteAllAuthoritizations(roomId) {
    let self = this;
    this.authDb.getAuthorizedUsers(roomId)
      .then((authUsersArray) => {
        if ((authUsersArray) && (authUsersArray.length)) {
          for (let i=0; i<authUsersArray.length; i++) {
            // Its not clear that this is working
            // TODO see if I can use await to fix this
            this.webex_sdk.setToken(authUsersArray[i].access_token)
              .then(() => self.webex_sdk.webhooksGet())
              .then((webhooks) => {
                when.map(webhooks, webhook => {
                  // TODO make this more configurable -- EVERYWHERE
                  if ((webhook.targetUrl == "https://addPhoneToSpace.ngrok.io/callsWebhook") &&
                      ((webhook.resource == "calls") || (webhook.resource == "callMemberships")) && 
                      (webhook.secret.includes(auth_info.roomId)) &&
                      (webhook.name.includes(auth_info.person.id))) {
                    self.webex_sdk.webhookRemove(webhook.id);
                  }
                });
              });
          }
        }
      })
      .then(() => this.authDb.deleteAuthorizedUsers(roomId))
      .catch((e) =>console.error('Unable to delete authorized users from space: ' +
        roomId + ': ' + e.message));

    // Delete the info in the local copy too
    for(var i = this.myUserAuthorizations.length; i--;) {
      if (this.myUserAuthorizations[i].roomId === roomId) {
        this.myUserAuthorizations.splice(i, 1);
      } 
    }
  }

  /**
   * Returns the stored User Authorization info for a particular
   * personId, roomId combination
   *
   * @function getUserForWebhook
   * @param {string} personId - personId returned in the name field of the webhook payload
   * @param {string} roomId - roomId returned in the secret field of the webhook payload
   */
  getUserForWebhook(personId, roomId) {
    return this.myUserAuthorizations.find(function(user) {
      return((roomId.includes(user.roomId)) && (personId.includes(user.person.id)));
    });
  }

  /**
   * Returns the names of the users in a space who have authorized
   * our integration
   *
   * @function getAuthorizedUsersForRoom
   * @param {string} roomId - roomId returned in the secret field of the webhook payload
   */
  getAuthorizedUsersForRoom(roomId) {
    return this.authDb.getAuthorizedUsers(roomId);
  }

  /**
   * Post a message, on behalf of the authorizing user about the 
   * calls related webhook that was recieved
   *
   * @function postWebhookMessage
   * @param {Object} auth_inf - details about the authorizing user and the room we are in
   * @param {Object} webhook - webhook data that was just received
   */
  postWebhookMessage(auth_info, webhook) {
    if (webhook.resource == 'calls') {
      this.postCallsWebhookMessage(auth_info, webhook);
    } else if (webhook.resource == 'callMemberships') {
      this.postCallMembershipsWebhookMessage(auth_info, webhook);
    } else {
      console.error('Got unexpected webhook with resource type: '+webhook.resource);
    }
  }

  /**
   * Post a message, on behalf of the authorizing user about the 
   * calls resource webhook that was recieved
   *
   * @function postWebhookMessage
   * @param {Object} auth_inf - details about the authorizing user and the room we are in
   * @param {Object} webhook - webhook data that was just received
   */
  postCallsWebhookMessage(auth_info, webhook) {
    let message = {};
    let actorName = '';
    let personName = '';
    let self = this;
    // Set the token for the user who we are sending this message for (just in case)
    self.webex_sdk.setToken(auth_info.access_token)
      .then(() => self.webex_sdk.personGet(webhook.createdBy)) // our authorized user
      .then((person) => {
        personName = person.displayName;
        return self.webex_sdk.personGet(webhook.actorId); // The calls actor
      })
      .then((person) => {
        actorName = person.displayName;
        message = {
          'roomId': auth_info.roomId
        };
        if (webhook.event = 'created') {
          message.markdown = personName + ' (webhook.createdBy) got a calls:created event\n\n.' + 
                            actorName + ' (webhoook.actorId) started a call.\n\nStatus: '+ 
                            webhook.data.status +
                            '\n```\n' + JSON.stringify(webhook, null, 2); // make it pretty 
        } else if (webhook.event = 'updated') {
          message.markdown = personName + ' (webhook.createdBy) got a calls:updated event\n\n.' +
                             actorName +' (webhook.actorId) updated a call.\n\nStatus: '+ 
                            webhook.data.status +
                            '\n```\n' + JSON.stringify(webhook, null, 2); // make it pretty 
        } else {
          throw new Error('Got unexpected calls resource webhook with event type: ' + webhook.event);
        }
      })  
      .then(() => self.webex_sdk.messageSend(message))
      .catch((e) => console.error('Error sending webhook info for ' +
                                  auth_info.person.displayName + 'to space: ' +
                                  e.message));

  }

  /**
   * Post a message, on behalf of the authorizing user about the 
   * callMemberships resoruce webhook that was recieved
   *
   * @function postWebhookMessage
   * @param {Object} auth_inf - details about the authorizing user and the room we are in
   * @param {Object} webhook - webhook data that was just received
   */
  postCallMembershipsWebhookMessage(auth_info, webhook) {
    let message = {};
    let participantName = '';
    let personName = '';
    let self = this;
    // Set the token for the user who we are sending this message for (just in case)
    self.webex_sdk.setToken(auth_info.access_token)
      .then(() => self.webex_sdk.personGet(webhook.createdBy)) // our authorized user
      .then((person) => {
        personName = person.displayName;
        return self.webex_sdk.personGet(webhook.data.personId); // The actor
      })
      .then((person) => {
        participantName = person.displayName;
        message = {
          'roomId': auth_info.roomId,
          'markdown': personName + ' (webhook.createdBy) got a ' + webhook.resource + 
                      ':' + webhook.event + ' event.\n\nNew Status for ' + 
                      participantName + ' (webhook.data.personId): '+ 
                      webhook.data.status +
                      '\n```\n' + JSON.stringify(webhook, null, 2)
        };
      })  
      .then(() => self.webex_sdk.messageSend(message))
      .catch((e) => console.error('Error sending webhook info for ' +
                                  auth_info.person.displayName + 'to space: ' +
                                  e.message));

  }

  //   /**
//    * Cleans up any number info associated with a space and removes the
//    * array entries to correlate the bot with the SpaceNumber info
//    *
//    * @function removeBotAndSpaceNumber
//    * @param {Object} bot - Reference to the bot associated with a space
//    */
//   removeBotAndSpaceNumber(bot, cb) {
//     this.removeNumFromSpace(bot, function(err, spaceNumberState) {
//       if (err) {console.log(err.message);}
//       else {spaceNumberState.cleanup();}
//       //remove the bot ID from the room element arrant
//       myBotRoomIds.splice(bot.room.id, 1);
//       bot.forget('spaceNumberState')
//         .then(function() {
//           cb(null);
//         })
//         .catch(function(err) {
//           cb(err);
//         });
//     });
//   }
//   /**
//    * This method releases a tropo phone number from a space
//    * It might be called after X days with no number activity
//    * Or when a bot is removed from a space
//    *
//    * @function removeNumFromSpace
//    * @private
//    * @param {Object} bot - Flint Bot Object
//    * @param {Function} callback - function to call when numbers is available
//    */
//   removeNumFromSpace(bot, cb) {
//     bot.recall('spaceNumberState')
//       .then(function(spaceNumberState) {
//         if (spaceNumberState.spaceNumberData.myNumber) {
//           //Since there is no number associated with this space this must be the time
//           //the bot has been asked to do anything PSTN call or SMS related 
//           var num = spaceNumberState.spaceNumberData.myNumber;
//           console.log('Asking Tropo release '+num+' whih is associated with ' + bot.room.title);
//           //TODO Modify to remove the PAPI call to remove this.
//           var tropoPapiNumberUrl = papiUrl + '/applications/' + tropoAppId + '/addresses/number/'+num;
//           var request = require("request");
//           var options = {
//           method: 'DELETE',
//             url: tropoPapiNumberUrl,
//             headers: {
//                 'cache-control': 'no-cache',
//                 authorization: 'Basic anBzaGlwaGVyZDpnTDg3UlpfcDZDYUY=',
//                 'content-type': 'application/json'
//             },
//             body: { type: 'number' },
//             json: true
//           };
//           request(options, function(error, response, body) {
//             if (error) {
//               return cb(error);
//             }
//             return cb(null, spaceNumberState);
//           });
//         } else {
//           console.log('No phone number associated with room: '+bot.room.title);
//           return cb(null, spaceNumberState);  
//         }
//       })
//       .catch(function(err) {
//         console.log('No space number info was set up for room: '+bot.room.title);
//         return cb(err);
//       });
//   }
// }

}

module.exports = CallStuff;
