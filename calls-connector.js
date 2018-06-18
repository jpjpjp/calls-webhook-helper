/*
 * calls-connector.js
 * 
 * This module handles the setup and maintanance for each authorized user
 * who wants to get details about their calls and callmembership events
 * 
 * It also implements the functions to post messages to a space on the
 * authorizing user's behalf when they receive webhooks
 * 
 * JP Shipherd 6/07/2018
 */

// SDK library for calling Webex Teams
const nodeSparky = require('node-sparky');

// We use a semiphore to ensure just one user auth is interacting
// with the webex sdk at a time
let Semaphore = require('semaphore-async-await');
const lock = new Semaphore.default(1);

// Helper object for sending messages on behalf of a user
let MessageStuff = require('./messages-connector.js');

class CallStuff {
  constructor(config, authDb) {
    this.config = config;
    this.authDb = authDb;
    this.webex_sdk = new nodeSparky({
      // We init with the bot's token but in practice
      // we'll set this to the authorizing user's token
      // when we are doing something on their behalf
      token: config.token
    });
    this.messageStuff = new MessageStuff(this.webex_sdk);
  }

  /**
   * Once we have a valid auth token setup the webhooks so 
   * we can report on any call related webhook events
   *
   * @function setupUser
   * @param {Object} req - request object from OAuth link
   * @param {Object} res - response to send
   * @param {Object} authInfo - Details about the user who just authorized us
   * 
   * @returns {Object} -- an object with the authentication info and bot instance
   *                      from the webex teams space where the user authentication from
   *                      -- or null when error occurs
   * 
   * side effect -- sends response under error conditions
   */

  setupUser(req, res, authInfo) {
    let self = this;
    return new Promise(function(resolve, reject) {
      setupUserWebhooks(authInfo, self.config, self.webex_sdk)
        .then((updatedAuthInfo) => {
          resolve(updatedAuthInfo);
        })
        .catch((e) => {
          console.error(e.message);
          if (e.message == 'Authorizing user is not a member of the Webex Teams space associated with the OAuth link.') {
            authInfo.bot.say('The user who attempted to authorize me: '+authInfo.person.displayName +
            ', is not a member of this space.  Only space members can use this link.\n'+
            'Type **/help** to see the link again.');
          } else {
            authInfo.bot.say('Failed to setup webhooks for '+authInfo.person.displayName +
                    '\n\nMake sure they are in this space and that the the user is authorized to use the calls API');
          }
          res.send("<h1>OAuth Integration could not complete</h1><p>" + 
            "Check the Webex Teams space that provided this link for more details.</p>");
          reject(e);
        });
    });
  }

  /**
   * Sends a message on behalf of the Authenticating user back to the 
   * Webex Teams space where the authentication link was first displayed
   * when setup is complete
   *
   * @function sendAuthCompleteMessage
   * @param {Object} authInfo - Details about the user who just authorized us
   */
  sendAuthCompleteMessage(authInfo) {
    this.messageStuff.sendAuthorizationCompleteMessage(authInfo, lock);
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
          self.authDb.deleteAuthorizedUsers(roomId)
            .catch((e) =>console.error('Unable to delete authorized users from space: ' +
              roomId + ': ' + e.message));
          cleanupAllUsers(authUsersArray, self.webex_sdk);
        }
      })
      .catch((e) => console.error('Failed lookup of users in space:'+
        roomId + ': ' + e.message));
  }

  /**
   * Delete webhooks and DB info for a single user
   *
   * @function deleteOneAuthoritization
   * @param {string} roomId - roomId to remove Auth info from
   * @param {string} personId - personId to remove
   * @param {bool} userLeft - set to True when called because user left a space
   */
  async deleteOneAuthoritization(roomId, personId, userLeft=false) {
    let self = this;
    let authInfo = await this.authDb.deleteOneAuthorizedUser(roomId, personId);
    if (authInfo) {
      await lock.wait();
      await cleanupUser(authInfo, self.webex_sdk, userLeft);
      lock.signal();    
    } else {
      throw new Error('Person is not in Space');
    }
  }

  /**
   * Returns the stored User Authorization info for a particular
   * personId, roomId combination
   *
   * @function getUserForWebhook
   * @param {string} secret - the webhook "secret" which includes our roomId
   * @param {string} personId - personId returned in the name field of the webhook payload
   */
  getUserForWebhook(secret, personId) {
    let n = secret.lastIndexOf(" ");;
    let roomId = secret.substring(n+1);
    return this.getUserForRoom(roomId, personId);
  }

  /**
   * Returns the stored User Authorization info for a particular
   * personId, roomId combination
   *
   * @function getUserForRoom
   * @param {string} roomId - the webhook "secret" which includes our roomId
   * @param {string} personId - personId returned in the name field of the webhook payload
   */
  getUserForRoom(roomId, personId) {
    let self = this;
    return new Promise(function(resolve, reject) {
      self.authDb.getAuthorizedUsers(roomId)
        .then((authUsersArray) => {
          if ((authUsersArray) && (authUsersArray.length)) {
            for (let i=0; i<authUsersArray.length; i++) {
              if (authUsersArray[i].person.id === personId) {
                resolve(authUsersArray[i]);
              }
            }
            resolve(null);
          } else {
            resolve(null);
          }
        })
        .catch((e) => {
          reject('Failed to load authorized users from DB ' +
        'for RoomID ' + roomId + ': ' + e.message);
        });
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
  postWebhookMessage(authInfo, webhook) {
    if (webhook.resource == 'calls') {
      this.messageStuff.postCallsWebhookMessage(authInfo, webhook, lock);
    } else if (webhook.resource == 'callMemberships') {
      this.messageStuff.postCallMembershipsWebhookMessage(authInfo, webhook, lock);
    } else {
      console.error('Got unexpected webhook with resource type: '+webhook.resource);
    }
  }

  /**
   * Configure if the webhook messages are terse or full
   *
   * @function setTerseMode
   * @param {Object} bot - bot for the room that /tersemode was sent to
   * @param {string} trigger - info on who sent terseMOde
   * @param {boolean} mode - mode to set
   */
  setTerseMode(bot, trigger, mode) {
    let self = this;
    return new Promise(function(resolve) {
      self.getUserForRoom(bot.room.id, trigger.personId)
        .then((authInfo) => {
          if (authInfo) {
            authInfo.terseMode = mode;
            self.authDb.saveAuthInfo(authInfo);
          } else {
            bot.say('Can\'t find info for ' + trigger.personDisplayName +
              '. Have you authorized me?  Type **/help** for an authorization link.');
            throw new Error('No-Auth');
          }
        })
        .then(() => {
          if (mode) {
            bot.say('I will only post summaries of webhook events for ' + trigger.personDisplayName);
          } else {
            bot.say('I will only post full details webhook events ' + trigger.personDisplayName);
          }
          resolve(mode);
        })
        .catch((e) => {
          console.error('Unable to update terseMode for ' + trigger.personDisplayName +
            ' in room: ' + trigger.roomTitle + ': '+ e.message);
          if (e.message != 'No-Auth') {
            bot.say('Sorry. I can\'t change this setting right now.');
          }
          resolve(mode);
        });
    });    
  }

}  // end of module

module.exports = CallStuff;

/**
 * Internal functions used by the module
 * We use async/await functions to try to ensure that any sdk methods we are 
 * calling after setting the token are called before the token is set for another user
 */
async function setupUserWebhooks(authInfo, config, sdk) {
  // before we go into our promise chain lets create the webhook json
  authInfo.webhookIds = [];
  let callsWebhookOptions = {
    targetUrl: config.webhookUrl + '/callsWebhook',
  };
  try {
    await lock.wait();
    let updatedAuthInfo = await doSetup(authInfo, config, callsWebhookOptions, sdk);
    lock.signal();
    return(updatedAuthInfo);
  } catch (e) {
    lock.signal();
    throw e;
  }
}
 
async function doSetup(authInfo, config, callsWebhookOptions, sdk) {
  //Set this users token in our SDK for these calls
  await sdk.setToken(authInfo.access_token);
  // First lets find out who this is
  let person = await sdk.personMe();
  authInfo.person = person;

  let memberships = [];
  try {
    memberships = await sdk.membershipsGet({ "roomId": authInfo.roomId });
  } catch(e) {
    throw new Error('Authorizing user is not a member of the Webex Teams space associated with the OAuth link.');
  }
  // Make sure the authorizer is in the space we'll be posting to  
  let user_found = false;
  for(var i = 0, len = memberships.length; i < len; i++) {
    if (memberships[i].personId == authInfo.person.id) {
      user_found = true;
      break;
    }
  }
  if (!user_found) {
    throw new Error('Authorizing user is not a member of the Webex Teams space associated with the OAuth link.');
  }
  // OK we have a valid user who is in the space that generated the auth link.  
  // First lets get rid of any previously registered webhooks
  let webhooks = await sdk.webhooksGet();
  let ourUrl = config.webhookUrl + '/callsWebhook';
  for (let i=0; i<webhooks.length; i++) {
    let webhook = webhooks[i];
    if ((webhook.targetUrl == ourUrl) &&
        ((webhook.resource == "calls") || (webhook.resource == "callMemberships")) && 
        (webhook.secret.includes(authInfo.roomId)) &&
        (webhook.name.includes(authInfo.person.id))) {
      await sdk.webhookRemove(webhook.id);
    }
  }

  // Add info about the user and space in the webhook envelope for readability
  callsWebhookOptions.name = 'Authorized by '+person.displayName + 
    ': '+ authInfo.person.id;
  // sparky sdk doesn't provide an accessor for this or respect it if it is passed in
  sdk.webhookSecret = 'For Space: ' +authInfo.roomTitle + ', ID: ' + authInfo.roomId;  

  // Now add the new webhooks..
  // We register a webhook per user, per room, using the secret for the room
  callsWebhookOptions.resource = 'calls';
  callsWebhookOptions.event = 'created';
  let webhook = await sdk.webhookAdd(callsWebhookOptions);
  authInfo.webhookIds.push(webhook.id);
  callsWebhookOptions.event = 'updated';
  webhook = await sdk.webhookAdd(callsWebhookOptions);
  authInfo.webhookIds.push(webhook.id);
  callsWebhookOptions.resource = 'callMemberships';
  callsWebhookOptions.event = 'created';
  webhook = await sdk.webhookAdd(callsWebhookOptions);
  authInfo.webhookIds.push(webhook.id);
  callsWebhookOptions.event = 'updated';
  webhook = await sdk.webhookAdd(callsWebhookOptions);
  authInfo.webhookIds.push(webhook.id);
  callsWebhookOptions.event = 'deleted';
  webhook = await sdk.webhookAdd(callsWebhookOptions);
  authInfo.webhookIds.push(webhook.id);

  // All five webhooks are registered! Return the authInfo object
  return(authInfo);
}



/**
 * Process, one at a time, the deletion of all authorizations in a space
 *
 * @function cleanupAllUsers
 * @param {Array} authUsersArray - array of user authorizations
 * @param {Ojbect} sdk - the webex sdk
 */
async function cleanupAllUsers(authUsersArray, sdk) {
  for (let i=0; i<authUsersArray.length; i++) {
    await lock.wait();
    await cleanupUser(authUsersArray[i], sdk);
    lock.signal();
  }
}

/**
 * Delete all webhooks associated with the authorization
 * Post a message that the authorization is being removed
 *
 * @function cleanupUser
 * @param {Object} authInfo - Authorization details for a user
 * @param {Ojbect} sdk - the webex sdk
 */
async function cleanupUser(authInfo, sdk, userLeft=false) {
  let message = {
    roomId: authInfo.roomId,
    markdown: 'Will no longer post webhook information' + 
              ' on behalf of ' + authInfo.person.displayName
  };
  try {
    await sdk.setToken(authInfo.access_token);
    // Clean up webhooks
    for (let i=0; i<authInfo.webhookIds.length; i++) {
      let webhookId = authInfo.webhookIds[i];
      console.log('Attempting to delete webhook: '+webhookId);
      await sdk.webhookRemove(webhookId);
    }
    // Post a message that the webhooks messages are off
    if (!userLeft) {
      await sdk.messageSend(message);
    }
  } catch(e) { 
    console.error('Failed to cleanup '+ authInfo.person.displayName + 
      ' in space ' +authInfo.roomTitle + ': '+ e.message);
  }
}

