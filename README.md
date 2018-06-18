# calls-webhooks-helper
This sample project serves two purposes.  First it provides an example of a single Webex Teams bot and integration to demonstrate how a bot can be used to introduce users to an integration. It provides an example of how to create an Integration Authorization link, and demonstrates how to generate an Integration OAuth token which the integration can use to make Webex API calls on a user's behalf.  This sample provides a reference for how an integration might store these access tokens and refresh them periodically.  The main code for handling token management is in [oauth-connector.js](./oauth-connector.js)

Secondly, it provides an integration that makes it easy for developers to become familar with the calls and callMemberships webhooks.  When the bot is added to a Webex Teams Space it provides a link which allows users in the space to authorize this integration to register webhooks for calls and callMemberships events, and to post messages on their behalf.   When these webhooks fire, the integration will post the contents of these events to the space on behalf of the user(s) who authorized it. 

At the time of this writing the Webex Teams calling API is still in Early Field Trials and are not available to all users.  If you would like to be part of the EFT, contact your Cisco representative or post an issue to this project.

## Using the bot/integration

If your primary interest is to get up to speed on the calls and callMemberships webhooks this integration is currently hosted.  Simply add the calls-webhook-helper@webex.bot to a one on one Webex Teams space, or to a group space with people who are interested in seeing the webhook payloads.   

The bot will provide you with a link which will walk the user through an Authorization flow which asks for permission to register webhooks and post messages on the user's behalf.   Once authorized, make a call in a Webex Teams space where the user who authorized the integration is a member.  As call and callMemebership webhooks fire, the integration will post the details of this to the space where the bot was added.

This provides a quick and easy way to get familiar with how these webhooks work!

## Checklist to build and start the bot yourself

Prerequisites:

- [ ] node.js (minimum supported v7.10.0 with *use-strict* runtime flag & npm 2.14.12 and up)

- [ ] Sign up for Webex Teams (logged in with your web browser)

- [ ] A Mongo Atlas account.   (Or reimplement [authorization-db.js](./authorization-db.js) to use your favorite data store)

----

- [ ] Create a Webex Teams Bot (save the API key): https://developer.ciscospark.com/add-bot.html.  

- [ ] Create or use an existing [Mongo Atlas DB](https://cloud.mongodb.com/) account and create a Database to save information about the authorized users. 

- [ ] Sign up for nGrok and start it on your machine (save the port number and public web address): https://ngrok.com/download.   Alternately know the publically accesible URL and Port where you plan to run your bot.

- [ ] Configure the bot Environment variables:
* WEBHOOK - the IP address where your application will run (ie: http://12356.ngrok.io)
* TOKEN - the Auth token for your bot 
* PORT - the Port that your server is listening on (would have been passed to ngrok if using that)

You can set these variables in your environment or in a config.json file.  If using a config.json file set the key names to all lower case.

- [ ] Create or login to a Mongo Atlas DB account: https://cloud.mongodb.com and set up a database there 

- [ ] Set the Atlas DB Environment variables: 
* MONGO_USER - username for your Mongo DB account 
* MONGO_PW - password for your Mongo DB account 
* MONGO_DB - database name created at https://cloud.mongodb.com
* MONGO_URL - access URL copied from the website 

You can set these variables in your enviornment or in a mongo.json file.  If using a json file set the key names using lower camel case (ie: mongoUser)

- [ ] Create a Webex Teams Integration.  You'll need to check the following scopes:
  *  spark:calls_read
  *  spark:call_memberships_read
  *  spark:memberships_read
  *  spark:messages_read
  *  spark:messages_write
  *  spark:people_read
  *  spark:rooms_read
  *  spark-admin:calls_read
  *  spark-admin:call_memberships_read

  Set the redirect URI to the /auth endpoint where your server will run, (ie: http://12356.ngrok.io/auth) 

  Save the following to set as configuration variables
  * client_id: The client ID provided when you crated your integration
  * client_secret: The client secret provide when you create your integration
  * authLink: The auth link that was generated when you create your integration.  You shoud remove the last bit after the state= part at the end of the url (ie: "https://api.ciscospark.com/v1/authorize?client_id=IDSTRING&response_type=code&redirect_uri=https%3A%2F%2F123456.ngrok.io%2Fauth&scope=spark%3Amemberships_read%20spark%3Akms%20spark%3Apeople_read%20spark%3Arooms_read%20spark-admin%3Acall_memberships_read%20spark%3Amessages_write%20spark%3Acalls_read%20spark%3Amessages_read%20spark%3Acall_memberships_read%20spark-admin%3Acalls_read&state=")

You can set these variables in your environment or in a config.json file.  If using environment varliables DON'T set them to upper case.  Use the casing described in the list above.

- [ ] Download the dependencies with ```npm install```

- [ ] Turn on your bot server with ```npm start```

## Using the bot

Once the bot is running simply add the bot to a space.   The bot will proactively provide a help menu and supports the following commands:

* **/help** will show help, including the link for members of the space to authorize the integration to register them for webhooks
* **/deleteall** will delete all authorized users associated with the space and stop sending webhooks
* **/deleteme** will delete any authorizations for the user who sent the message
* **/tersemode on** will tell the integration to just post webhook summary information, 
* **/tersemode off** will tell the bot to post the full webhook data (this is the default).
* **/status** will provide a list of authorized users and the authorization link 

If the bot is removed from a space it will delete all the authorizations associated with that space and stop posting webhook data
  
## Bot Admin User

The bot can also notify the author about when the bot is added to a new space.  If you would like to receive these messages set an environment variable ADMIN_EMAIL to the Webex Teams email address of the developer or admin.

## TODO
I'd like to do the following some day:
* Add a command to delete the webhook related messages posted on a users behalf
* Upon receiving a calls/updated event with a DISCONNNECTED status make a call to the /calls API and post the final disposition of the call.