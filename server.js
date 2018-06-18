/*
Heavily based off Nick Marus' node-flint framework helloworld example: https://github.com/nmarus/flint

This is an example implementation of a webex teams bot and integration.

The bot provides a link that Webex Teams subscribers can use to authorize the 
integration to register for calls and callMemberships webhooks on their behalf.

After these are registered the integration will post details about any webhooks
received back to the team space that the bot was in. 

*/
/*jshint esversion: 6 */  // Help out our linter

var Flint = require('node-flint');
var webhook = require('node-flint/webhook');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();


// Set the config vars for the environment we are running in
var config = {};
if ((process.env.webhookUrl) && (process.env.token) ||
    (process.env.authLink) && (process.env.client_id) && (process.env.client_secret)) {
  config.webhookUrl = process.env.webhookUrl;
  config.token = process.env.token;
  config.authLink = process.env.authLink;
  config.client_id = process.env.client_id;
  config.client_secret = process.env.client_secret;
} else {
  // sets config for this instance of the bot.
  console.log('Unable to read config from environment');
  config = require("./config.json");
}
if (process.env.PORT) {
  config.port = process.env.PORT;
}

// Create the object that helps manage authorizations
let OAuthStuff = require('./oauth-connector.js');
let oAuthStuff = new OAuthStuff(config);

// Create the object that keeps track of all the authorizations
let CallStuff = require('./calls-connector.js');
let callStuff = new CallStuff(config, oAuthStuff.getAuthDb());

app.use(bodyParser.json({limit: '50mb'}));

// If configured, the bot will notify an admin when it is 
// added to a new room
if (process.env.ADMIN_EMAIL) {
  var adminEmail = process.env.ADMIN_EMAIL;
} else {
  var adminEmail = 'none';
}
var adminsBot = null;

// init the flint bot framework
var flint = new Flint(config);
flint.start();
flint.messageFormat = 'markdown';
console.log("Starting flint, please wait...");


flint.on("initialized", function() {
  console.log("Flint initialized successfully! [Press CTRL-C to quit]");
  // Configure a timer to refresh access tokens on a weekly basis 
  setInterval(function () {
    oAuthStuff.refreshAllTokens(flint);
  //},  7 * 24 * 60 * 60000);   // Should fire once a week
  },  5 * 60000);   // Should fire every five minutes
});


flint.on('spawn', function(bot){
  // An instance of the bot has been added to a room
  console.log('new bot spawned in room: ' + bot.room.title + ' with id: ' +
    bot.room.id + '\nChecking for users who have previously authorized me...');
  // We use the restart of the bot as an opportunity to refresh and
  // previously authorized access tokens 
  oAuthStuff.refreshTokensforRoom(bot.room.id);

  // Check if this instance is the one on one room with the admin
  if ((!adminsBot) && (bot.isDirectTo === adminEmail)) {
    adminsBot = bot;
  }
  // Notify admin if the bot was added to a new room.     
  if(flint.initialized) {
    if (adminsBot) {
      updateAdmin('addPhoneToSpace Helper is in Space: ' + bot.room.title);        
    }
    postInstructions(bot, /*status_only=*/false, /*instructions_only=*/true);    
  }
});

/* Some logging if API calls are being dropped or retried */
flint.spark.on('dropped', function(req) { 
  console.error('dropped outbound api request:');
  console.dir(req); 
});

flint.spark.on('retry', function(req) { 
  console.error('requeued outbound api request:');
  console.dir(req); 
});


flint.on('despawn', function(bot){
  console.log('Got a flint despawn event for id: ' + bot.room.title);
  callStuff.deleteAllAuthoritizations(bot.room.id, bot);
});

flint.on('stop', function(id){
  console.log('Got a flint stop event for id: ' + id);
});

flint.on('start', function(id){
  console.log('Got a flint start event for id: ' + id);
});

/* These methods are not currently used.   Was trying to understand what they do

flint.on('personEnters', function(bot, person, id){
  console.log('Got a flint personEnters event.');
  // Check if the person entering is our helper user.  
  var email = person.emails[0];
  var name = person.displayName.split(' ')[0]; // reference first name
  console.log('New person in space: ' + bot.room.title + ' is: ' + name + ", email: " + email);
});

*/

flint.on('personExits', function(bot, person) {
  console.log('Got a flint personExits event.');
  // Check if the person exiting authorized us
  callStuff.getUserForRoom(bot.room.id, person.id)
    .then((authInfo) => {
      if (authInfo) {
        console.log(person.displayName + 'left the space "' + bot.room.title + '"');
        return callStuff.deleteOneAuthoritization(bot.room.id, person.id, /*userLeft=*/true);
      }
    })
    .then(() => bot.say('Will no longer post webhook information' + 
      ' on behalf of ' + person.displayName))
    .catch((e) => console.error('onPersonExits handler: Got error: ' + e.message +
      ' when ' + person.displayName + 'left the space "' + bot.room.title + '"'));
});

function updateAdmin(message, listAll=false) {
  try {
    adminsBot.say(message);
    if (listAll) {
      flint.bots.forEach(function(bot) {
        adminsBot.say({'markdown': "* " + bot.isDirectTo});
      });
    }
  } catch (e) {
    flint.debug('Unable to message JP the news ' + message);
    flint.debug('Reason: ' + e.message);
  }
}

function postInstructions(bot, status_only=false) {
  callStuff.getAuthorizedUsersForRoom(bot.room.id)
    .then((authUserArray) => {
      let statusMsg = '';
      if ((authUserArray) && (authUserArray.length)) {
        statusMsg = '\n\nThe following people have authorized me:\n\n';
        for (i=0; i<authUserArray.length; i++) {
          statusMsg += '* '+authUserArray[i].person.displayName;
          if (authUserArray[i].terseMode) {
            statusMsg += ', terseMode enabled\n';
          } else {
            statusMsg += ', full webhooks data\n';
          }
        }
        statusMsg += '\n\nOther users can authorize me via this link:';
      } else {
        statusMsg = "\n\nFor this to work the user in question must authorize me to do this with this link:";
      }
      statusMsg += "\n\n"+config.authLink+bot.room.id; 
      if (!status_only) {
        statusMsg += 
            '\n\n\n\nUsers who have authorized for this space me can also type:\n\n' +
            '* **/tersemode on** to see just webhook summary information\n' +
            '* **/tersemode on** to see the full payload of each webhook\n' +
            '* **/deleteme** to revoke their authorization for this space\n' +
            '\n\n\n\nAnyone can type the following commands:\n\n' +
            '* **/status** to list authorized users in this space\n' +
            '* **/deleteall** to remove all the authorizations for this room\n' +
            '* **/help** To see this message and link again\n';
      }
      bot.say(statusMsg);
    })
    .catch((e) => bot.say('Something is wrong: '+e.message));
}


/****
## Process incoming messages
****/

/* Check for commands
*/
var responded = false;

flint.hears(/(^| )\/status( |.|$)/i, function(bot) {
  flint.debug('Processing /status Request for ' + bot.room.title);
  // TODO do something interesting here.
  postInstructions(bot, /*status_only=*/true);
  responded = true;
});

flint.hears(/(^| )\/help( |.|$)/i, function(bot) {
  flint.debug('Processing /help Request for ' + bot.room.title);
  postInstructions(bot, /*status_only=*/false);
  responded = true;
});

flint.hears(/(^| )\/deleteall( |.|$)/i, function(bot) {
  flint.debug('Processing /deleteall Request for ' + bot.room.title);
  callStuff.deleteAllAuthoritizations(bot.room.id, bot);
  bot.say('No more call webhook events will be posted to this room.\n' +
    'Type **/help** to see the authorization link again.');
  responded = true;
});

flint.hears(/(^| )\/deleteme( |.|$)/i, function(bot, trigger) {
  flint.debug('Processing /deleteall Request for ' + bot.room.title);
  callStuff.deleteOneAuthoritization(bot.room.id, trigger.personId)
    .catch(() => bot.say('Could not find a previous authorization for ' + 
      trigger.personDisplayName + ' to delete.'));
  responded = true;
});

flint.hears(/(^| )\/tersemode.*$/i, function(bot, trigger) {
  flint.debug('Processing /tersemode Request for ' + bot.room.title);
  let text = '';
  if (trigger.args.length == 3) {
    text = trigger.args[2];
  }
  if ((text) && (text.trim().toLowerCase() == 'on')) {
    callStuff.setTerseMode(bot, trigger, true);
  } else if ((text) && (text.trim().toLowerCase() == 'off')) {
    callStuff.setTerseMode(bot, trigger, false);
  } else {
    bot.say('Invalid syntax.\n\n' +
      'Type **/tersemode on** to have me report only summaries of webhooks.\n'+
      'Type **/tersemode off** to have me show the full webhook data.');
  }
  responded = true;
});

flint.hears('/showjptheusers', function() {
  updateAdmin('The following spaces are using me:', true);
  responded = true;
});


/* Catch all for everything else
*/
flint.hears(/.*/, function(bot, trigger) {
  let text = trigger.text;
  if (!responded) {
    console.log("Got an un-handled message to my bot:" + text);
    bot.say('I don\'t know the command\n' + text +
      '\nSend me a **/help** message to see my commands');
  }
  responded = false;
  //console.log(trigger);
});

/****
## Server config & Express Routes
****/

// Webex webbhook registered by flint
app.post('/', webhook(flint));

var server = app.listen(config.port, function () {
  flint.debug('Flint listening on port %s', config.port);
});

// Webex webbhook registered by flint
//app.post('/callsWebhook', calls_webhook(flint));
app.post('/callsWebhook', function (req, res) {
  //console.log('Got a /callsWebhook event...');
  //console.log(req.body);
  let webhook = req.body;
  if ((!webhook) || (!webhook.name) || (!webhook.secret)) {
    console.error('Can\'t find person and roomID in webhook data: ' + req.body);
    res.send('Ignoring.');
  }
  console.log('Got a ' + webhook.resource + ':' + webhook.event + ' webhook.');
  // let auth_info = callStuff.getUserForWebhook(webhook.name, webhook.secret);
  // if ((!auth_info) || (!auth_info.access_token)) {
  //   console.error('Can\'t find user info for webhook data: ' + 
  //     JSON.stringify(webhook, null, 2));
  //   return res.send('Ignoring.');
  // }
  callStuff.getUserForWebhook(webhook.secret, webhook.createdBy)
    .then((auth_info) => {
      if (!auth_info) {throw new Error('No authorized user for this room, person combo');}
      res.send('Posting to Webex Teams Room');
      callStuff.postWebhookMessage(auth_info, webhook);    
    })
    .catch((e) => {
      console.error('Can\'t find user info for webhook data: ' + 
        JSON.stringify(webhook, null, 2));
      console.error(e.message);
      res.send('Ignoring.');
    });
});

// Basic liveness test
app.get('/', function (req, res) {
  res.send('I\'m alive');
  // Do I have access to session info?
  var sess = req.session;
  console.log(sess);
});


// A user has authorized us to look at their call webhook
app.get('/auth', function(req, res) { 
  console.log("Got a get on /auth");
  // do the OAuth dance
  oAuthStuff.oAuthDance(req, res, flint)
    .then((authInfo) => callStuff.setupUser(req, res, authInfo))
    .then((authInfo) => oAuthStuff.storeAuthInfo(req, res, authInfo))
    .then((authInfo) => callStuff.sendAuthCompleteMessage(authInfo))
    .then(() => {
      // If everything went OK we can finally respond to the OAuth request
      res.send('<h1>OAuth Integration Succesful!</h1><p>'+
      'Return to the Webex Teams space with the Calls Helper bot to see whats next.');
      return;
    })
    .catch((e) => {
      // failure conditions return a response
      // otherwise the client is still waiting for us
      console.error(e.message);
      return;
    });
});



// gracefully shutdown (ctrl-c), etc
process.on('SIGINT', sayGoodbye);
process.on('SIGTERM', sayGoodbye);

function sayGoodbye() {
  /* This is too chatty on heroku which goes up and down all the time by design
   *
  updateAdmin({'markdown': "It looks like I'm going offline for a bit.   I won't be able to " +
            "notify you about anything until I send you a welcome message again." +
            "\n\nI'm afraid you'll have to use other tools to find out what is happening in Jira. " +
            "You still have an email client, don't you?<br><br>**INACTIVE**"});
    *
    */
  flint.debug('stoppping...');
  server.close();
  flint.stop().then(function() {
    process.exit();
  });
}