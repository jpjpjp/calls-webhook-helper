# call-helper
A Webex Teams "Bot" and "Integration" which allows users in a Webex Teams space to authorize this integration to register webhooks for calls and callMemberships events.   When these webhooks fire, the integration will post the contents of these events to the space on behalf of the user(s) who authorized it. 
## Checklist to build and start the bot


Prerequisites:

- [ ] node.js (minimum supported v6.9.1 with *use-strict* runtime flag & npm 2.14.12 and up)

- [ ] Sign up for Webex Teams (logged in with your web browser)


- [ ] A Mongo Atlas account.

----

- [ ] Create a Webex Teams Bot (save the API key): https://developer.ciscospark.com/add-bot.html to run the bot in bot mode.  

- [ ] Create or use an existing Mongo Altas DB account and create a Database to save informationa about the authorized users.

- [ ] Sign up for nGrok and start it on your machine (save the port number and public web address): https://ngrok.com/download.   Alternately know the publically accesible URL and Port where you plan to run your bot.

- [ ] Configure the bot Environment variable:
WEBHOOK - the IP address where your application will run (ie: http://12356.ngrok.io)
TOKEN - the Auth token for your bot 
PORT - the Port that your server is listening on (would have been passed to ngrok if using that)

- [ ] Set the Atlas DB Environment variables: MONGO_USER, MONGO_PW, MONGO_URL, and MONGO_DB

- [ ] Turn on your bot server with ```npm start```

## Using the bot

Once the bot is running simply add the bot to a space.   The bot will proactively provide a help menu and supports the following commands:

* **/help will show help, including the link for members of the space to authorize the integration to register them for webhooks
* **/deleteall will delete all authorized users associated with the space and stop sending webhooks

Currently the bot from the space will not stop the integration from posting webhook info.
  
## Admin user

The bot also notifies the author jshipher@cisco.com about usage.  For developers who clone this, I request that you please remove this or make yourself the person who is getting the hidden notifications.  (A possible improvement here is to read the admin email from the environment.)

## TODO
* Remove all the authorizations when a bot is removed from a space
* Add a command to remove the authorization for just a single user
* Add a command to delete the webhook related messages posted on a users behalf