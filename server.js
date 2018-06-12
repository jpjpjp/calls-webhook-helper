/*
Heavily based off Nick Marus' node-flint framework helloworld example: https://github.com/nmarus/flint

This bot exercise the calls and callMemberships webhooks providing feedback as a bot to users who 
are being called.

*/
/*jshint esversion: 6 */  // Help out our linter

var Flint = require('node-flint');
var webhook = require('node-flint/webhook');
//TODO
//var calls_webhook = require('calls-webhook');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
//var _ = require('lodash');


// Set the config vars for the environment we are running in
var config = {};
// if ((process.env.WEBHOOK) && (process.env.TOKEN) ||
//     (process.env.AUTHLINK) && (process.env.CLIENT_ID) && (process.env.CLIENT_SECRET)) {
//   config.webhookUrl = process.env.WEBHOOK;
//   config.token = process.env.TOKEN;
//   config.authLink = process.env.AUTHLINK;
//   config.client_id = process.env.CLIENT_ID;
//   config.client_secret = process.env.CLIENT_SECRET;
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

// Create the object that keeps track of all the authorizations
let CallStuff = require('./calls-connector.js');
let callStuff = new CallStuff(config);


//app.use(bodyParser.json());
app.use(bodyParser.json({limit: '50mb'}));

var adminEmail = "jshipher@cisco.com";
var adminsBot = null;
// init flint
var flint = new Flint(config);
flint.start();
flint.messageFormat = 'markdown';
console.log("Starting flint, please wait...");


flint.on("initialized", function() {
  console.log("Flint initialized successfully! [Press CTRL-C to quit]");
});


flint.on('spawn', function(bot){
  // An instance of the bot has been added to a room
  console.log('new bot spawned in room: %s with id: %s', bot.room.title, bot.room.id);
  // Check if this instance is the one on one room with the admin
  if (bot.isDirectTo === adminEmail) {
    adminsBot = bot;
  }
  // Load any existing Authorized User info into memory
  callStuff.loadUsersFromDB(bot.room.id);
  if(flint.initialized) {
    // Notify admin if the bot was added to a new room.     
    if (adminsBot) {
      updateAdmin('addPhoneToSpace Helper is in Space: ' + bot.room.title);        
    }
    postInstructions(bot, /*status_only=*/false, /*instructions_only=*/true);    
  }
});

/* Some logging if API calls are being dropped or retried */
flint.spark.on('dropped', function(req) { 
  console.log('dropped outbound api request:');
  console.dir(req); 
});

flint.spark.on('retry', function(req) { 
  console.log('requeued outbound api request:');
  console.dir(req); 
});


flint.on('despawn', function(bot, id){
  console.log('Got a flint stop event for id: ' + id);
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

flint.on('personExits', function(bot, person, id){
  console.log('Got a flint personExits event.');
  // Check if the person entering is our helper user.  
  var email = person.emails[0];
  var name = person.displayName.split(' ')[0]; // reference first name
  console.log('Person leaving ' + bot.room.title + ' is: ' + name + ", email: " + email);
});
*/

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

function postInstructions(bot, status_only=false, instructions_only=false) {
  callStuff.getAuthorizedUsersForRoom(bot.room.id)
    .then((authUserArray) => {
      let statusMsg = '';
      if ((authUserArray) && (authUserArray.length)) {
        statusMsg = '\n\nThe following people have authorized me:\n\n';
        for (i=0; i<authUserArray.length; i++) {
          statusMsg += '* '+authUserArray[i].person.displayName+'\n';
        }
        statusMsg += '\n\nOther users can authorize me via this link:';
      } else {
        statusMsg = "\n\nFor this to work the user in question must authorize me to do this with this link:";
      }
      statusMsg += "\n\n"+config.authLink; 
      if (!status_only) {
        bot.say("I can post call and callmembership webhook info for users in this space." +
            statusMsg + bot.room.id + '\n\n' +
            '\n\n To remove all the authorizations for this room type **/deleteall**' +
            '\n\n To see this message and link again type **/help**');
        //TODO - Add more, how do I turn this off for example?
      }
      if (!instructions_only) {
        //bot.say("placeholder for sending a status message");
      }
    })
    .catch((e) => bot.say('Something is wrong: '+e.message));
}


/****
## Process incoming messages
****/

/* Check for commands
*/
var responded = false;

flint.hears('/status', function(bot) {
  flint.debug('Processing /status Request for ' + bot.room.title);
  // TODO do something interesting here.
  bot.say('/status is not yet implemented.');
  responded = true;
});

flint.hears(/(^| )\/help( |.|$)/i, function(bot) {
  flint.debug('Processing /help Request for ' + bot.room.title);
  postInstructions(bot, /*status_only=*/false, /*help_only*/false);
  responded = true;
});

flint.hears(/(^| )\/deleteall( |.|$)/i, function(bot) {
  flint.debug('Processing /deleteall Request for ' + bot.room.title);
  callStuff.deleteAllAuthoritizations(bot.room.id);
  bot.say('No more call webhook events will be posted to this room.\n' +
    'Type **/help** to see the authorization link again.');
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
  let auth_info = callStuff.getUserForWebhook(webhook.name, webhook.secret);
  if ((!auth_info) || (!auth_info.access_token)) {
    console.error('Can\'t find user info for webhook data: ' + 
      JSON.stringify(webhook, null, 2));
    return res.send('Ignoring.');
  }
  res.send('Posting to Webex Teams Room');
  callStuff.postWebhookMessage(auth_info, webhook);
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
  callStuff.oAuthDance(req, res, flint)
    .then((auth_info) => callStuff.setupUser(req, res, auth_info))
    .then((auth_info) => callStuff.setupNewUser(auth_info))
    .then((auth_info) => {
      // TODO create another method that saves all this auth_info

      // If everything went OK we can finally respond to the OAuth request
      res.send('<h1>OAuth Integration Succesful!</h1><p>'+
      'Return to the Webex Teams space with the Calls Helper bot to see whats next.');

      return callStuff.sendAuthorizationCompleteMessage(auth_info);
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


  
