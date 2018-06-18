/*
 * oauth-connector.js
 * 
 * This module handles the setup and maintanance for each authorized user
 * who wants to get details about their calls and callmembership events
 * 
 * Once a token is created additional information about the user and their
 * webhooks is added to the AuthInof object in the calls-connector module 
 * 
 * authorization-db.js is a mongo cloud atlas db specific connector 
 * to that data store 
 *  
 * JP Shipherd 6/07/2018
 */

const request = require('request');
const when = require('when');

// Module for managing authorization info stored in a mongo db
// Reimplement this if you'd like to use a different data store
const AuthorizationDB = require('./authorization-db.js');


class OAuthStuff {
  constructor(config) {
    this.config = config;
    this.authDb = new AuthorizationDB();
  }

  /**
   * Accessor for the authDB object which is shared with the 
   * callConnector module.
   *
   * @function getAuthDb
   *    
   * * @returns {Object} -- authDb object used to read/write authorization 
   *                        objects from the data store
   */
  getAuthDb() {
    return this.authDb;
  }

  /**
   * Handles the initial response to a user authenticating at one of
   * our authorization links.   From here we will do the back and forth
   * with the webex platform to get the access tokens
   * needed register webhooks and post messages on a users behalf
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
    let self = this;
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
                'supplied by the Calls Webhook Helper bot in a Webex Teams Space');
        reject(new Error('Could not find a bot for Webex Teams room associated with OAuth link'));
      }

      /*  Submit the code we got from webex and exchange it for an auth token */
      var options = { method: 'POST', 
        url: 'https://api.ciscospark.com/v1/access_token',
        headers: 
        { 'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded' },
        form: 
        { grant_type: 'authorization_code',
          client_id: self.config.client_id,
          client_secret: self.config.client_secret,
          code: req.query.code,
          redirect_uri: self.config.webhookUrl + '/auth'
        } 
      };
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
            return reject(new Error('https://api.ciscospark.com/v1/access_token returned ' + 
                              response.statusMessage));
          } else {
            return reject(new Error('https://api.ciscospark.com/v1/access_token returned ' + 
                              response.statusMessage));
          }
        }

        // OK we got a response make sure its good and return it
        var authInfo = JSON.parse(body);
        if ((!authInfo) || (!authInfo.access_token)) {
          res.send("<h1>OAuth Integration could not complete</h1><p>Sorry, could not retreive your access token. Try again...</p>");
          reject(new Error('Webex returned invalid access_token object'));
        }
        authInfo.bot = bot;
        authInfo.roomId = roomId;
        authInfo.roomTitle = bot.room.title;
        resolve(authInfo);
      });
    });
  }

  /**
   * Handles the refresh of an auth token
   *
   * @function refreshToken
   * @param {Object} authInfo - authInfo object
   * 
   * @returns {Promise} -- of an object with the authentication info and bot instance
   *                      from the webex teams space where the user authentication from
   *                      -- or reject when error occurs
   * 
   */
  refreshToken(authInfo) {
    let self = this;
    return new Promise(function(resolve, reject) {
      /*  Submit the code we got from webex and exchange it for an auth token */
      var options = { method: 'POST', 
        url: 'https://api.ciscospark.com/v1/access_token',
        headers: 
        { 'cache-control': 'no-cache',
          'content-type': 'application/x-www-form-urlencoded' },
        form: 
        { grant_type: 'refresh_token',
          client_id: self.config.client_id,
          client_secret: self.config.client_secret,
          refresh_token: authInfo.refresh_token
        } 
      };
      request(options, function (error, response, body) {
        if (error) {
          console.error("Error attemptig to retreive access & refresh tokens: "+ error.message);
          reject(error);
        }
        if (response.statusCode != 200) {
          console.error("access token not issued with status code: " + response.statusCode);
          if (response.statusMessage) {
            reject(new Error('https://api.ciscospark.com/v1/access_token returned ' + 
                              response.statusMessage));
          } else {
            reject(new Error('https://api.ciscospark.com/v1/access_token returned ' + 
                              response.statusMessage));
          }
        }

        // OK we got a response make sure its good and return it
        var newAuthInfo = JSON.parse(body);
        if ((!newAuthInfo) || (!newAuthInfo.access_token)) {
          reject(new Error('Webex returned invalid access_token object'));
        }
        authInfo.access_token = newAuthInfo.access_token;
        authInfo.expires_in = newAuthInfo.expires_in;
        authInfo.refresh_token = newAuthInfo.refresh_token;
        authInfo.refresh_token_expires_in = newAuthInfo.refresh_token_expires_in;
        resolve(authInfo);
      });
    });
  }

  /**
   * Adds an instance of the AuthUserState data when a new user
   * authorizes our bot/integration
   *
   * @function storeAuthInfo
   * @param {Object} req - request object from OAuth link
   * @param {Object} res - response to send
   * @param {Object} authInfo - Details about the user who just authorized us
   */
  storeAuthInfo(req, res, authInfo) {       // arrow function binds the "this"
    let self = this;
    return new Promise(function(resolve) {
      // Strip out some of the non-needed info in the authInfo
      if (authInfo.person) {
        let person = authInfo.person;
        authInfo.person = {};
        authInfo.person.id = person.id;
        authInfo.person.displayName = person.displayName;
      }
      if (authInfo.bot) {
        /* We kept a copy of the bot to post messages about failure conditions 
           during setup but once we get here all subsequent messages are sent 
           on behalf of the authorizing user so it is no longer needed
         */
        delete authInfo.bot;
      }
      authInfo.terseMode = false;

      // Store this in a db and return our promise of a new authInfo
      self.authDb.saveAuthInfo(authInfo)
        .then(() => resolve(authInfo))
        .catch((e) => {
          res.send("<h1>OAuth Integration could not complete</h1><p>" + 
                    "Unable to save data authorization data.</p>");
          console.error('Failed saving authorization information ' +
            'for user '+authInfo.person.displayName + ' in space "' 
            + authInfo.roomTitle + '": ' + e.message);
          // Try to remove any registered webhooks
          self.webex_sdk.setToken(authInfo.access_token)
            .then(() => {
              when.map(authInfo.webhookIds, webhookId => {
                self.webex_sdk.webhookRemove(webhookId);
              });
            })
            .catch((e) => console.error('Failed to cleanup webhoooks after DB fail:'+
              e.message));
          reject(e);
        });
    });
  }

  /**
   * Load any authorized user information stored in the database
   * for a particular room and refresh all the access tokens
   *
   * @function refreshTokensforRoom
   * @param {string} roomId - roomId returned in the secret field of the webhook payload
   */
  refreshTokensforRoom(roomId) {
    let self = this;
    self.authDb.getAuthorizedUsers(roomId)
      .then((authUsersArray) => {
        if ((authUsersArray) && (authUsersArray.length)) {
          let i = 0;
          when.map(authUsersArray, authInfo => {
            i += 1;
            console.log('Updating Auth Token for  ' + reply.authInfoArray[0].roomTitle);
            self.refreshToken(authInfo)
              .then((newAuthInfo) => self.authDb.saveAuthInfo(newAuthInfo))
              .catch((e) => console.error(e.message));
          })
            .done(() => console.log('Updated '+ i + ' Auth Tokens for Space: '+ roomId));
        }
      })
      .catch((e) => console.log('No authorized users in DB ' +
      'for RoomID ' + roomId + ': ' + e.message));
  }

  /**
   * Refresh all tokens
   *
   * @function refreshAllTokens
   * @param {object} flint - flint object
   */
  refreshAllTokens(flint) {
    return when.map(flint.bots, bot => {
      this.refreshTokensforRoom(bot.room.id);
      return when(true);
    });

  }

}  // end of module

module.exports = OAuthStuff;
