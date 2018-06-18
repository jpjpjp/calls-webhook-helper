/*
 * messages-connector.js
 * 
 * This module handles sending messages about webhooks on behalf
 * of any users who have authorized the integration
 * 
 * JP Shipherd 6/14/2018
 */

class MessageStuff {
  constructor(sdk) {
    this.webex_sdk = sdk; 
  }

  /**
   * Sends a message on behalf of the Authenticating user back to the 
   * Webex Teams space where the authentication link was first displayed
   *
   * @function sendAuthorizationCompleteMessage
   * @param {Object} authInfo - Details about the user who just authorized us
   */
  async sendAuthorizationCompleteMessage(authInfo, lock) {
    let message = {
      'roomId': authInfo.roomId,
      text: authInfo.person.displayName + 
          ' has authorized me to post calls webhook data to this space.\n\n' +
          'Make a call and see what happens...'
    };
    let self = this;
    try {
      await lock.wait();  
      // Set the token for the user who we are sending this message for (just in case)
      await self.webex_sdk.setToken(authInfo.access_token);
      // And post a message in the space on behalf of the authentication user
      await self.webex_sdk.messageSend(message);
      lock.signal();
    } catch(e) { 
      lock.signal();
      throw(e); 
    }
  }

  /**
   * Post a message, on behalf of the authorizing user about the 
   * calls resource webhook that was recieved
   *
   * @function postCallsWebhookMessage
   * @param {Object} authInfo - details about the authorizing user and the room we are in
   * @param {Object} webhook - webhook data that was just received
   */
  async postCallsWebhookMessage(authInfo, webhook, lock) {
    let message = {};
    let actorName = '';
    let personName = '';
    let self = this;
    try {
      await lock.wait();  
      // Set the token for the user who we are sending this message on behalf of
      await self.webex_sdk.setToken(authInfo.access_token);

      // get info for the players in this webhook
      let person = await self.webex_sdk.personGet(webhook.createdBy); // our authorized user
      personName = person.displayName;
      person = await self.webex_sdk.personGet(webhook.actorId); // The calls actor
      actorName = person.displayName;

      // Format the message and send the message
      message = {
        'roomId': authInfo.roomId
      };
      if (webhook.event === 'created') {
        message.markdown = personName + ' (webhook.createdBy) got a calls:created event\n\n' + 
                          actorName + ' (webhoook.actorId) started a call.\n\nStatus: '+ 
                          webhook.data.status;
      } else if (webhook.event == 'updated') {
        message.markdown = personName + ' (webhook.createdBy) got a calls:updated event\n\n' +
                            actorName +' (webhook.actorId) updated a call.\n\nStatus: '+ 
                          webhook.data.status;
      } else {
        throw new Error('Got unexpected calls resource webhook with event type: ' + webhook.event);
      }
      if (!authInfo.terseMode) {
        message.markdown += '\n```\n' + JSON.stringify(webhook, null, 2); // make it pretty 
      }
      await self.webex_sdk.messageSend(message);
      lock.signal();
    } catch(e) {
      lock.signal();
      console.error('Error sending webhook info for ' + authInfo.person.displayName + 
        'to space: ' +e.message);
    }
  }

  /**
   * Post a message, on behalf of the authorizing user about the 
   * callMemberships resoruce webhook that was recieved
   *
   * @function postCallMembershipsWebhookMessage
   * @param {Object} authInfo - details about the authorizing user and the room we are in
   * @param {Object} webhook - webhook data that was just received
   */
  async postCallMembershipsWebhookMessage(authInfo, webhook, lock) {
    let message = {};
    let participantName = '';
    let personName = '';
    let self = this;
    try {
      await lock.wait();  
      // Set the token for the user who we are sending this message for (just in case)
      await self.webex_sdk.setToken(authInfo.access_token);
      let person = await self.webex_sdk.personGet(webhook.createdBy); // our authorized user
      personName = person.displayName;
      person = await self.webex_sdk.personGet(webhook.data.personId); // The actor
      participantName = person.displayName;

      // Format the message and send the message
      message = {
        'roomId': authInfo.roomId,
        'markdown': personName + ' (webhook.createdBy) got a ' + webhook.resource + 
                    ':' + webhook.event + ' event.\n\nNew Status for ' + 
                    participantName + ' (webhook.data.personId): '+ 
                    webhook.data.status
      };
      if (!authInfo.terseMode) {
        message.markdown += '\n```\n' + JSON.stringify(webhook, null, 2); // make it pretty 
      }
      await self.webex_sdk.messageSend(message);
      lock.signal();
    } catch(e) {
      lock.signal();
      console.error('Error sending webhook info for ' + authInfo.person.displayName + 
        'to space: ' + e.message);
    }
  }

} // end of module definition

module.exports = MessageStuff;
